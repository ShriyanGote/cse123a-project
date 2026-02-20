import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  if (req.headers["x-api-key"] !== process.env.INGEST_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { device_id, weight_g, battery_mv } = req.body || {};

  const { error } = await supabase.from("water_readings").insert([
    { device_id, weight_g, battery_mv }
  ]);

  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ ok: true });
}
