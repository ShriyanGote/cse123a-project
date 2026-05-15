import React from "react";
import { AppState, Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import { useLowWaterMonitor } from "../src/useLowWaterMonitor";
import { fetchGroupDetails, fetchMyGroups } from "../src/api";
import { updateGroupWaterLevelState } from "../src/groupLowWaterAlerts";

jest.mock("../src/api", () => ({
  fetchMyGroups: jest.fn(),
  fetchGroupDetails: jest.fn(),
}));

jest.mock("../src/groupLowWaterAlerts", () => ({
  updateGroupWaterLevelState: jest.fn(() => Promise.resolve()),
}));

function MonitorHarness({ enabled }) {
  useLowWaterMonitor(enabled);
  return <Text>monitor</Text>;
}

describe("useLowWaterMonitor", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fetchMyGroups.mockResolvedValue({
      groups: [{ id: "g1", device_id: "d1" }],
    });
    fetchGroupDetails.mockResolvedValue({
      group: { id: "g1", device_id: "d1" },
      latestReading: { weight_g: 10 },
    });
    AppState.currentState = "active";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when disabled", async () => {
    render(<MonitorHarness enabled={false} />);
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(fetchMyGroups).not.toHaveBeenCalled();
  });

  it("polls groups while enabled and active", async () => {
    render(<MonitorHarness enabled />);
    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalled());
    await waitFor(() => expect(updateGroupWaterLevelState).toHaveBeenCalled());
    await act(async () => {
      jest.advanceTimersByTime(8_000);
    });
    expect(fetchMyGroups.mock.calls.length).toBeGreaterThan(1);
  });

  it("handles a missing groups array", async () => {
    fetchMyGroups.mockResolvedValueOnce({});
    render(<MonitorHarness enabled />);
    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalled());
    expect(fetchGroupDetails).not.toHaveBeenCalled();
  });

  it("updates groups that have no latest reading", async () => {
    fetchMyGroups.mockResolvedValue({
      groups: [{ id: "g2", device_id: "d2" }],
    });
    fetchGroupDetails.mockResolvedValue({
      group: { id: "g2", device_id: "d2" },
    });
    render(<MonitorHarness enabled />);
    await waitFor(() =>
      expect(updateGroupWaterLevelState).toHaveBeenCalledWith(
        { id: "g2", device_id: "d2" },
        null
      )
    );
  });

  it("skips groups when detail fetch fails", async () => {
    fetchMyGroups.mockResolvedValue({
      groups: [{ id: "g2", device_id: "d2" }],
    });
    fetchGroupDetails.mockRejectedValue(new Error("fail"));
    render(<MonitorHarness enabled />);
    await waitFor(() => expect(fetchGroupDetails).toHaveBeenCalled());
    expect(updateGroupWaterLevelState).not.toHaveBeenCalled();
  });

  it("cleans up interval on unmount", async () => {
    const { unmount } = render(<MonitorHarness enabled />);
    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalled());
    fetchMyGroups.mockClear();
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(fetchMyGroups).not.toHaveBeenCalled();
  });

  it("skips polling when app is not active", async () => {
    AppState.currentState = "background";
    render(<MonitorHarness enabled />);
    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalledTimes(0));
  });

  it("logs warnings when polling fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    fetchMyGroups.mockRejectedValueOnce({});
    render(<MonitorHarness enabled />);
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith("Low water monitor:", expect.anything())
    );
    warn.mockRestore();
  });

  it("cleans up when unmounted during setInterval assignment", async () => {
    let unmountDuringInterval;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockImplementation(() => {
      act(() => {
        unmountDuringInterval?.();
      });
      return 42;
    });
    const { unmount } = render(<MonitorHarness enabled />);
    unmountDuringInterval = unmount;
    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalled());
    setIntervalSpy.mockRestore();
  });

  it("polls again when app returns to active", async () => {
    let changeHandler;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, handler) => {
      changeHandler = handler;
      return { remove: jest.fn() };
    });
    render(<MonitorHarness enabled />);
    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalled());
    fetchMyGroups.mockClear();
    AppState.currentState = "background";
    changeHandler("background");
    changeHandler("active");
    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalled());
  });
});
