import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../supabase";

export default function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleAuth() {
    setIsLoading(true);
    setMessage("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase.from("profiles").upsert({
            id: data.user.id,
            display_name: displayName.trim() || email.split("@")[0],
          });
          if (profileError) throw profileError;
        }

        setMessage("Account created. Please sign in.");
        setMode("signin");
      }
    } catch (e) {
      setMessage(e.message ?? "Authentication failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <Text style={styles.title}>Water Group Dashboard</Text>
        <Text style={styles.subtitle}>
          {mode === "signin" ? "Sign in to continue" : "Create your account"}
        </Text>

        {mode === "signup" ? (
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            autoCapitalize="words"
            style={styles.input}
          />
        ) : null}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
        />

        <Pressable
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
          onPress={handleAuth}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>
              {mode === "signin" ? "Sign In" : "Create Account"}
            </Text>
          )}
        </Pressable>

        <Pressable onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
          <Text style={styles.switchText}>
            {mode === "signin"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>

        {!!message && <Text style={styles.message}>{message}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f8fafc",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    color: "#64748b",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  ctaButton: {
    marginTop: 4,
    backgroundColor: "#0ea5e9",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: {
    color: "#fff",
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.85,
  },
  switchText: {
    color: "#0284c7",
    textAlign: "center",
    fontWeight: "600",
  },
  message: {
    textAlign: "center",
    color: "#334155",
    fontSize: 13,
  },
});
