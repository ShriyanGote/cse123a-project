import { requireUserAuth } from "./_lib/auth.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Use GET" });
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  try {
    const { data: reading, error: readingError } = await supabaseAdmin
      .from("water_readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readingError) {
      return res.status(500).json({ error: readingError.message });
    }

    const { data: calibration, error: calibrationError } = await supabaseAdmin
      .from("calibration")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (calibrationError) {
      return res.status(500).json({ error: calibrationError.message });
    }

    return res.status(200).json({
      reading: reading ?? null,
      calibration: calibration ?? null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
