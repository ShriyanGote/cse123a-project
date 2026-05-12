import { requireUserAuth } from "../_lib/auth.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  const { device_id, auth_token, device_name = null, group_id = null } = req.body || {};

  if (!device_id || typeof device_id !== "string") {
    return res.status(400).json({ error: "Missing device_id." });
  }
  if (!auth_token || typeof auth_token !== "string") {
    return res.status(400).json({ error: "Missing auth_token." });
  }

  const { data: upsertedDevice, error: deviceError } = await supabaseAdmin
    .from("devices")
    .upsert(
      {
        device_id: device_id.trim(),
        created_by: auth.user.id,
        status: "active",
        auth_token: auth_token.trim(),
        device_name: device_name ? String(device_name).trim() : null,
      },
      { onConflict: "device_id" }
    )
    .select("id, device_id, device_name")
    .single();

  if (deviceError || !upsertedDevice) {
    return res.status(500).json({
      error: "Failed to register device. Ensure devices table has auth_token and device_name columns.",
      details: deviceError?.message ?? null,
    });
  }

  const { error: bindError } = await supabaseAdmin.from("device_user_bindings").upsert(
    {
      device_id: upsertedDevice.id,
      user_id: auth.user.id,
      group_id,
      bound_by: auth.user.id,
      bound_at: new Date().toISOString(),
    },
    { onConflict: "device_id,user_id" }
  );

  if (bindError) {
    return res.status(500).json({
      error: "Failed to bind device to user.",
      details: bindError.message,
    });
  }

  /** POST /api/ingest looks up `groups` by hardware device_id; without this row ingest returns 404. */
  const hardwareId = device_id.trim();
  let targetGroupId =
    typeof group_id === "string" && group_id.trim() ? group_id.trim() : null;

  if (targetGroupId) {
    const { data: grp, error: grpErr } = await supabaseAdmin
      .from("groups")
      .select("id, created_by")
      .eq("id", targetGroupId)
      .maybeSingle();
    if (grpErr || !grp) {
      return res.status(400).json({ error: "group_id not found.", details: grpErr?.message ?? null });
    }
    if (grp.created_by !== auth.user.id) {
      return res.status(403).json({ error: "You can only attach a device to a group you created." });
    }
  } else {
    const { data: owned, error: listErr } = await supabaseAdmin
      .from("groups")
      .select("id, device_id")
      .eq("created_by", auth.user.id)
      .order("created_at", { ascending: false });
    if (listErr) {
      return res.status(500).json({ error: "Failed to list your groups.", details: listErr.message });
    }
    const rows = owned ?? [];
    const reuse = rows.find((g) => g.device_id === hardwareId);
    const empty = rows.find((g) => g.device_id == null || String(g.device_id).trim() === "");
    targetGroupId = reuse?.id ?? empty?.id ?? null;
  }

  let ingest_linked_group_id = null;
  if (targetGroupId) {
    const { data: updated, error: linkErr } = await supabaseAdmin
      .from("groups")
      .update({ device_id: hardwareId })
      .eq("id", targetGroupId)
      .eq("created_by", auth.user.id)
      .select("id")
      .maybeSingle();
    if (linkErr) {
      return res.status(500).json({
        error: "Device saved but failed to link group for ingest.",
        details: linkErr.message,
      });
    }
    if (updated?.id) {
      ingest_linked_group_id = updated.id;
    }
  }

  return res.status(200).json({
    ok: true,
    device_id: upsertedDevice.device_id,
    device_name: upsertedDevice.device_name,
    ingest_linked_group_id,
    ingest_note: ingest_linked_group_id
      ? "groups.device_id set; POST /api/ingest should succeed."
      : "No group linked: create a group in the app (or pass group_id) so readings can be stored.",
  });
}
