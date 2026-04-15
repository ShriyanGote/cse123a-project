const DEFAULT_API_BASE = "https://cse123a-project-6a3s.vercel.app";

export const apiBaseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE
).replace(/\/$/, "");

export async function fetchAppState() {
  const res = await fetch(`${apiBaseUrl}/api/app-state`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function postCalibration(partial) {
  const res = await fetch(`${apiBaseUrl}/api/calibration`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
