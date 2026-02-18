import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.INGEST_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { device_id, weight_g, battery_mv } = req.body ?? {};
  if (!device_id || typeof weight_g !== "number") {
    return res.status(400).json({ error: "device_id and numeric weight_g required" });
  }

  const { error } = await supabase.from("water_readings").insert([{
    device_id,
    weight_g,
    battery_mv: typeof battery_mv === "number" ? battery_mv : null,
  }]);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
