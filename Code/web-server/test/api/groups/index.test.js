import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock("../../../api/_lib/groups.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateInviteCode: vi.fn(() => "ABC123"),
  };
});

import handler from "../../../api/groups/index.js";
import { requireUserAuth } from "../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../api/_lib/supabaseAdmin.js";
import { createMockRes as mockRes } from "../../createMockRes.js";

describe("api/groups/index", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUserAuth.mockReset();
    supabaseAdmin.from.mockReset();
  });

  it("handles OPTIONS without auth", async () => {
    const res = mockRes();
    await handler({ method: "OPTIONS" }, res);
    expect(res._status).toBe(204);
  });

  it("returns merged groups on GET", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                role: "member",
                groups: { id: "g1", name: "A", invite_code: "X", device_id: null, created_by: "u2" },
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: "g2", name: "Owned", invite_code: "Y", device_id: null, created_by: "u1" }],
            error: null,
          }),
        };
      }
      return {};
    });

    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(200);
    expect(res._json.groups.map((g) => g.id).sort()).toEqual(["g1", "g2"]);
  });

  it("returns 400 when POST name is empty", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "POST", body: { name: "   " } }, res);
    expect(res._status).toBe(400);
  });

  it("creates a group on POST", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const newGroup = {
      id: "g-new",
      name: "Hello",
      invite_code: "ABC123",
      device_id: null,
      created_by: "u1",
      created_at: "t",
    };

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
        };
      }
      if (table === "groups") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: newGroup, error: null }),
          delete: vi.fn().mockReturnThis(),
        };
      }
      if (table === "group_members") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const res = mockRes();
    await handler({ method: "POST", body: { name: "Hello", device_id: "d1" } }, res);
    expect(res._status).toBe(201);
    expect(res._json.group.id).toBe("g-new");
  });

  it("returns 405 for unsupported methods", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "DELETE" }, res);
    expect(res._status).toBe(405);
  });

  it("returns 500 when membership query fails on GET", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "member q" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when owned-groups query fails on GET", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let gm = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "groups") {
        gm += 1;
        if (gm === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: { message: "owned q" } }),
          };
        }
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when GET handler throws", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("boom");
  });

  it("returns 403 when attaching a device the user does not own", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { name: "G", device_id: "foreign" } }, res);
    expect(res._status).toBe(403);
  });

  it("returns 500 when device ownership check errors", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "own err" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { name: "G", device_id: "d1" } }, res);
    expect(res._status).toBe(500);
  });

  it("rolls back group when owner member insert fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const newGroup = {
      id: "g-new",
      name: "Hello",
      invite_code: "ABC123",
      device_id: null,
      created_by: "u1",
      created_at: "t",
    };
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === "groups") {
        const chain = {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: newGroup, error: null }),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
        chain.insert.mockReturnValue(chain);
        chain.select.mockReturnValue(chain);
        chain.delete.mockReturnValue(chain);
        return chain;
      }
      if (table === "group_members") {
        return {
          insert: vi.fn().mockResolvedValue({ error: { message: "member insert" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { name: "Hello" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when POST handler throws", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation(() => {
      throw new Error("post boom");
    });
    const res = mockRes();
    await handler({ method: "POST", body: { name: "Hi" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when group insert keeps failing after retries", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === "groups") {
        const chain = {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "duplicate" } }),
        };
        chain.insert.mockReturnValue(chain);
        chain.select.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { name: "Hello" } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("duplicate");
  });

  it("GET maps catch errors without message", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation(() => {
      throw {};
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("Failed to list groups.");
  });

  it("POST maps exhausted create errors without message", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: {} }),
    };
    chain.insert.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === "groups") return chain;
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { name: "Hello" } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("Could not create group.");
  });

  it("returns early on GET when not authenticated", async () => {
    requireUserAuth.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBeNull();
  });

  it("GET tolerates undefined membership and owned rows", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: undefined, error: null }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: undefined, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(200);
    expect(res._json.groups).toEqual([]);
  });

  it("GET filters membership rows without nested group", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ role: "member", groups: null }, { role: "owner", groups: { id: "g1", name: "A" } }],
            error: null,
          }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._json.groups.map((g) => g.id)).toEqual(["g1"]);
  });

  it("POST ignores non-string device_id for ownership check", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        const chain = {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "new",
              name: "Hi",
              invite_code: "ABC123",
              device_id: null,
              created_by: "u1",
              created_at: "t",
            },
            error: null,
          }),
        };
        chain.insert.mockReturnValue(chain);
        chain.select.mockReturnValue(chain);
        return chain;
      }
      if (table === "group_members") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "devices") {
        throw new Error("devices should not be queried when device_id is not a string");
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { name: "Hi", device_id: 99 } }, res);
    expect(res._status).toBe(201);
  });

  it("POST maps create catch errors without message", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === "groups") {
        const chain = {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockRejectedValue({}),
        };
        chain.insert.mockReturnValue(chain);
        chain.select.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { name: "Hello" } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("Failed to create group.");
  });

  it("POST reads missing body as empty name and device id", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "POST", headers: {} }, res);
    expect(res._status).toBe(400);
  });
});
