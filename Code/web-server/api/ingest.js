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

    const { data: groupData, error: groupLookupError } = await supabaseAdmin
      .from("groups")
      .select("id, name, empty_g, full_g")
      .eq("device_id", resolvedDeviceId)
      .maybeSingle();
    if (groupLookupError) return res.status(500).json({ error: groupLookupError.message });
    if (!groupData) {
      return res.status(404).json({ error: "No group linked to this device." });
    }

    const { data: previousReading, error: previousError } = await supabaseAdmin
      .from("water_readings")
      .select("weight_g")
      .eq("device_id", resolvedDeviceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousError) return res.status(500).json({ error: previousError.message });

    const { error } = await supabaseAdmin.from("water_readings").insert([
      { device_id: resolvedDeviceId, weight_g, battery_mv }
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

    return res.status(200).json({ ok: true, debug });
  } catch (unhandledError) {
    console.error("Unhandled ingest failure", unhandledError);
    return res.status(500).json({ error: "Internal server error" });
  }
}
