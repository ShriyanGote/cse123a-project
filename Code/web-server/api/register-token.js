import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { token } = req.body || {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing FCM token" });
  }

  const { error } = await supabase.from("notification_tokens").upsert(
    [
      {
        token,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "token" }
  );

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}