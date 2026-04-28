import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuthScreen from "./src/screens/AuthScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import GroupScreen from "./src/screens/GroupScreen";
import IntroScreen from "./src/screens/IntroScreen";
import ProvisionDeviceScreen from "./src/screens/ProvisionDeviceScreen";
import { ensureMyProfile } from "./src/api";
import { isSupabaseConfigured, supabase } from "./src/supabase";

const Stack = createNativeStackNavigator();
const INTRO_COMPLETED_KEY = "app:intro-completed";

export default function App() {
  const [session, setSession] = useState(null);
  const [isBooting, setIsBooting] = useState(true);
  const [showIntro, setShowIntro] = useState(null);
  const [screenTransition] = useState(() => new Animated.Value(1));

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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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
      <NavigationContainer>
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
          ) : (
            <Stack.Navigator
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
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="ProvisionDevice"
                options={{ title: "Provision Device", animation: "fade_from_bottom" }}
              >
                {(props) => <ProvisionDeviceScreen {...props} user={session.user} />}
              </Stack.Screen>
              <Stack.Screen
                name="Group"
                options={({ route }) => ({
                  title: route.params?.groupName ?? "Group",
                  animation: "slide_from_right",
                })}
              >
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
});
