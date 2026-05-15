import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import {
  generateInviteCode,
  getMembership,
  normalizeParam,
  requireMembership,
  setCors,
} from "../../../api/_lib/groups.js";
import { supabaseAdmin } from "../../../api/_lib/supabaseAdmin.js";

describe("groups helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    supabaseAdmin.from.mockReset();
  });

  it("normalizeParam handles arrays and scalars", () => {
    expect(normalizeParam(undefined)).toBe("");
    expect(normalizeParam(null)).toBe("");
    expect(normalizeParam("abc")).toBe("abc");
    expect(normalizeParam(["x", "y"])).toBe("x");
    expect(normalizeParam([])).toBe("");
  });

  it("generateInviteCode returns a string of expected length", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(generateInviteCode(4)).toHaveLength(4);
    expect(generateInviteCode(4)).toMatch(/^[A-Z2-9]+$/);
  });

  it("setCors sets headers", () => {
    const res = {
      _h: {},
      setHeader(k, v) {
        res._h[k] = v;
        return res;
      },
    };
    setCors(res, "GET, POST");
    expect(res._h["Access-Control-Allow-Origin"]).toBe("*");
    expect(res._h["Access-Control-Allow-Methods"]).toBe("GET, POST");
    expect(res._h["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization");
  });

  it("getMembership returns data or throws on error", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
    };
    supabaseAdmin.from.mockReturnValue(chain);

    const row = await getMembership("u1", "g1");
    expect(row).toEqual({ role: "owner" });
    expect(supabaseAdmin.from).toHaveBeenCalledWith("group_members");

    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "db" } });
    await expect(getMembership("u1", "g1")).rejects.toEqual({ message: "db" });
  });

  it("requireMembership throws 403-style error when missing", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    supabaseAdmin.from.mockReturnValue(chain);

    await expect(requireMembership("u1", "g1")).rejects.toMatchObject({
      message: "You do not have access to this group.",
      status: 403,
    });
  });
});
