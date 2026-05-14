import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: { from: vi.fn(), auth: { admin: { signOut: vi.fn() } } },
}));

import handler from "../../../api/profile/index.js";
import { requireUserAuth } from "../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../api/_lib/supabaseAdmin.js";

function mockRes() {
  const res = {
    _status: null,
    _json: null,
    _headers: {},
    setHeader(k, v) {
      res._headers[k] = v;
      return res;
    },
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._json = body;
      return res;
    },
    end() {
      res._ended = true;
      return res;
    },
  };
  return res;
}

describe("api/profile/index", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUserAuth.mockReset();
    supabaseAdmin.from.mockReset();
    supabaseAdmin.auth.admin.signOut.mockReset();
  });

  it("returns profile on GET", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { display_name: "Ada", is_active: true },
        error: null,
      }),
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(200);
    expect(res._json.display_name).toBe("Ada");
  });

  it("upserts display name via POST", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    supabaseAdmin.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    const res = mockRes();
    await handler(
      { method: "POST", body: { display_name: "Bob" }, headers: {} },
      res
    );
    expect(res._status).toBe(200);
    expect(res._json.ok).toBe(true);
  });

  it("updates active flag and devices on POST", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });

    const profileChain = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
    const devicesChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    devicesChain.update.mockReturnValue(devicesChain);

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "profiles") return profileChain;
      if (table === "devices") return devicesChain;
      return profileChain;
    });

    const res = mockRes();
    await handler({ method: "POST", body: { is_active: false }, headers: {} }, res);
    expect(res._status).toBe(200);
    expect(supabaseAdmin.auth.admin.signOut).toHaveBeenCalled();
  });

  it("handles OPTIONS", async () => {
    const res = mockRes();
    await handler({ method: "OPTIONS" }, res);
    expect(res._status).toBe(204);
  });

  it("returns 405 for unsupported methods", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "PUT", headers: {} }, res);
    expect(res._status).toBe(405);
  });

  it("returns 500 on GET when profile read fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "read fail" } }),
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(500);
  });

  it("uses email local-part fallback when ensuring profile without display_name", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "ada@example.com", user_metadata: {} },
    });
    supabaseAdmin.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    const res = mockRes();
    await handler({ method: "POST", body: { display_name: "" }, headers: {} }, res);
    expect(res._status).toBe(200);
    expect(supabaseAdmin.from).toHaveBeenCalled();
  });

  it("returns 500 when device cascade fails during deactivate", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "profiles") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "devices") {
        const c = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: { message: "dev" } }) };
        c.update.mockReturnValue(c);
        return c;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { is_active: false }, headers: {} }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toMatch(/failed to update devices/);
  });

  it("ignores signOut errors when deactivating", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    supabaseAdmin.auth.admin.signOut.mockRejectedValue(new Error("signOut boom"));
    const devicesChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    devicesChain.update.mockReturnValue(devicesChain);
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "profiles") return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === "devices") return devicesChain;
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { is_active: false }, headers: {} }, res);
    expect(res._status).toBe(200);
  });

  it("returns 500 when ensure upsert fails", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    supabaseAdmin.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { message: "upsert fail" } }),
    });
    const res = mockRes();
    await handler({ method: "POST", body: { display_name: "x" }, headers: {} }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when profile upsert fails during deactivate", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "profiles") {
        return { upsert: vi.fn().mockResolvedValue({ error: { message: "prof" } }) };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { is_active: false }, headers: {} }, res);
    expect(res._status).toBe(500);
  });
});
