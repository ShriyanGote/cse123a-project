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
