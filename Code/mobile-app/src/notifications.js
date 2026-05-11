import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureLocalNotificationPermissionsAsync() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const permission = await Notifications.requestPermissionsAsync();
    finalStatus = permission.status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0ea5e9",
    });
  }
  return true;
}

export function addNotificationResponseListener(onNavigateToGroup) {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response?.notification?.request?.content?.data;
      const groupId = typeof data?.groupId === "string" ? data.groupId : null;
      const groupName = typeof data?.groupName === "string" ? data.groupName : undefined;
      if (groupId) {
        onNavigateToGroup(groupId, groupName);
      }
    }
  );
  return () => subscription.remove();
}

export async function handleInitialNotification(openGroup) {
  const response = await Notifications.getLastNotificationResponseAsync();
  const data = response?.notification?.request?.content?.data;
  const groupId = typeof data?.groupId === "string" ? data.groupId : null;
  const groupName = typeof data?.groupName === "string" ? data.groupName : undefined;
  if (groupId) {
    openGroup(groupId, groupName);
  }
}

/** Local notification when water crosses below threshold (no remote push). */
export async function scheduleLowWaterLocalNotification({ groupId, groupName, levelPercent }) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${groupName}`,
      body: `Water filter is at ${levelPercent}%. Time to refill.`,
      sound: "default",
      data: {
        type: "low_water",
        groupId,
        groupName,
        level_percent: String(levelPercent),
      },
    },
    trigger: null,
  });
}
