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
import { createMockRes as mockRes } from "../../createMockRes.js";

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

  it("returns early on GET when not authenticated", async () => {
    requireUserAuth.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBeNull();
  });

  it("GET defaults profile fields when row is missing", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(200);
    expect(res._json.display_name).toBeNull();
    expect(res._json.is_active).toBe(true);
  });

  it("uses user_metadata display_name when ensuring with empty body name", async () => {
    requireUserAuth.mockResolvedValue({
      user: {
        id: "u1",
        email: "ada@example.com",
        user_metadata: { display_name: "MetaName" },
      },
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    supabaseAdmin.from.mockReturnValue({ upsert });
    const res = mockRes();
    await handler({ method: "POST", body: { display_name: "" }, headers: {} }, res);
    expect(res._status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "MetaName" })
    );
  });

  it("rejects account reactivation", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    const res = mockRes();
    await handler({ method: "POST", body: { is_active: true }, headers: {} }, res);
    expect(res._status).toBe(403);
    expect(res._json.error).toMatch(/cannot be reactivated/i);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("treats non-string display_name as empty when ensuring profile", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "ada@example.com", user_metadata: {} },
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    supabaseAdmin.from.mockReturnValue({ upsert });
    const res = mockRes();
    await handler({ method: "POST", body: { display_name: 12345 }, headers: {} }, res);
    expect(res._status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ display_name: "ada" }));
  });

  it("falls back to User when ensuring without email or metadata name", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", user_metadata: {} },
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    supabaseAdmin.from.mockReturnValue({ upsert });
    const res = mockRes();
    await handler({ method: "POST", body: { display_name: "" }, headers: {} }, res);
    expect(res._status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ display_name: "User" }));
  });
});
