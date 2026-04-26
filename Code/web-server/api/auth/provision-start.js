import { randomUUID } from "node:crypto";
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

  const sessionId = randomUUID();
  const nonce = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabaseAdmin.from("provisioning_sessions").insert({
    id: sessionId,
    user_id: auth.user.id,
    nonce,
    expires_at: expiresAt,
  });

  if (error) {
    return res.status(500).json({
      error:
        "Failed to create provisioning session. Ensure provisioning_sessions table exists.",
      details: error.message,
    });
  }

  return res.status(200).json({ session_id: sessionId, nonce, expires_at: expiresAt });
}
