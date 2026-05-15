import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import handler from "../../../api/devices/ble-register.js";
import { requireUserAuth } from "../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../api/_lib/supabaseAdmin.js";
import { createMockRes as mockRes } from "../../createMockRes.js";

describe("api/devices/ble-register", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUserAuth.mockReset();
    supabaseAdmin.from.mockReset();
  });

  it("returns 400 when device_id or auth_token is missing", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "POST", body: { auth_token: "x" } }, res);
    expect(res._status).toBe(400);
    await handler({ method: "POST", body: { device_id: "d" } }, res);
    expect(res._status).toBe(400);
  });

  it("treats null body like empty for required fields", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "POST", body: null }, res);
    expect(res._status).toBe(400);
  });

  it("returns 500 when device upsert fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockReturnValue({
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    });
    const res = mockRes();
    await handler(
      { method: "POST", body: { device_id: "d1", auth_token: "tok" } },
      res
    );
    expect(res._status).toBe(500);
  });

  it("returns 200 and links group when flow succeeds", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const deviceRow = { id: 5, device_id: "hw", device_name: null };

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: deviceRow, error: null }),
        };
      }
      if (table === "device_user_bindings") {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "g99", created_by: "u1" },
            error: null,
          }),
        };
      }
      return {};
    });

    const res = mockRes();
    await handler(
      {
        method: "POST",
        body: { device_id: "hw", auth_token: "tok", group_id: "g99" },
      },
      res
    );
    expect(res._status).toBe(200);
    expect(res._json.ok).toBe(true);
    expect(res._json.ingest_linked_group_id).toBe("g99");
  });

  it("returns 400 when group_id is not found", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const deviceRow = { id: 5, device_id: "hw", device_name: null };

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: deviceRow, error: null }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });

    const res = mockRes();
    await handler(
      { method: "POST", body: { device_id: "hw", auth_token: "tok", group_id: "missing" } },
      res
    );
    expect(res._status).toBe(400);
  });

  it("handles OPTIONS and rejects non-POST", async () => {
    const resOpt = mockRes();
    await handler({ method: "OPTIONS" }, resOpt);
    expect(resOpt._status).toBe(204);

    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "GET" }, res);
    expect(res._status).toBe(405);
  });

  it("returns 500 when device_user_bindings upsert fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 1, device_id: "hw", device_name: null },
            error: null,
          }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: { message: "bind fail" } }) };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "hw", auth_token: "tok" } }, res);
    expect(res._status).toBe(500);
    expect(res._json.details).toBe("bind fail");
  });

  it("returns 403 when group_id belongs to another user", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 1, device_id: "hw", device_name: null },
            error: null,
          }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "g1", created_by: "other" },
            error: null,
          }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "hw", auth_token: "tok", group_id: "g1" } }, res);
    expect(res._status).toBe(403);
  });

  it("returns 500 when listing owned groups fails without group_id", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 1, device_id: "hw", device_name: null },
            error: null,
          }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "list err" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "hw", auth_token: "tok" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when group link update fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let groupsFrom = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 1, device_id: "hw", device_name: null },
            error: null,
          }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        groupsFrom += 1;
        if (groupsFrom === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "g1", created_by: "u1" },
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "link err" },
          }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "hw", auth_token: "tok", group_id: "g1" } }, res);
    expect(res._status).toBe(500);
    expect(res._json.details).toBe("link err");
  });

  it("returns 200 without ingest link when update returns no row", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let groupsFrom = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 1, device_id: "hw", device_name: null },
            error: null,
          }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        groupsFrom += 1;
        if (groupsFrom === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "g1", created_by: "u1" },
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "hw", auth_token: "tok", group_id: "g1" } }, res);
    expect(res._status).toBe(200);
    expect(res._json.ingest_linked_group_id).toBeNull();
  });

  it("returns early when POST has no auth", async () => {
    requireUserAuth.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "d", auth_token: "t" } }, res);
    expect(res._status).toBeNull();
  });

  it("includes null device upsert details when error has no message", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockReturnValue({
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "d1", auth_token: "tok" } }, res);
    expect(res._status).toBe(500);
    expect(res._json.details).toBeNull();
  });

  it("returns 400 for missing group with error lacking message", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const deviceRow = { id: 5, device_id: "hw", device_name: null };
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: deviceRow, error: null }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: {} }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "hw", auth_token: "tok", group_id: "gx" } }, res);
    expect(res._status).toBe(400);
    expect(res._json.details).toBeNull();
  });

  it("treats undefined owned groups list as empty when linking", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 1, device_id: "HW-UN", device_name: null },
            error: null,
          }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: undefined, error: null }),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "HW-UN", auth_token: "tok" } }, res);
    expect(res._status).toBe(200);
    expect(res._json.ingest_linked_group_id).toBeNull();
  });

  it("persists trimmed device_name when provided", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const upsert = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({
      data: { id: 1, device_id: "named", device_name: "My Dev" },
      error: null,
    });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert,
          select: vi.fn().mockReturnThis(),
          single,
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({
      method: "POST",
      body: { device_id: "named", auth_token: "tok", device_name: "  My Dev  " },
    }, res);
    expect(res._status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ device_name: "My Dev" }),
      expect.any(Object)
    );
  });

  it("links first empty group when no row reuses this hardware id", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let groupsFrom = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 1, device_id: "NEW-HW", device_name: null },
            error: null,
          }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        groupsFrom += 1;
        if (groupsFrom === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                { id: "g-other", device_id: "OTHER-HW" },
                { id: "g-empty", device_id: null },
              ],
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "g-empty" }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "NEW-HW", auth_token: "tok" } }, res);
    expect(res._status).toBe(200);
    expect(res._json.ingest_linked_group_id).toBe("g-empty");
  });

  it("auto-picks reuse group when omitting group_id", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let groupsFrom = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "devices") {
        return {
          upsert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 1, device_id: "HW-AUTO", device_name: null },
            error: null,
          }),
        };
      }
      if (table === "device_user_bindings") {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "groups") {
        groupsFrom += 1;
        if (groupsFrom === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [{ id: "g-reuse", device_id: "HW-AUTO" }],
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "g-reuse" }, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "HW-AUTO", auth_token: "tok" } }, res);
    expect(res._status).toBe(200);
    expect(res._json.ingest_linked_group_id).toBe("g-reuse");
  });
});
