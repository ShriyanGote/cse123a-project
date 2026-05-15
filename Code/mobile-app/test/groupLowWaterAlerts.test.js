import {
  clearAllLowWaterAlertState,
  LOW_WATER_ALERT_DELAY_MS,
  LOW_WATER_THRESHOLD_PERCENT,
  shouldAlertLowWater,
  updateGroupWaterLevelState,
  waterPercentForGroup,
} from "../src/groupLowWaterAlerts";
import { scheduleLowWaterLocalNotification } from "../src/notifications";

jest.mock("../src/notifications", () => ({
  scheduleLowWaterLocalNotification: jest.fn(() => Promise.resolve()),
}));

const group = {
  id: "g1",
  name: " Kitchen ",
  device_id: "dev-1",
  empty_g: 0,
  full_g: 100,
};

describe("groupLowWaterAlerts", () => {
  beforeEach(() => {
    clearAllLowWaterAlertState();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("computes water percent for a group reading", () => {
    expect(
      waterPercentForGroup(group, { weight_g: 50, created_at: "t1" })
    ).toBe(50);
    expect(
      waterPercentForGroup(group, { weight_g: 25, updated_at: "t2" })
    ).toBe(25);
    expect(waterPercentForGroup(null, { weight_g: 1 })).toBeNull();
    expect(waterPercentForGroup(group, null)).toBeNull();
    expect(waterPercentForGroup(group, { weight_g: null })).toBeNull();
  });

  it("shouldAlertLowWater returns false at/above threshold or without reading signature", () => {
    expect(shouldAlertLowWater(50, 20, null, null)).toBe(false);
    expect(shouldAlertLowWater(50, 25, "sig", "sig")).toBe(false);
    expect(shouldAlertLowWater(10, 10, "sig-a", "sig-a")).toBe(false);
  });

  it("shouldAlertLowWater alerts on cross or new low reading", () => {
    expect(shouldAlertLowWater(25, 10, null, "sig-b")).toBe(true);
    expect(shouldAlertLowWater(25, 10, "sig-a", "sig-b")).toBe(true);
  });

  it("clears state when group has no device", async () => {
    await updateGroupWaterLevelState({ ...group, device_id: null }, { weight_g: 5 });
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, { weight_g: 80, created_at: "b" });
    expect(scheduleLowWaterLocalNotification).not.toHaveBeenCalled();
  });

  it("alerts immediately when crossing below threshold from above", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT,
      created_at: "high",
    });
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT - 1,
      created_at: "low",
    });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "g1", groupName: "Kitchen" })
    );
  });

  it("uses default group name when name is not a string", async () => {
    await updateGroupWaterLevelState(
      { ...group, name: 123 },
      { weight_g: LOW_WATER_THRESHOLD_PERCENT - 1, created_at: "low" }
    );
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalledWith(
      expect.objectContaining({ groupName: "Group" })
    );
  });

  it("uses default group name when name is blank", async () => {
    await updateGroupWaterLevelState(
      { ...group, name: "   " },
      { weight_g: 0, created_at: "z1" }
    );
    jest.advanceTimersByTime(LOW_WATER_ALERT_DELAY_MS + 1);
    await updateGroupWaterLevelState(
      { ...group, name: "   " },
      { weight_g: 0, created_at: "z2" }
    );
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalledWith(
      expect.objectContaining({ groupName: "Group" })
    );
  });

  it("waits before alerting on sustained zero percent", async () => {
    await updateGroupWaterLevelState(group, { weight_g: 0, created_at: "z1" });
    expect(scheduleLowWaterLocalNotification).not.toHaveBeenCalled();
    jest.advanceTimersByTime(LOW_WATER_ALERT_DELAY_MS);
    await updateGroupWaterLevelState(group, { weight_g: 0, created_at: "z2" });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalled();
  });

  it("skips duplicate zero-percent alerts for the same reading signature", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT,
      created_at: "high",
    });
    await updateGroupWaterLevelState(group, { weight_g: 0, created_at: "z-same" });
    jest.advanceTimersByTime(LOW_WATER_ALERT_DELAY_MS + 1);
    await updateGroupWaterLevelState(group, { weight_g: 0, created_at: "z-same" });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalledTimes(1);
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, { weight_g: 0, created_at: "z-same" });
    expect(scheduleLowWaterLocalNotification).not.toHaveBeenCalled();
  });

  it("clears bookkeeping when level returns above threshold", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: 5,
      created_at: "low",
    });
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, {
      weight_g: 90,
      created_at: "high",
    });
    await updateGroupWaterLevelState(group, {
      weight_g: 5,
      created_at: "low-again",
    });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalledTimes(1);
  });

  it("ignores updates without group id or readable weight", async () => {
    await updateGroupWaterLevelState({}, { weight_g: 1 });
    await updateGroupWaterLevelState(group, { weight_g: null });
    expect(scheduleLowWaterLocalNotification).not.toHaveBeenCalled();
  });

  it("does not re-alert for the same low reading signature", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT,
      created_at: "high",
    });
    await updateGroupWaterLevelState(group, {
      weight_g: 10,
      created_at: "low-1",
    });
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, {
      weight_g: 10,
      created_at: "low-1",
    });
    expect(scheduleLowWaterLocalNotification).not.toHaveBeenCalled();
  });

  it("builds reading signatures without battery_mv", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT,
      created_at: "high",
    });
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, {
      weight_g: 10,
      created_at: "low-no-batt",
    });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalled();
  });

  it("builds reading signatures when timestamps are missing", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT,
    });
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, {
      weight_g: 10,
    });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalled();
  });

  it("builds reading signatures when battery_mv is zero", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT,
      created_at: "high",
    });
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, {
      weight_g: 10,
      battery_mv: 0,
      created_at: "low-zero-batt",
    });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalled();
  });

  it("includes battery_mv in reading signatures", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT,
      created_at: "high",
    });
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, {
      weight_g: 10,
      battery_mv: 3100,
      created_at: "low-batt",
    });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalled();
  });

  it("ignores readings without weight", async () => {
    await updateGroupWaterLevelState(group, { weight_g: null, created_at: "x" });
    expect(scheduleLowWaterLocalNotification).not.toHaveBeenCalled();
  });

  it("builds reading signatures from updated_at when created_at is missing", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT,
      created_at: "high",
    });
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, {
      weight_g: 10,
      updated_at: "low-updated",
    });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalled();
  });

  it("clearAllLowWaterAlertState resets internal map", async () => {
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT,
      created_at: "high",
    });
    clearAllLowWaterAlertState();
    scheduleLowWaterLocalNotification.mockClear();
    await updateGroupWaterLevelState(group, {
      weight_g: LOW_WATER_THRESHOLD_PERCENT - 1,
      created_at: "low",
    });
    expect(scheduleLowWaterLocalNotification).toHaveBeenCalled();
  });
});
