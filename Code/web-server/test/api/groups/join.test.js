import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/auth.js", () => ({
  requireUserAuth: vi.fn(),
}));

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import handler from "../../../api/groups/join.js";
import { requireUserAuth } from "../../../api/_lib/auth.js";
import { supabaseAdmin } from "../../../api/_lib/supabaseAdmin.js";
import { createMockRes as mockRes } from "../../createMockRes.js";

describe("api/groups/join", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireUserAuth.mockReset();
    supabaseAdmin.from.mockReset();
  });

  it("returns 400 when invite code is missing", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "POST", body: {} }, res);
    expect(res._status).toBe(400);
  });

  it("returns 404 when invite is unknown", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const res = mockRes();
    await handler({ method: "POST", body: { invite_code: "ABCDEF" } }, res);
    expect(res._status).toBe(404);
  });

  it("returns 409 when already a member", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let step = 0;
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => {
        step += 1;
        if (step === 1) return { data: { id: "g1" }, error: null };
        return { data: { group_id: "g1" }, error: null };
      }),
    }));
    const res = mockRes();
    await handler({ method: "POST", body: { invite_code: "ABCDEF" } }, res);
    expect(res._status).toBe(409);
  });

  it("joins successfully", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let step = 0;
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => {
        step += 1;
        if (step === 1) return { data: { id: "g1" }, error: null };
        return { data: null, error: null };
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));
    const res = mockRes();
    await handler({ method: "POST", body: { invite_code: "abcdef" } }, res);
    expect(res._status).toBe(200);
    expect(res._json.group_id).toBe("g1");
  });

  it("handles OPTIONS and rejects non-POST", async () => {
    const opt = mockRes();
    await handler({ method: "OPTIONS" }, opt);
    expect(opt._status).toBe(204);

    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    const res = mockRes();
    await handler({ method: "GET" }, res);
    expect(res._status).toBe(405);
  });

  it("returns 500 when group lookup errors", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "db" } }),
    });
    const res = mockRes();
    await handler({ method: "POST", body: { invite_code: "ABCDEF" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when membership lookup errors", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let step = 0;
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => {
        step += 1;
        if (step === 1) return { data: { id: "g1" }, error: null };
        return { data: null, error: { message: "mem err" } };
      }),
    }));
    const res = mockRes();
    await handler({ method: "POST", body: { invite_code: "ABCDEF" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when join insert fails", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    let step = 0;
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => {
        step += 1;
        if (step === 1) return { data: { id: "g1" }, error: null };
        return { data: null, error: null };
      }),
      insert: vi.fn().mockResolvedValue({ error: { message: "insert fail" } }),
    }));
    const res = mockRes();
    await handler({ method: "POST", body: { invite_code: "ABCDEF" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns 500 when join handler throws", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation(() => {
      throw new Error("join boom");
    });
    const res = mockRes();
    await handler({ method: "POST", body: { invite_code: "ABCDEF" } }, res);
    expect(res._status).toBe(500);
  });

  it("returns early when join POST has no auth", async () => {
    requireUserAuth.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: "POST", body: { invite_code: "ABC" } }, res);
    expect(res._status).toBeNull();
  });

  it("maps join catch errors without message", async () => {
    requireUserAuth.mockResolvedValue({ user: { id: "u1" } });
    supabaseAdmin.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockRejectedValue({}),
    }));
    const res = mockRes();
    await handler({ method: "POST", body: { invite_code: "ABCDEF" } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("Could not join group.");
  });
});
