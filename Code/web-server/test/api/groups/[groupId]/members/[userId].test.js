import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../api/_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("../../../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import handler from "../../../../../api/groups/[groupId]/members/[userId].js";
import { requireUserAuth } from "../../../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../../../api/_lib/supabaseAdmin.js";
import { createMockRes as mockRes } from "../../../../createMockRes.js";

describe("api/groups/[groupId]/members/[userId]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUserAuth.mockReset();
    supabaseAdmin.from.mockReset();
  });

  it("returns 400 when ids are missing", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1" }, body: {} }, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 for invalid role on PATCH", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });

    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      return {};
    });

    const res = mockRes();
    await handler(
      { method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "admin" } },
      res
    );
    expect(res._status).toBe(400);
  });

  it("handles OPTIONS", async () => {
    const res = mockRes();
    await handler({ method: "OPTIONS", query: { groupId: "g1", userId: "u2" } }, res);
    expect(res._status).toBe(204);
  });

  it("returns 405 for unsupported methods", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "GET", query: { groupId: "g1", userId: "u2" } }, res);
    expect(res._status).toBe(405);
  });

  it("returns 403 when actor is not a member", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "member" } }, res);
    expect(res._status).toBe(403);
  });

  it("returns 500 when target membership query errors", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "db" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "member" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 404 when target member row is missing", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "member" } }, res);
    expect(res._status).toBe(404);
  });

  it("returns 400 when promoting a member who is already owner", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "owner" } }, res);
    expect(res._status).toBe(400);
  });

  it("returns 500 when demote-after-promote fails and rolls back", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    function updChain(resError) {
      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn(),
      };
      chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: resError });
      return chain;
    }
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (calls === 2) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      if (calls === 3) return updChain(null);
      if (calls === 4) return updChain({ message: "demote failed" });
      if (calls === 5) return updChain(null);
      return {};
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "owner" } }, res);
    expect(res._status).toBe(500);
  });

  it("promotes member to owner and demotes self", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    function updChain(resError) {
      const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn() };
      chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: resError });
      return chain;
    }
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (calls === 2) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      if (calls <= 4) return updChain(null);
      return {};
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "owner" } }, res);
    expect(res._status).toBe(200);
  });

  it("returns 403 when non-owner PATCHes another member role", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
      };
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "owner" } }, res);
    expect(res._status).toBe(403);
  });

  it("returns 400 when changing owner role to member", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
      };
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "member" } }, res);
    expect(res._status).toBe(400);
  });

  it("updates a member role to member", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (calls === 2) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn() };
      chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: null });
      return chain;
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "member" } }, res);
    expect(res._status).toBe(200);
  });

  it("returns 403 when non-owner DELETEs", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
      };
    });
    const res = mockRes();
    await handler({ method: "DELETE", query: { groupId: "g1", userId: "u2" } }, res);
    expect(res._status).toBe(403);
  });

  it("returns 400 when DELETE targets the owner", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
      };
    });
    const res = mockRes();
    await handler({ method: "DELETE", query: { groupId: "g1", userId: "u2" } }, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when owner tries to remove themselves", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
      };
    });
    const res = mockRes();
    await handler({ method: "DELETE", query: { groupId: "g1", userId: "u1" } }, res);
    expect(res._status).toBe(400);
  });

  it("DELETE removes a member", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (calls === 2) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      const chain = { delete: vi.fn().mockReturnThis(), eq: vi.fn() };
      chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: null });
      return chain;
    });
    const res = mockRes();
    await handler({ method: "DELETE", query: { groupId: "g1", userId: "u2" } }, res);
    expect(res._status).toBe(200);
  });

  it("returns 400 when owner deletes self but membership row is inconsistent", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
      };
    });
    const res = mockRes();
    await handler({ method: "DELETE", query: { groupId: "g1", userId: "u1" } }, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/cannot remove themselves/i);
  });

  it("returns 500 when promote update fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (calls === 2) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn() };
      chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: { message: "promote fail" } });
      return chain;
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "owner" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when member PATCH update fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (calls === 2) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn() };
      chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: { message: "patch fail" } });
      return chain;
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "member" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when DELETE remove fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (calls === 2) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
        };
      }
      const chain = { delete: vi.fn().mockReturnThis(), eq: vi.fn() };
      chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: { message: "del fail" } });
      return chain;
    });
    const res = mockRes();
    await handler({ method: "DELETE", query: { groupId: "g1", userId: "u2" } }, res);
    expect(res._status).toBe(500);
  });

  it("maps member handler catch errors without message", async () => {
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
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "member" } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("Request failed.");
  });

  it("returns early when PATCH has no auth", async () => {
    requireUserAuth.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: "member" } }, res);
    expect(res._status).toBeNull();
  });

  it("returns 400 when role is not a string", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let calls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table !== "group_members") return {};
      calls += 1;
      if (calls === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
      };
    });
    const res = mockRes();
    await handler({ method: "PATCH", query: { groupId: "g1", userId: "u2" }, body: { role: 1 } }, res);
    expect(res._status).toBe(400);
  });
});
