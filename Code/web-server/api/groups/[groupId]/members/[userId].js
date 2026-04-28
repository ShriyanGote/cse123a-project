import { requireUserAuth } from "../../../../_lib/auth.js";
import { normalizeParam, requireMembership, setCors } from "../../../../_lib/groups.js";
import { supabaseAdmin } from "../../../../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  setCors(res, "PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  const groupId = normalizeParam(req.query.groupId);
  const targetUserId = normalizeParam(req.query.userId);
  if (!groupId || !targetUserId) {
    return res.status(400).json({ error: "Missing group id or user id." });
  }

  try {
    const actorMembership = await requireMembership(auth.user.id, groupId);
    const { data: targetMembership, error: targetError } = await supabaseAdmin
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (targetError) return res.status(500).json({ error: targetError.message });
    if (!targetMembership) return res.status(404).json({ error: "Group member not found." });

    if (req.method === "PATCH") {
      if (actorMembership.role !== "owner") {
        return res.status(403).json({ error: "Only owner can update member roles." });
      }
      if (targetMembership.role === "owner") {
        return res.status(400).json({ error: "Owner role cannot be changed." });
      }

      const role = typeof req.body?.role === "string" ? req.body.role : "";
      if (!["member", "admin"].includes(role)) {
        return res.status(400).json({ error: "Role must be member or admin." });
      }

      const { error } = await supabaseAdmin
        .from("group_members")
        .update({ role })
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      if (!["owner", "admin"].includes(actorMembership.role)) {
        return res.status(403).json({ error: "Only owner or admin can remove members." });
      }
      if (targetMembership.role === "owner") {
        return res.status(400).json({ error: "Owner cannot be removed." });
      }
      if (auth.user.id === targetUserId && actorMembership.role === "owner") {
        return res.status(400).json({ error: "Owner cannot remove themselves." });
      }

      const { error } = await supabaseAdmin
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Use PATCH or DELETE" });
  } catch (error) {
    return res.status(error.status ?? 500).json({ error: error.message ?? "Request failed." });
  }
}
