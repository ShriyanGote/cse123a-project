import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("jose", () => ({
  compactDecrypt: vi.fn(),
  importJWK: vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { compactDecrypt, importJWK, jwtVerify } from "jose";
import { requireDeviceAuth, verifyNestedDeviceToken } from "../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../api/_lib/supabaseAdmin.js";

function tokenReplayGuardTable(maybeSingleImpl) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(maybeSingleImpl ?? (async () => ({ data: null, error: null }))),
    upsert: vi.fn().mockResolvedValue(undefined),
  };
  chain.eq.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);
  return chain;
}

function deviceCredentialsTable(maybeSingleImpl) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(
      maybeSingleImpl ??
        (async () => ({
          data: {
            public_jwk: { kty: "EC", crv: "P-256", x: "a", y: "b" },
            revoked_at: null,
          },
          error: null,
        }))
    ),
  };
}

function defaultFromImpl() {
  return (table) => {
    if (table === "token_replay_guard") return tokenReplayGuardTable();
    if (table === "device_credentials") return deviceCredentialsTable();
    return {};
  };
}

/** Must be unique across tests: auth.js replay cache is module-global. */
let jtiSeq = 0;

describe("verifyNestedDeviceToken + nested requireDeviceAuth", () => {
  beforeEach(() => {
    process.env.DEVICE_JWE_PRIVATE_JWK = "{}";
    delete process.env.DEVICE_JWT_ISSUER;
    delete process.env.DEVICE_JWT_AUDIENCE;
    supabaseAdmin.from.mockReset();
    compactDecrypt.mockReset();
    importJWK.mockReset();
    jwtVerify.mockReset();

    compactDecrypt.mockResolvedValue({ plaintext: new TextEncoder().encode("nested.jwt") });
    importJWK.mockResolvedValue({});
    jwtVerify.mockImplementation(async (_jwt, getKey) => {
      await getKey({ kid: "kid1" }, { sub: "hw-dev" });
      jtiSeq += 1;
      return {
        payload: {
          jti: `fresh-jti-${jtiSeq}`,
          sub: "hw-dev",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        protectedHeader: { kid: "kid1" },
      };
    });
    supabaseAdmin.from.mockImplementation(defaultFromImpl());
  });

  it("returns nested device context on success", async () => {
    const out = await verifyNestedDeviceToken("jwe");
    expect(out.deviceId).toBe("hw-dev");
    expect(out.nestedJwt).toBe("nested.jwt");
  });

  it("drops expired replay cache entries before checking jti", async () => {
    const base = new Date("2025-06-01T12:00:00.000Z").getTime();
    vi.useFakeTimers({ now: base });
    const expSec = Math.floor(base / 1000) + 30;
    jwtVerify.mockImplementation(async (_jwt, getKey) => {
      await getKey({ kid: "kid1" }, { sub: "hw-dev" });
      return {
        payload: { jti: "cache-exp-jti", sub: "hw-dev", exp: expSec },
        protectedHeader: { kid: "kid1" },
      };
    });
    await verifyNestedDeviceToken("jwe-a");
    vi.advanceTimersByTime(60_000);
    await verifyNestedDeviceToken("jwe-b");
    vi.useRealTimers();
  });

  it("rejects replayed jti on second verification", async () => {
    jwtVerify.mockImplementation(async (_jwt, getKey) => {
      await getKey({ kid: "kid1" }, { sub: "hw-dev" });
      return {
        payload: { jti: "SAME-JTI", sub: "hw-dev", exp: 9999999999 },
        protectedHeader: { kid: "kid1" },
      };
    });
    await verifyNestedDeviceToken("a");
    await expect(verifyNestedDeviceToken("b")).rejects.toThrow(/Replay/);
  });

  it("rejects when jti is missing from payload", async () => {
    jwtVerify.mockImplementation(async (_jwt, getKey) => {
      await getKey({ kid: "kid1" }, { sub: "hw-dev" });
      return {
        payload: { sub: "hw-dev", exp: 9999999999 },
        protectedHeader: { kid: "kid1" },
      };
    });
    await expect(verifyNestedDeviceToken("x")).rejects.toThrow(/jti/);
  });

  it("rejects when kid or sub is missing for credential lookup", async () => {
    jwtVerify.mockImplementation(async (_jwt, getKey) => {
      await getKey({}, { sub: "hw-dev" });
      return {
        payload: { jti: "j1", sub: "hw-dev", exp: 9999999999 },
        protectedHeader: { kid: "kid1" },
      };
    });
    await expect(verifyNestedDeviceToken("x")).rejects.toThrow(/kid header/);
  });

  it("rejects when device credentials are missing or inactive", async () => {
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "token_replay_guard") return tokenReplayGuardTable();
      if (table === "device_credentials") {
        return deviceCredentialsTable(async () => ({
          data: null,
          error: { message: "nope" },
        }));
      }
      return {};
    });
    await expect(verifyNestedDeviceToken("x")).rejects.toThrow(/No active credential/);
  });

  it("rejects revoked credentials", async () => {
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "token_replay_guard") return tokenReplayGuardTable();
      if (table === "device_credentials") {
        return deviceCredentialsTable(async () => ({
          data: {
            public_jwk: { kty: "EC", crv: "P-256", x: "a", y: "b" },
            revoked_at: "2020-01-01",
          },
          error: null,
        }));
      }
      return {};
    });
    await expect(verifyNestedDeviceToken("x")).rejects.toThrow(/No active credential/);
  });

  it("still succeeds when replay guard upsert throws", async () => {
    const guard = tokenReplayGuardTable();
    guard.upsert.mockRejectedValue(new Error("no table"));
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "token_replay_guard") return guard;
      if (table === "device_credentials") return deviceCredentialsTable();
      return {};
    });
    await expect(verifyNestedDeviceToken("z")).resolves.toMatchObject({ deviceId: "hw-dev" });
  });

  it("rejects when replay guard DB reports jti already seen", async () => {
    jwtVerify.mockImplementation(async (_jwt, getKey) => {
      await getKey({ kid: "kid1" }, { sub: "hw-dev" });
      return {
        payload: { jti: "SEEN-IN-DB", sub: "hw-dev", exp: 9999999999 },
        protectedHeader: { kid: "kid1" },
      };
    });
    const guard = tokenReplayGuardTable(async () => ({
      data: { jti: "SEEN-IN-DB" },
      error: null,
    }));
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "token_replay_guard") return guard;
      if (table === "device_credentials") return deviceCredentialsTable();
      return {};
    });
    await expect(verifyNestedDeviceToken("x")).rejects.toThrow(/Replay/);
  });

  it("treats replay guard select error as not-seen", async () => {
    const guard = tokenReplayGuardTable(async () => ({
      data: null,
      error: { message: "select failed" },
    }));
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "token_replay_guard") return guard;
      if (table === "device_credentials") return deviceCredentialsTable();
      return {};
    });
    await expect(verifyNestedDeviceToken("ok")).resolves.toMatchObject({ deviceId: "hw-dev" });
  });

  it("treats replay guard select throw as not-seen", async () => {
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "token_replay_guard") {
        return {
          select: vi.fn(() => {
            throw new Error("db down");
          }),
        };
      }
      if (table === "device_credentials") return deviceCredentialsTable();
      return {};
    });
    await expect(verifyNestedDeviceToken("ok")).resolves.toMatchObject({ deviceId: "hw-dev" });
  });

  it("requireDeviceAuth uses nested path when provision token does not match", async () => {
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === "token_replay_guard") return tokenReplayGuardTable();
      if (table === "device_credentials") return deviceCredentialsTable();
      return {};
    });
    const res = {
      _status: null,
      _json: null,
      status(c) {
        res._status = c;
        return res;
      },
      json(b) {
        res._json = b;
        return res;
      },
    };
    const auth = await requireDeviceAuth(
      { headers: { authorization: "Bearer jwe-body" }, body: { device_id: "hw-dev" } },
      res
    );
    expect(auth).toMatchObject({ type: "device", device: expect.objectContaining({ deviceId: "hw-dev" }) });
  });

  it("requireDeviceAuth maps missing nested verify error message to default", async () => {
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === "token_replay_guard") return tokenReplayGuardTable();
      if (table === "device_credentials") return deviceCredentialsTable();
      return {};
    });
    jwtVerify.mockImplementation(async () => {
      throw { reason: "no-message" };
    });
    const res = {
      _status: null,
      _json: null,
      status(c) {
        res._status = c;
        return res;
      },
      json(b) {
        res._json = b;
        return res;
      },
    };
    await requireDeviceAuth({ headers: { authorization: "Bearer x" }, body: {} }, res);
    expect(res._json.error).toBe("Invalid device token.");
  });

  it("uses default TTL when JWT exp is 0", async () => {
    jwtVerify.mockImplementation(async (_jwt, getKey) => {
      await getKey({ kid: "kid1" }, { sub: "hw-dev" });
      jtiSeq += 1;
      return {
        payload: { jti: `exp0-${jtiSeq}`, sub: "hw-dev", exp: 0 },
        protectedHeader: { kid: "kid1" },
      };
    });
    await expect(verifyNestedDeviceToken("jwe")).resolves.toMatchObject({ deviceId: "hw-dev" });
  });

  it("marks replay with subject unknown when sub is missing", async () => {
    const guard = tokenReplayGuardTable();
    jwtVerify.mockImplementation(async (_jwt, getKey) => {
      await getKey({ kid: "kid1" }, { sub: "hw-dev" });
      jtiSeq += 1;
      return {
        payload: { jti: `nosub-${jtiSeq}`, exp: 9999999999 },
        protectedHeader: { kid: "kid1" },
      };
    });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "token_replay_guard") return guard;
      if (table === "device_credentials") return deviceCredentialsTable();
      return {};
    });
    await expect(verifyNestedDeviceToken("jwe")).resolves.toMatchObject({ deviceId: "undefined" });
    expect(guard.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ subject_id: "unknown" })
    );
  });

  it("treats replay guard row without jti field as not seen", async () => {
    jwtVerify.mockImplementation(async (_jwt, getKey) => {
      await getKey({ kid: "kid1" }, { sub: "hw-dev" });
      jtiSeq += 1;
      return {
        payload: { jti: `emptyrow-${jtiSeq}`, sub: "hw-dev", exp: 9999999999 },
        protectedHeader: { kid: "kid1" },
      };
    });
    const guard = tokenReplayGuardTable(async () => ({ data: {}, error: null }));
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "token_replay_guard") return guard;
      if (table === "device_credentials") return deviceCredentialsTable();
      return {};
    });
    await expect(verifyNestedDeviceToken("jwe")).resolves.toMatchObject({ deviceId: "hw-dev" });
  });

  it("rejects when credential row has no public JWK", async () => {
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "token_replay_guard") return tokenReplayGuardTable();
      if (table === "device_credentials") {
        return deviceCredentialsTable(async () => ({
          data: { public_jwk: null, revoked_at: null },
          error: null,
        }));
      }
      return {};
    });
    await expect(verifyNestedDeviceToken("jwe")).rejects.toThrow(/No active credential/);
  });
});
