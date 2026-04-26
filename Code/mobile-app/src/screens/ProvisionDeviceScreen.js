import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { completeProvisionSession, createProvisionSession } from "../api";

export default function ProvisionDeviceScreen() {
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [nonce, setNonce] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [jwkKid, setJwkKid] = useState("");
  const [publicJwk, setPublicJwk] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function startProvisioning() {
    setIsStarting(true);
    setError("");
    setMessage("");
    try {
      const response = await createProvisionSession();
      setSessionId(response.session_id ?? "");
      setNonce(response.nonce ?? "");
      setMessage(
        "Session created. Send session_id and nonce to ESP over BLE, then complete below."
      );
    } catch (e) {
      setError(e.message ?? "Failed to start provisioning.");
    } finally {
      setIsStarting(false);
    }
  }

  async function completeProvisioning() {
    if (!sessionId || !deviceId || !jwkKid || !publicJwk) {
      setError("Session, device id, key id, and public JWK are required.");
      return;
    }

    setIsCompleting(true);
    setError("");
    setMessage("");
    try {
      let parsedJwk;
      try {
        parsedJwk = JSON.parse(publicJwk);
      } catch {
        throw new Error("Public JWK must be valid JSON.");
      }

      await completeProvisionSession({
        session_id: sessionId.trim(),
        device_id: deviceId.trim(),
        jwk_kid: jwkKid.trim(),
        public_jwk: parsedJwk,
      });
      setMessage("Device provisioned successfully and linked to your account.");
    } catch (e) {
      setError(e.message ?? "Failed to complete provisioning.");
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Device Provisioning</Text>
          <Text style={styles.instructions}>
            1) Tap Start Session. 2) Connect your ESP over BLE and send session nonce.
            3) Receive/generated device_id and public key from ESP. 4) Complete
            provisioning to bind device to your account.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={startProvisioning}
            disabled={isStarting || isCompleting}
          >
            {isStarting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Start Session</Text>
            )}
          </Pressable>

          <TextInput
            style={styles.input}
            value={sessionId}
            onChangeText={setSessionId}
            placeholder="session_id"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={nonce}
            onChangeText={setNonce}
            placeholder="nonce (from start session)"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={deviceId}
            onChangeText={setDeviceId}
            placeholder="device_id"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={jwkKid}
            onChangeText={setJwkKid}
            placeholder="jwk_kid"
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={publicJwk}
            onChangeText={setPublicJwk}
            placeholder='public_jwk JSON, e.g. {"kty":"EC",...}'
            autoCapitalize="none"
            multiline
            numberOfLines={5}
          />

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={completeProvisioning}
            disabled={isCompleting || isStarting}
          >
            {isCompleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Complete Provisioning</Text>
            )}
          </Pressable>

          {!!message && <Text style={styles.messageText}>{message}</Text>}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 20,
  },
  card: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
  },
  instructions: {
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
  },
  input: {
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#0ea5e9",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.85,
  },
  messageText: {
    fontSize: 13,
    color: "#0369a1",
  },
  errorText: {
    fontSize: 13,
    color: "#b91c1c",
  },
});
