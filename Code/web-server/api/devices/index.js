import { requireUserAuth } from "../_lib/auth.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

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
    const { data, error } = await supabaseAdmin
      .from("devices")
      .select("id, device_id, device_name, status, last_seen_at, created_at")
      .eq("created_by", auth.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ devices: data ?? [] });
  } catch (e) {
    return res.status(500).json({ error: e.message ?? "Failed to list devices." });
  }
}
