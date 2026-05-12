import { Buffer } from "buffer";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchMyDevices, registerBleDevice } from "../api";

/* Must match `custom_ble_prov` firmware (128-bit UUIDs). Override via EXPO_PUBLIC_* if needed. */
const FALLBACK_SERVICE_UUID = "a0b40001-9267-4d61-a8c8-9f2f4b2c8e01";
const FALLBACK_AUTH_CHAR_UUID = "a0b40002-9267-4d61-a8c8-9f2f4b2c8e01";
const FALLBACK_WIFI_CHAR_UUID = "a0b40003-9267-4d61-a8c8-9f2f4b2c8e01";
const FALLBACK_STATUS_CHAR_UUID = "a0b40004-9267-4d61-a8c8-9f2f4b2c8e01";
console.log("Something to print\n");

function resolveUuid(envValue, fallbackValue) {
  const value = typeof envValue === "string" ? envValue.trim() : "";
  if (!value) return fallbackValue;
  // Ignore placeholder values such as xxxx-xxxx-... from local env files.
  if (/^x+(-x+)*$/i.test(value.replace(/\{|\}/g, ""))) {
    return fallbackValue;
  }
  return value;
}

const DEFAULT_SERVICE_UUID = resolveUuid(
  process.env.EXPO_PUBLIC_ESP_SERVICE_UUID,
  FALLBACK_SERVICE_UUID
);
const DEFAULT_AUTH_CHAR_UUID = resolveUuid(
  process.env.EXPO_PUBLIC_ESP_AUTH_CHAR_UUID,
  FALLBACK_AUTH_CHAR_UUID
);
const DEFAULT_WIFI_CHAR_UUID = resolveUuid(
  process.env.EXPO_PUBLIC_ESP_WIFI_CHAR_UUID,
  FALLBACK_WIFI_CHAR_UUID
);
const DEFAULT_STATUS_CHAR_UUID = resolveUuid(
  process.env.EXPO_PUBLIC_ESP_STATUS_CHAR_UUID,
  FALLBACK_STATUS_CHAR_UUID
);

function toBase64Text(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

/** Avoid expo-crypto here: it requires native ExpoCryptoAES, which breaks in some runtimes (e.g. Expo Go / skewed builds). */
function randomUuidV4() {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseQrPayload(rawValue) {
  if (!rawValue || typeof rawValue !== "string") return null;

  const text = rawValue.trim();

  const tryJson = (input) => {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };

  const fromJson = tryJson(text);
  if (fromJson) return fromJson;

  // Some QR generators prepend labels/log text before JSON.
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSlice = text.slice(firstBrace, lastBrace + 1);
    const fromSlice = tryJson(jsonSlice);
    if (fromSlice) return fromSlice;

    // Tolerate single-quoted pseudo-JSON.
    const singleQuoted = jsonSlice.replace(/'/g, "\"");
    const fromSingleQuoted = tryJson(singleQuoted);
    if (fromSingleQuoted) return fromSingleQuoted;
  }

  // Support URL payloads like espprov://...?device_name=... or https://...?... 
  try {
    const url = new URL(text);
    const params = Object.fromEntries(url.searchParams.entries());
    if (Object.keys(params).length > 0) return params;
  } catch {
    // Not a URL. Continue.
  }

  // Support base64-encoded JSON payloads.
  try {
    const decoded = Buffer.from(text, "base64").toString("utf8");
    const fromBase64Json = tryJson(decoded);
    if (fromBase64Json) return fromBase64Json;

    const b64FirstBrace = decoded.indexOf("{");
    const b64LastBrace = decoded.lastIndexOf("}");
    if (b64FirstBrace !== -1 && b64LastBrace > b64FirstBrace) {
      const b64Slice = decoded.slice(b64FirstBrace, b64LastBrace + 1);
      const fromB64Slice = tryJson(b64Slice);
      if (fromB64Slice) return fromB64Slice;
    }
  } catch {
    // Not base64 JSON.
  }

  return null;
}

export default function ProvisionDeviceScreen({ navigation }) {
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [isBleBusy, setIsBleBusy] = useState(false);
  const [isWaitingForServer, setIsWaitingForServer] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [authToken, setAuthToken] = useState("");
  const [espName, setEspName] = useState("");
  const [proofOfPossession, setProofOfPossession] = useState("");
  const [transport, setTransport] = useState("");
  const [qrVersion, setQrVersion] = useState("");
  const [serviceUuid, setServiceUuid] = useState(DEFAULT_SERVICE_UUID);
  const [authCharUuid, setAuthCharUuid] = useState(DEFAULT_AUTH_CHAR_UUID);
  const [wifiCharUuid, setWifiCharUuid] = useState(DEFAULT_WIFI_CHAR_UUID);
  const [statusCharUuid, setStatusCharUuid] = useState(DEFAULT_STATUS_CHAR_UUID);
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [deviceNickname, setDeviceNickname] = useState("");
  const [lastBleStatus, setLastBleStatus] = useState("");
  const [lastQrRawValue, setLastQrRawValue] = useState("");
  const [scanDebug, setScanDebug] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bleUnavailableReason, setBleUnavailableReason] = useState("");
  const bleManagerRef = useRef(null);
  const connectedDeviceRef = useRef(null);
  const hasHandledScanRef = useRef(false);
  const isQrScanActiveRef = useRef(false);
  const handleBarcodeScannedRef = useRef(null);
  const stableBarcodeHandler = useRef(({ data }) => {
    handleBarcodeScannedRef.current?.({ data });
  }).current;
  const isIos = Platform.OS === "ios";
  const canUseNativeProvisioning = isIos;

  const isReadyToSendBlePayload = useMemo(() => {
    return (
      canUseNativeProvisioning &&
      !bleUnavailableReason &&
      authToken &&
      deviceId.trim() &&
      espName &&
      serviceUuid &&
      authCharUuid &&
      wifiCharUuid &&
      wifiSsid
    );
  }, [
    canUseNativeProvisioning,
    bleUnavailableReason,
    authToken,
    deviceId,
    espName,
    serviceUuid,
    authCharUuid,
    wifiCharUuid,
    wifiSsid,
  ]);

  useEffect(() => {
    setAuthToken((prev) => prev || randomUuidV4());
  }, []);

  useEffect(() => {
    if (!canUseNativeProvisioning) return undefined;
    try {
      const { BleManager } = require("react-native-ble-plx");
      bleManagerRef.current = new BleManager();
      setBleUnavailableReason("");
    } catch (bleInitError) {
      bleManagerRef.current = null;
      setBleUnavailableReason(
        "BLE native module unavailable in this runtime. Use an iOS development build (expo run:ios or EAS dev build), not Expo Go."
      );
      console.warn("BLE initialization failed:", bleInitError?.message ?? bleInitError);
    }
    return () => {
      try {
        bleManagerRef.current?.stopDeviceScan();
      } catch {
        // Ignore cleanup failures.
      }
      try {
        connectedDeviceRef.current?.cancelConnection();
      } catch {
        // Ignore cleanup failures.
      }
      try {
        bleManagerRef.current?.destroy();
      } catch {
        // Ignore destroy failures.
      }
    };
  }, [canUseNativeProvisioning]);

  async function openQrScanner() {
    setError("");
    setScanDebug("Opening camera...");
    console.log("QR: open scanner tapped");
    if (!cameraPermission?.granted) {
      console.log("QR: requesting camera permission");
      const result = await requestCameraPermission();
      if (!result.granted) {
        setError("Camera permission is required to scan ESP QR.");
        setScanDebug("Camera permission denied.");
        console.log("QR: camera permission denied");
        return;
      }
      console.log("QR: camera permission granted");
    }
    hasHandledScanRef.current = false;
    isQrScanActiveRef.current = true;
    setScanDebug("Scanner active. Point camera at QR.");
    console.log("QR: scanner active");
    setCameraVisible(true);
  }

  function closeQrScanner() {
    console.log("QR: scanner closed");
    isQrScanActiveRef.current = false;
    setCameraVisible(false);
    setIsCameraReady(false);
    hasHandledScanRef.current = false;
  }

  handleBarcodeScannedRef.current = ({ data }) => {
    console.log("🔍 onBarcodeScanned fired:", data?.slice(0, 80));
    if (!data || hasHandledScanRef.current || !isQrScanActiveRef.current) {
      console.log("🔍 guard blocked:", {
        noData: !data,
        alreadyHandled: hasHandledScanRef.current,
        notActive: !isQrScanActiveRef.current,
      });
      return;
    }
    hasHandledScanRef.current = true;
    isQrScanActiveRef.current = false;
    setScanDebug(`Captured QR (${String(data).length} chars).`);
    console.log("RAW QR DATA:", data);
    applyQrData(data);
    closeQrScanner();
  };

  function applyQrData(rawData) {
    setLastQrRawValue(rawData ?? "");
    const parsed = parseQrPayload(rawData);
    if (!parsed) {
      setError(
        "No usable data found in QR. Supported formats: JSON, URL query params, or base64 JSON."
      );
      return;
    }

    // Accept common aliases from different QR generators.
    const deviceName = parsed.device_name ?? parsed.name ?? parsed.ble_name;
    const parsedDeviceId = parsed.device_id ?? parsed.id;
    const parsedServiceUuid = parsed.service_uuid ?? parsed.service ?? parsed.svc;
    const parsedAuthChar = parsed.auth_char_uuid ?? parsed.auth_char ?? parsed.auth;
    const parsedWifiChar = parsed.wifi_char_uuid ?? parsed.wifi_char ?? parsed.wifi;
    const parsedStatusChar =
      parsed.status_char_uuid ?? parsed.status_char ?? parsed.status;
    const parsedPop = parsed.pop ?? parsed.proof_of_possession ?? parsed.proof;
    const parsedTransport = parsed.transport ?? parsed.t;
    const parsedVer = parsed.ver ?? parsed.version;

    if (deviceName) {
      setEspName(String(deviceName));
      setDeviceNickname((prev) => prev || String(deviceName));
    }
    if (parsedDeviceId) setDeviceId(String(parsedDeviceId));
    if (parsedServiceUuid) setServiceUuid(String(parsedServiceUuid));
    if (parsedAuthChar) setAuthCharUuid(String(parsedAuthChar));
    if (parsedWifiChar) setWifiCharUuid(String(parsedWifiChar));
    if (parsedStatusChar) setStatusCharUuid(String(parsedStatusChar));
    if (parsedPop) setProofOfPossession(String(parsedPop));
    if (parsedTransport) setTransport(String(parsedTransport));
    if (parsedVer) setQrVersion(String(parsedVer));

    const mappedCount = [
      deviceName,
      parsedDeviceId,
      parsedServiceUuid,
      parsedAuthChar,
      parsedWifiChar,
      parsedStatusChar,
      parsedPop,
      parsedTransport,
      parsedVer,
    ].filter(Boolean).length;

    if (mappedCount === 0) {
      setError(
        "QR parsed, but no expected fields were found. Check your QR key names."
      );
      return;
    }

    if (String(parsedTransport ?? "").toLowerCase() === "ble") {
      setMessage(
        `BLE QR detected (${mappedCount} fields mapped). Send auth token + Wi-Fi over BLE, then tap Complete to register with the server.`
      );
    } else {
      setMessage(
        `QR data loaded (${mappedCount} fields mapped). Send token + Wi-Fi over BLE, then complete registration.`
      );
    }
    setError("");
  }

  async function findAndConnectDevice() {
    if (!canUseNativeProvisioning) {
      throw new Error("BLE provisioning is currently enabled for iOS only.");
    }
    if (!espName.trim()) {
      throw new Error("Scan QR or enter ESP device name first.");
    }
    const manager = bleManagerRef.current;
    if (!manager) throw new Error("BLE manager not initialized.");
    const expected = espName.trim().toLowerCase();
    const seenNames = new Set();

    const device = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        manager.stopDeviceScan();
        const sample = Array.from(seenNames).slice(0, 6).join(", ");
        reject(
          new Error(
            sample
              ? `BLE scan timed out. Looking for "${espName.trim()}". Seen: ${sample}`
              : "BLE scan timed out. Ensure ESP is advertising."
          )
        );
      }, 20000);

      manager.startDeviceScan(null, null, (scanError, candidate) => {
        if (scanError) {
          clearTimeout(timeout);
          manager.stopDeviceScan();
          reject(scanError);
          return;
        }

        const candidateName = (candidate?.name ?? "").trim();
        const candidateLocalName = (candidate?.localName ?? "").trim();
        if (candidateName) seenNames.add(candidateName);
        if (candidateLocalName) seenNames.add(candidateLocalName);

        const lowerName = candidateName.toLowerCase();
        const lowerLocalName = candidateLocalName.toLowerCase();
        const hasName = lowerName.length > 0;
        const hasLocalName = lowerLocalName.length > 0;
        const match =
          (hasName && (lowerName === expected || lowerName.startsWith(expected))) ||
          (hasLocalName &&
            (lowerLocalName === expected || lowerLocalName.startsWith(expected)));

        if (match) {
          clearTimeout(timeout);
          manager.stopDeviceScan();
          resolve(candidate);
        }
      });
    });

    const connected = await device.connect();
    await connected.discoverAllServicesAndCharacteristics();
    try {
      await connected.requestMTU(512);
      console.log("MTU requested from app side (512)");
    } catch (mtuError) {
      console.log("MTU request failed (non-fatal):", mtuError?.message ?? mtuError);
    }
    // Ble-plx can resolve discovery before iOS GATT cache is fully settled.
    await new Promise((resolve) => setTimeout(resolve, 500));
    connectedDeviceRef.current = connected;
    return connected;
  }

  async function sendBleProvisioningPayload() {
    if (!isReadyToSendBlePayload) {
      setError("Need QR (device name), auth token, BLE UUIDs, and Wi-Fi SSID before sending.");
      return;
    }
    if (!deviceId.trim()) {
      setError("device_id from QR is required so the server can authorize the ESP before Wi‑Fi connects.");
      return;
    }

    setIsBleBusy(true);
    setError("");
    setMessage("");
    try {
      const nameForServer =
        deviceNickname.trim() || espName.trim() || deviceId.trim();
      await registerBleDevice({
        device_id: deviceId.trim(),
        auth_token: authToken.trim(),
        device_name: nameForServer,
      });

      const device = connectedDeviceRef.current ?? (await findAndConnectDevice());
      const discoveredServices = await device.services();
      console.log("GATT services:", discoveredServices.map((s) => s.uuid));
      for (const svc of discoveredServices) {
        try {
          const chars = await svc.characteristics();
          console.log(
            `GATT chars for ${svc.uuid}:`,
            chars.map((c) => c.uuid)
          );
        } catch (serviceError) {
          console.log(
            `GATT char read failed for ${svc.uuid}:`,
            serviceError?.message ?? serviceError
          );
        }
      }

      const authB64 = toBase64Text(authToken.trim());
      console.log("Auth payload b64 length:", authB64.length, "value:", authB64);
      try {
        console.log("About to write auth...");
        await device.writeCharacteristicWithoutResponseForService(
          serviceUuid.trim(),
          authCharUuid.trim(),
          authB64
        );
        console.log("Auth write done.");
      } catch (e) {
        console.log("AUTH WRITE ERROR:", e?.message ?? e, e?.errorCode);
        throw e;
      }

      const wifiCompact = `${wifiSsid.trim()}:${wifiPassword}`;
      const wifiB64 = toBase64Text(wifiCompact);
      console.log("WiFi payload b64 length:", wifiB64.length);
      try {
        console.log("About to write wifi...");
        await device.writeCharacteristicWithoutResponseForService(
          serviceUuid.trim(),
          wifiCharUuid.trim(),
          wifiB64
        );
        console.log("WiFi write done.");
      } catch (e) {
        console.log("WIFI WRITE ERROR:", e?.message ?? e, e?.errorCode);
        throw e;
      }

      if (statusCharUuid.trim()) {
        try {
          const statusCharacteristic = await device.readCharacteristicForService(
            serviceUuid.trim(),
            statusCharUuid.trim()
          );
          const decoded = statusCharacteristic?.value
            ? Buffer.from(statusCharacteristic.value, "base64").toString("utf8")
            : "";
          setLastBleStatus(decoded || "Status characteristic read with no payload.");
        } catch {
          setLastBleStatus("Status read skipped/failed. Continuing.");
        }
      }

      setMessage(
        "Device registered on the server, auth + Wi‑Fi sent over BLE. The ESP is rebooting to apply credentials."
      );

      try {
        connectedDeviceRef.current?.cancelConnection();
      } catch {
        // Ignore disconnect errors; the ESP reboot will drop BLE anyway.
      }
      connectedDeviceRef.current = null;

      await waitForDeviceVisibleThenReturnHome(deviceId.trim());
    } catch (e) {
      setError(e.message ?? "Failed BLE provisioning transfer.");
    } finally {
      setIsBleBusy(false);
    }
  }

  async function waitForDeviceVisibleThenReturnHome(targetDeviceId) {
    setIsWaitingForServer(true);
    setMessage("Waiting for the server to see the new device...");
    try {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        try {
          const { devices: latest = [] } = await fetchMyDevices();
          const found = latest.find(
            (d) => String(d.device_id ?? "").toLowerCase() === targetDeviceId.toLowerCase()
          );
          if (found) {
            setMessage("Device is registered. Returning to Home.");
            if (navigation?.popToTop) {
              navigation.popToTop();
            } else if (navigation?.goBack) {
              navigation.goBack();
            }
            return;
          }
        } catch (pollError) {
          console.log("device poll failed (will retry):", pollError?.message ?? pollError);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      setError(
        "Provisioning sent, but the server did not show the device within 30s. Pull-to-refresh from Home."
      );
    } finally {
      setIsWaitingForServer(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Device Provisioning</Text>
          <Text style={styles.instructions}>
            Scan the ESP QR (device_name + device_id), enter Wi‑Fi, then send. The app registers
            device_id + auth_token on the server first, then pushes the same token and Wi‑Fi to the ESP
            over BLE so ingest works as soon as the board gets online.
          </Text>

          {!canUseNativeProvisioning ? (
            <Text style={styles.platformNote}>
              QR + BLE provisioning is enabled for iOS first. Use iOS dev build for native
              Bluetooth behavior.
            </Text>
          ) : bleUnavailableReason ? (
            <Text style={styles.platformNote}>{bleUnavailableReason}</Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={openQrScanner}
            disabled={isBleBusy}
          >
            <Text style={styles.secondaryButtonText}>Scan ESP QR</Text>
          </Pressable>

          <TextInput
            style={styles.input}
            value={espName}
            onChangeText={(value) => {
              setEspName(value);
              setDeviceNickname((prev) => prev || value);
            }}
            placeholder="Device name (from QR — editable)"
            autoCapitalize="none"
          />
          <Text style={styles.hintMuted}>
            A one-time auth token is generated on this screen and sent to the ESP over BLE (see technical
            details). Use the same flow if you regenerate the token.
          </Text>

          <TextInput
            style={styles.input}
            value={wifiSsid}
            onChangeText={setWifiSsid}
            placeholder="Wi-Fi SSID"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={wifiPassword}
            onChangeText={setWifiPassword}
            placeholder="Wi-Fi password"
            secureTextEntry
            autoCapitalize="none"
          />
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              (!isReadyToSendBlePayload || isBleBusy || isWaitingForServer) && styles.disabledButton,
              pressed && styles.pressed,
            ]}
            onPress={sendBleProvisioningPayload}
            disabled={!isReadyToSendBlePayload || isBleBusy || isWaitingForServer}
          >
            {isBleBusy || isWaitingForServer ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Send Token + Wi-Fi over BLE</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={() => setShowAdvancedDetails((prev) => !prev)}
          >
            <Text style={styles.secondaryButtonText}>
              {showAdvancedDetails ? "Hide technical details" : "Show technical details"}
            </Text>
          </Pressable>

          {showAdvancedDetails ? (
            <>
              <Text style={styles.advancedHeading}>Technical (normally hidden)</Text>
              <TextInput style={styles.input} editable={false} value={authToken} placeholder="auth_token" />
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                onPress={() => {
                  setAuthToken(randomUuidV4());
                }}
              >
                <Text style={styles.secondaryButtonText}>Generate new auth token</Text>
              </Pressable>
              <TextInput
                style={styles.input}
                value={proofOfPossession}
                onChangeText={setProofOfPossession}
                placeholder="Legacy POP field (Espressif QR only)"
                autoCapitalize="none"
              />
              <View style={styles.readOnlyMetaRow}>
                <Text style={styles.readOnlyMetaText}>QR transport: {transport || "--"}</Text>
                <Text style={styles.readOnlyMetaText}>QR version: {qrVersion || "--"}</Text>
              </View>
              <TextInput
                style={styles.input}
                value={serviceUuid}
                onChangeText={setServiceUuid}
                placeholder="BLE service UUID"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={authCharUuid}
                onChangeText={setAuthCharUuid}
                placeholder="BLE auth characteristic UUID"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={wifiCharUuid}
                onChangeText={setWifiCharUuid}
                placeholder="BLE Wi-Fi characteristic UUID"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={statusCharUuid}
                onChangeText={setStatusCharUuid}
                placeholder="BLE status characteristic UUID (optional)"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={deviceNickname}
                onChangeText={setDeviceNickname}
                placeholder="Display nickname (optional)"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={deviceId}
                onChangeText={setDeviceId}
                placeholder="device_id (from QR)"
                autoCapitalize="none"
              />
              {!!lastQrRawValue && (
                <Text style={styles.statusText}>
                  Last QR raw payload: {String(lastQrRawValue).slice(0, 220)}
                  {String(lastQrRawValue).length > 220 ? "..." : ""}
                </Text>
              )}
            </>
          ) : null}

          {!!lastBleStatus && <Text style={styles.statusText}>ESP status: {lastBleStatus}</Text>}
          {!!message && <Text style={styles.messageText}>{message}</Text>}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      </ScrollView>

      {cameraVisible ? (
        <Modal
          visible
          animationType="slide"
          onShow={() => {
            console.log("QR: modal shown, activating camera");
            setScanDebug("Camera mounted. Scanner ready.");
            setIsCameraReady(true);
          }}
        >
          <SafeAreaView style={styles.cameraSafeArea}>
            <View style={styles.cameraHeader}>
              <Text style={styles.cameraTitle}>Scan ESP Provisioning QR</Text>
              <Pressable
                style={[styles.secondaryButton, styles.cameraCloseButton]}
                onPress={closeQrScanner}
              >
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
            {cameraPermission?.granted ? (
              isCameraReady ? (
                <CameraView
                  style={styles.cameraView}
                  barcodeScannerEnabled
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={stableBarcodeHandler}
                />
              ) : (
                <View style={styles.cameraLoadingContainer}>
                  <ActivityIndicator color="#38bdf8" size="large" />
                </View>
              )
            ) : (
              <View style={styles.cameraFallback}>
                <Text style={styles.cameraHint}>
                  Camera permission is not granted. Enable camera access in iOS Settings for this app.
                </Text>
              </View>
            )}
            {!!scanDebug && <Text style={styles.cameraDebugText}>{scanDebug}</Text>}
            <Text style={styles.cameraHint}>
              Expected JSON: device_name, device_id (optional UUID overrides: service_uuid, auth_char_uuid,
              wifi_char_uuid, status_char_uuid). Custom firmware uses fixed UUIDs if omitted.
            </Text>
          </SafeAreaView>
        </Modal>
      ) : null}
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
  hintMuted: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 17,
  },
  advancedHeading: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  platformNote: {
    fontSize: 12,
    color: "#7c2d12",
    backgroundColor: "#ffedd5",
    borderColor: "#fdba74",
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  rowButtons: {
    flexDirection: "row",
    gap: 8,
  },
  flexButton: {
    flex: 1,
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
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontWeight: "700",
  },
  readOnlyMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  readOnlyMetaText: {
    fontSize: 12,
    color: "#334155",
  },
  disabledButton: {
    opacity: 0.5,
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
  statusText: {
    fontSize: 12,
    color: "#334155",
  },
  errorText: {
    fontSize: 13,
    color: "#b91c1c",
  },
  cameraSafeArea: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  cameraHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 10,
    backgroundColor: "#f8fafc",
  },
  cameraCloseButton: {
    marginTop: 6,
  },
  cameraTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  cameraView: {
    flex: 1,
  },
  cameraFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  cameraLoadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cameraHint: {
    fontSize: 12,
    color: "#e2e8f0",
    padding: 12,
    lineHeight: 18,
  },
  cameraDebugText: {
    fontSize: 12,
    color: "#38bdf8",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
});
