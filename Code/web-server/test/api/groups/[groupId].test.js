import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import handler from "../../../api/groups/[groupId].js";
import { requireUserAuth } from "../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../api/_lib/supabaseAdmin.js";
import { createMockRes as mockRes } from "../../createMockRes.js";

function mockReq(method, query, body = {}) {
  return { method, query, body, headers: {} };
}

describe("api/groups/[groupId]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUserAuth.mockReset();
    supabaseAdmin.from.mockReset();
  });

  it("returns 400 when group id is missing", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler(mockReq("GET", {}), res);
    expect(res._status).toBe(400);
  });

  it("returns GET payload for members and latest reading", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });

    let groupMembersFromCount = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        groupMembersFromCount += 1;
        if (groupMembersFromCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { group_id: "g1", user_id: "u1", role: "member" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                group_id: "g1",
                user_id: "u1",
                role: "member",
                created_at: "t",
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "g1",
              name: "G",
              invite_code: "X",
              device_id: "d1",
              empty_g: 0,
              full_g: 100,
              created_by: "u1",
              created_at: "t",
            },
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { weight_g: 50, battery_mv: 3000, created_at: "t" },
            error: null,
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ id: "u1", display_name: " Me " }],
            error: null,
          }),
        };
      }
      return {};
    });

    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(200);
    expect(res._json.group.id).toBe("g1");
    expect(res._json.members[0].display_name).toBe("Me");
  });

  it("allows PATCH for owner", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { role: "owner" },
            error: null,
          }),
        };
      }
      if (table === "groups") {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          single: vi.fn(),
        };
        chain.update.mockReturnValue(chain);
        chain.eq.mockResolvedValue({ error: null });
        return chain;
      }
      return {};
    });

    const res = mockRes();
    await handler(mockReq("PATCH", { groupId: "g1" }, { name: "N", device_id: "" }), res);
    expect(res._status).toBe(200);
  });

  it("handles OPTIONS", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler(mockReq("OPTIONS", { groupId: "g1" }), res);
    expect(res._status).toBe(204);
  });

  it("GET skips readings when group has no device", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { group_id: "g1", user_id: "u1", role: "member" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ group_id: "g1", user_id: "u1", role: "member", created_at: "t" }],
            error: null,
          }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "g1",
              name: "G",
              invite_code: "X",
              device_id: null,
              empty_g: 0,
              full_g: 100,
              created_by: "u1",
              created_at: "t",
            },
            error: null,
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [{ id: "u1", display_name: "A" }], error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(200);
    expect(res._json.latestReading).toBeNull();
  });

  it("returns 500 when group row read fails on GET", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { group_id: "g1", user_id: "u1", role: "member" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "group read" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when latest reading query fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { group_id: "g1", user_id: "u1", role: "member" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "g1",
              name: "G",
              invite_code: "X",
              device_id: "d1",
              empty_g: 0,
              full_g: 100,
              created_by: "u1",
              created_at: "t",
            },
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "read err" } }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when members list fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { group_id: "g1", user_id: "u1", role: "member" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "members" } }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "g1",
              name: "G",
              invite_code: "X",
              device_id: null,
              empty_g: 0,
              full_g: 100,
              created_by: "u1",
              created_at: "t",
            },
            error: null,
          }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when profile lookup fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { group_id: "g1", user_id: "u1", role: "member" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ group_id: "g1", user_id: "u1", role: "member", created_at: "t" }],
            error: null,
          }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "g1",
              name: "G",
              invite_code: "X",
              device_id: null,
              empty_g: 0,
              full_g: 100,
              created_by: "u1",
              created_at: "t",
            },
            error: null,
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: null, error: { message: "profiles" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(500);
  });

  it("returns 403 when non-owner PATCHes", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("PATCH", { groupId: "g1" }, { name: "N" }), res);
    expect(res._status).toBe(403);
  });

  it("returns 400 when PATCH name is empty", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("PATCH", { groupId: "g1" }, { name: "   " }), res);
    expect(res._status).toBe(400);
  });

  it("returns 403 when non-owner DELETEs", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("DELETE", { groupId: "g1" }), res);
    expect(res._status).toBe(403);
  });

  it("allows owner to DELETE group", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (table === "groups") {
        const chain = {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
        chain.delete.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("DELETE", { groupId: "g1" }), res);
    expect(res._status).toBe(200);
  });

  it("returns 405 for unsupported methods after auth", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("PUT", { groupId: "g1" }), res);
    expect(res._status).toBe(405);
  });

  it("returns 500 when membership lookup throws", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockRejectedValue(new Error("db")),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(500);
  });

  it("maps membership rejection without message in outer catch", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockRejectedValue({}),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("Request failed.");
  });

  it("GET uses null latestReading when water row is absent", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { group_id: "g1", user_id: "u1", role: "member" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ group_id: "g1", user_id: "u1", role: "member", created_at: "t" }],
            error: null,
          }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "g1",
              name: "G",
              invite_code: "X",
              device_id: "d1",
              empty_g: 0,
              full_g: 100,
              created_by: "u1",
              created_at: "t",
            },
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [{ id: "u1", display_name: 99 }], error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(200);
    expect(res._json.latestReading).toBeNull();
    expect(res._json.members[0].display_name).toBeNull();
  });

  it("returns 400 when PATCH name is not a string", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("PATCH", { groupId: "g1" }, { name: 123 }), res);
    expect(res._status).toBe(400);
  });

  it("returns 500 when DELETE fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (table === "groups") {
        const chain = {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: { message: "cannot delete" } }),
        };
        chain.delete.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("DELETE", { groupId: "g1" }), res);
    expect(res._status).toBe(500);
  });

  it("returns early on GET when not authenticated", async () => {
    requireUserAuth.mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBeNull();
  });

  it("GET maps undefined member rows to empty list", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { group_id: "g1", user_id: "u1", role: "member" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: undefined, error: null }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "g1",
              name: "G",
              invite_code: "X",
              device_id: null,
              empty_g: 0,
              full_g: 100,
              created_by: "u1",
              created_at: "t",
            },
            error: null,
          }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(200);
    expect(res._json.members).toEqual([]);
  });

  it("GET uses empty profile list when query returns undefined rows", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { group_id: "g1", user_id: "u1", role: "member" },
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ group_id: "g1", user_id: "u1", role: "member", created_at: "t" }],
            error: null,
          }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "g1",
              name: "G",
              invite_code: "X",
              device_id: null,
              empty_g: 0,
              full_g: 100,
              created_by: "u1",
              created_at: "t",
            },
            error: null,
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: undefined, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("GET", { groupId: "g1" }), res);
    expect(res._status).toBe(200);
    expect(res._json.members[0].display_name).toBeNull();
  });

  it("returns 500 when PATCH update fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (table === "groups") {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          single: vi.fn(),
        };
        chain.update.mockReturnValue(chain);
        chain.eq.mockResolvedValue({ error: { message: "patch db" } });
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler(mockReq("PATCH", { groupId: "g1" }, { name: "N" }), res);
    expect(res._status).toBe(500);
  });
});
