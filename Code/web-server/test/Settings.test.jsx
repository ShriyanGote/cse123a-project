import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "../src/Settings";

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock("../src/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...a) => mockGetSession(...a),
      onAuthStateChange: (...a) => mockOnAuthStateChange(...a),
      signInWithPassword: (...a) => mockSignInWithPassword(...a),
      signOut: (...a) => mockSignOut(...a),
    },
  },
}));

function fetchUrl(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && "url" in input) return String(input.url);
  return String(input ?? "");
}

function signedIn(email = "me@example.com", token = "tok") {
  return { data: { session: { access_token: token, user: { email } } } };
}

describe("Settings", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockOnAuthStateChange.mockClear();
    mockSignInWithPassword.mockClear();
    mockSignOut.mockClear();
    globalThis.fetch = vi.fn();
  });

  it("shows loading then sign-in when there is no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<Settings />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Sign In" })).toBeInTheDocument();
  });

  it("submits sign-in and shows errors from Supabase", async () => {
    const user = userEvent.setup();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({ error: { message: "Invalid login" } });
    render(<Settings />);
    await screen.findByRole("heading", { name: "Sign In" });
    await user.type(screen.getByLabelText(/Email/i), "a@b.com");
    await user.type(screen.getByLabelText(/Password/i), "secret");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));
    expect(await screen.findByText("Invalid login")).toBeInTheDocument();
  });

  it("lists groups and devices when signed in", async () => {
    mockGetSession.mockResolvedValue(signedIn());
    globalThis.fetch.mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url.includes("/api/profile")) {
        return { ok: true, json: async () => ({ id: "u1", display_name: "Me" }) };
      }
      if (url.includes("/api/groups")) {
        return {
          ok: true,
          json: async () => ({
            groups: [{ id: "1", name: "Home", role: "owner", device_id: "d1" }],
          }),
        };
      }
      if (url.includes("/api/devices")) {
        return {
          ok: true,
          json: async () => ({
            devices: [{ id: "9", device_name: "Kitchen", device_id: "d1", status: "active" }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    render(<Settings />);
    expect(await screen.findByRole("heading", { name: "My Account" })).toBeInTheDocument();
    expect(screen.getByText(/me@example.com/)).toBeInTheDocument();
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/groups",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        })
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/devices",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        })
      );
    });
    expect(screen.getAllByRole("list").length).toBeGreaterThanOrEqual(2);
  });

  it("signs out and clears group and device lists", async () => {
    const user = userEvent.setup();
    mockGetSession.mockResolvedValue(signedIn());
    globalThis.fetch.mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url.includes("/api/profile")) {
        return { ok: true, json: async () => ({ id: "u1", display_name: "Me" }) };
      }
      if (url.includes("/api/groups")) {
        return {
          ok: true,
          json: async () => ({
            groups: [{ id: "1", name: "Home", role: "owner", device_id: null }],
          }),
        };
      }
      if (url.includes("/api/devices")) {
        return {
          ok: true,
          json: async () => ({
            devices: [{ id: "9", device_name: "Kitchen", device_id: "d1", status: "active" }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    mockSignOut.mockResolvedValue({});
    render(<Settings />);
    await screen.findByRole("heading", { name: "My Account" });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "(sign out)" }));
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    await waitFor(() => {
      expect(screen.getByText("No groups found for this account.")).toBeInTheDocument();
      expect(screen.getByText("No devices found for this account.")).toBeInTheDocument();
    });
  });

  it("updates session when onAuthStateChange fires", async () => {
    let authCallback;
    mockOnAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    globalThis.fetch.mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url.includes("/api/profile")) {
        return { ok: true, json: async () => ({ id: "u1", display_name: "Me" }) };
      }
      return { ok: true, json: async () => ({ groups: [], devices: [] }) };
    });
    render(<Settings />);
    await screen.findByRole("heading", { name: "Sign In" });
    await act(async () => {
      authCallback("SIGNED_IN", { user: { email: "x@y.com" }, access_token: "t2" });
    });
    expect(await screen.findByRole("heading", { name: "My Account" })).toBeInTheDocument();
  });

  it("shows load errors from account APIs", async () => {
    mockGetSession.mockResolvedValue(signedIn());
    globalThis.fetch.mockRejectedValue(new Error("network down"));
    render(<Settings />);
    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("clears password after successful sign-in", async () => {
    const user = userEvent.setup();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    render(<Settings />);
    await screen.findByRole("heading", { name: "Sign In" });
    const pw = screen.getByLabelText(/Password/i);
    await user.type(screen.getByLabelText(/Email/i), "a@b.com");
    await user.type(pw, "secret123");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));
    await waitFor(() => expect(pw).toHaveValue(""));
  });

  it("defaults missing groups and devices keys after load", async () => {
    mockGetSession.mockResolvedValue(signedIn());
    globalThis.fetch.mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url.includes("/api/profile")) {
        return { ok: true, json: async () => ({ id: "u1", display_name: "Me" }) };
      }
      if (url.includes("/api/groups") || url.includes("/api/devices")) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: false, json: async () => ({}) };
    });
    render(<Settings />);
    await screen.findByRole("heading", { name: "My Account" });
    await waitFor(() => {
      expect(screen.getByText("No groups found for this account.")).toBeInTheDocument();
      expect(screen.getByText("No devices found for this account.")).toBeInTheDocument();
    });
  });

  it("shows device_id when device_name is absent", async () => {
    mockGetSession.mockResolvedValue(signedIn());
    globalThis.fetch.mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url.includes("/api/profile")) {
        return { ok: true, json: async () => ({ id: "u1", display_name: "Me" }) };
      }
      if (url.includes("/api/groups")) return { ok: true, json: async () => ({ groups: [] }) };
      if (url.includes("/api/devices")) {
        return {
          ok: true,
          json: async () => ({
            devices: [{ id: "9", device_name: null, device_id: "hw-only", status: "active" }],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    render(<Settings />);
    expect(await screen.findByText(/hw-only · active/)).toBeInTheDocument();
  });

  it("maps HTTP errors without JSON error field", async () => {
    mockGetSession.mockResolvedValue(signedIn("e@e.com"));
    globalThis.fetch.mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url.includes("/api/profile")) {
        return { ok: true, json: async () => ({ id: "u1", display_name: "Me" }) };
      }
      return { ok: false, status: 502, json: async () => ({}) };
    });
    render(<Settings />);
    expect(await screen.findByText("Request failed (502)")).toBeInTheDocument();
  });

  it("deletes account after confirmation", async () => {
    const user = userEvent.setup();
    mockGetSession.mockResolvedValue(signedIn());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    globalThis.fetch.mockImplementation(async (input, init) => {
      const url = fetchUrl(input);
      if (url.includes("/api/profile") && init?.method === "POST") {
        const body = JSON.parse(init.body);
        if (body.delete_account === true) {
          return { ok: true, json: async () => ({ ok: true, deleted: true }) };
        }
      }
      if (url.includes("/api/profile")) {
        return { ok: true, json: async () => ({ id: "u1", display_name: "Me" }) };
      }
      if (url.includes("/api/groups")) return { ok: true, json: async () => ({ groups: [] }) };
      if (url.includes("/api/devices")) return { ok: true, json: async () => ({ devices: [] }) };
      return { ok: false, json: async () => ({}) };
    });
    mockSignOut.mockResolvedValue({});
    render(<Settings />);
    await screen.findByRole("heading", { name: "My Account" });
    await user.click(screen.getByRole("button", { name: /Delete account/i }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/profile",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ delete_account: true }),
        })
      );
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    });
    confirmSpy.mockRestore();
  });

  it("does not delete account when delete is cancelled", async () => {
    const user = userEvent.setup();
    mockGetSession.mockResolvedValue(signedIn());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    globalThis.fetch.mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url.includes("/api/profile")) {
        return { ok: true, json: async () => ({ id: "u1", display_name: "Me" }) };
      }
      if (url.includes("/api/groups")) return { ok: true, json: async () => ({ groups: [] }) };
      if (url.includes("/api/devices")) return { ok: true, json: async () => ({ devices: [] }) };
      return { ok: false, json: async () => ({}) };
    });
    render(<Settings />);
    await screen.findByRole("heading", { name: "My Account" });
    await user.click(screen.getByRole("button", { name: /Delete account/i }));
    expect(
      globalThis.fetch.mock.calls.some(
        ([url, init]) =>
          fetchUrl(url).includes("/api/profile") &&
          init?.method === "POST" &&
          init.body?.includes("delete_account")
      )
    ).toBe(false);
    confirmSpy.mockRestore();
  });

  it("clears session when auth callback omits session", async () => {
    let authCallback;
    mockOnAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockGetSession.mockResolvedValue(signedIn("x@y.com", "t"));
    globalThis.fetch.mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url.includes("/api/profile")) {
        return { ok: true, json: async () => ({ id: "u1", display_name: "Me" }) };
      }
      return { ok: true, json: async () => ({ groups: [], devices: [] }) };
    });
    render(<Settings />);
    await screen.findByRole("heading", { name: "My Account" });
    await act(async () => authCallback("TOKEN_REFRESHED", undefined));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Sign In" })).toBeInTheDocument();
    });
  });
});
