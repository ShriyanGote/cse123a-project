import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";

/** How often to verify the Supabase session while signed in (e.g. web Settings sign-out everywhere). */
export const REMOTE_AUTH_POLL_MS = 30_000;

/**
 * Confirms the session is still valid server-side. Returns false when the user was
 * signed out globally and local state was cleared.
 */
export async function ensureRemoteSessionValid() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return true;

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    await supabase.auth.signOut({ scope: "local" });
    return false;
  }

  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    await supabase.auth.signOut({ scope: "local" });
    return false;
  }

  return true;
}

/** Polls Supabase while signed in so global sign-out from web Settings returns to auth. */
export function useRemoteAuthMonitor(enabled) {
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let intervalId = null;

    async function check() {
      if (cancelled || appStateRef.current !== "active") return;
      try {
        await ensureRemoteSessionValid();
      } catch (e) {
        console.warn("Session check failed:", e?.message ?? e);
      }
    }

    const sub = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
      if (next === "active") check();
    });

    check();
    intervalId = setInterval(check, REMOTE_AUTH_POLL_MS);

    return () => {
      cancelled = true;
      sub.remove();
      /* istanbul ignore next -- interval is always set before cleanup in practice */
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled]);
}
