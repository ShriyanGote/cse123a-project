import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    const { data: current, error: readError } = await supabase
      .from("calibration")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readError) {
      return res.status(500).json({ error: readError.message });
    }

    const base = current ?? {};
    const body = req.body || {};

    const payload = {
      id: body.id != null ? body.id : base.id ?? 1,
      empty: Object.prototype.hasOwnProperty.call(body, "empty")
        ? body.empty
        : base.empty ?? null,
      full: Object.prototype.hasOwnProperty.call(body, "full")
        ? body.full
        : base.full ?? null,
    };

    const { error: upsertError } = await supabase
      .from("calibration")
      .upsert(payload, { onConflict: "id" });

    if (upsertError) {
      return res.status(500).json({ error: upsertError.message });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
