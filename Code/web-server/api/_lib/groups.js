import { supabaseAdmin } from "./supabaseAdmin.js";

export function normalizeParam(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function generateInviteCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * alphabet.length);
    code += alphabet[index];
  }
  return code;
}

export async function getMembership(userId, groupId) {
  const { data, error } = await supabaseAdmin
    .from("group_members")
    .select("group_id, user_id, role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function requireMembership(userId, groupId) {
  const membership = await getMembership(userId, groupId);
  if (!membership) {
    const error = new Error("You do not have access to this group.");
    error.status = 403;
    throw error;
  }
  return membership;
}

export function setCors(res, methods) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
