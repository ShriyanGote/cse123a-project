import { requireUserAuth } from "../_lib/auth.js";
import { normalizeParam, requireMembership, setCors } from "../_lib/groups.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  setCors(res, "GET, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  const groupId = normalizeParam(req.query.groupId);
  if (!groupId) return res.status(400).json({ error: "Missing group id." });

  try {
    const membership = await requireMembership(auth.user.id, groupId);

    if (req.method === "GET") {
      const { data: groupData, error: groupError } = await supabaseAdmin
        .from("groups")
        .select("id, name, invite_code, device_id, empty_g, full_g, created_by, created_at")
        .eq("id", groupId)
        .single();
      if (groupError) return res.status(500).json({ error: groupError.message });

      let latestReading = null;
      if (groupData.device_id) {
        const { data, error } = await supabaseAdmin
          .from("water_readings")
          .select("weight_g, battery_mv, created_at")
          .eq("device_id", groupData.device_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        latestReading = data ?? null;
      }

      const { data: memberData, error: membersError } = await supabaseAdmin
        .from("group_members")
        .select("group_id, user_id, role, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });
      if (membersError) return res.status(500).json({ error: membersError.message });

      const userIds = (memberData ?? []).map((member) => member.user_id);
      let profileMap = new Map();
      if (userIds.length > 0) {
        const { data: profileData, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);
        if (profileError) return res.status(500).json({ error: profileError.message });
        profileMap = new Map((profileData ?? []).map((row) => [row.id, row.display_name]));
      }

      const members = (memberData ?? []).map((member) => {
        const rawDisplayName = profileMap.get(member.user_id);
        const normalizedDisplayName =
          typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
        return {
          ...member,
          display_name: normalizedDisplayName || null,
        };
      });

      return res.status(200).json({ group: groupData, latestReading, members, membership });
    }

    if (req.method === "PATCH") {
      if (membership.role !== "owner") {
        return res.status(403).json({ error: "Only owner can edit group details." });
      }

      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const deviceId =
        typeof req.body?.device_id === "string" ? req.body.device_id.trim() : "";
      if (!name) return res.status(400).json({ error: "Group name cannot be empty." });

      const { error } = await supabaseAdmin
        .from("groups")
        .update({
          name,
          device_id: deviceId || null,
        })
        .eq("id", groupId);
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      if (membership.role !== "owner") {
        return res.status(403).json({ error: "Only owner can delete a group." });
      }

      const { error } = await supabaseAdmin.from("groups").delete().eq("id", groupId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Use GET, PATCH, or DELETE" });
  } catch (error) {
    return res.status(error.status ?? 500).json({ error: error.message ?? "Request failed." });
  }
}
