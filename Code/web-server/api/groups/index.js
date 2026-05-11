import { requireUserAuth } from "../_lib/auth.js";
import { generateInviteCode, setCors } from "../_lib/groups.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  setCors(res, "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  if (req.method === "GET") {
    try {
      const uid = auth.user.id;

      const { data: memberRows, error: memberError } = await supabaseAdmin
        .from("group_members")
        .select("role, groups:group_id(id, name, invite_code, device_id, created_by, created_at)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (memberError) return res.status(500).json({ error: memberError.message });

      const fromMembership = (memberRows ?? [])
        .map((row) => ({
          role: row.role,
          ...(row.groups ?? {}),
        }))
        .filter((group) => group?.id);

      const memberIds = new Set(fromMembership.map((g) => g.id));

      const { data: ownedRows, error: ownedError } = await supabaseAdmin
        .from("groups")
        .select("id, name, invite_code, device_id, created_by, created_at")
        .eq("created_by", uid);
      if (ownedError) return res.status(500).json({ error: ownedError.message });

      const fromCreatorOnly = (ownedRows ?? [])
        .filter((g) => g?.id && !memberIds.has(g.id))
        .map((g) => ({
          role: "owner",
          ...g,
        }));

      const groups = [...fromMembership, ...fromCreatorOnly];
      return res.status(200).json({ groups });
    } catch (error) {
      return res.status(500).json({ error: error.message ?? "Failed to list groups." });
    }
  }

  if (req.method === "POST") {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const deviceId =
        typeof req.body?.device_id === "string" ? req.body.device_id.trim() : "";

      if (!name) {
        return res.status(400).json({ error: "Group name is required." });
      }

      if (deviceId) {
        const { data: owned, error: ownErr } = await supabaseAdmin
          .from("devices")
          .select("id")
          .eq("device_id", deviceId)
          .eq("created_by", auth.user.id)
          .maybeSingle();
        if (ownErr) {
          return res.status(500).json({ error: ownErr.message });
        }
        if (!owned) {
          return res.status(403).json({
            error: "You can only attach a device you registered, or the device id is invalid.",
          });
        }
      }

      let group = null;
      let createError = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const inviteCode = generateInviteCode(6);
        const { data, error } = await supabaseAdmin
          .from("groups")
          .insert({
            name,
            invite_code: inviteCode,
            device_id: deviceId || null,
            created_by: auth.user.id,
          })
          .select("id, name, invite_code, device_id, created_by, created_at")
          .single();

        if (!error) {
          group = data;
          break;
        }
        createError = error;
      }

      if (!group) {
        return res
          .status(500)
          .json({ error: createError?.message ?? "Could not create group." });
      }

      const { error: memberError } = await supabaseAdmin.from("group_members").insert({
        group_id: group.id,
        user_id: auth.user.id,
        role: "owner",
      });
      if (memberError) {
        await supabaseAdmin.from("groups").delete().eq("id", group.id);
        return res.status(500).json({ error: memberError.message });
      }

      return res.status(201).json({ group });
    } catch (error) {
      return res.status(500).json({ error: error.message ?? "Failed to create group." });
    }
  }

  return res.status(405).json({ error: "Use GET or POST" });
}
