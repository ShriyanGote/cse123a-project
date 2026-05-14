import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../api/_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("../../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import handler from "../../../../api/groups/[groupId]/calibration.js";
import { requireUserAuth } from "../../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../../api/_lib/supabaseAdmin.js";
import { createMockRes as mockRes } from "../../../createMockRes.js";

describe("api/groups/[groupId]/calibration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUserAuth.mockReset();
    supabaseAdmin.from.mockReset();
  });

  it("returns 400 for invalid action", async () => {
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
    await handler(
      { method: "POST", query: { groupId: "g1" }, body: { action: "nope" } },
      res
    );
    expect(res._status).toBe(400);
  });

  it("applies reset action", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });

    let groupsFromCount = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (table === "groups") {
        groupsFromCount += 1;
        if (groupsFromCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { device_id: null }, error: null }),
          };
        }
        const updateChain = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
        updateChain.update.mockReturnValue(updateChain);
        return updateChain;
      }
      return {};
    });

    const res = mockRes();
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "reset" } }, res);
    expect(res._status).toBe(200);
  });

  it("handles OPTIONS and rejects non-POST", async () => {
    const opt = mockRes();
    await handler({ method: "OPTIONS", query: { groupId: "g1" } }, opt);
    expect(opt._status).toBe(204);

    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "GET", query: { groupId: "g1" } }, res);
    expect(res._status).toBe(405);
  });

  it("returns 400 when group id is missing", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "POST", query: {}, body: { action: "reset" } }, res);
    expect(res._status).toBe(400);
  });

  it("returns 403 when caller is not owner", async () => {
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
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "reset" } }, res);
    expect(res._status).toBe(403);
  });

  it("returns 400 when empty/full requested without device", async () => {
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
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { device_id: null }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "empty" } }, res);
    expect(res._status).toBe(400);
  });

  it("returns 500 when group select fails", async () => {
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
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "g err" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "empty" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when water reading query fails for calibration", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let groupsFrom = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (table === "groups") {
        groupsFrom += 1;
        if (groupsFrom === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { device_id: "d1" }, error: null }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "water_readings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "w err" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "full" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 400 when no reading exists for empty/full", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let groupsFrom = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (table === "groups") {
        groupsFrom += 1;
        if (groupsFrom === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { device_id: "d1" }, error: null }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
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
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "empty" } }, res);
    expect(res._status).toBe(400);
  });

  it("applies empty and full actions from latest reading", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    for (const action of ["empty", "full"]) {
      let groupsFrom = 0;
      supabaseAdmin.from.mockImplementation((table) => {
        if (table === "group_members") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
          };
        }
        if (table === "groups") {
          groupsFrom += 1;
          if (groupsFrom === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { device_id: "d1" }, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "water_readings") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 42 }, error: null }),
          };
        }
        return {};
      });
      const res = mockRes();
      await handler({ method: "POST", query: { groupId: "g1" }, body: { action } }, res);
      expect(res._status).toBe(200);
    }
  });

  it("returns 500 when calibration update fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let groupsFrom = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
        };
      }
      if (table === "groups") {
        groupsFrom += 1;
        if (groupsFrom === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { device_id: null }, error: null }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: { message: "upd" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "reset" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when calibration handler throws", async () => {
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
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockRejectedValue(new Error("cal boom")),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "reset" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns early when calibration POST has no auth", async () => {
    requireUserAuth.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "reset" } }, res);
    expect(res._status).toBeNull();
  });

  it("returns 400 when action is not a string", async () => {
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
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: 1 } }, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when latest reading has no weight", async () => {
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
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { device_id: "d1" }, error: null }),
        };
      }
      if (table === "water_readings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "empty" } }, res);
    expect(res._status).toBe(400);
  });

  it("maps calibration catch errors without message", async () => {
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
    await handler({ method: "POST", query: { groupId: "g1" }, body: { action: "reset" } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("Calibration failed.");
  });
});
