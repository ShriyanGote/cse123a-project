import { setNotificationHandler } from "expo-notifications";
import {
  addNotificationResponseListener,
  clearLowWaterNotificationsOnSignOut,
  ensureLocalNotificationPermissionsAsync,
  handleInitialNotification,
  scheduleLowWaterLocalNotification,
} from "../src/notifications";

const {
  mockScheduleNotificationAsync,
  mockGetPermissionsAsync,
  mockRequestPermissionsAsync,
  mockAddNotificationResponseReceivedListener,
  mockGetLastNotificationResponseAsync,
  mockGetPresentedNotificationsAsync,
  mockDismissNotificationAsync,
  mockDismissAllNotificationsAsync,
  mockCancelAllScheduledNotificationsAsync,
} = require("./mocks/expoNotifications").__mocks;

describe("notifications", () => {
  let foregroundHandler;

  beforeAll(() => {
    foregroundHandler = setNotificationHandler.mock.calls[0][0].handleNotification;
  });

  it("registers the foreground notification handler", async () => {
    await expect(foregroundHandler()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  beforeEach(() => {
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockRequestPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetLastNotificationResponseAsync.mockResolvedValue(null);
    mockGetPresentedNotificationsAsync.mockResolvedValue([]);
  });

  it("skips permission request when already granted", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: "granted" });
    await expect(ensureLocalNotificationPermissionsAsync()).resolves.toBe(true);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("requests permission when not yet granted", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: "undetermined" });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: "granted" });
    await expect(ensureLocalNotificationPermissionsAsync()).resolves.toBe(true);
    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
  });

  it("returns null when permission is denied", async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
    await expect(ensureLocalNotificationPermissionsAsync()).resolves.toBeNull();
  });

  it("invokes navigation callback from notification response listener", () => {
    const onNavigate = jest.fn();
    const subscriptionRemove = jest.fn();
    let listener;
    mockAddNotificationResponseReceivedListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: subscriptionRemove };
    });
    const remove = addNotificationResponseListener(onNavigate);
    listener({
      notification: {
        request: {
          content: { data: { groupId: "g1", groupName: "Kitchen" } },
        },
      },
    });
    expect(onNavigate).toHaveBeenCalledWith("g1", "Kitchen");
    remove();
    expect(subscriptionRemove).toHaveBeenCalled();
  });

  it("ignores invalid group ids in notification listener", () => {
    const onNavigate = jest.fn();
    let listener;
    mockAddNotificationResponseReceivedListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: jest.fn() };
    });
    addNotificationResponseListener(onNavigate);
    listener({
      notification: { request: { content: { data: { groupId: 123 } } } },
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("opens group from initial notification when present", async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValueOnce({
      notification: {
        request: { content: { data: { groupId: "g2", groupName: "Office" } } },
      },
    });
    const openGroup = jest.fn();
    await handleInitialNotification(openGroup);
    expect(openGroup).toHaveBeenCalledWith("g2", "Office");
  });

  it("skips dismiss when a presented notification has no identifier", async () => {
    mockGetPresentedNotificationsAsync.mockResolvedValueOnce([
      {
        request: {
          identifier: "",
          content: { data: { type: "low_water" } },
        },
      },
    ]);
    await clearLowWaterNotificationsOnSignOut();
    expect(mockDismissNotificationAsync).not.toHaveBeenCalled();
  });

  it("ignores dismiss failures for individual notifications", async () => {
    mockGetPresentedNotificationsAsync.mockResolvedValueOnce([
      {
        request: {
          identifier: "n1",
          content: { data: { type: "low_water" } },
        },
      },
    ]);
    mockDismissNotificationAsync.mockRejectedValueOnce(new Error("dismiss failed"));
    await expect(clearLowWaterNotificationsOnSignOut()).resolves.toBeUndefined();
  });

  it("dismisses low-water notifications on sign out", async () => {
    mockGetPresentedNotificationsAsync.mockResolvedValueOnce([
      {
        request: {
          identifier: "n1",
          content: { data: { type: "low_water" } },
        },
      },
      {
        request: {
          identifier: "n2",
          content: { data: { type: "other" } },
        },
      },
    ]);
    await clearLowWaterNotificationsOnSignOut();
    expect(mockDismissNotificationAsync).toHaveBeenCalledWith("n1");
    expect(mockDismissNotificationAsync).not.toHaveBeenCalledWith("n2");
  });

  it("falls back to dismissAll when presented notifications are unavailable", async () => {
    mockGetPresentedNotificationsAsync.mockRejectedValueOnce(new Error("unsupported"));
    await clearLowWaterNotificationsOnSignOut();
    expect(mockDismissAllNotificationsAsync).toHaveBeenCalled();
  });

  it("tolerates cancel scheduled notification failures on sign out", async () => {
    mockCancelAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("cancel failed"));
    await expect(clearLowWaterNotificationsOnSignOut()).resolves.toBeUndefined();
  });

  it("schedules a local low-water notification", async () => {
    await scheduleLowWaterLocalNotification({
      groupId: "g1",
      groupName: "Kitchen",
      levelPercent: 12,
    });
    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Kitchen",
          data: expect.objectContaining({
            type: "low_water",
            groupId: "g1",
          }),
        }),
      })
    );
  });
});
