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
  const [groups, setGroups] = useState([]);
  const [devices, setDevices] = useState([]);
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

  const loadAccountData = useCallback(async () => {
    if (!session) return;
    try {
      const profileData = await authedFetch("/api/profile");
      setProfile(profileData);
      const [groupsData, devicesData] = await Promise.all([
        authedFetch("/api/groups"),
        authedFetch("/api/devices"),
      ]);
      setGroups(groupsData.groups ?? []);
      setDevices(devicesData.devices ?? []);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [session]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

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
    await supabase.auth.signOut({ scope: "local" });
    setProfile(null);
    setGroups([]);
    setDevices([]);
  }

  async function handleSignOutEverywhere() {
    const confirmed = window.confirm(
      "Sign out of every device, including phones? Other devices will be kicked out within a few minutes."
    );
    if (!confirmed) return;
    setError("");
    setWorking(true);
    try {
      await authedFetch("/api/profile", {
        method: "POST",
        body: JSON.stringify({ sign_out_all: true }),
      });
      await supabase.auth.signOut({ scope: "local" });
      setProfile(null);
      setGroups([]);
      setDevices([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      "Permanently delete your account? This removes your profile, revokes your devices, transfers or deletes your groups, and signs you out everywhere. This cannot be undone."
    );
    if (!confirmed) return;
    setError("");
    setWorking(true);
    try {
      await authedFetch("/api/profile", {
        method: "POST",
        body: JSON.stringify({ delete_account: true }),
      });
      await supabase.auth.signOut({ scope: "local" });
      setProfile(null);
      setGroups([]);
      setDevices([]);
    } catch (e) {
      setError(e.message);
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
        <h2>Sign In</h2>
        <p className="settings-hint">
          Sign in with the same account you use in the mobile app.
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

  return (
    <div className="settings-page">
      <h2>My Account</h2>
      <p className="settings-hint">
        Signed in as <strong>{session.user.email}</strong>{" "}
        <button className="settings-link" type="button" onClick={handleSignOut}>
          (sign out)
        </button>
      </p>

      <section className="settings-section">
        <h3>My Groups</h3>
        {groups.length === 0 ? (
          <p className="settings-hint">No groups found for this account.</p>
        ) : (
          <ul>
            {groups.map((group) => (
              <li key={group.id}>
                {group.name} ({group.role}){" "}
                {group.device_id ? `· Device: ${group.device_id}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section">
        <h3>My Devices</h3>
        {devices.length === 0 ? (
          <p className="settings-hint">No devices found for this account.</p>
        ) : (
          <ul>
            {devices.map((device) => (
              <li key={device.id}>
                {device.device_name || device.device_id} · {device.status}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section">
        <h3>Security</h3>
        <p className="settings-hint">
          Lost your phone? Sign out of every device that's currently signed in to this account.
        </p>
        <button
          type="button"
          onClick={handleSignOutEverywhere}
          disabled={working}
        >
          {working ? "Working…" : "Sign out everywhere"}
        </button>
      </section>

      <section className="settings-section">
        <h3>Delete account</h3>
        <p className="settings-hint">
          Permanently delete your account, revoke your devices, and remove your
          data. This action cannot be undone.
        </p>
        <button
          type="button"
          className="settings-button settings-button--danger"
          onClick={handleDeleteAccount}
          disabled={working}
        >
          {working ? "Working…" : "Delete account"}
        </button>
      </section>

      {error && <p className="settings-error">{error}</p>}
    </div>
  );
}
