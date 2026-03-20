import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

// Default calibration if none is stored in Supabase
const DEFAULT_FULL_G = 2500; // ~2.5L of water
const DEFAULT_EMPTY_G = 0;

// Set to true to show fake data and see the UI without Supabase
const USE_DEMO_DATA = false;
const DEMO_READING = {
  device_id: "demo-sensor-1",
  weight_g: 1625,
  battery_mv: 3850,
  created_at: new Date().toISOString(),
};

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function getLevelPercent(weightG, calibration) {
  if (weightG == null) return 0;

  const empty = calibration?.empty ?? DEFAULT_EMPTY_G;
  const full = calibration?.full ?? DEFAULT_FULL_G;

  if (full <= empty || weightG <= empty) return 0;

  const range = full - empty;
  const value = ((weightG - empty) / range) * 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function hasWater(weightG, calibration) {
  if (weightG == null) return false;
  const empty = calibration?.empty ?? DEFAULT_EMPTY_G;
  return weightG > empty;
}

export default function App() {
  const [latest, setLatest] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [isSavingCalibration, setIsSavingCalibration] = useState(false);
  const [waterCanAnimate, setWaterCanAnimate] = useState(false);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [pushStatus, setPushStatus] = useState("");

  async function load() {
    const { data } = await supabase
      .from("water_readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest(data ?? null);
  }

  async function loadCalibration() {
    const { data } = await supabase
      .from("calibration")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setCalibration(data ?? null);
  }

  useEffect(() => {
    load();
    loadCalibration();
    const t = setInterval(() => {
      load();
      loadCalibration();
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const subscribeToPush = useCallback(async ({ requestPermission = false } = {}) => {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      setPushStatus("Push notifications are not supported in this browser.");
      return;
    }

    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setPushStatus("Missing VAPID_PUBLIC_KEY.");
      return;
    }

    let permission = Notification.permission;
    if (requestPermission) {
      permission = await Notification.requestPermission();
    }

    setNotificationPermission(permission);

    if (permission !== "granted") {
      setPushStatus(
        permission === "denied"
          ? "Notifications are blocked. Enable them in browser settings."
          : "Notifications are not enabled yet."
      );
      return;
    }

    setIsSubscribingPush(true);
    setPushStatus("");

    try {
      const serviceWorkerRegistration = await navigator.serviceWorker.register(
        "/push-sw.js"
      );

      let subscription = await serviceWorkerRegistration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await serviceWorkerRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      if (!subscription) {
        setPushStatus("Failed to create a push subscription.");
        return;
      }

      const registerResponse = await fetch("/api/register-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });

      if (!registerResponse.ok) {
        setPushStatus("Subscription registration failed on the server.");
        return;
      }

      setPushStatus("Notifications are enabled.");
    } finally {
      setIsSubscribingPush(false);
    }
  }, []);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "Notification" in window;
    setNotificationSupported(supported);

    if (!supported) {
      setPushStatus("Push notifications are not supported in this browser.");
      return;
    }

    setNotificationPermission(Notification.permission);

    if (Notification.permission === "granted") {
      subscribeToPush({ requestPermission: false }).catch((error) => {
        console.error("Push setup failed", error);
        setPushStatus("Push setup failed. Check browser console for details.");
      });
    }
  }, [subscribeToPush]);

  const display = USE_DEMO_DATA ? DEMO_READING : latest;
  const percent = display ? getLevelPercent(display.weight_g, calibration) : 0;

  // Enable water height transition only after first paint so reload doesn’t animate from 0
  useEffect(() => {
    if (!display) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setWaterCanAnimate(true));
    });
    return () => cancelAnimationFrame(id);
  }, [!!display]);
  const waterPresent = hasWater(display?.weight_g, calibration);
  const lastUpdated = display?.created_at
    ? new Date(display.created_at)
    : null;

  async function upsertCalibration(nextFields) {
    setIsSavingCalibration(true);
    const base = calibration ?? {};
    const payload = {
      id: base.id ?? 1,
      empty: "empty" in nextFields ? nextFields.empty : base.empty ?? null,
      full: "full" in nextFields ? nextFields.full : base.full ?? null,
    };

    await supabase
      .from("calibration")
      .upsert(payload, { onConflict: "id" });

    await loadCalibration();
    setIsSavingCalibration(false);
  }

  async function calibrateEmpty() {
    if (!display) return;
    await upsertCalibration({ empty: display.weight_g });
  }

  async function calibrateFull() {
    if (!display) return;
    await upsertCalibration({ full: display.weight_g });
  }

  async function resetCalibration() {
    if (!display) return;
    await upsertCalibration({ empty: null, full: null });
  }

  return (
    <div className="brita-dashboard">
      {USE_DEMO_DATA && (
        <p className="brita-demo-banner">Demo mode — showing fake data</p>
      )}
      <header className="brita-header">
        <h1>Water Filter Level</h1>
        <div className="status-row">
          <span
            className={`status-dot ${waterPresent ? "status-dot--full" : "status-dot--empty"}`}
            title={waterPresent ? "Water in pitcher" : "Pitcher empty"}
            aria-hidden
          />
          <span className="status-label">
            {waterPresent ? "Water in pitcher" : "Pitcher empty"}
          </span>
        </div>
        {notificationSupported && notificationPermission !== "granted" && (
          <div className="brita-calibration brita-calibration--push" style={{ marginTop: 12 }}>
            <p className="brita-calibration__hint">
              Enable notifications to get low-water alerts.
            </p>
            <button
              className="brita-calibration__button brita-calibration__button--primary"
              type="button"
              onClick={() => subscribeToPush({ requestPermission: true })}
              disabled={isSubscribingPush}
            >
              {isSubscribingPush ? "Enabling..." : "Enable notifications"}
            </button>
          </div>
        )}
        {pushStatus && <p className="brita-calibration__hint">{pushStatus}</p>}
      </header>

      {!display ? (
        <div className="brita-empty-state">
          <p>No data yet. Waiting for sensor…</p>
        </div>
      ) : (
        <>
          <div className="brita-pitcher-wrap">
            <div className="brita-pitcher">
              <div className="brita-pitcher__body">
                <div
                  className={`brita-pitcher__water${waterCanAnimate ? " brita-pitcher__water--animate" : ""}`}
                  style={{ height: `${percent}%` }}
                />
              </div>
              <div className="brita-pitcher__spout" />
              <div className="brita-pitcher__handle" />
            </div>
            <p className="brita-percent">
              <span className="brita-percent__value">{percent}</span>
              <span className="brita-percent__unit">%</span>
            </p>
          </div>

          <div className="brita-meta">
            <p className="brita-meta__updated">
              Last updated:{" "}
              <time dateTime={lastUpdated.toISOString()}>
                {lastUpdated.toLocaleString()}
              </time>
            </p>
            <p className="brita-meta__detail">
              Weight: {display.weight_g} g
              {display.battery_mv != null && (
                <> · Battery: {display.battery_mv} mV</>
              )}
            </p>
            <div className="brita-calibration">
              <div className="brita-calibration__row">
                <button
                  className="brita-calibration__button"
                  type="button"
                  onClick={calibrateEmpty}
                  disabled={!display || isSavingCalibration}
                >
                  Calibrate empty
                </button>
                <button
                  className="brita-calibration__button brita-calibration__button--primary"
                  type="button"
                  onClick={calibrateFull}
                  disabled={!display || isSavingCalibration}
                >
                  Calibrate full
                </button>
                <button
                  className="brita-calibration__button brita-calibration__button--reset"
                  type="button"
                  onClick={resetCalibration}
                  disabled={isSavingCalibration}
                >
                  Reset calibration
                </button>
              </div>
              <p className="brita-calibration__current">
                Empty:{" "}
                {calibration?.empty != null
                  ? `${calibration.empty} g`
                  : `${DEFAULT_EMPTY_G} g (default)`}{" "}
                · Full:{" "}
                {calibration?.full != null
                  ? `${calibration.full} g`
                  : `${DEFAULT_FULL_G} g (default)`}
              </p>
              <p className="brita-calibration__hint">
                Uses the latest reading when you press the buttons. New
                calibrations overwrite previous values.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
