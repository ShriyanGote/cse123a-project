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
import { createMockRes as mockRes } from "../../createMockRes.js";

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

  it("attaches auth and returns user context on success", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "authenticated" } },
      error: null,
    });

    const req = { headers: { authorization: "Bearer good" } };
    const res = mockRes();
    const auth = await requireUserAuth(req, res);
    expect(auth).toEqual(
      expect.objectContaining({ type: "user", token: "good", user: expect.any(Object) })
    );
    expect(req.auth).toBe(auth);
  });

  it("accepts audience from comma-separated USER_JWT_AUDIENCE", async () => {
    process.env.USER_JWT_AUDIENCE = "authenticated, custom-aud ";
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "custom-aud" } },
      error: null,
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

  it("uses default aud claim when user JWT has no aud", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    delete process.env.USER_JWT_AUDIENCE;
    const req = { headers: { authorization: "Bearer t" } };
    const res = mockRes();
    await expect(requireUserAuth(req, res)).resolves.toMatchObject({ type: "user" });
  });

  it("falls back to default audience list when env is only commas", async () => {
    process.env.USER_JWT_AUDIENCE = " , , ";
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", aud: "authenticated" } },
      error: null,
    });
    const req = { headers: { authorization: "Bearer t" } };
    const res = mockRes();
    await expect(requireUserAuth(req, res)).resolves.toMatchObject({ type: "user" });
  });
});

describe("requireDeviceAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DEVICE_JWE_PRIVATE_JWK;
    supabaseAdmin.from.mockReset();
    supabaseAdmin.auth.getUser.mockReset();
  });

  function stubDevicesMaybeSingle(result) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(result),
    };
    supabaseAdmin.from.mockImplementation(() => chain);
  }

  it("returns null and 401 when token is missing", async () => {
    const req = { method: "POST", headers: {}, body: {} };
    const res = mockRes();
    const auth = await requireDeviceAuth(req, res);
    expect(auth).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null when provision token matches length but not bytes", async () => {
    stubDevicesMaybeSingle({
      data: { id: 9, device_id: "dev-1", auth_token: "aaaaaaaaaa", status: "active" },
      error: null,
    });
    const res = mockRes();
    expect(
      await requireDeviceAuth(
        {
          method: "POST",
          headers: { authorization: "Bearer bbbbbbbbbb" },
          body: { device_id: "dev-1" },
        },
        res
      )
    ).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null when provision token length mismatches stored token", async () => {
    stubDevicesMaybeSingle({
      data: { id: 1, device_id: "d1", auth_token: "short", status: "active" },
      error: null,
    });
    const res = mockRes();
    expect(
      await requireDeviceAuth(
        {
          method: "POST",
          headers: { authorization: "Bearer much-longer-token" },
          body: { device_id: "d1" },
        },
        res
      )
    ).toBeNull();
    expect(res._status).toBe(401);
  });

  it("uses provision token flow when devices row matches", async () => {
    const token = "secret-token";
    stubDevicesMaybeSingle({
      data: { id: 9, device_id: "dev-1", auth_token: token, status: "active" },
      error: null,
    });
    const res = mockRes();
    const auth = await requireDeviceAuth(
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: { device_id: "dev-1" },
      },
      res
    );
    expect(auth).toEqual(
      expect.objectContaining({
        type: "device",
        device: expect.objectContaining({ mode: "provision_token", deviceId: "dev-1" }),
      })
    );
  });

  it("returns null and 401 when nested verification fails", async () => {
    process.env.DEVICE_JWE_PRIVATE_JWK = "not-json";
    stubDevicesMaybeSingle({ data: null, error: null });
    const res = mockRes();
    const auth = await requireDeviceAuth(
      { method: "POST", headers: { authorization: "Bearer some-token" }, body: {} },
      res
    );
    expect(auth).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null when provision device_id is not a string", async () => {
    stubDevicesMaybeSingle({ data: null, error: null });
    const res = mockRes();
    const auth = await requireDeviceAuth(
      { method: "POST", headers: { authorization: "Bearer t" }, body: { device_id: 123 } },
      res
    );
    expect(auth).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null when devices lookup errors for provision flow", async () => {
    stubDevicesMaybeSingle({ data: null, error: { message: "db" } });
    const res = mockRes();
    expect(
      await requireDeviceAuth(
        { method: "POST", headers: { authorization: "Bearer t" }, body: { device_id: "d1" } },
        res
      )
    ).toBeNull();
    expect(res._status).toBe(401);
  });

  it("returns null when provision row has no auth_token", async () => {
    stubDevicesMaybeSingle({ data: { id: 1, device_id: "d1", status: "active" }, error: null });
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
    stubDevicesMaybeSingle({
      data: { id: 1, device_id: "d1", auth_token: "secret", status: "revoked" },
      error: null,
    });
    const res = mockRes();
    expect(
      await requireDeviceAuth(
        { method: "POST", headers: { authorization: "Bearer secret" }, body: { device_id: "d1" } },
        res
      )
    ).toBeNull();
  });

  it("returns null when stored auth_token is not a string", async () => {
    stubDevicesMaybeSingle({
      data: { id: 1, device_id: "d1", auth_token: 999, status: "active" },
      error: null,
    });
    const res = mockRes();
    expect(
      await requireDeviceAuth(
        { method: "POST", headers: { authorization: "Bearer x" }, body: { device_id: "d1" } },
        res
      )
    ).toBeNull();
    expect(res._status).toBe(401);
  });

  it("treats non-object body as empty for device_id resolution", async () => {
    process.env.DEVICE_JWE_PRIVATE_JWK = "not-json";
    stubDevicesMaybeSingle({ data: null, error: null });
    const res = mockRes();
    await requireDeviceAuth({ method: "POST", headers: { authorization: "Bearer t" }, body: "nope" }, res);
    expect(res._status).toBe(401);
  });
});
