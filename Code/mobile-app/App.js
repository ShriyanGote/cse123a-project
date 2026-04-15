import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fetchAppState, postCalibration } from "./src/api";

const DEFAULT_FULL_G = 2500;
const DEFAULT_EMPTY_G = 0;

function getLevelPercent(weightG, calibration) {
  if (weightG == null) return 0;
  const empty = calibration?.empty ?? DEFAULT_EMPTY_G;
  const full = calibration?.full ?? DEFAULT_FULL_G;

  if (full <= empty || weightG <= empty) return 0;

  const range = full - empty;
  const value = ((weightG - empty) / range) * 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function hasWater(weightG, calibration) {
  if (weightG == null) return false;
  const empty = calibration?.empty ?? DEFAULT_EMPTY_G;
  return weightG > empty;
}

function PillButton({ label, onPress, disabled, variant = "default" }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "reset" && styles.buttonReset,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "primary" && styles.buttonTextPrimary,
          variant === "reset" && styles.buttonTextReset,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const [latest, setLatest] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCalibration, setIsSavingCalibration] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { reading, calibration: cal } = await fetchAppState();
      setLatest(reading ?? null);
      setCalibration(cal ?? null);
      setError("");
    } catch (e) {
      setError(e.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      await load();
      if (mounted) setIsLoading(false);
    }

    boot();

    const timer = setInterval(() => {
      load();
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [load]);

  const display = latest;
  const percent = useMemo(
    () => getLevelPercent(display?.weight_g, calibration),
    [display?.weight_g, calibration]
  );
  const waterPresent = hasWater(display?.weight_g, calibration);
  const lastUpdated = display?.created_at ? new Date(display.created_at) : null;

  async function upsertCalibration(nextFields) {
    setIsSavingCalibration(true);
    try {
      await postCalibration(nextFields);
      await load();
      setError("");
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setIsSavingCalibration(false);
    }
  }

  async function calibrateEmpty() {
    if (!display) return;
    await upsertCalibration({ empty: display.weight_g });
  }

  async function calibrateFull() {
    if (!display) return;
    await upsertCalibration({ full: display.weight_g });
  }

  async function resetCalibration() {
    await upsertCalibration({ empty: null, full: null });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Water Filter Level</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                waterPresent ? styles.statusDotFull : styles.statusDotEmpty,
              ]}
            />
            <Text style={styles.statusLabel}>
              {waterPresent ? "Water in pitcher" : "Pitcher empty"}
            </Text>
          </View>
          {!!error && <Text style={styles.errorText}>Error: {error}</Text>}
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.emptyStateText}>Loading sensor data...</Text>
          </View>
        ) : !display ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.emptyStateText}>No data yet. Waiting for sensor...</Text>
          </View>
        ) : (
          <>
            <View style={styles.pitcherWrap}>
              <View style={styles.pitcher}>
                <View style={styles.pitcherBody}>
                  <View style={[styles.pitcherWater, { height: `${percent}%` }]} />
                </View>
                <View style={styles.pitcherSpout} />
                <View style={styles.pitcherHandle} />
              </View>
              <Text style={styles.percentText}>
                {percent}
                <Text style={styles.percentUnit}>%</Text>
              </Text>
            </View>

            <View style={styles.metaCard}>
              <Text style={styles.metaUpdated}>
                Last updated: {lastUpdated?.toLocaleString() ?? "--"}
              </Text>
              <Text style={styles.metaDetail}>
                Weight: {display.weight_g} g
                {display.battery_mv != null ? `  -  Battery: ${display.battery_mv} mV` : ""}
              </Text>

              <View style={styles.buttonRow}>
                <PillButton
                  label="Calibrate empty"
                  onPress={calibrateEmpty}
                  disabled={isSavingCalibration || !display}
                />
                <PillButton
                  label="Calibrate full"
                  onPress={calibrateFull}
                  disabled={isSavingCalibration || !display}
                  variant="primary"
                />
                <PillButton
                  label="Reset calibration"
                  onPress={resetCalibration}
                  disabled={isSavingCalibration}
                  variant="reset"
                />
              </View>

              <Text style={styles.calibrationCurrent}>
                Empty:{" "}
                {calibration?.empty != null
                  ? `${calibration.empty} g`
                  : `${DEFAULT_EMPTY_G} g (default)`}{" "}
                - Full:{" "}
                {calibration?.full != null
                  ? `${calibration.full} g`
                  : `${DEFAULT_FULL_G} g (default)`}
              </Text>
              <Text style={styles.hintText}>
                Uses the latest reading when you press a calibration button.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f0f9ff",
  },
  container: {
    flexGrow: 1,
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: "#e0f2fe",
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0c4a6e",
    marginBottom: 10,
    textAlign: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusDotFull: {
    backgroundColor: "#22c55e",
  },
  statusDotEmpty: {
    backgroundColor: "#64748b",
  },
  statusLabel: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "500",
  },
  errorText: {
    marginTop: 12,
    color: "#b91c1c",
    textAlign: "center",
    fontSize: 12,
  },
  loadingWrap: {
    marginTop: 30,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyStateText: {
    color: "#64748b",
    fontSize: 15,
  },
  pitcherWrap: {
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
  },
  pitcher: {
    width: 180,
    height: 260,
    position: "relative",
  },
  pitcherBody: {
    position: "absolute",
    left: 28,
    top: 0,
    width: 124,
    height: 260,
    borderWidth: 3,
    borderColor: "#0ea5e9",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    backgroundColor: "#e0f2fe",
    overflow: "hidden",
  },
  pitcherWater: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#38bdf8",
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
  },
  pitcherSpout: {
    position: "absolute",
    right: 2,
    top: 10,
    width: 24,
    height: 34,
    borderWidth: 3,
    borderLeftWidth: 0,
    borderColor: "#0ea5e9",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: "#e0f2fe",
  },
  pitcherHandle: {
    position: "absolute",
    left: 6,
    top: 28,
    width: 20,
    height: 110,
    borderWidth: 3,
    borderRightWidth: 0,
    borderColor: "#0ea5e9",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: "#e0f2fe",
  },
  percentText: {
    fontSize: 52,
    fontWeight: "700",
    color: "#0c4a6e",
  },
  percentUnit: {
    fontSize: 24,
    color: "#0284c7",
    fontWeight: "600",
  },
  metaCard: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.8)",
    borderColor: "rgba(14,165,233,0.2)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  metaUpdated: {
    fontSize: 14,
    color: "#0c4a6e",
    fontWeight: "600",
    textAlign: "center",
  },
  metaDetail: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
  },
  buttonRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  button: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.5)",
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
  },
  buttonPrimary: {
    borderColor: "transparent",
    backgroundColor: "#0ea5e9",
  },
  buttonReset: {
    borderColor: "#94a3b8",
    backgroundColor: "#f8fafc",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: "600",
  },
  buttonTextPrimary: {
    color: "#ecfeff",
  },
  buttonTextReset: {
    color: "#475569",
  },
  calibrationCurrent: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
  },
  hintText: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
  },
});
