import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: { admin: { signOut: vi.fn(), deleteUser: vi.fn() } },
  },
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
    supabaseAdmin.auth.admin.deleteUser.mockReset();
  });

  it("returns profile on GET", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { display_name: "Ada" },
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

  function mockDeleteAccountTables({ ownedGroups = [], groupMembersByGroup = {} } = {}) {
    const deleteGroup = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const promoteOwner = vi.fn();

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((field) => {
              if (field === "group_id") {
                const groupId = ownedGroups[0];
                return Promise.resolve({
                  data: groupMembersByGroup[groupId] ?? [],
                  error: null,
                });
              }
              return {
                eq: vi.fn().mockImplementation(() => {
                  return Promise.resolve({
                    data: ownedGroups.map((groupId) => ({ group_id: groupId })),
                    error: null,
                  });
                }),
              };
            }),
          }),
          update: promoteOwner.mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "groups") return { delete: deleteGroup };
      if (table === "devices") {
        const c = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
        c.update.mockReturnValue(c);
        return c;
      }
      return {};
    });

    return { deleteGroup, promoteOwner };
  }

  it("permanently deletes account on POST delete_account", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    const { deleteGroup, promoteOwner } = mockDeleteAccountTables({
      ownedGroups: ["g1"],
      groupMembersByGroup: {
        g1: [{ user_id: "u2" }, { user_id: "u1" }],
      },
    });
    supabaseAdmin.auth.admin.deleteUser.mockResolvedValue({ error: null });

    const res = mockRes();
    await handler({ method: "POST", body: { delete_account: true }, headers: {} }, res);
    expect(res._status).toBe(200);
    expect(res._json.deleted).toBe(true);
    expect(promoteOwner).toHaveBeenCalled();
    expect(deleteGroup).toHaveBeenCalled();
    expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith("u1");
    expect(supabaseAdmin.auth.admin.signOut).toHaveBeenCalled();
  });

  it("deletes sole-owner groups when deleting account", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });
    const { deleteGroup } = mockDeleteAccountTables({
      ownedGroups: ["g-solo"],
      groupMembersByGroup: {
        "g-solo": [{ user_id: "u1" }],
      },
    });
    supabaseAdmin.auth.admin.deleteUser.mockResolvedValue({ error: null });

    const res = mockRes();
    await handler({ method: "POST", body: { delete_account: true }, headers: {} }, res);
    expect(res._status).toBe(200);
    expect(deleteGroup).toHaveBeenCalled();
  });

  it("returns 500 when deleteUser fails", async () => {
    requireUserAuth.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", user_metadata: {} },
    });

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "groups") {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "devices") {
        const c = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
        c.update.mockReturnValue(c);
        return c;
      }
      return {};
    });

    supabaseAdmin.auth.admin.deleteUser.mockResolvedValue({
      error: { message: "delete failed" },
    });

    const res = mockRes();
    await handler({ method: "POST", body: { delete_account: true }, headers: {} }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("delete failed");
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
