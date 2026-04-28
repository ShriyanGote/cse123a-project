import { requireUserAuth } from "../_lib/auth.js";
import { setCors } from "../_lib/groups.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  setCors(res, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  try {
    const nameFromBody =
      typeof req.body?.display_name === "string" ? req.body.display_name.trim() : "";
    const fallback =
      auth.user.user_metadata?.display_name ||
      auth.user.email?.split("@")[0] ||
      "User";

    const { error } = await supabaseAdmin.from("profiles").upsert({
      id: auth.user.id,
      display_name: nameFromBody || fallback,
    });
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message ?? "Failed to ensure profile." });
  }
}
