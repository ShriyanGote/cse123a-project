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
    const inviteCode =
      typeof req.body?.invite_code === "string" ? req.body.invite_code.trim().toUpperCase() : "";
    if (!inviteCode) {
      return res.status(400).json({ error: "Invite code is required." });
    }

    const { data: group, error: groupError } = await supabaseAdmin
      .from("groups")
      .select("id")
      .eq("invite_code", inviteCode)
      .maybeSingle();
    if (groupError) {
      return res.status(500).json({ error: groupError.message });
    }
    if (!group?.id) {
      return res.status(404).json({ error: "Invite code not found." });
    }

    const { error: joinError } = await supabaseAdmin.from("group_members").upsert(
      {
        group_id: group.id,
        user_id: auth.user.id,
        role: "member",
      },
      { onConflict: "group_id,user_id" }
    );
    if (joinError) {
      return res.status(500).json({ error: joinError.message });
    }

    return res.status(200).json({ ok: true, group_id: group.id });
  } catch (error) {
    return res.status(500).json({ error: error.message ?? "Could not join group." });
  }
}
