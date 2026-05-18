import { requireUserAuth } from "../_lib/auth.js";
import { setCors } from "../_lib/groups.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

// Combined profile endpoint. Kept as one Vercel function to stay under the
// 12-function limit on Hobby plans.
//   GET  /api/profile                        -> current profile
//   POST /api/profile { display_name }       -> upsert display name (formerly /ensure)
//   POST /api/profile { delete_account: true } -> permanently delete account
//   POST /api/profile { sign_out_all: true } -> revoke refresh tokens on all devices
export default async function handler(req, res) {
  setCors(res, "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  if (req.method === "GET") {
    return handleGet(req, res, auth);
  }
  if (req.method === "POST") {
    if (req.body?.sign_out_all === true) {
      return handleSignOutAll(req, res, auth);
    }
    if (req.body?.delete_account === true) {
      return handleDeleteAccount(req, res, auth);
    }
    return handleEnsure(req, res, auth);
  }
  return res.status(405).json({ error: "Use GET or POST" });
}

async function handleGet(_req, res, auth) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    id: auth.user.id,
    display_name: data?.display_name ?? null,
  });
}

async function handleEnsure(req, res, auth) {
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
}

async function handleSignOutAll(_req, res, auth) {
  const { error } = await supabaseAdmin.auth.admin.signOut(auth.token, "global");
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true });
}

async function handleDeleteAccount(_req, res, auth) {
  const userId = auth.user.id;

  const { data: ownedMemberships, error: ownedError } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId)
    .eq("role", "owner");
  if (ownedError) {
    return res.status(500).json({ error: ownedError.message });
  }

  for (const { group_id: groupId } of ownedMemberships ?? []) {
    const { data: members, error: membersError } = await supabaseAdmin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);
    if (membersError) {
      return res.status(500).json({ error: membersError.message });
    }

    const others = (members ?? []).filter((member) => member.user_id !== userId);
    if (others.length === 0) {
      const { error: deleteGroupError } = await supabaseAdmin
        .from("groups")
        .delete()
        .eq("id", groupId);
      if (deleteGroupError) {
        return res.status(500).json({ error: deleteGroupError.message });
      }
      continue;
    }

    const { error: promoteError } = await supabaseAdmin
      .from("group_members")
      .update({ role: "owner" })
      .eq("group_id", groupId)
      .eq("user_id", others[0].user_id);
    if (promoteError) {
      return res.status(500).json({ error: promoteError.message });
    }
  }

  const { error: leaveGroupsError } = await supabaseAdmin
    .from("group_members")
    .delete()
    .eq("user_id", userId);
  if (leaveGroupsError) {
    return res.status(500).json({ error: leaveGroupsError.message });
  }

  const { error: orphanGroupsError } = await supabaseAdmin
    .from("groups")
    .delete()
    .eq("created_by", userId);
  if (orphanGroupsError) {
    return res.status(500).json({ error: orphanGroupsError.message });
  }

  const { error: devicesError } = await supabaseAdmin
    .from("devices")
    .update({ status: "revoked" })
    .eq("created_by", userId);
  if (devicesError) {
    return res.status(500).json({ error: devicesError.message });
  }

  try {
    await supabaseAdmin.auth.admin.signOut(userId, "global");
  } catch {
    // Best-effort.
  }

  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    return res.status(500).json({ error: deleteUserError.message });
  }

  return res.status(200).json({ ok: true, deleted: true });
}
