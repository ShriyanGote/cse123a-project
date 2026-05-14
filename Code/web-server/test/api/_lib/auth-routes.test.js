import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(),
      admin: { signOut: vi.fn() },
    },
    from: vi.fn(),
  },
}));

import { requireDeviceAuth, requireUserAuth } from "../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../api/_lib/supabaseAdmin.js";

function mockRes() {
  const res = {
    _status: null,
    _json: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._json = body;
      return res;
    },
  };
  return res;
}

describe("requireUserAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.USER_JWT_AUDIENCE;
    supabaseAdmin.auth.getUser.mockReset();
    supabaseAdmin.from.mockReset();
  });

  it("returns null and 401 when bearer token is missing", async () => {
    const req = { headers: {} };
    const res = mockRes();
    const auth = await requireUserAuth(req, res);
    expect(auth).toBeNull();
    expect(res._status).toBe(401);
    expect(res._json.error).toMatch(/Missing Bearer/);
  });

  it("returns null and 401 when Supabase rejects the token", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    const req = { headers: { authorization: "Bearer x" } };
    const res = mockRes();
    const auth = await requireUserAuth(req, res);
    expect(auth).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null and 403 when audience claim is not allowed", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "wrong-aud" } },
      error: null,
    });
    process.env.USER_JWT_AUDIENCE = "authenticated";
    const req = { headers: { authorization: "Bearer tok" } };
    const res = mockRes();
    const auth = await requireUserAuth(req, res);
    expect(auth).toBeNull();
    expect(res._status).toBe(403);
  });

  it("returns null and 403 when account is deactivated", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "authenticated" } },
      error: null,
    });
    const profileChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { is_active: false }, error: null }),
    };
    supabaseAdmin.from.mockReturnValue(profileChain);

    const req = { headers: { authorization: "Bearer tok" } };
    const res = mockRes();
    const auth = await requireUserAuth(req, res);
    expect(auth).toBeNull();
    expect(res._status).toBe(403);
    expect(res._json.code).toBe("account_deactivated");
  });

  it("attaches auth and returns user context on success", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "authenticated" } },
      error: null,
    });
    const profileChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { is_active: true }, error: null }),
    };
    supabaseAdmin.from.mockReturnValue(profileChain);

    const req = { headers: { authorization: "Bearer good" } };
    const res = mockRes();
    const auth = await requireUserAuth(req, res);
    expect(auth).toEqual(
      expect.objectContaining({ type: "user", token: "good", user: expect.any(Object) })
    );
    expect(req.auth).toBe(auth);
  });

  it("allows deactivated accounts when allowDeactivated is true", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "authenticated" } },
      error: null,
    });
    const req = { headers: { authorization: "Bearer tok" } };
    const res = mockRes();
    const auth = await requireUserAuth(req, res, { allowDeactivated: true });
    expect(auth).toMatchObject({ type: "user", user: expect.objectContaining({ id: "u1" }) });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("fails open on profiles read error when checking activation", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "authenticated" } },
      error: null,
    });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "db" } }),
    });
    const req = { headers: { authorization: "Bearer tok" } };
    const res = mockRes();
    const auth = await requireUserAuth(req, res);
    expect(auth).toMatchObject({ type: "user" });
  });

  it("accepts audience from comma-separated USER_JWT_AUDIENCE", async () => {
    process.env.USER_JWT_AUDIENCE = "authenticated, custom-aud ";
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "custom-aud" } },
      error: null,
    });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { is_active: true }, error: null }),
    });
    const req = { headers: { authorization: "Bearer t" } };
    const res = mockRes();
    await expect(requireUserAuth(req, res)).resolves.toMatchObject({ type: "user" });
  });

  it("treats missing profile row as active", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "authenticated" } },
      error: null,
    });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const req = { headers: { authorization: "Bearer t" } };
    const res = mockRes();
    await expect(requireUserAuth(req, res)).resolves.toMatchObject({ type: "user" });
  });

  it("maps verify errors without message for user auth", async () => {
    supabaseAdmin.auth.getUser.mockRejectedValue({});
    const req = { headers: { authorization: "Bearer bad" } };
    const res = mockRes();
    await requireUserAuth(req, res);
    expect(res._json.error).toBe("Invalid user token.");
  });
});

describe("requireDeviceAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DEVICE_JWE_PRIVATE_JWK;
    supabaseAdmin.from.mockReset();
    supabaseAdmin.auth.getUser.mockReset();
  });

  it("returns null and 401 when token is missing", async () => {
    const req = { method: "POST", headers: {}, body: {} };
    const res = mockRes();
    const auth = await requireDeviceAuth(req, res);
    expect(auth).toBeNull();
    expect(res._status).toBe(401);
  });

  it("uses provision token flow when devices row matches", async () => {
    const token = "secret-token";
    const deviceTable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 9,
          device_id: "dev-1",
          auth_token: token,
          status: "active",
        },
        error: null,
      }),
    };
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") return deviceTable;
      return deviceTable;
    });

    const req = {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: { device_id: "dev-1" },
    };
    const res = mockRes();
    const auth = await requireDeviceAuth(req, res);
    expect(auth).toEqual(
      expect.objectContaining({
        type: "device",
        device: expect.objectContaining({ mode: "provision_token", deviceId: "dev-1" }),
      })
    );
  });

  it("returns null and 401 when nested verification fails", async () => {
    process.env.DEVICE_JWE_PRIVATE_JWK = "not-json";
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const req = {
      method: "POST",
      headers: { authorization: "Bearer some-token" },
      body: {},
    };
    const res = mockRes();
    const auth = await requireDeviceAuth(req, res);
    expect(auth).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null when provision device_id is not a string", async () => {
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
    const req = {
      method: "POST",
      headers: { authorization: "Bearer t" },
      body: { device_id: 123 },
    };
    const res = mockRes();
    const auth = await requireDeviceAuth(req, res);
    expect(auth).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null when devices lookup errors for provision flow", async () => {
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "db" } }),
    }));
    const req = {
      method: "POST",
      headers: { authorization: "Bearer t" },
      body: { device_id: "d1" },
    };
    const res = mockRes();
    expect(await requireDeviceAuth(req, res)).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null when provision row has no auth_token", async () => {
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 1, device_id: "d1", status: "active" },
        error: null,
      }),
    }));
    const res = mockRes();
    expect(
      await requireDeviceAuth(
        { method: "POST", headers: { authorization: "Bearer any" }, body: { device_id: "d1" } },
        res
      )
    ).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null when provision row is revoked", async () => {
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 1, device_id: "d1", auth_token: "secret", status: "revoked" },
        error: null,
      }),
    }));
    const res = mockRes();
    expect(
      await requireDeviceAuth(
        { method: "POST", headers: { authorization: "Bearer secret" }, body: { device_id: "d1" } },
        res
      )
    ).toBeNull();
  });

  it("returns null when provision bearer does not match stored token", async () => {
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 1, device_id: "d1", auth_token: "a", status: "active" },
        error: null,
      }),
    }));
    const res = mockRes();
    expect(
      await requireDeviceAuth(
        { method: "POST", headers: { authorization: "Bearer wrong" }, body: { device_id: "d1" } },
        res
      )
    ).toBeNull();
  });
});
