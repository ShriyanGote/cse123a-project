import { afterEach, describe, expect, it, vi } from "vitest";

describe("supabase browser client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("creates a client using Vite env vars", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-test-key");
    const { supabase } = await import("../src/supabase.js");
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe("function");
  });
});
