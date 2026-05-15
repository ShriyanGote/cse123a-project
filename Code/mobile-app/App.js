import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CommonActions,
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuthScreen from "./src/screens/AuthScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import GroupScreen from "./src/screens/GroupScreen";
import IntroScreen from "./src/screens/IntroScreen";
import ProvisionDeviceScreen from "./src/screens/ProvisionDeviceScreen";
import { ensureMyProfile, fetchMyProfile } from "./src/api";
import {
  addNotificationResponseListener,
  clearLowWaterNotificationsOnSignOut,
  ensureLocalNotificationPermissionsAsync,
  handleInitialNotification,
} from "./src/notifications";
import { clearAllLowWaterAlertState } from "./src/groupLowWaterAlerts";
import { isSupabaseConfigured, supabase } from "./src/supabase";
import { useLowWaterMonitor } from "./src/useLowWaterMonitor";

const Stack = createNativeStackNavigator();
const INTRO_COMPLETED_KEY = "app:intro-completed";

export const navigationRef = createNavigationContainerRef();

export function groupScreenTitle(route) {
  return route?.params?.groupName ?? "Group";
}

export function resolveGroupNavName(groupName) {
  return groupName || "Group";
}

export function groupStackScreenOptions({ route }) {
  return {
    title: groupScreenTitle(route),
    animation: "slide_from_right",
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [isBooting, setIsBooting] = useState(true);
  const [showIntro, setShowIntro] = useState(null);
  const [screenTransition] = useState(() => new Animated.Value(1));
  const [isDeactivated, setIsDeactivated] = useState(false);
  /** Latest auth / intro flags for notification handlers (avoid stale closures). */
  const navGateRef = useRef({
    hasUser: false,
    showIntro: true,
    isDeactivated: false,
  });
  const pendingGroupNavRef = useRef(null);

  useEffect(() => {
    navGateRef.current = {
      hasUser: Boolean(session?.user),
      showIntro: showIntro !== false,
      isDeactivated,
    };
  }, [session?.user, showIntro, isDeactivated]);

  function tryOpenGroupFromNotification(groupId, groupName) {
    if (!groupId) return;
    const gate = navGateRef.current;
    if (!gate.hasUser || gate.showIntro || gate.isDeactivated) {
      pendingGroupNavRef.current = {
        groupId,
        groupName: resolveGroupNavName(groupName),
      };
      return;
    }
    if (!navigationRef.isReady()) {
      pendingGroupNavRef.current = {
        groupId,
        groupName: resolveGroupNavName(groupName),
      };
      return;
    }
    pendingGroupNavRef.current = null;
    try {
      navigationRef.navigate("Group", {
        groupId,
        groupName: resolveGroupNavName(groupName),
      });
    } catch {
      pendingGroupNavRef.current = {
        groupId,
        groupName: resolveGroupNavName(groupName),
      };
    }
  }

  function flushPendingGroupNavigation() {
    const pending = pendingGroupNavRef.current;
    if (!pending || !navigationRef.isReady()) return;
    const gate = navGateRef.current;
    if (!gate.hasUser || gate.showIntro || gate.isDeactivated) return;
    pendingGroupNavRef.current = null;
    try {
      navigationRef.navigate("Group", pending);
    } catch {
      pendingGroupNavRef.current = pending;
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsBooting(false);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null);
        setIsBooting(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_IN" && nextSession?.user) {
        pendingGroupNavRef.current = null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!navigationRef.isReady()) return;
            try {
              navigationRef.dispatch(
                CommonActions.reset({ index: 0, routes: [{ name: "Dashboard" }] })
              );
            } catch {
              // Stack may not be mounted yet (e.g. intro); remount still lands on Dashboard.
            }
          });
        });
      }
      setSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadIntroState() {
      try {
        const introCompleted = await AsyncStorage.getItem(INTRO_COMPLETED_KEY);
        setShowIntro(introCompleted !== "true");
      } catch (error) {
        console.warn("Failed to load intro state:", error?.message ?? error);
        setShowIntro(true);
      }
    }

    loadIntroState();
  }, []);

  useEffect(() => {
    async function ensureProfile() {
      if (!session?.user || !isSupabaseConfigured) return;
      try {
        await ensureMyProfile(session.user.user_metadata?.display_name ?? null);
      } catch (error) {
        const message = error?.message ?? String(error);
        if (/API route not found/i.test(message)) {
          return;
        }
        console.warn("Failed to upsert profile:", message);
      }
    }

    ensureProfile();
  }, [session?.user]);

  useEffect(() => {
    let cancelled = false;
    let removeResponseListener = null;

    async function setupLocalNotifications() {
      if (!session?.user || !isSupabaseConfigured) return;

      try {
        await ensureLocalNotificationPermissionsAsync();
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to initialize local notifications:", error?.message ?? error);
        }
      }
    }

    setupLocalNotifications();
    removeResponseListener = addNotificationResponseListener(tryOpenGroupFromNotification);
    handleInitialNotification(tryOpenGroupFromNotification).catch(() => {});

    return () => {
      cancelled = true;
      if (removeResponseListener) removeResponseListener();
    };
  }, [session?.user?.id]);

  useEffect(() => {
    flushPendingGroupNavigation();
  }, [showIntro, isDeactivated]);

  const lowWaterMonitorEnabled =
    Boolean(session?.user) &&
    isSupabaseConfigured &&
    !isDeactivated;

  useLowWaterMonitor(lowWaterMonitorEnabled);

  useEffect(() => {
    if (session?.user) return;
    clearAllLowWaterAlertState();
    clearLowWaterNotificationsOnSignOut().catch(() => {});
  }, [session?.user]);

  // Check account status and subscribe to live updates so a deactivation
  // performed from the web Settings page kicks the user out immediately.
  useEffect(() => {
    if (!session?.user || !isSupabaseConfigured) {
      setIsDeactivated(false);
      return undefined;
    }

    let cancelled = false;

    async function checkStatus() {
      try {
        const profile = await fetchMyProfile();
        if (!cancelled && profile?.is_active === false) {
          setIsDeactivated(true);
        }
      } catch (error) {
        const message = error?.message ?? String(error);
        if (/account.*deactivat/i.test(message) || /403/.test(message)) {
          if (!cancelled) setIsDeactivated(true);
        }
      }
    }

    checkStatus();

    const channel = supabase
      .channel(`profile-${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${session.user.id}`,
        },
        (payload) => {
          if (payload.new?.is_active === false) setIsDeactivated(true);
          if (payload.new?.is_active === true) setIsDeactivated(false);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  async function runSignOut() {
    clearAllLowWaterAlertState();
    await clearLowWaterNotificationsOnSignOut().catch(() => {});
    await supabase.auth.signOut({ scope: "local" });
  }

  async function handleDeactivatedSignOut() {
    await runSignOut();
    setIsDeactivated(false);
  }

  useEffect(() => {
    if (showIntro === null) return;
    screenTransition.setValue(0);
    Animated.timing(screenTransition, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [screenTransition, session?.user, showIntro]);

  async function handleCompleteIntro() {
    setShowIntro(false);
    try {
      await AsyncStorage.setItem(INTRO_COMPLETED_KEY, "true");
    } catch (error) {
      console.warn("Failed to save intro state:", error?.message ?? error);
    }
  }

  if (isBooting || showIntro === null) {
    return (
      <View style={styles.loadingWrap}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.configWrap}>
        <StatusBar style="dark" />
        <Text style={styles.configTitle}>Supabase Config Required</Text>
        <Text style={styles.configText}>
          Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to
          `mobile-app/.env`, then restart Expo with cache clear (`npx expo start -c`).
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          flushPendingGroupNavigation();
        }}
      >
        <StatusBar style="dark" />
        <Animated.View
          style={[
            styles.screenWrap,
            {
              opacity: screenTransition,
              transform: [
                {
                  translateY: screenTransition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {showIntro ? (
            <IntroScreen onContinue={handleCompleteIntro} />
          ) : !session?.user ? (
            <AuthScreen onOpenIntro={() => setShowIntro(true)} />
          ) : isDeactivated ? (
            <View style={styles.deactivatedWrap}>
              <Text style={styles.deactivatedTitle}>Account deactivated</Text>
              <Text style={styles.deactivatedText}>
                Your account has been deactivated. Sign in to the web app to
                reactivate it, then sign in again here.
              </Text>
              <TouchableOpacity style={styles.deactivatedButton} onPress={handleDeactivatedSignOut}>
                <Text style={styles.deactivatedButtonText}>Sign out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Stack.Navigator
              key={session.user.id}
              initialRouteName="Dashboard"
              screenOptions={{
                animation: "slide_from_right",
                contentStyle: { backgroundColor: "#f8fafc" },
              }}
            >
              <Stack.Screen name="Dashboard" options={{ title: "Dashboard" }}>
                {(props) => (
                  <DashboardScreen
                    {...props}
                    user={session.user}
                    onOpenIntro={() => setShowIntro(true)}
                    onSignOut={runSignOut}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="ProvisionDevice"
                options={{ title: "Provision Device", animation: "fade_from_bottom" }}
              >
                {(props) => <ProvisionDeviceScreen {...props} user={session.user} />}
              </Stack.Screen>
              <Stack.Screen name="Group" options={groupStackScreenOptions}>
                {(props) => <GroupScreen {...props} user={session.user} />}
              </Stack.Screen>
            </Stack.Navigator>
          )}
        </Animated.View>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  screenWrap: {
    flex: 1,
  },
  configWrap: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  configTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  configText: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    lineHeight: 20,
  },
  deactivatedWrap: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  deactivatedTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#dc2626",
    textAlign: "center",
  },
  deactivatedText: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    lineHeight: 20,
  },
  deactivatedButton: {
    marginTop: 12,
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  deactivatedButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
