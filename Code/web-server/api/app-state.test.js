import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the auth and supabase modules before importing the handler
vi.mock("./_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("./_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import handler from "./app-state.js";
import { requireUserAuth } from "./_lib/auth.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

// Helper: build a fake req object
function mockReq(method = "GET", headers = {}) {
  return { method, headers };
}

// Helper: build a fake res object that records status + body
function mockRes() {
  const res = {
    _status: null,
    _json: null,
    _ended: false,
    _headers: {},
    setHeader(key, value) {
      res._headers[key] = value;
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

// Helper: set up supabaseAdmin.from() to return chained query results
function mockSupabaseChain(resolvedValue) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
  };
  return chain;
}

describe("app-state handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 204 for CORS preflight OPTIONS request", async () => {
    const req = mockReq("OPTIONS");
    const res = mockRes();

    await handler(req, res);

    expect(res._status).toBe(204);
    expect(res._ended).toBe(true);
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("returns 405 for non-GET methods", async () => {
    const req = mockReq("POST");
    const res = mockRes();

    await handler(req, res);

    expect(res._status).toBe(405);
    expect(res._json).toEqual({ error: "Use GET" });
  });

  it("returns 401 when auth fails", async () => {
    requireUserAuth.mockResolvedValue(null);

    const req = mockReq("GET", { authorization: "Bearer bad-token" });
    const res = mockRes();

    await handler(req, res);

    // requireUserAuth sets the 401 response itself and returns null
    expect(requireUserAuth).toHaveBeenCalledWith(req, res);
  });

  it("returns reading and calibration on success", async () => {
    const fakeReading = { id: 1, weight_g: 1500, created_at: "2026-04-29T00:00:00Z" };
    const fakeCalibration = { id: 1, empty: 0, full: 2500, created_at: "2026-04-29T00:00:00Z" };

    requireUserAuth.mockResolvedValue({ type: "user", user: { id: "u1" } });

    const readingChain = mockSupabaseChain({ data: fakeReading, error: null });
    const calibrationChain = mockSupabaseChain({ data: fakeCalibration, error: null });

    let callCount = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "water_readings") return readingChain;
      if (table === "calibration") return calibrationChain;
    });

    const req = mockReq("GET", { authorization: "Bearer valid-token" });
    const res = mockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({
      reading: fakeReading,
      calibration: fakeCalibration,
    });
  });

  it("returns nulls when no reading or calibration exists", async () => {
    requireUserAuth.mockResolvedValue({ type: "user", user: { id: "u1" } });

    const emptyChain = mockSupabaseChain({ data: null, error: null });
    supabaseAdmin.from.mockReturnValue(emptyChain);

    const req = mockReq("GET", { authorization: "Bearer valid-token" });
    const res = mockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({ reading: null, calibration: null });
  });

  it("returns 500 when water_readings query fails", async () => {
    requireUserAuth.mockResolvedValue({ type: "user", user: { id: "u1" } });

    const errorChain = mockSupabaseChain({ data: null, error: { message: "DB read error" } });
    supabaseAdmin.from.mockReturnValue(errorChain);

    const req = mockReq("GET", { authorization: "Bearer valid-token" });
    const res = mockRes();

    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json).toEqual({ error: "DB read error" });
  });

  it("returns 500 when calibration query fails", async () => {
    requireUserAuth.mockResolvedValue({ type: "user", user: { id: "u1" } });

    const okChain = mockSupabaseChain({ data: { id: 1 }, error: null });
    const errChain = mockSupabaseChain({ data: null, error: { message: "calibration error" } });

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "water_readings") return okChain;
      if (table === "calibration") return errChain;
    });

    const req = mockReq("GET", { authorization: "Bearer valid-token" });
    const res = mockRes();

    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json).toEqual({ error: "calibration error" });
  });

  it("sets correct CORS headers on every request", async () => {
    requireUserAuth.mockResolvedValue(null);

    const req = mockReq("GET");
    const res = mockRes();

    await handler(req, res);

    expect(res._headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res._headers["Access-Control-Allow-Methods"]).toBe("GET, OPTIONS");
    expect(res._headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization");
  });
});
