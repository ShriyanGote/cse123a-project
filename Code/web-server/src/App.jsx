import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

// Typical Brita pitcher capacity ~2.5L ≈ 2500g water
const MAX_WEIGHT_G = 2500;
const EMPTY_WEIGHT_G = 0; // weight when pitcher is empty (no water)

function getLevelPercent(weightG) {
  if (weightG == null || weightG <= EMPTY_WEIGHT_G) return 0;
  const range = MAX_WEIGHT_G - EMPTY_WEIGHT_G;
  const value = ((weightG - EMPTY_WEIGHT_G) / range) * 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function hasWater(weightG) {
  return weightG != null && weightG > EMPTY_WEIGHT_G;
}

export default function App() {
  const [latest, setLatest] = useState(null);

  async function load() {
    const { data } = await supabase
      .from("water_readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest(data ?? null);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const percent = latest ? getLevelPercent(latest.weight_g) : 0;
  const waterPresent = hasWater(latest?.weight_g);
  const lastUpdated = latest?.created_at
    ? new Date(latest.created_at)
    : null;

  return (
    <div className="brita-dashboard">
      <header className="brita-header">
        <h1>Brita Water Level</h1>
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
      </header>

      {!latest ? (
        <div className="brita-empty-state">
          <p>No data yet. Waiting for sensor…</p>
        </div>
      ) : (
        <>
          <div className="brita-pitcher-wrap">
            <div className="brita-pitcher">
              <div className="brita-pitcher__body">
                <div
                  className="brita-pitcher__water"
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
              Weight: {latest.weight_g} g
              {latest.battery_mv != null && (
                <> · Battery: {latest.battery_mv} mV</>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
