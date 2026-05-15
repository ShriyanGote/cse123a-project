import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import KeyboardAvoidingWrapper from "../components/KeyboardAvoidingWrapper";
import { supabase } from "../supabase";

const DEFAULT_AUTH_REDIRECT_URL = "https://cse123a-project-6a3s.vercel.app";
const authRedirectUrl =
  process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || DEFAULT_AUTH_REDIRECT_URL;

export default function AuthScreen({ onOpenIntro }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const cardAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;
  const signupFieldAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(formAnim, {
        toValue: 1,
        duration: 420,
        delay: 100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardAnim, formAnim]);

  useEffect(() => {
    Animated.timing(signupFieldAnim, {
      toValue: mode === "signup" ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [mode, signupFieldAnim]);

  async function handleAuth() {
    setIsLoading(true);
    setMessage("");
    setAuthError("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authRedirectUrl,
            data: {
              display_name: displayName.trim() || email.trim().split("@")[0],
            },
          },
        });
        if (error) throw error;

        setMessage("Account created. Please sign in.");
        setMode("signin");
      }
    } catch (e) {
      const errorMessage = e?.message ?? "Authentication failed.";
      const isInvalidCredentials =
        mode === "signin" &&
        /invalid login credentials|invalid credentials|invalid password|wrong password/i.test(
          errorMessage
        );

      if (isInvalidCredentials) {
        setAuthError("Incorrect email or password.");
      } else {
        setMessage(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }

  const swipeToIntroResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dx > 28 &&
          Math.abs(gestureState.dy) < 18 &&
          Math.abs(gestureState.vx) > 0.08,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx > 72 && Math.abs(gestureState.dy) < 28) {
            onOpenIntro?.();
          }
        },
      }),
    [onOpenIntro]
  );

  return (
    <SafeAreaView style={styles.safeArea} {...swipeToIntroResponder.panHandlers}>
      <KeyboardAvoidingWrapper>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >
        <Animated.View
          style={[
            styles.card,
            {
              opacity: cardAnim,
              transform: [
                {
                  translateY: cardAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.title}>Water Group Dashboard</Text>
          <Text style={styles.subtitle}>
            {mode === "signin" ? "Sign in to continue" : "Create your account"}
          </Text>
          <Text style={styles.swipeHint}>Swipe right to view introduction</Text>
          <View style={styles.instructionsBox}>
            <Text style={styles.instructionsTitle}>Setup flow</Text>
            <Text style={styles.instructionsText}>
              1) Create/sign in to your account.
            </Text>
            <Text style={styles.instructionsText}>
              2) Connect the ESP device over Bluetooth in Provision Device.
            </Text>
            <Text style={styles.instructionsText}>
              3) Send generated device token and device ID to complete secure setup.
            </Text>
          </View>

          <Animated.View
            style={{
              opacity: formAnim,
              transform: [
                {
                  translateY: formAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            }}
          >
            <View style={styles.formStack}>
              <Animated.View
                style={{
                  opacity: signupFieldAnim,
                  maxHeight: signupFieldAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 72],
                  }),
                  transform: [
                    {
                      translateY: signupFieldAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-8, 0],
                      }),
                    },
                  ],
                  overflow: "hidden",
                }}
              >
                {mode === "signup" ? (
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Display name"
                    autoCapitalize="words"
                    style={styles.input}
                  />
                ) : null}
              </Animated.View>

              {!!authError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{authError}</Text>
                </View>
              )}
              <TextInput
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (authError) setAuthError("");
                }}
                placeholder="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <TextInput
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (authError) setAuthError("");
                }}
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

              <Pressable
                onPress={() => {
                  setAuthError("");
                  setMode(mode === "signin" ? "signup" : "signin");
                }}
              >
                <Text style={styles.switchText}>
                  {mode === "signin"
                    ? "Need an account? Sign up"
                    : "Already have an account? Sign in"}
                </Text>
              </Pressable>

              {!!message && <Text style={styles.message}>{message}</Text>}
            </View>
          </Animated.View>
        </Animated.View>
        </ScrollView>
      </KeyboardAvoidingWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
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
  swipeHint: {
    textAlign: "center",
    color: "#0284c7",
    fontSize: 12,
    marginTop: -2,
  },
  instructionsBox: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  instructionsTitle: {
    fontWeight: "700",
    color: "#1d4ed8",
    fontSize: 13,
    marginBottom: 2,
  },
  instructionsText: {
    fontSize: 12,
    color: "#1e3a8a",
    lineHeight: 17,
  },
  formStack: {
    gap: 10,
    marginTop: 8,
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
  errorBox: {
    borderWidth: 1,
    borderColor: "#ef4444",
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "600",
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
