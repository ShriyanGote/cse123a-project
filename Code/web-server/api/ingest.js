import { createClient } from "@supabase/supabase-js";
import admin from "firebase-admin";

const MAX_WEIGHT_G = 2500;
const EMPTY_WEIGHT_G = 0;
const LOW_WATER_THRESHOLD_PERCENT = 20;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getLevelPercent(weightG) {
  if (weightG == null || weightG <= EMPTY_WEIGHT_G) return 0;
  const range = MAX_WEIGHT_G - EMPTY_WEIGHT_G;
  const value = ((weightG - EMPTY_WEIGHT_G) / range) * 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getFirebaseApp() {
  if (admin.apps.length > 0) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) return null;

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export default async function handler(req, res) {
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

  if (crossedBelowThreshold) {
    const { data: tokenRows, error: tokenError } = await supabase
      .from("notification_tokens")
      .select("token");

    if (!tokenError && tokenRows?.length) {
      const firebaseApp = getFirebaseApp();

      if (firebaseApp) {
        const tokens = tokenRows.map((row) => row.token).filter(Boolean);

        if (tokens.length > 0) {
          try {
            const response = await admin.messaging(firebaseApp).sendEachForMulticast({
              tokens,
              notification: {
                title: "Brita water level low",
                body: `Water level is ${currentPercent}%. Time to refill.`,
              },
              data: {
                type: "low_water",
                level_percent: String(currentPercent),
              },
            });

            const invalidTokens = [];
            response.responses.forEach((r, index) => {
              const code = r.error?.code || "";
              if (
                code.includes("registration-token-not-registered") ||
                code.includes("invalid-registration-token")
              ) {
                invalidTokens.push(tokens[index]);
              }
            });

            if (invalidTokens.length > 0) {
              await supabase
                .from("notification_tokens")
                .delete()
                .in("token", invalidTokens);
            }
          } catch (notifyError) {
            console.error("FCM send failed", notifyError);
          }
        }
      }
    }
  }

  res.status(200).json({ ok: true });
}
