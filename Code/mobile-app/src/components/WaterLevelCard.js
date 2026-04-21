import { StyleSheet, Text, View } from "react-native";
import { getLevelPercent, hasWater } from "../lib/water";

export default function WaterLevelCard({ waterState }) {
  const percent = getLevelPercent(
    waterState?.weight_g,
    waterState?.empty_g,
    waterState?.full_g
  );
  const waterPresent = hasWater(waterState?.weight_g, waterState?.empty_g);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Water Filter Level</Text>
      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusDot,
            waterPresent ? styles.statusDotFull : styles.statusDotEmpty,
          ]}
        />
        <Text style={styles.statusLabel}>
          {waterPresent ? "Water detected" : "No water detected"}
        </Text>
      </View>

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

      <Text style={styles.detailText}>
        Weight: {waterState?.weight_g ?? "--"} g  |  Empty:{" "}
        {waterState?.empty_g ?? 0} g  |  Full: {waterState?.full_g ?? 2500} g
      </Text>
      <Text style={styles.detailText}>
        Battery: {waterState?.battery_mv != null ? `${waterState.battery_mv} mV` : "--"}
      </Text>
      <Text style={styles.detailText}>
        Updated:{" "}
        {waterState?.updated_at || waterState?.created_at
          ? new Date(waterState.updated_at || waterState.created_at).toLocaleString()
          : "--"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 6,
  },
  statusDotFull: {
    backgroundColor: "#22c55e",
  },
  statusDotEmpty: {
    backgroundColor: "#94a3b8",
  },
  statusLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  pitcherWrap: {
    marginTop: 6,
    alignItems: "center",
    gap: 8,
  },
  pitcher: {
    width: 140,
    height: 200,
    position: "relative",
  },
  pitcherBody: {
    position: "absolute",
    left: 22,
    top: 0,
    width: 96,
    height: 200,
    borderWidth: 3,
    borderColor: "#0ea5e9",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: "#e0f2fe",
    overflow: "hidden",
  },
  pitcherWater: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#38bdf8",
  },
  pitcherSpout: {
    position: "absolute",
    right: 2,
    top: 12,
    width: 18,
    height: 28,
    borderWidth: 3,
    borderLeftWidth: 0,
    borderColor: "#0ea5e9",
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: "#e0f2fe",
  },
  pitcherHandle: {
    position: "absolute",
    left: 4,
    top: 24,
    width: 18,
    height: 80,
    borderWidth: 3,
    borderRightWidth: 0,
    borderColor: "#0ea5e9",
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    backgroundColor: "#e0f2fe",
  },
  percentText: {
    fontSize: 40,
    fontWeight: "700",
    color: "#0f172a",
  },
  percentUnit: {
    fontSize: 20,
    color: "#0284c7",
  },
  detailText: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
  },
});
