import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuthScreen from "./src/screens/AuthScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import GroupScreen from "./src/screens/GroupScreen";
import ProvisionDeviceScreen from "./src/screens/ProvisionDeviceScreen";
import { isSupabaseConfigured, supabase } from "./src/supabase";

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState(null);
  const [isBooting, setIsBooting] = useState(true);

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
    async function ensureProfile() {
      if (!session?.user || !isSupabaseConfigured) return;
      try {
        await supabase.from("profiles").upsert({
          id: session.user.id,
          display_name:
            session.user.user_metadata?.display_name ||
            session.user.email?.split("@")[0] ||
            "User",
        });
      } catch (error) {
        console.warn("Failed to upsert profile:", error?.message ?? error);
      }
    }

    ensureProfile();
  }, [session?.user]);

  if (isBooting) {
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
        {!session?.user ? (
          <AuthScreen />
        ) : (
          <Stack.Navigator>
            <Stack.Screen name="Dashboard" options={{ title: "Dashboard" }}>
              {(props) => <DashboardScreen {...props} user={session.user} />}
            </Stack.Screen>
            <Stack.Screen
              name="ProvisionDevice"
              options={{ title: "Provision Device" }}
            >
              {(props) => <ProvisionDeviceScreen {...props} user={session.user} />}
            </Stack.Screen>
            <Stack.Screen
              name="Group"
              options={({ route }) => ({
                title: route.params?.groupName ?? "Group",
              })}
            >
              {(props) => <GroupScreen {...props} user={session.user} />}
            </Stack.Screen>
          </Stack.Navigator>
        )}
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
