import { requireUserAuth } from "../_lib/auth.js";
import { setCors } from "../_lib/groups.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

// Combined profile endpoint. Kept as one Vercel function to stay under the
// 12-function limit on Hobby plans.
//   GET  /api/profile                        -> current profile
//   POST /api/profile { display_name }       -> upsert display name (formerly /ensure)
//   POST /api/profile { is_active: false }   -> deactivate (delete) account
//   POST /api/profile { sign_out_all: true } -> revoke refresh tokens on all devices
export default async function handler(req, res) {
  setCors(res, "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Allow deactivated users to read their own status only.
  const auth = await requireUserAuth(req, res, { allowDeactivated: true });
  if (!auth) return;

  if (req.method === "GET") {
    return handleGet(req, res, auth);
  }
  if (req.method === "POST") {
    if (req.body?.sign_out_all === true) {
      return handleSignOutAll(req, res, auth);
    }
    if (typeof req.body?.is_active === "boolean") {
      return handleSetActive(req, res, auth);
    }
    return handleEnsure(req, res, auth);
  }
  return res.status(405).json({ error: "Use GET or POST" });
}

async function handleGet(_req, res, auth) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, is_active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    id: auth.user.id,
    display_name: data?.display_name ?? null,
    is_active: data?.is_active ?? true,
  });
}

async function handleEnsure(req, res, auth) {
  const nameFromBody =
    typeof req.body?.display_name === "string" ? req.body.display_name.trim() : "";
  const fallback =
    auth.user.user_metadata?.display_name ||
    auth.user.email?.split("@")[0] ||
    "User";

  const { error } = await supabaseAdmin.from("profiles").upsert({
    id: auth.user.id,
    display_name: nameFromBody || fallback,
  });
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true });
}

async function handleSetActive(req, res, auth) {
  const isActive = req.body.is_active;
  const userId = auth.user.id;

  if (isActive) {
    return res.status(403).json({ error: "Deleted accounts cannot be reactivated." });
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, is_active: isActive });
  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  // Cascade to devices the user owns: revoke on deactivate.
  const nextDeviceStatus = "revoked";
  const { error: devicesError } = await supabaseAdmin
    .from("devices")
    .update({ status: nextDeviceStatus })
    .eq("created_by", userId);
  if (devicesError) {
    return res.status(500).json({
      error: `Profile updated but failed to update devices: ${devicesError.message}`,
    });
  }

  if (!isActive) {
    try {
      await supabaseAdmin.auth.admin.signOut(userId, "global");
    } catch {
      // Best-effort.
    }
  }

  return res.status(200).json({ ok: true, is_active: isActive });
}

async function handleSignOutAll(_req, res, auth) {
  const { error } = await supabaseAdmin.auth.admin.signOut(auth.token, "global");
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true });
}
