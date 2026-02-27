/*

You can use this command to send sample data to the ingest API endpoint. It has a debug output that shows the current percent, 
previous percent, whether it crossed the low water threshold, number of notification tokens, and how many attempts 
succeeded/failed.

Make sure to replace {INGEST-API-KEY} with the actual API key from your environment variables.

Command: curl -s -o /tmp/ingestDebug.out -w "HTTP %{http_code}\n" -X POST https://cse123a-project-6a3s.vercel.app/api/ingest -H "Content-Type: application/json" -H "x-api-key: {INGEST-API-KEY}" -d '{"device_id":"demo-calibrate-1","weight_g":1100,"battery_mv":3790}' && cat /tmp/ingestDebug.out

*/

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
      tokenCount: 0,
      firebaseConfigured: false,
      sentCount: 0,
      failedCount: 0,
    };

    if (crossedBelowThreshold) {
      const { data: tokenRows, error: tokenError } = await supabase
        .from("notification_tokens")
        .select("token");

      if (tokenError) {
        console.error("Failed to read notification_tokens", tokenError);
      } else if (tokenRows?.length) {
        const tokens = tokenRows.map((row) => row.token).filter(Boolean);
        debug.tokenCount = tokens.length;

        let firebaseApp = null;
        try {
          firebaseApp = getFirebaseApp();
        } catch (initError) {
          console.error("Firebase Admin initialization failed", initError);
        }

        if (firebaseApp) {
          debug.firebaseConfigured = true;
        }

        if (firebaseApp && tokens.length > 0) {
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

            debug.sentCount = response.successCount;
            debug.failedCount = response.failureCount;

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

    return res.status(200).json({ ok: true, debug });
  } catch (unhandledError) {
    console.error("Unhandled ingest failure", unhandledError);
    return res.status(500).json({ error: "Internal server error" });
  }
}
