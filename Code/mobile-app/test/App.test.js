import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App, {
  groupScreenTitle,
  groupStackScreenOptions,
  navigationRef,
  resolveGroupNavName,
} from "../App";
import { ensureMyProfile, fetchMyProfile, reactivateMyAccount } from "../src/api";
import {
  addNotificationResponseListener,
  clearLowWaterNotificationsOnSignOut,
  ensureLocalNotificationPermissionsAsync,
} from "../src/notifications";
import { clearAllLowWaterAlertState } from "../src/groupLowWaterAlerts";
import {
  mockChannelOn,
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
jest.mock("../src/useRemoteAuthMonitor", () => ({
  useRemoteAuthMonitor: jest.fn(),
}));

describe("App", () => {
  beforeEach(() => resetAppTestState(navigationRef));

  it("derives the group screen title from route params", () => {
    expect(groupScreenTitle({ params: { groupName: "Kitchen" } })).toBe("Kitchen");
    expect(groupScreenTitle({ params: { groupId: "g1" } })).toBe("Group");
    expect(groupScreenTitle({})).toBe("Group");
  });

  it("resolves notification group names with a default", () => {
    expect(resolveGroupNavName("Kitchen")).toBe("Kitchen");
    expect(resolveGroupNavName("")).toBe("Group");
    expect(resolveGroupNavName(undefined)).toBe("Group");
  });

  it("builds group stack screen options from route params", () => {
    expect(
      groupStackScreenOptions({ route: { params: { groupName: "Pantry" } } })
    ).toEqual({
      title: "Pantry",
      animation: "slide_from_right",
    });
    expect(groupStackScreenOptions({ route: { params: {} } }).title).toBe("Group");
  });

  it("shows loading then auth when intro is complete", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Water Group Dashboard")).toBeTruthy()
    );
  });

  it("opens intro from the auth screen via swipe", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Water Group Dashboard")).toBeTruthy()
    );
    await act(async () => {
      global.__getLatestPanResponderConfig().onPanResponderRelease({}, { dx: 100, dy: 0 });
    });
    await waitFor(() =>
      expect(
        screen.getByText("Household water filter monitoring made simple.")
      ).toBeTruthy()
    );
  });

  it("shows intro when it has not been completed", async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText("Household water filter monitoring made simple.")
      ).toBeTruthy()
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Get Started"));
    });
    await waitFor(() =>
      expect(screen.getByText("Water Group Dashboard")).toBeTruthy()
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("app:intro-completed", "true");
  });

  it("shows deactivated account UI and signs out", async () => {
    signIn();
    fetchMyProfile.mockResolvedValue({ is_active: false });
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Account deactivated")).toBeTruthy()
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Sign out"));
    });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(clearAllLowWaterAlertState).toHaveBeenCalled();
    expect(clearLowWaterNotificationsOnSignOut).toHaveBeenCalled();
  });

  it("ensures profile and local notifications for signed-in users", async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(ensureMyProfile).toHaveBeenCalled());
    await waitFor(() =>
      expect(ensureLocalNotificationPermissionsAsync).toHaveBeenCalled()
    );
    expect(addNotificationResponseListener).toHaveBeenCalled();
  });

  it("handles auth sign-in reset and profile realtime updates", async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(ensureMyProfile).toHaveBeenCalled());
    await act(async () => {
      mockOnAuthStateChange("SIGNED_IN", signedInSession);
    });
    const updateHandler = mockChannelOn.mock.calls[0][2];
    await act(async () => {
      updateHandler({ new: { is_active: false } });
    });
    await waitFor(() =>
      expect(screen.getByText("Account deactivated")).toBeTruthy()
    );
    await act(async () => {
      updateHandler({ new: { is_active: true } });
    });
    await waitFor(() => expect(screen.getByText("Home")).toBeTruthy());
  });

  it("reactivates account from the deactivated screen", async () => {
    signIn();
    fetchMyProfile.mockResolvedValue({ is_active: false });
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Account deactivated")).toBeTruthy()
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Reactivate account"));
    });
    await waitFor(() => expect(reactivateMyAccount).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Home")).toBeTruthy());
  });

  it("falls back when intro storage fails and profile upsert warns", async () => {
    AsyncStorage.getItem.mockRejectedValueOnce(new Error("storage down"));
    signIn();
    ensureMyProfile.mockRejectedValueOnce(new Error("profile failed"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText("Household water filter monitoring made simple.")
      ).toBeTruthy()
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores missing API route errors during profile ensure", async () => {
    signIn();
    ensureMyProfile.mockRejectedValueOnce(new Error("API route not found at /api/profile"));
    render(<App />);
    await waitFor(() => expect(ensureMyProfile).toHaveBeenCalled());
  });

  it("marks account deactivated from profile fetch errors", async () => {
    signIn();
    fetchMyProfile.mockRejectedValueOnce(new Error("Account deactivated (403)"));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Account deactivated")).toBeTruthy()
    );
  });

  it("saves intro completion errors gracefully", async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    AsyncStorage.setItem.mockRejectedValueOnce(new Error("write failed"));
    await expectConsoleWarn(async () => {
      render(<App />);
      await waitFor(() =>
        expect(
          screen.getByText("Household water filter monitoring made simple.")
        ).toBeTruthy()
      );
      await act(async () => {
        fireEvent.press(screen.getByText("Get Started"));
      });
    }, "Failed to save intro state:", "write failed");
  });

  it("warns when local notification setup fails", async () => {
    ensureLocalNotificationPermissionsAsync.mockRejectedValueOnce(
      new Error("notifications down")
    );
    signIn();
    await expectConsoleWarn(
      () => render(<App />),
      "Failed to initialize local notifications:",
      "notifications down"
    );
  });

  it("resets deactivated state after signing out from deactivated screen", async () => {
    signIn();
    fetchMyProfile.mockResolvedValue({ is_active: false });
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Account deactivated")).toBeTruthy()
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Sign out"));
    });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it("renders stack screens for signed-in users", async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(screen.getByText("Home")).toBeTruthy());
    expect(screen.getByText("Device Provisioning")).toBeTruthy();
    expect(screen.getByText("Members")).toBeTruthy();
  });

  it("enables remote auth monitoring for signed-in users", async () => {
    const { useRemoteAuthMonitor } = require("../src/useRemoteAuthMonitor");
    signIn();
    render(<App />);
    await waitFor(() => expect(ensureMyProfile).toHaveBeenCalled());
    expect(useRemoteAuthMonitor).toHaveBeenCalledWith(true);
  });

  it("returns to auth when session is revoked globally", async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(screen.getByText("Home")).toBeTruthy());
    await act(async () => {
      mockOnAuthStateChange("SIGNED_OUT", null);
    });
    await waitFor(() =>
      expect(screen.getByText("Water Group Dashboard")).toBeTruthy()
    );
  });

  it("clears low-water state when session ends", async () => {
    signIn();
    render(<App />);
    await waitFor(() => expect(ensureMyProfile).toHaveBeenCalled());
    await act(async () => {
      mockOnAuthStateChange("SIGNED_OUT", null);
    });
    expect(clearAllLowWaterAlertState).toHaveBeenCalled();
  });
});
