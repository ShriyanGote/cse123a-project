describe("supabase module", () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    jest.resetModules();
  });

  it("reports configured when env vars are set", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { isSupabaseConfigured, supabase } = require("../src/supabase");
    expect(isSupabaseConfigured).toBe(true);
    expect(supabase).toBeDefined();
  });

  it("reports not configured and warns when env vars are missing", () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { isSupabaseConfigured, supabase } = require("../src/supabase");
    expect(isSupabaseConfigured).toBe(false);
    expect(supabase).toBeDefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Missing EXPO_PUBLIC_SUPABASE_URL")
    );
    warn.mockRestore();
  });
});
