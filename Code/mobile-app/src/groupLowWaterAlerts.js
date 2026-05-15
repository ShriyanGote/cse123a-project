import { getLevelPercent } from "./lib/water";
import { scheduleLowWaterLocalNotification } from "./notifications";

export const LOW_WATER_THRESHOLD_PERCENT = 20;
/** Require this long continuously at 0% before notifying on empty/off readings (non-zero low alerts immediately). */
export const LOW_WATER_ALERT_DELAY_MS = 30_000;

/** @typedef {{ lastPercent: number | null, lastAlertedSig: string | null, zeroPercentSinceMs: number | null }} GroupWaterAlertState */

/** @type {Map<string, GroupWaterAlertState>} */
const stateByGroupId = new Map();

function clearState(groupId) {
  stateByGroupId.delete(groupId);
}

/** Clears all low-water alert bookkeeping (call on sign-out so nothing carries across sessions). */
export function clearAllLowWaterAlertState() {
  stateByGroupId.clear();
}

function getState(groupId) {
  return (
    stateByGroupId.get(groupId) ?? {
      lastPercent: null,
      lastAlertedSig: null,
      zeroPercentSinceMs: null,
    }
  );
}

function putState(groupId, state) {
  stateByGroupId.set(groupId, state);
}

function readingSignature(latestReading) {
  /* istanbul ignore if -- only called after a valid weight_g reading */
  if (latestReading.weight_g == null) return null;
  const t = latestReading.created_at ?? latestReading.updated_at ?? "";
  const battery = latestReading.battery_mv;
  return `${t}|${latestReading.weight_g}|${battery == null ? "" : battery}`;
}

export function waterPercentForGroup(group, latestReading) {
  if (!group?.id || !latestReading || latestReading.weight_g == null) return null;
  return getLevelPercent(
    Number(latestReading.weight_g),
    group.empty_g,
    group.full_g
  );
}

function groupDisplayName(group) {
  const name = typeof group?.name === "string" ? group.name.trim() : "";
  return name || "Group";
}

/**
 * @param {number | null} prevPercent
 * @param {number} currentPercent
 * @param {string | null} lastAlertedSig
 * @param {string | null} readingSig
 */
export function shouldAlertLowWater(prevPercent, currentPercent, lastAlertedSig, readingSig) {
  if (currentPercent >= LOW_WATER_THRESHOLD_PERCENT || !readingSig) {
    return false;
  }

  const crossedFromAbove =
    prevPercent != null &&
    prevPercent >= LOW_WATER_THRESHOLD_PERCENT &&
    currentPercent < LOW_WATER_THRESHOLD_PERCENT;

  const newReadingWhileLow =
    lastAlertedSig == null || readingSig !== lastAlertedSig;

  return crossedFromAbove || newReadingWhileLow;
}

/**
 * Call after each fresh fetch of `group` + `latestReading`.
 * Below threshold: non-zero low (1–19%) alerts immediately when rules fire; 0% waits
 * {@link LOW_WATER_ALERT_DELAY_MS} before notifying. Clears bookkeeping when level is back at or above the threshold.
 */
export async function updateGroupWaterLevelState(group, latestReading) {
  const groupId = group?.id;
  if (!groupId) return;

  if (!group.device_id) {
    clearState(groupId);
    return;
  }

  const current = waterPercentForGroup(group, latestReading);
  if (current == null) {
    clearState(groupId);
    return;
  }

  const state = getState(groupId);
  const prevPercent = state.lastPercent;
  state.lastPercent = current;

  if (current >= LOW_WATER_THRESHOLD_PERCENT) {
    state.lastAlertedSig = null;
    state.zeroPercentSinceMs = null;
    putState(groupId, state);
    return;
  }

  const readingSig = readingSignature(latestReading);

  if (current > 0) {
    state.zeroPercentSinceMs = null;
    if (
      !shouldAlertLowWater(prevPercent, current, state.lastAlertedSig, readingSig)
    ) {
      putState(groupId, state);
      return;
    }

    state.lastAlertedSig = readingSig;
    putState(groupId, state);

    await scheduleLowWaterLocalNotification({
      groupId,
      groupName: groupDisplayName(group),
      levelPercent: current,
    });
    return;
  }

  // current === 0% (empty weight): defer until sustained long enough
  if (state.zeroPercentSinceMs == null) {
    state.zeroPercentSinceMs = Date.now();
  }

  const delayElapsed =
    Date.now() - state.zeroPercentSinceMs >= LOW_WATER_ALERT_DELAY_MS;

  if (!delayElapsed) {
    putState(groupId, state);
    return;
  }

  if (
    !shouldAlertLowWater(prevPercent, current, state.lastAlertedSig, readingSig)
  ) {
    putState(groupId, state);
    return;
  }

  state.lastAlertedSig = readingSig;
  putState(groupId, state);

  await scheduleLowWaterLocalNotification({
    groupId,
    groupName: groupDisplayName(group),
    levelPercent: current,
  });
}
