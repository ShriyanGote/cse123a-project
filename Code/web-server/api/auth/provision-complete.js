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

  const {
    session_id,
    device_id,
    public_jwk,
    jwk_kid,
    alg = "ES256",
    enc = "A256GCM",
    group_id = null,
  } = req.body || {};

  if (!session_id || !device_id || !public_jwk || !jwk_kid) {
    return res.status(400).json({
      error: "Missing required fields: session_id, device_id, public_jwk, jwk_kid.",
    });
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("provisioning_sessions")
    .select("id, user_id, used_at, expires_at")
    .eq("id", session_id)
    .maybeSingle();

  if (sessionError || !session) {
    return res.status(400).json({ error: "Invalid provisioning session." });
  }
  if (session.user_id !== auth.user.id) {
    return res.status(403).json({ error: "Provisioning session does not belong to user." });
  }
  if (session.used_at) {
    return res.status(409).json({ error: "Provisioning session already used." });
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: "Provisioning session expired." });
  }

  const { data: upsertedDevice, error: deviceError } = await supabaseAdmin
    .from("devices")
    .upsert(
      {
        device_id,
        created_by: auth.user.id,
        status: "active",
      },
      { onConflict: "device_id" }
    )
    .select("id, device_id")
    .single();

  if (deviceError || !upsertedDevice) {
    return res.status(500).json({
      error: "Failed to upsert device. Ensure devices table exists.",
      details: deviceError?.message ?? null,
    });
  }

  const { error: credError } = await supabaseAdmin.from("device_credentials").upsert(
    {
      device_id: upsertedDevice.id,
      jwk_kid,
      public_jwk,
      alg,
      enc,
      issued_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "device_id,jwk_kid" }
  );

  if (credError) {
    return res.status(500).json({
      error: "Failed to save device credential. Ensure device_credentials table exists.",
      details: credError.message,
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
      error: "Failed to bind device to user. Ensure device_user_bindings table exists.",
      details: bindError.message,
    });
  }

  await supabaseAdmin
    .from("provisioning_sessions")
    .update({ used_at: new Date().toISOString() })
    .eq("id", session_id);

  return res.status(200).json({
    ok: true,
    device_id,
    bound_user_id: auth.user.id,
  });
}
