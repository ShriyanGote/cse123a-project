import { getLevelPercent } from "./lib/water";
import { scheduleLowWaterLocalNotification } from "./notifications";

export const LOW_WATER_THRESHOLD_PERCENT = 20;

/** @typedef {{ lastPercent: number | null, lastAlertedSig: string | null }} GroupWaterAlertState */

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
  return stateByGroupId.get(groupId) ?? { lastPercent: null, lastAlertedSig: null };
}

function putState(groupId, state) {
  stateByGroupId.set(groupId, state);
}

function readingSignature(latestReading) {
  if (!latestReading || latestReading.weight_g == null) return null;
  const t = latestReading.created_at ?? latestReading.updated_at ?? "";
  return `${t}|${latestReading.weight_g}|${latestReading.battery_mv ?? ""}`;
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
function shouldAlertLowWater(prevPercent, currentPercent, lastAlertedSig, readingSig) {
  if (currentPercent >= LOW_WATER_THRESHOLD_PERCENT || !readingSig) return false;

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
 * Alerts when level crosses below the threshold or a new sub-threshold reading arrives.
 * Clears alert bookkeeping when level is back at or above the threshold.
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
    putState(groupId, state);
    return;
  }

  const readingSig = readingSignature(latestReading);
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
