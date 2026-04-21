import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WaterLevelCard from "../components/WaterLevelCard";
import { supabase } from "../supabase";

export default function GroupScreen({ route, user }) {
  const { groupId } = route.params;
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [group, setGroup] = useState(null);
  const [latestReading, setLatestReading] = useState(null);
  const [members, setMembers] = useState([]);

  const myMembership = useMemo(
    () => members.find((member) => member.user_id === user.id),
    [members, user.id]
  );
  const canManageUsers =
    myMembership?.role === "owner" || myMembership?.role === "admin";

  const loadGroup = useCallback(async () => {
    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .select("id, name, invite_code, device_id, empty_g, full_g, created_by, created_at")
      .eq("id", groupId)
      .single();
    if (groupError) throw groupError;

    let reading = null;
    if (groupData.device_id) {
      const { data: readingData, error: readingError } = await supabase
        .from("water_readings")
        .select("weight_g, battery_mv, created_at")
        .eq("device_id", groupData.device_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (readingError) throw readingError;
      reading = readingData ?? null;
    }

    const { data: memberData, error: membersError } = await supabase
      .from("group_members")
      .select("group_id, user_id, role, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });
    if (membersError) throw membersError;

    const userIds = (memberData ?? []).map((member) => member.user_id);
    let profileMap = new Map();
    if (userIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      if (profileError) throw profileError;
      profileMap = new Map((profileData ?? []).map((row) => [row.id, row.display_name]));
    }
    const mergedMembers = (memberData ?? []).map((member) => ({
      ...member,
      display_name: profileMap.get(member.user_id) ?? null,
    }));

    setGroup(groupData);
    setLatestReading(reading);
    setMembers(mergedMembers);
  }, [groupId]);

  const refresh = useCallback(async () => {
    try {
      setError("");
      await loadGroup();
    } catch (e) {
      setError(e.message ?? "Could not load group details.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [loadGroup]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function updateMemberRole(targetUserId, nextRole) {
    if (!canManageUsers) return;
    try {
      setError("");
      const { error: updateError } = await supabase
        .from("group_members")
        .update({ role: nextRole })
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);
      if (updateError) throw updateError;
      await refresh();
    } catch (e) {
      setError(e.message ?? "Could not update member role.");
    }
  }

  async function removeMember(targetUserId) {
    if (!canManageUsers) return;
    if (targetUserId === user.id && myMembership?.role === "owner") {
      setError("Owner cannot remove themselves.");
      return;
    }
    try {
      setError("");
      const { error: removeError } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);
      if (removeError) throw removeError;
      await refresh();
    } catch (e) {
      setError(e.message ?? "Could not remove member.");
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0ea5e9" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => {
            setIsRefreshing(true);
            refresh();
          }} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.headerCard}>
              <Text style={styles.groupName}>{group?.name ?? "Group"}</Text>
              <Text style={styles.groupMeta}>Invite code: {group?.invite_code ?? "--"}</Text>
              <Text style={styles.groupMeta}>Device: {group?.device_id ?? "Not set"}</Text>
              <Text style={styles.groupMeta}>Your role: {myMembership?.role ?? "--"}</Text>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </View>
            <WaterLevelCard
              waterState={
                latestReading
                  ? {
                      weight_g: latestReading.weight_g,
                      battery_mv: latestReading.battery_mv,
                      empty_g: group?.empty_g,
                      full_g: group?.full_g,
                      updated_at: latestReading.created_at,
                    }
                  : {
                      weight_g: null,
                      empty_g: group?.empty_g,
                      full_g: group?.full_g,
                      updated_at: null,
                    }
              }
            />
            <Text style={styles.memberTitle}>Members</Text>
          </>
        }
        renderItem={({ item }) => {
          const displayName = item.display_name || item.user_id;
          const isOwner = item.role === "owner";
          const canEdit = canManageUsers && !isOwner;

          return (
            <View style={styles.memberCard}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{displayName}</Text>
                <Text style={styles.memberMeta}>{item.user_id}</Text>
                <Text style={styles.memberMeta}>Role: {item.role}</Text>
              </View>
              {canEdit ? (
                <View style={styles.memberActions}>
                  <Pressable
                    onPress={() =>
                      updateMemberRole(item.user_id, item.role === "admin" ? "member" : "admin")
                    }
                    style={styles.smallButton}
                  >
                    <Text style={styles.smallButtonText}>
                      {item.role === "admin" ? "Set member" : "Set admin"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeMember(item.user_id)}
                    style={[styles.smallButton, styles.smallButtonDanger]}
                  >
                    <Text style={[styles.smallButtonText, styles.smallButtonDangerText]}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 16,
    gap: 10,
    paddingBottom: 24,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 14,
    gap: 4,
  },
  groupName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
  },
  groupMeta: {
    color: "#64748b",
    fontSize: 12,
  },
  memberTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  memberCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  memberInfo: {
    gap: 2,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  memberMeta: {
    color: "#64748b",
    fontSize: 12,
  },
  memberActions: {
    flexDirection: "row",
    gap: 8,
  },
  smallButton: {
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f0f9ff",
  },
  smallButtonText: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: "600",
  },
  smallButtonDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
  },
  smallButtonDangerText: {
    color: "#be123c",
  },
  errorText: {
    marginTop: 6,
    color: "#b91c1c",
    fontSize: 12,
  },
});
