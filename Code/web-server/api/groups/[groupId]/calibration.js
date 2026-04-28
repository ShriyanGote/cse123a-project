import { requireUserAuth } from "../../_lib/auth.js";
import { normalizeParam, requireMembership, setCors } from "../../_lib/groups.js";
import { supabaseAdmin } from "../../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  setCors(res, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  const groupId = normalizeParam(req.query.groupId);
  if (!groupId) return res.status(400).json({ error: "Missing group id." });

  try {
    const membership = await requireMembership(auth.user.id, groupId);
    if (membership.role !== "owner") {
      return res.status(403).json({ error: "Only owner can calibrate this group." });
    }

    const action = typeof req.body?.action === "string" ? req.body.action : "";
    if (!["reset", "empty", "full"].includes(action)) {
      return res.status(400).json({ error: "Action must be one of: reset, empty, full." });
    }

    const { data: groupData, error: groupError } = await supabaseAdmin
      .from("groups")
      .select("device_id")
      .eq("id", groupId)
      .single();
    if (groupError) return res.status(500).json({ error: groupError.message });

    let payload = null;
    if (action === "reset") {
      payload = { empty_g: 0, full_g: 2500 };
    } else {
      if (!groupData.device_id) {
        return res.status(400).json({ error: "Group has no device ID for calibration." });
      }
      const { data: latestReading, error: readError } = await supabaseAdmin
        .from("water_readings")
        .select("weight_g")
        .eq("device_id", groupData.device_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (readError) return res.status(500).json({ error: readError.message });
      if (!latestReading || (latestReading.weight_g == null && latestReading.weight_g !== 0)) {
        return res.status(400).json({ error: "No sensor reading available for calibration." });
      }

      payload =
        action === "empty"
          ? { empty_g: latestReading.weight_g }
          : { full_g: latestReading.weight_g };
    }

    const { error: updateError } = await supabaseAdmin
      .from("groups")
      .update(payload)
      .eq("id", groupId);
    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(error.status ?? 500).json({ error: error.message ?? "Calibration failed." });
  }
}
