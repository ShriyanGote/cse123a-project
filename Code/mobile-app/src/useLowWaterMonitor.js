import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { fetchGroupDetails, fetchMyGroups } from "./api";
import { updateGroupWaterLevelState } from "./groupLowWaterAlerts";

/** How often to re-fetch groups while the app is active (lower = faster alerts, more API calls). */
const POLL_INTERVAL_MS = 8_000;

/**
 * Polls the user's groups while the app is active and triggers local low-water
 * notifications per groupLowWaterAlerts (immediate for non-zero low; 30s delay at 0%).
 */
export function useLowWaterMonitor(enabled) {
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let intervalId = null;

    async function pollOnce() {
      if (cancelled || appStateRef.current !== "active") return;
      try {
        const { groups } = await fetchMyGroups();
        const list = groups ?? [];
        const withDevice = list.filter((g) => g?.id && g?.device_id);
        if (withDevice.length === 0) return;

        const results = await Promise.all(
          withDevice.map((g) =>
            fetchGroupDetails(g.id).catch(() => null)
          )
        );

        for (let i = 0; i < withDevice.length; i += 1) {
          const res = results[i];
          if (!res?.group) continue;
          await updateGroupWaterLevelState(res.group, res.latestReading ?? null);
        }
      } catch (e) {
        console.warn("Low water monitor:", e?.message ?? e);
      }
    }

    const onAppStateChange = (next) => {
      appStateRef.current = next;
      if (next === "active") pollOnce();
    };

    const sub = AppState.addEventListener("change", onAppStateChange);
    pollOnce();
    intervalId = setInterval(pollOnce, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      sub.remove();
      /* istanbul ignore next -- interval is always set before cleanup in practice */
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled]);
}
