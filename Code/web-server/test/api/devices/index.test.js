import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import handler from "../../../api/devices/index.js";
import { requireUserAuth } from "../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../api/_lib/supabaseAdmin.js";

function mockRes() {
  const res = {
    _status: null,
    _json: null,
    _ended: false,
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

describe("api/devices/index", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUserAuth.mockReset();
    supabaseAdmin.from.mockReset();
  });

  it("returns early when auth is missing", async () => {
    requireUserAuth.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBeNull();
  });

  it("handles OPTIONS and lists devices on GET", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: 1, device_id: "d1", device_name: "N", status: "active" }],
        error: null,
      }),
    };
    supabaseAdmin.from.mockReturnValue(chain);

    const opt = mockRes();
    await handler({ method: "OPTIONS" }, opt);
    expect(opt._status).toBe(204);

    const res = mockRes();
    await handler({ method: "GET", headers: { authorization: "Bearer t" } }, res);
    expect(res._status).toBe(200);
    expect(res._json.devices).toHaveLength(1);
  });

  it("returns empty list when Supabase returns null data", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(200);
    expect(res._json.devices).toEqual([]);
  });

  it("returns 405 for unsupported methods", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "DELETE" }, res);
    expect(res._status).toBe(405);
  });

  it("returns 500 when Supabase returns an error", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "db" } }),
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when listing throws", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockImplementation(() => {
        throw new Error("unexpected");
      }),
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("unexpected");
  });

  it("uses default message when list throws non-Error", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockImplementation(() => {
        throw { code: "x" };
      }),
    });
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("Failed to list devices.");
  });
});
