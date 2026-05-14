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

function mockRes() {
  const res = {
    _status: null,
    _json: null,
    _headers: {},
    _ended: false,
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
});
