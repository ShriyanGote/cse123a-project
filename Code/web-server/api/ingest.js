import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const MAX_WEIGHT_G = 2500;
const EMPTY_WEIGHT_G = 0;
const LOW_WATER_THRESHOLD_PERCENT = 20;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let webPushConfigured = false;

function getMissingVapidEnvVars() {
  const missing = [];
  if (!process.env.VAPID_PUBLIC_KEY) missing.push("VAPID_PUBLIC_KEY");
  if (!process.env.VAPID_PRIVATE_KEY) missing.push("VAPID_PRIVATE_KEY");
  if (!process.env.VAPID_SUBJECT) missing.push("VAPID_SUBJECT");
  return missing;
}

function configureWebPush() {
  if (webPushConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  webPushConfigured = true;
  return true;
}

function parseSubscriptionToken(token) {
  if (!token) return null;

  if (typeof token === "string") {
    try {
      const parsed = JSON.parse(token);
      if (parsed && typeof parsed.endpoint === "string") return parsed;
    } catch {
      return null;
    }
    return null;
  }

  if (typeof token === "object" && typeof token.endpoint === "string") {
    return token;
  }

  return null;
}

function getLevelPercent(weightG) {
  if (weightG == null || weightG <= EMPTY_WEIGHT_G) return 0;
  const range = MAX_WEIGHT_G - EMPTY_WEIGHT_G;
  const value = ((weightG - EMPTY_WEIGHT_G) / range) * 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    if (req.headers["x-api-key"] !== process.env.INGEST_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { device_id, weight_g, battery_mv } = req.body || {};

    const { data: previousReading, error: previousError } = await supabase
      .from("water_readings")
      .select("weight_g")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousError) return res.status(500).json({ error: previousError.message });

    const { error } = await supabase.from("water_readings").insert([
      { device_id, weight_g, battery_mv }
    ]);

    if (error) return res.status(500).json({ error: error.message });

    const currentPercent = getLevelPercent(Number(weight_g));
    const previousPercent = getLevelPercent(previousReading?.weight_g);
    const crossedBelowThreshold =
      currentPercent < LOW_WATER_THRESHOLD_PERCENT &&
      (!previousReading || previousPercent >= LOW_WATER_THRESHOLD_PERCENT);

    const debug = {
      currentPercent,
      previousPercent,
      crossedBelowThreshold,
      subscriptionCount: 0,
      webPushConfigured: false,
      missingVapidEnvVars: [],
      sentCount: 0,
      failedCount: 0,
      failedReasons: [],
    };

    if (crossedBelowThreshold) {
      debug.missingVapidEnvVars = getMissingVapidEnvVars();

      const { data: subscriptionRows, error: subscriptionError } = await supabase
        .from("notification_tokens")
        .select("token");

      if (subscriptionError) {
        console.error("Failed to read notification_tokens", subscriptionError);
      } else if (subscriptionRows?.length) {
        const subscriptions = subscriptionRows
          .map((row) => {
            const parsedSubscription = parseSubscriptionToken(row?.token);
            if (!parsedSubscription) return null;

            return {
              rawToken: row.token,
              subscription: parsedSubscription,
            };
          })
          .filter(Boolean);

        debug.subscriptionCount = subscriptions.length;

        const isWebPushReady = configureWebPush();
        debug.webPushConfigured = isWebPushReady;

        if (isWebPushReady && subscriptions.length > 0) {
          try {
            const payload = JSON.stringify({
              notification: {
                title: "Brita water level low",
                body: `Water level is ${currentPercent}%. Time to refill.`,
              },
              data: {
                type: "low_water",
                level_percent: String(currentPercent),
              },
            });

            const expiredSubscriptions = [];

            await Promise.all(
              subscriptions.map(async (item) => {
                try {
                  await webpush.sendNotification(item.subscription, payload);
                  debug.sentCount += 1;
                } catch (pushError) {
                  debug.failedCount += 1;

                  const statusCode = pushError?.statusCode;
                  if (statusCode === 404 || statusCode === 410) {
                    expiredSubscriptions.push(item.rawToken);
                  } else {
                    console.error("Web Push send failed", pushError);
                  }

                  debug.failedReasons.push({
                    statusCode: statusCode ?? null,
                    message: pushError?.message ?? "Unknown push error",
                  });
                }
              }
            ));

            if (expiredSubscriptions.length > 0) {
              await supabase
                .from("notification_tokens")
                .delete()
                .in("token", expiredSubscriptions);
            }
          } catch (notifyError) {
            console.error("Push notification send failed", notifyError);
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
