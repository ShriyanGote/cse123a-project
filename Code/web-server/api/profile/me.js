import { requireUserAuth } from "../_lib/auth.js";
import { setCors } from "../_lib/groups.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  setCors(res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Use GET" });
  }

  // Use a permissive auth check here so a deactivated user can still
  // see their own status (otherwise the mobile app can't tell why it
  // was rejected). The hard gate is in requireUserAuth for other routes.
  const auth = await requireUserAuth(req, res, { allowDeactivated: true });
  if (!auth) return;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, is_active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    id: auth.user.id,
    display_name: data?.display_name ?? null,
    is_active: data?.is_active ?? true,
  });
}
