import { timingSafeEqual } from "node:crypto";
import { compactDecrypt, importJWK, jwtVerify } from "jose";
import { supabaseAdmin } from "./supabaseAdmin.js";

const replayCache = new Map();
const DEFAULT_REPLAY_TTL_MS = 5 * 60 * 1000;

function cleanupReplayCache() {
  const now = Date.now();
  for (const [jti, expiresAt] of replayCache.entries()) {
    if (expiresAt <= now) replayCache.delete(jti);
  }
}

function toJson(res, status, payload) {
  return res.status(status).json(payload);
}

export function parseBearerToken(req) {
  const raw = req.headers.authorization ?? req.headers.Authorization;
  if (!raw || typeof raw !== "string") return null;
  const [scheme, token] = raw.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

async function markJtiAsSeen(jti, subjectType, subjectId, exp) {
  cleanupReplayCache();
  const expiresMs = exp ? exp * 1000 : Date.now() + DEFAULT_REPLAY_TTL_MS;
  replayCache.set(jti, expiresMs);

  // Best-effort DB replay guard. Safe to continue if table is not provisioned.
  try {
    await supabaseAdmin.from("token_replay_guard").upsert({
      jti,
      subject_type: subjectType,
      subject_id: subjectId,
      expires_at: new Date(expiresMs).toISOString(),
    });
  } catch {
    // Ignore if schema is not present yet.
  }
}

async function hasSeenJti(jti) {
  cleanupReplayCache();
  if (replayCache.has(jti)) return true;
  try {
    const { data, error } = await supabaseAdmin
      .from("token_replay_guard")
      .select("jti")
      .eq("jti", jti)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.jti);
  } catch {
    return false;
  }
}

function getAllowedWebAudiences() {
  const raw = process.env.USER_JWT_AUDIENCE ?? "";
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : ["authenticated"];
}

async function verifyUserJwt(token) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new Error("Invalid user bearer token.");
  return data.user;
}

async function resolveDeviceVerificationKey(protectedHeader, payload) {
  const kid = protectedHeader?.kid;
  const deviceId = payload?.sub;
  if (!kid || !deviceId) {
    throw new Error("Device token must include kid header and sub claim.");
  }

  const { data, error } = await supabaseAdmin
    .from("device_credentials")
    .select("public_jwk, revoked_at")
    .eq("jwk_kid", kid)
    .maybeSingle();

  if (error || !data?.public_jwk || data?.revoked_at) {
    throw new Error("No active credential for device token.");
  }

  return importJWK(data.public_jwk, "ES256");
}

function timingSafeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function tryProvisionTokenAuth(bearerToken, deviceId) {
  if (!deviceId || typeof deviceId !== "string") return null;

  const { data, error } = await supabaseAdmin
    .from("devices")
    .select("id, device_id, auth_token, status")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error || !data?.auth_token || data.status === "revoked") return null;
  if (!timingSafeEqualString(data.auth_token, bearerToken)) return null;

  return {
    deviceId: data.device_id,
    rowId: data.id,
    mode: "provision_token",
  };
}

export async function verifyNestedDeviceToken(token) {
  const jwkJson = process.env.DEVICE_JWE_PRIVATE_JWK;
  if (!jwkJson) throw new Error("Server missing DEVICE_JWE_PRIVATE_JWK.");

  const privateJwk = JSON.parse(jwkJson);
  const jweDecryptKey = await importJWK(privateJwk);
  const { plaintext } = await compactDecrypt(token, jweDecryptKey);
  const nestedJwt = new TextDecoder().decode(plaintext);

  const expectedIssuer = process.env.DEVICE_JWT_ISSUER ?? "esp-device";
  const expectedAudience = process.env.DEVICE_JWT_AUDIENCE ?? "esp-ingest";

  const { payload, protectedHeader } = await jwtVerify(
    nestedJwt,
    resolveDeviceVerificationKey,
    {
      issuer: expectedIssuer,
      audience: expectedAudience,
    }
  );

  if (!payload?.jti) throw new Error("Device token missing jti claim.");
  if (await hasSeenJti(payload.jti)) throw new Error("Replay token rejected.");
  await markJtiAsSeen(payload.jti, "device", String(payload.sub ?? "unknown"), payload.exp);

  return {
    deviceId: String(payload.sub),
    payload,
    protectedHeader,
    nestedJwt,
  };
}

async function isAccountActive(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) return true; // Fail open if profiles row is missing.
  if (!data) return true;
  return data.is_active !== false;
}

export async function requireUserAuth(req, res, options = {}) {
  const token = parseBearerToken(req);
  if (!token) {
    toJson(res, 401, { error: "Missing Bearer token." });
    return null;
  }

  try {
    const user = await verifyUserJwt(token);
    const audClaim = user?.aud ?? "authenticated";
    if (!getAllowedWebAudiences().includes(audClaim)) {
      toJson(res, 403, { error: "Invalid user audience claim." });
      return null;
    }

    if (!options.allowDeactivated && !(await isAccountActive(user.id))) {
      toJson(res, 403, { error: "Account is deactivated.", code: "account_deactivated" });
      return null;
    }

    req.auth = { type: "user", token, user };
    return req.auth;
  } catch (error) {
    toJson(res, 401, { error: error.message ?? "Invalid user token." });
    return null;
  }
}

export async function requireDeviceAuth(req, res) {
  const token = parseBearerToken(req);
  if (!token) {
    toJson(res, 401, { error: "Missing Bearer token." });
    return null;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const deviceId = body.device_id ?? null;

  const provisionAuth = await tryProvisionTokenAuth(token, deviceId);
  if (provisionAuth) {
    req.auth = { type: "device", token, device: provisionAuth };
    return req.auth;
  }

  try {
    const device = await verifyNestedDeviceToken(token);
    req.auth = { type: "device", token, device };
    return req.auth;
  } catch (error) {
    toJson(res, 401, { error: error.message ?? "Invalid device token." });
    return null;
  }
}
