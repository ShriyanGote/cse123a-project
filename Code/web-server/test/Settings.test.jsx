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
      getSession: (...args) => mockGetSession(...args),
      onAuthStateChange: (...args) => mockOnAuthStateChange(...args),
      signInWithPassword: (...args) => mockSignInWithPassword(...args),
      signOut: (...args) => mockSignOut(...args),
    },
  },
}));

function fetchUrl(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && "url" in input) return String(input.url);
  return String(input ?? "");
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
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: "tok",
          user: { email: "me@example.com" },
        },
      },
    });
    globalThis.fetch.mockImplementation(async (input) => {
      const url = fetchUrl(input);
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
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) })
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/devices",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) })
      );
    });
    const lists = screen.getAllByRole("list");
    expect(lists.length).toBeGreaterThanOrEqual(2);
  });

  it("signs out and clears group and device lists", async () => {
    const user = userEvent.setup();
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: "tok",
          user: { email: "me@example.com" },
        },
      },
    });
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        groups: [{ id: "1", name: "Home", role: "owner", device_id: null }],
        devices: [{ id: "9", device_name: "Kitchen", device_id: "d1", status: "active" }],
      }),
    });
    mockSignOut.mockResolvedValue({});

    render(<Settings />);
    await screen.findByRole("heading", { name: "My Account" });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /sign out/i }));

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
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [], devices: [] }),
    });
    render(<Settings />);
    await screen.findByRole("heading", { name: "Sign In" });
    await act(async () => {
      authCallback("SIGNED_IN", { user: { email: "x@y.com" }, access_token: "t2" });
    });
    expect(await screen.findByRole("heading", { name: "My Account" })).toBeInTheDocument();
  });

  it("shows load errors from account APIs", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: { access_token: "tok", user: { email: "me@example.com" } },
      },
    });
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
    await waitFor(() => {
      expect(pw).toHaveValue("");
    });
  });
});
