import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App, { navigationRef } from "../App";
import { ensureMyProfile, fetchMyProfile } from "../src/api";
import {
  addNotificationResponseListener,
  ensureLocalNotificationPermissionsAsync,
} from "../src/notifications";
import {
  captureNotificationHandler,
  mockGetSession,
  mockOnAuthStateChange,
  mockSignOut,
  resetAppTestState,
  signIn,
  signedInSession,
} from "./helpers/appMocks";
import { expectConsoleWarn } from "./helpers/testUtils";

jest.mock("../src/supabase", () => require("./helpers/appMocks").createSupabaseMock());
jest.mock("../src/api", () => require("./helpers/appMocks").createApiMock());
jest.mock("../src/notifications", () => require("./helpers/appMocks").createNotificationsMock());
jest.mock("../src/groupLowWaterAlerts", () => ({
  clearAllLowWaterAlertState: jest.fn(),
}));
jest.mock("../src/useLowWaterMonitor", () => ({
  useLowWaterMonitor: jest.fn(),
}));

function flushAnimationFrames() {
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

describe("App branch coverage", () => {
  const mockDispatch = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    global.requestAnimationFrame = (callback) => {
      callback();
      return 0;
    };
    resetAppTestState(navigationRef);
    navigationRef.dispatch = mockDispatch;
  });

  it("ignores session updates after unmount", async () => {
    let resolveSession;
    mockGetSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSession = () => resolve({ data: { session: signedInSession } });
        })
    );
    const { unmount } = render(<App />);
    unmount();
    await act(async () => {
      resolveSession();
    });
  });

  it("skips dashboard reset when navigation is not ready on sign-in", async () => {
    navigationRef.isReady = jest.fn(() => false);
    signIn();
    render(<App />);
    await waitFor(() => expect(ensureMyProfile).toHaveBeenCalled());
    await act(async () => {
      mockOnAuthStateChange("SIGNED_IN", signedInSession);
    });
    flushAnimationFrames();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("tolerates dashboard reset failures on sign-in", async () => {
    mockDispatch.mockImplementation(() => {
      throw new Error("reset failed");
    });
    signIn();
    render(<App />);
    await waitFor(() => expect(ensureMyProfile).toHaveBeenCalled());
    await act(async () => {
      mockOnAuthStateChange("SIGNED_IN", signedInSession);
    });
    flushAnimationFrames();
    expect(mockDispatch).toHaveBeenCalled();
  });

  it.each([
    ["gid-empty", ""],
    ["gid-only", undefined],
  ])("uses default group name when notification passes %s", async (groupId, groupName) => {
    const getHandler = captureNotificationHandler(addNotificationResponseListener);
    signIn();
    render(<App />);
    await waitFor(() => expect(addNotificationResponseListener).toHaveBeenCalled());
    await act(async () => {
      getHandler()(groupId, groupName);
    });
    expect(navigationRef.navigate).toHaveBeenCalledWith("Group", {
      groupId,
      groupName: "Group",
    });
  });

  it.each([
    ["Failed to load intro state:", "storage unavailable", () =>
      AsyncStorage.getItem.mockRejectedValueOnce("storage unavailable")],
    ["Failed to load intro state:", {}, () => AsyncStorage.getItem.mockRejectedValueOnce({})],
    [
      "Failed to initialize local notifications:",
      "notifications down",
      () => {
        ensureLocalNotificationPermissionsAsync.mockRejectedValueOnce("notifications down");
        signIn();
      },
    ],
    [
      "Failed to upsert profile:",
      "profile down",
      () => {
        signIn();
        ensureMyProfile.mockRejectedValueOnce("profile down");
      },
    ],
    [
      "Failed to upsert profile:",
      "[object Object]",
      () => {
        signIn();
        ensureMyProfile.mockRejectedValueOnce({});
      },
    ],
  ])("warns with fallback text for %s", async (prefix, value, setup) => {
    setup();
    await expectConsoleWarn(() => render(<App />), prefix, value);
  });

  it("warns with fallback text when notification setup fails without a message", async () => {
    let rejectPermissions;
    const permissionsPromise = new Promise((_resolve, reject) => {
      rejectPermissions = reject;
    });
    ensureLocalNotificationPermissionsAsync.mockReturnValueOnce(permissionsPromise);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    signIn();
    render(<App />);
    await act(async () => {
      rejectPermissions({});
      await permissionsPromise.catch(() => {});
    });
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "Failed to initialize local notifications:",
        {}
      )
    );
    warn.mockRestore();
  });

  it("skips profile upsert when user metadata is missing", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "a@b.com" } } },
    });
    render(<App />);
    await waitFor(() => expect(ensureMyProfile).toHaveBeenCalledWith(null));
  });

  it("does not warn about notification setup after unmount", async () => {
    let resolvePermissions;
    const permissionsPromise = new Promise((resolve) => {
      resolvePermissions = resolve;
    });
    ensureLocalNotificationPermissionsAsync.mockReturnValueOnce(permissionsPromise);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    signIn();
    const { unmount } = render(<App />);
    unmount();
    await act(async () => {
      resolvePermissions(true);
    });
    expect(warn).not.toHaveBeenCalledWith(
      "Failed to initialize local notifications:",
      expect.anything()
    );
    warn.mockRestore();
  });

  it("cleans up safely when notification listener was not registered", async () => {
    addNotificationResponseListener.mockReturnValueOnce(null);
    signIn();
    const { unmount } = render(<App />);
    await waitFor(() => expect(ensureMyProfile).toHaveBeenCalled());
    unmount();
  });

  it("ignores profile deactivation updates after unmount", async () => {
    let resolveProfile;
    fetchMyProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        })
    );
    signIn();
    const { unmount } = render(<App />);
    await waitFor(() => expect(fetchMyProfile).toHaveBeenCalled());
    unmount();
    await act(async () => {
      resolveProfile({ is_active: false });
    });
  });

  it("marks account deactivated when profile fetch message matches 403", async () => {
    signIn();
    fetchMyProfile.mockRejectedValueOnce(new Error("Forbidden 403"));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Account deactivated")).toBeTruthy()
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("ignores non-deactivation profile fetch errors", async () => {
    signIn();
    fetchMyProfile.mockRejectedValueOnce(new Error("network down"));
    render(<App />);
    await waitFor(() => expect(fetchMyProfile).toHaveBeenCalled());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("stays on auth after sign-out even if profile realtime sets is_active true", async () => {
    signIn();
    fetchMyProfile.mockResolvedValue({ is_active: false });
    const { supabase } = require("../src/supabase");
    let updateHandler;
    supabase.channel.mockImplementation(() => ({
      on: jest.fn((_event, _filter, handler) => {
        updateHandler = handler;
        return { subscribe: jest.fn() };
      }),
      subscribe: jest.fn(),
    }));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Account deactivated")).toBeTruthy()
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Sign out"));
    });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await act(async () => {
      mockOnAuthStateChange("SIGNED_OUT", null);
      updateHandler({ new: { is_active: true } });
    });
    await waitFor(() =>
      expect(screen.getByText("Water Group Dashboard")).toBeTruthy()
    );
    expect(screen.queryByText("Home")).toBeNull();
  });

  it("warns with fallback text when intro save fails without a message", async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    AsyncStorage.setItem.mockRejectedValueOnce({});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText("Household water filter monitoring made simple.")
      ).toBeTruthy()
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Get Started"));
    });
    expect(warn).toHaveBeenCalledWith("Failed to save intro state:", {});
    warn.mockRestore();
  });
});
