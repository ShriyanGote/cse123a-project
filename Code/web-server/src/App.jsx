import { useEffect, useState } from "react";
import { supabase } from "./supabase";

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

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Brita Water Monitor</h1>
      {!latest ? (
        <p>No data yet.</p>
      ) : (
        <div>
          <p><b>Device:</b> {latest.device_id}</p>
          <p><b>Weight (g):</b> {latest.weight_g}</p>
          <p><b>Battery (mV):</b> {latest.battery_mv ?? "—"}</p>
          <p><b>Time:</b> {new Date(latest.created_at).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}
