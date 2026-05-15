import {
  calibrateGroup,
  createGroup,
  deleteGroup,
  ensureMyProfile,
  fetchAppState,
  fetchGroupDetails,
  fetchMyDevices,
  fetchMyGroups,
  fetchMyProfile,
  joinGroupByInvite,
  registerBleDevice,
  removeGroupMember,
  updateGroup,
  updateGroupMemberRole,
} from "../src/api";

const mockGetSession = jest.fn();

jest.mock("../src/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
    },
  },
}));

describe("api", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com";
    jest.resetModules();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token-abc" } },
      error: null,
    });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
    jest.resetModules();
  });

  function loadApi() {
    return require("../src/api");
  }

  it("exposes apiBaseUrl without trailing slash", () => {
    const api = loadApi();
    expect(api.apiBaseUrl).toBe("https://api.example.com");
  });

  it("throws when session has no token", async () => {
    const api = loadApi();
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(api.fetchMyGroups()).rejects.toThrow("Please sign in first.");
  });

  it("throws when getSession returns an error without message", async () => {
    const api = loadApi();
    mockGetSession.mockResolvedValueOnce({ data: {}, error: {} });
    await expect(api.fetchMyGroups()).rejects.toThrow("Failed to read auth session.");
  });

  it("throws when API base is not HTTPS", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://insecure.example";
    const api = loadApi();
    await expect(api.fetchMyGroups()).rejects.toThrow("API base URL must use HTTPS.");
  });

  it("merges custom headers and returns JSON on success", async () => {
    const api = loadApi();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ groups: [{ id: "g1" }] }),
    });
    const result = await api.apiFetch("/api/groups");
    expect(result).toEqual({ groups: [{ id: "g1" }] });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await api.apiFetch("/api/groups", {
      method: "GET",
      headers: { "X-Test": "1" },
    });
    expect(global.fetch).toHaveBeenLastCalledWith(
      "https://api.example.com/api/groups",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-abc",
          "X-Test": "1",
        }),
      })
    );
  });

  it("throws helpful messages for missing API routes", async () => {
    const api = loadApi();
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    await expect(api.fetchMyGroups()).rejects.toThrow("API route not found");
    await expect(api.fetchMyProfile()).rejects.toThrow("API route not found");
    await expect(api.fetchMyDevices()).rejects.toThrow("API route not found");
  });

  it("throws server error message from JSON body", async () => {
    const api = loadApi();
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server blew up" }),
    });
    await expect(api.fetchMyGroups()).rejects.toThrow("Server blew up");
  });

  it("throws generic status when response JSON is invalid", async () => {
    const api = loadApi();
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 418,
      json: async () => {
        throw new Error("bad json");
      },
    });
    await expect(api.fetchMyGroups()).rejects.toThrow("Request failed (418)");
  });

  it("calls each exported endpoint with expected methods", async () => {
    const api = loadApi();
    const ok = { ok: true, status: 200, json: async () => ({ ok: true }) };
    global.fetch.mockResolvedValue(ok);

    await api.fetchAppState();
    await api.registerBleDevice({ device_id: "d1", auth_token: "t" });
    await api.ensureMyProfile();
    await api.ensureMyProfile("Alice");
    await api.fetchMyProfile();
    await api.fetchMyDevices();
    await api.createGroup({ name: "Home" });
    await api.joinGroupByInvite("ABCD12");
    await api.fetchGroupDetails("gid");
    await api.updateGroup("gid", { name: "New" });
    await api.deleteGroup("gid");
    await api.updateGroupMemberRole("gid", "uid", "owner");
    await api.removeGroupMember("gid", "uid");
    await api.calibrateGroup("gid", "empty");

    const calls = global.fetch.mock.calls;
    expect(calls[2][1].body).toContain('"display_name":null');
    expect(calls.map(([, init]) => init.method)).toEqual([
      "GET",
      "POST",
      "POST",
      "POST",
      "GET",
      "GET",
      "POST",
      "POST",
      "GET",
      "PATCH",
      "DELETE",
      "PATCH",
      "DELETE",
      "POST",
    ]);
  });
});
