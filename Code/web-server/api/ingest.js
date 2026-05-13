import { requireDeviceAuth } from "./_lib/auth.js";
import { sendExpoPushNotifications } from "./_lib/expoPush.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

const DEFAULT_FULL_G = 2500; // ~2.5L of water
const DEFAULT_EMPTY_G = 0;
const LOW_WATER_THRESHOLD_PERCENT = 20;

function getLevelPercent(weightG, calibration) {
  if (weightG == null) return 0;

  const empty = calibration?.empty ?? DEFAULT_EMPTY_G;
  const full = calibration?.full ?? DEFAULT_FULL_G;

  if (full <= empty || weightG <= empty) return 0;

  const range = full - empty;
  const value = ((weightG - empty) / range) * 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeHardwareDeviceId(id) {
  return typeof id === "string" ? id.trim().toLowerCase() : "";
}

/**
 * Resolve group for ingest: direct groups.device_id match, or auto-link first
 * owned empty group for the device's created_by user (same idea as ble-register).
 */
async function resolveGroupForIngest(hardwareId) {
  const hid = normalizeHardwareDeviceId(hardwareId);
  if (!hid) return { group: null, linked: false };

  const { data: direct, error: directErr } = await supabaseAdmin
    .from("groups")
    .select("id, name, empty_g, full_g")
    .eq("device_id", hid)
    .maybeSingle();
  if (directErr) {
    return { group: null, linked: false, error: directErr.message };
  }
  if (direct) {
    return { group: direct, linked: false };
  }

  const { data: deviceRow, error: devErr } = await supabaseAdmin
    .from("devices")
    .select("id, created_by")
    .eq("device_id", hid)
    .maybeSingle();
  if (devErr || !deviceRow?.created_by) {
    return { group: null, linked: false };
  }

  const { data: owned, error: listErr } = await supabaseAdmin
    .from("groups")
    .select("id, name, empty_g, full_g, device_id")
    .eq("created_by", deviceRow.created_by)
    .order("created_at", { ascending: false });
  if (listErr) {
    return { group: null, linked: false, error: listErr.message };
  }
  const rows = owned ?? [];
  const reuse = rows.find((g) => g.device_id && String(g.device_id).trim().toLowerCase() === hid);
  if (reuse) {
    return {
      group: {
        id: reuse.id,
        name: reuse.name,
        empty_g: reuse.empty_g,
        full_g: reuse.full_g,
      },
      linked: false,
    };
  }
  const slot = rows.find((g) => g.device_id == null || String(g.device_id).trim() === "");
  if (!slot) {
    return { group: null, linked: false };
  }

  const { data: patched, error: patchErr } = await supabaseAdmin
    .from("groups")
    .update({ device_id: hid })
    .eq("id", slot.id)
    .select("id, name, empty_g, full_g")
    .maybeSingle();
  if (patchErr || !patched) {
    return { group: null, linked: false, error: patchErr?.message };
  }
  return { group: patched, linked: true };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const auth = await requireDeviceAuth(req, res);
    if (!auth) return;

    const { device_id, weight_g, battery_mv } = req.body || {};
    const resolvedDeviceId = device_id ?? auth.device.deviceId;
    if (!resolvedDeviceId) {
      return res.status(400).json({ error: "Missing device_id." });
    }

    const hid =
      normalizeHardwareDeviceId(resolvedDeviceId) ||
      (typeof resolvedDeviceId === "string" ? resolvedDeviceId.trim() : String(resolvedDeviceId));

    const { group: groupData, linked: autoLinkedGroup, error: resolveErr } =
      await resolveGroupForIngest(hid);
    if (resolveErr) {
      return res.status(500).json({ error: resolveErr });
    }
    if (!groupData) {
      console.warn("[ingest] no group for device", hid);
      return res.status(404).json({
        error: "No group linked to this device.",
        code: "INGEST_NO_GROUP",
        hint: "Create a group in the app, or run device provisioning again so a group can be linked.",
      });
    }
    if (autoLinkedGroup) {
      console.info("[ingest] auto-linked groups.device_id for device", hid, "group", groupData.id);
    }

    const { data: previousReading, error: previousError } = await supabaseAdmin
      .from("water_readings")
      .select("weight_g")
      .eq("device_id", hid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousError) return res.status(500).json({ error: previousError.message });

    const { error } = await supabaseAdmin.from("water_readings").insert([
      { device_id: hid, weight_g, battery_mv }
    ]);

    if (error) return res.status(500).json({ error: error.message });

    const calibrationData = {
      empty: groupData.empty_g,
      full: groupData.full_g,
    };
    const currentPercent = getLevelPercent(Number(weight_g), calibrationData);
    const previousPercent = getLevelPercent(previousReading?.weight_g, calibrationData);
    const crossedBelowThreshold =
      previousPercent >= LOW_WATER_THRESHOLD_PERCENT &&
      currentPercent < LOW_WATER_THRESHOLD_PERCENT;

    const debug = {
      currentPercent,
      previousPercent,
      crossedBelowThreshold,
      groupId: groupData.id,
      subscriptionCount: 0,
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      failedReasons: [],
    };

    if (crossedBelowThreshold) {
      const { data: members, error: membersError } = await supabaseAdmin
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupData.id);

      if (membersError) {
        console.error("Failed to read group members", membersError);
      } else {
        const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean);
        debug.recipientCount = userIds.length;

        if (userIds.length > 0) {
          const { data: tokenRows, error: tokenError } = await supabaseAdmin
            .from("notification_tokens")
            .select("token")
            .eq("provider", "expo")
            .eq("enabled", true)
            .in("user_id", userIds);

          if (tokenError) {
            console.error("Failed to read notification_tokens", tokenError);
          } else {
            const expoTokens = (tokenRows ?? [])
              .map((row) => (typeof row?.token === "string" ? row.token.trim() : ""))
              .filter((token) => token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
            debug.subscriptionCount = expoTokens.length;

            if (expoTokens.length > 0) {
              const { invalidTokens, failures, tickets } = await sendExpoPushNotifications(
                expoTokens.map((token) => ({
                  to: token,
                  title: "Brita water level low",
                  body: `Water level is ${currentPercent}%. Time to refill.`,
                  data: {
                    type: "low_water",
                    level_percent: String(currentPercent),
                    groupId: groupData.id,
                    groupName: groupData.name ?? "Group",
                    deviceId: resolvedDeviceId,
                  },
                }))
              );

              debug.sentCount = tickets.filter((entry) => entry?.ticket?.status === "ok").length;
              debug.failedCount = failures.length;
              debug.failedReasons = failures.map((failure) => ({
                statusCode: null,
                message: failure.message ?? "Unknown push error",
              }));

              if (invalidTokens.length > 0) {
                const { error: disableError } = await supabaseAdmin
                  .from("notification_tokens")
                  .update({
                    enabled: false,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("provider", "expo")
                  .in("token", invalidTokens);
                if (disableError) {
                  console.error("Failed to disable invalid Expo tokens", disableError);
                }
              }
            }
          }
        }
      }
    }

    return res.status(200).json({ ok: true, auto_linked_group: autoLinkedGroup, debug });
  } catch (unhandledError) {
    console.error("Unhandled ingest failure", unhandledError);
    return res.status(500).json({ error: "Internal server error" });
  }
}
