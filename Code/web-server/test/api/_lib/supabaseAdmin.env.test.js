import { afterEach, describe, expect, it, vi } from "vitest";

describe("supabaseAdmin when env is set", () => {
  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("loads without warning branch when both env vars are present", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    vi.resetModules();
    await import("../../../api/_lib/supabaseAdmin.js");
    expect(warn).not.toHaveBeenCalled();
  });
});
