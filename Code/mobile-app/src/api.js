import { supabase } from "./supabase";

const DEFAULT_API_BASE = "https://cse123a-project-6a3s.vercel.app";

export const apiBaseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE
).replace(/\/$/, "");

async function getAuthHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message ?? "Failed to read auth session.");
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in first.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function assertHttps(url) {
  if (!url.startsWith("https://")) {
    throw new Error("API base URL must use HTTPS.");
  }
}

async function apiFetch(path, init = {}) {
  assertHttps(apiBaseUrl);
  const headers = await getAuthHeaders();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404 && (path.startsWith("/api/groups") || path.startsWith("/api/profile"))) {
      throw new Error(
        `API route not found at ${apiBaseUrl}${path}. Set EXPO_PUBLIC_API_BASE_URL to the deployed web-server API that includes the new group/profile routes.`
      );
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchAppState() {
  return apiFetch("/api/app-state", { method: "GET" });
}

export async function postCalibration(partial) {
  return apiFetch("/api/calibration", {
    method: "POST",
    body: JSON.stringify(partial),
  });
}

export async function createProvisionSession() {
  return apiFetch("/api/auth/provision-start", { method: "POST" });
}

export async function completeProvisionSession(payload) {
  return apiFetch("/api/auth/provision-complete", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function ensureMyProfile(displayName) {
  return apiFetch("/api/profile/ensure", {
    method: "POST",
    body: JSON.stringify({ display_name: displayName ?? null }),
  });
}

export async function fetchMyGroups() {
  return apiFetch("/api/groups", { method: "GET" });
}

export async function createGroup(payload) {
  return apiFetch("/api/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function joinGroupByInvite(inviteCode) {
  return apiFetch("/api/groups/join", {
    method: "POST",
    body: JSON.stringify({ invite_code: inviteCode }),
  });
}

export async function fetchGroupDetails(groupId) {
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: "GET",
  });
}

export async function updateGroup(groupId, payload) {
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteGroup(groupId) {
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: "DELETE",
  });
}

export async function updateGroupMemberRole(groupId, userId, role) {
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function removeGroupMember(groupId, userId) {
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function calibrateGroup(groupId, action) {
  return apiFetch(`/api/groups/${encodeURIComponent(groupId)}/calibration`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}
