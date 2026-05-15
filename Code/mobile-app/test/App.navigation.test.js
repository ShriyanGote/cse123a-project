import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import App, { navigationRef } from "../App";
import {
  addNotificationResponseListener,
  handleInitialNotification,
} from "../src/notifications";
import {
  captureNotificationHandler,
  mockOnAuthStateChange,
  resetAppTestState,
  signIn,
  signedInSession,
} from "./helpers/appMocks";

jest.mock("../src/supabase", () => require("./helpers/appMocks").createSupabaseMock());
jest.mock("../src/api", () => require("./helpers/appMocks").createApiMock());
jest.mock("../src/notifications", () => require("./helpers/appMocks").createNotificationsMock());
jest.mock("../src/groupLowWaterAlerts", () => ({
  clearAllLowWaterAlertState: jest.fn(),
}));
jest.mock("../src/useLowWaterMonitor", () => ({
  useLowWaterMonitor: jest.fn(),
}));

import { INTRO_TAGLINE } from "./helpers/screenTestUtils";

describe("App notification navigation", () => {
  let getNotificationHandler;

  beforeEach(() => {
    resetAppTestState(navigationRef);
    signIn();
    getNotificationHandler = captureNotificationHandler(addNotificationResponseListener);
  });

  async function renderWithHandlers({ initialHandler } = {}) {
    handleInitialNotification.mockImplementation(
      initialHandler
        ? async (handler) => {
            initialHandler(handler);
          }
        : async () => {}
    );
    render(<App />);
    await waitFor(() => expect(addNotificationResponseListener).toHaveBeenCalled());
  }

  it("navigates to groups from notification listeners when ready", async () => {
    await renderWithHandlers({
      initialHandler: (handler) => handler("initial-group", "Initial"),
    });
    await act(async () => {
      getNotificationHandler()("tap-group", "Kitchen");
    });
    expect(navigationRef.navigate).toHaveBeenCalledWith("Group", {
      groupId: "tap-group",
      groupName: "Kitchen",
    });
    expect(navigationRef.navigate).toHaveBeenCalledWith("Group", {
      groupId: "initial-group",
      groupName: "Initial",
    });
  });

  it("uses default group name when notification omits it", async () => {
    await renderWithHandlers();
    await act(async () => {
      getNotificationHandler()("gid-only");
    });
    expect(navigationRef.navigate).toHaveBeenCalledWith("Group", {
      groupId: "gid-only",
      groupName: "Group",
    });
  });

  it("queues navigation when navigation is not ready", async () => {
    navigationRef.isReady = jest.fn(() => false);
    await renderWithHandlers();
    await act(async () => {
      getNotificationHandler()("queued", "Queued");
    });
    expect(navigationRef.navigate).not.toHaveBeenCalled();
    navigationRef.isReady = jest.fn(() => true);
    await act(async () => {
      mockOnAuthStateChange("SIGNED_IN", signedInSession);
    });
  });

  it("recovers when navigate throws", async () => {
    navigationRef.navigate.mockImplementation(() => {
      throw new Error("nav failed");
    });
    await renderWithHandlers();
    await act(async () => {
      getNotificationHandler()("retry-group", "Retry");
    });
    navigationRef.isReady = jest.fn(() => true);
    await act(async () => {
      mockOnAuthStateChange("TOKEN_REFRESHED", signedInSession);
    });
  });

  it("ignores notification taps without a group id", async () => {
    await renderWithHandlers();
    navigationRef.navigate.mockClear();
    await act(async () => {
      getNotificationHandler()(null);
    });
    expect(navigationRef.navigate).not.toHaveBeenCalled();
  });

  it("queues navigation while intro is showing", async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    await renderWithHandlers();
    await act(async () => {
      getNotificationHandler()("queued-group", "Queued");
    });
    expect(navigationRef.navigate).not.toHaveBeenCalled();
  });

  it("flushes queued navigation after intro is completed", async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    render(<App />);
    await waitFor(() => expect(addNotificationResponseListener).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(INTRO_TAGLINE)).toBeTruthy());
    await act(async () => {
      getNotificationHandler()("queued-group", "Queued");
    });
    expect(navigationRef.navigate).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByText("Get Started"));
    });
    await waitFor(() =>
      expect(navigationRef.navigate).toHaveBeenCalledWith("Group", {
        groupId: "queued-group",
        groupName: "Queued",
      })
    );
  });

  it("re-queues navigation when flush navigate throws", async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    render(<App />);
    await waitFor(() => expect(addNotificationResponseListener).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(INTRO_TAGLINE)).toBeTruthy());
    await act(async () => {
      getNotificationHandler()("retry-group", "Retry");
    });
    navigationRef.navigate.mockImplementation(() => {
      throw new Error("flush failed");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Get Started"));
    });
    expect(navigationRef.navigate).toHaveBeenCalled();
  });
});
