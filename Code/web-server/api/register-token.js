import { requireUserAuth } from "./_lib/auth.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Use POST or DELETE" });
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  if (req.method === "DELETE") {
    return unregisterToken(req, res, auth.user.id);
  }

  return registerToken(req, res, auth.user.id);
}

function normalizeProvider(provider, fallback = "expo") {
  if (typeof provider !== "string") return fallback;
  const trimmed = provider.trim().toLowerCase();
  if (trimmed === "expo" || trimmed === "webpush") return trimmed;
  return fallback;
}

function parseLegacyWebPushToken(subscription) {
  if (
    !subscription ||
    typeof subscription !== "object" ||
    typeof subscription.endpoint !== "string"
  ) {
    return null;
  }
  return JSON.stringify(subscription);
}

function parseTokenPayload(body) {
  const tokenFromExpo = typeof body?.token === "string" ? body.token.trim() : "";
  if (tokenFromExpo) {
    return {
      provider: normalizeProvider(body?.provider, "expo"),
      platform: typeof body?.platform === "string" ? body.platform.trim() : null,
      token: tokenFromExpo,
    };
  }

  const legacyToken = parseLegacyWebPushToken(body?.subscription);
  if (legacyToken) {
    return {
      provider: "webpush",
      platform: "web",
      token: legacyToken,
    };
  }

  return null;
}

async function registerToken(req, res, userId) {
  const payload = parseTokenPayload(req.body || {});
  if (!payload?.token) {
    return res.status(400).json({ error: "Missing push token or subscription." });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("notification_tokens").upsert(
    {
      token: payload.token,
      provider: payload.provider,
      platform: payload.platform,
      user_id: userId,
      enabled: true,
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "provider,token" }
  );
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, provider: payload.provider });
}

async function unregisterToken(req, res, userId) {
  const payload = parseTokenPayload(req.body || {});
  if (!payload?.token) {
    return res.status(400).json({ error: "Missing push token or subscription." });
  }

  const { error } = await supabaseAdmin
    .from("notification_tokens")
    .update({
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", payload.provider)
    .eq("token", payload.token);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}