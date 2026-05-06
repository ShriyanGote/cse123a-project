import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

async function authedFetch(path, init = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export default function Settings() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  // Sign-in form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    try {
      const data = await authedFetch("/api/profile");
      setProfile(data);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [session]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Live updates: if anything changes our profile row (e.g. another tab
  // toggles the flag), reflect it immediately.
  useEffect(() => {
    if (!session?.user) return;
    const channel = supabase
      .channel(`profile-${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${session.user.id}`,
        },
        (payload) => {
          setProfile((prev) => ({ ...(prev ?? {}), ...payload.new }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  async function handleSignIn(event) {
    event.preventDefault();
    setError("");
    setWorking(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      setPassword("");
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function handleToggleActive(nextActive) {
    const verb = nextActive ? "reactivate" : "deactivate";
    const confirmed = window.confirm(
      nextActive
        ? "Reactivate your account? Your devices will be re-enabled."
        : "Deactivate your account? This will sign you out of the mobile app on every device and revoke your devices until you reactivate."
    );
    if (!confirmed) return;
    setWorking(true);
    setError("");
    try {
      const data = await authedFetch("/api/profile", {
        method: "POST",
        body: JSON.stringify({ is_active: nextActive }),
      });
      setProfile((prev) => ({ ...(prev ?? {}), is_active: data.is_active }));
    } catch (e) {
      setError(`Failed to ${verb}: ${e.message}`);
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <div className="settings-page"><p>Loading…</p></div>;
  }

  if (!session) {
    return (
      <div className="settings-page">
        <h2>Settings — Sign In</h2>
        <p className="settings-hint">
          Sign in with the same account you use in the mobile app to manage
          account activation.
        </p>
        <form onSubmit={handleSignIn} className="settings-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={working}>
            {working ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {error && <p className="settings-error">{error}</p>}
      </div>
    );
  }

  const isActive = profile?.is_active !== false;

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <p className="settings-hint">
        Signed in as <strong>{session.user.email}</strong>{" "}
        <button className="settings-link" type="button" onClick={handleSignOut}>
          (sign out)
        </button>
      </p>

      <section className="settings-section">
        <h3>Account status</h3>
        <p>
          Status:{" "}
          <strong className={isActive ? "status-active" : "status-inactive"}>
            {isActive ? "Active" : "Deactivated"}
          </strong>
        </p>
        <p className="settings-hint">
          Deactivating your account will sign you out of the mobile app on
          every device and revoke your registered devices. Use this if your
          phone is lost. You can reactivate any time by signing in here.
        </p>
        {isActive ? (
          <button
            type="button"
            className="settings-button settings-button--danger"
            onClick={() => handleToggleActive(false)}
            disabled={working}
          >
            {working ? "Working…" : "Deactivate account"}
          </button>
        ) : (
          <button
            type="button"
            className="settings-button settings-button--primary"
            onClick={() => handleToggleActive(true)}
            disabled={working}
          >
            {working ? "Working…" : "Reactivate account"}
          </button>
        )}
      </section>

      {error && <p className="settings-error">{error}</p>}
    </div>
  );
}
