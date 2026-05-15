import React from "react";
import { AppState, Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import {
  ensureRemoteSessionValid,
  REMOTE_AUTH_POLL_MS,
  useRemoteAuthMonitor,
} from "../src/useRemoteAuthMonitor";

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockGetUser = jest.fn();
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock("../src/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
      refreshSession: (...args) => mockRefreshSession(...args),
      getUser: (...args) => mockGetUser(...args),
      signOut: (...args) => mockSignOut(...args),
    },
  },
}));

function MonitorHarness({ enabled }) {
  useRemoteAuthMonitor(enabled);
  return <Text>monitor</Text>;
}

describe("useRemoteAuthMonitor", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockSignOut.mockClear();
    AppState.currentState = "active";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when disabled", async () => {
    render(<MonitorHarness enabled={false} />);
    await act(async () => {
      jest.advanceTimersByTime(REMOTE_AUTH_POLL_MS * 2);
    });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("polls while enabled and signs out when refresh fails", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid Refresh Token" },
    });
    render(<MonitorHarness enabled />);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" }));
    await act(async () => {
      jest.advanceTimersByTime(REMOTE_AUTH_POLL_MS);
    });
    expect(mockSignOut.mock.calls.length).toBeGreaterThan(1);
  });

  it("signs out when getUser fails after refresh", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
      error: null,
    });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "JWT expired" } });
    render(<MonitorHarness enabled />);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" }));
  });

  it("re-checks when the app returns to foreground", async () => {
    let changeHandler;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, handler) => {
      changeHandler = handler;
      return { remove: jest.fn() };
    });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<MonitorHarness enabled />);
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    mockGetSession.mockClear();
    AppState.currentState = "background";
    changeHandler("background");
    AppState.currentState = "active";
    changeHandler("active");
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
  });
});

describe("ensureRemoteSessionValid", () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  });

  it("returns true when there is no local session", async () => {
    await expect(ensureRemoteSessionValid()).resolves.toBe(true);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it("returns false after signing out on refresh failure", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: "revoked" },
    });
    await expect(ensureRemoteSessionValid()).resolves.toBe(false);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
