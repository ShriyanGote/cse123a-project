import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId() {
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (fromEnv) return fromEnv;
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

export async function registerForPushNotificationsAsync() {
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

  const projectId = getProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  return tokenResponse?.data ?? null;
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
