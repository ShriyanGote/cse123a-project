import { requireUserAuth } from "../_lib/auth.js";
import { setCors } from "../_lib/groups.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  setCors(res, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  // Allow deactivated users to call this so they can reactivate.
  const auth = await requireUserAuth(req, res, { allowDeactivated: true });
  if (!auth) return;

  const isActive = req.body?.is_active;
  if (typeof isActive !== "boolean") {
    return res.status(400).json({ error: "Body must include is_active boolean." });
  }

  const userId = auth.user.id;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, is_active: isActive });
  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  // Cascade to devices the user owns: revoke on deactivate, restore to
  // 'active' on reactivate. Devices the user only joined via group bindings
  // are intentionally left alone — only the owner's devices are affected.
  const nextDeviceStatus = isActive ? "active" : "revoked";
  const { error: devicesError } = await supabaseAdmin
    .from("devices")
    .update({ status: nextDeviceStatus })
    .eq("created_by", userId);
  if (devicesError) {
    return res.status(500).json({
      error: `Profile updated but failed to update devices: ${devicesError.message}`,
    });
  }

  // On deactivate, sign the user out of all sessions everywhere so the
  // mobile app's stored session can no longer hit the API.
  if (!isActive) {
    try {
      await supabaseAdmin.auth.admin.signOut(userId, "global");
    } catch {
      // Best-effort. The Realtime profile event + auth gate still protect us.
    }
  }

  return res.status(200).json({ ok: true, is_active: isActive });
}
