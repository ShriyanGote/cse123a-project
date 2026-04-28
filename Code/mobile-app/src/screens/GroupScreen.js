import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WaterLevelCard from "../components/WaterLevelCard";
import { supabase } from "../supabase";

export default function GroupScreen({ route, user, navigation }) {
  const { groupId } = route.params;
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [editError, setEditError] = useState("");
  const [waterError, setWaterError] = useState("");
  const [group, setGroup] = useState(null);
  const [latestReading, setLatestReading] = useState(null);
  const [members, setMembers] = useState([]);
  const [editName, setEditName] = useState("");
  const [editDeviceId, setEditDeviceId] = useState("");
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);

  const myMembership = useMemo(
    () => members.find((member) => member.user_id === user.id),
    [members, user.id]
  );
  const canManageUsers =
    myMembership?.role === "owner" || myMembership?.role === "admin";
  const canEditGroup = myMembership?.role === "owner";
  const canDeleteGroup = myMembership?.role === "owner";

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
    const mergedMembers = (memberData ?? []).map((member) => {
      const rawDisplayName = profileMap.get(member.user_id);
      const normalizedDisplayName =
        typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
      return {
        ...member,
        display_name: normalizedDisplayName || null,
      };
    });

    setGroup(groupData);
    setEditName(groupData.name ?? "");
    setEditDeviceId(groupData.device_id ?? "");
    setLatestReading(reading);
    setMembers(mergedMembers);
  }, [groupId]);

  const refresh = useCallback(async () => {
    try {
      setGeneralError("");
      await loadGroup();
    } catch (e) {
      setGeneralError(e.message ?? "Could not load group details.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [loadGroup]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function updateMemberRole(targetUserId, nextRole) {
    if (!canEditGroup) return;
    try {
      setGeneralError("");
      const { error: updateError } = await supabase
        .from("group_members")
        .update({ role: nextRole })
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);
      if (updateError) throw updateError;
      await refresh();
    } catch (e) {
      setGeneralError(e.message ?? "Could not update member role.");
    }
  }

  async function removeMember(targetUserId) {
    if (!canManageUsers) return;
    if (targetUserId === user.id && myMembership?.role === "owner") {
      setGeneralError("Owner cannot remove themselves.");
      return;
    }
    try {
      setGeneralError("");
      const { error: removeError } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);
      if (removeError) throw removeError;
      await refresh();
    } catch (e) {
      setGeneralError(e.message ?? "Could not remove member.");
    }
  }

  async function saveGroupEdits() {
    if (!canEditGroup) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError("Group name cannot be empty.");
      return;
    }

    setIsSavingGroup(true);
    try {
      setEditError("");
      const { error: updateError } = await supabase
        .from("groups")
        .update({
          name: trimmedName,
          device_id: editDeviceId.trim() || null,
        })
        .eq("id", groupId);
      if (updateError) throw updateError;
      setIsEditModalVisible(false);
      await refresh();
    } catch (e) {
      setEditError(e.message ?? "Could not save group details.");
    } finally {
      setIsSavingGroup(false);
    }
  }

  function confirmDeleteGroup() {
    if (!canDeleteGroup) return;
    Alert.alert(
      "Delete Group",
      "This will permanently delete the group and all memberships. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeletingGroup(true);
            try {
              setGeneralError("");
              const { error: deleteError } = await supabase
                .from("groups")
                .delete()
                .eq("id", groupId);
              if (deleteError) throw deleteError;
              navigation.goBack();
            } catch (e) {
              setGeneralError(e.message ?? "Could not delete group.");
            } finally {
              setIsDeletingGroup(false);
            }
          },
        },
      ]
    );
  }

  async function calibrateGroup(field) {
    if (!canEditGroup) return;
    if (!latestReading?.weight_g && latestReading?.weight_g !== 0) {
      setWaterError("No sensor reading available for calibration.");
      return;
    }

    setIsCalibrating(true);
    try {
      setWaterError("");
      const payload =
        field === "reset"
          ? { empty_g: 0, full_g: 2500 }
          : field === "empty"
            ? { empty_g: latestReading.weight_g }
            : { full_g: latestReading.weight_g };
      const { error: updateError } = await supabase
        .from("groups")
        .update(payload)
        .eq("id", groupId);
      if (updateError) throw updateError;
      await refresh();
    } catch (e) {
      setWaterError(e.message ?? "Could not calibrate water filter.");
    } finally {
      setIsCalibrating(false);
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
              <View style={styles.headerTopRow}>
                <Text style={styles.groupName}>{group?.name ?? "Group"}</Text>
                {canEditGroup ? (
                  <Pressable
                    style={[
                      styles.editHeaderButton,
                      (isSavingGroup || isDeletingGroup) && styles.disabledButton,
                    ]}
                    onPress={() => {
                      setEditError("");
                      setIsEditModalVisible(true);
                    }}
                    disabled={isSavingGroup || isDeletingGroup}
                  >
                    <Text style={styles.editHeaderButtonText}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.groupMeta}>Invite code: {group?.invite_code ?? "--"}</Text>
              <Text style={styles.groupMeta}>Device: {group?.device_id ?? "Not set"}</Text>
              <Text style={styles.groupMeta}>Your role: {myMembership?.role ?? "--"}</Text>
              {!!generalError && <Text style={styles.errorText}>{generalError}</Text>}
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
              showCalibrationButtons={canEditGroup}
              onCalibrateEmpty={() => calibrateGroup("empty")}
              onCalibrateFull={() => calibrateGroup("full")}
              onResetCalibration={() => calibrateGroup("reset")}
              isCalibrating={isCalibrating}
              errorMessage={waterError}
            />
            <Text style={styles.memberTitle}>Members</Text>
          </>
        }
        renderItem={({ item }) => {
          const isCurrentUser = item.user_id === user.id;
          const baseName = item.display_name?.trim() || "Group member";
          const displayName = isCurrentUser ? `${baseName} (You)` : baseName;
          const isOwner = item.role === "owner";
          const canEdit = canManageUsers && !isOwner;

          return (
            <View style={styles.memberCard}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{displayName}</Text>
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
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.editTitle}>Edit Group</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="Group name"
              style={styles.input}
            />
            <TextInput
              value={editDeviceId}
              onChangeText={setEditDeviceId}
              placeholder="Device ID"
              autoCapitalize="none"
              style={styles.input}
            />
            {!!editError && <Text style={styles.modalErrorText}>{editError}</Text>}
            <Pressable
              style={[
                styles.actionButton,
                (isSavingGroup || isDeletingGroup) && styles.disabledButton,
              ]}
              onPress={saveGroupEdits}
              disabled={isSavingGroup || isDeletingGroup}
            >
              <Text style={styles.actionButtonText}>
                {isSavingGroup ? "Saving..." : "Save changes"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryAction}
              onPress={() => setIsEditModalVisible(false)}
            >
              <Text style={styles.secondaryActionText}>Cancel</Text>
            </Pressable>
            {canDeleteGroup ? (
              <Pressable
                style={[
                  styles.deleteButton,
                  (isSavingGroup || isDeletingGroup) && styles.disabledButton,
                ]}
                onPress={confirmDeleteGroup}
                disabled={isSavingGroup || isDeletingGroup}
              >
                <Text style={styles.deleteButtonText}>
                  {isDeletingGroup ? "Deleting..." : "Delete group"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
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
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  editHeaderButton: {
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editHeaderButtonText: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: "700",
  },
  editTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  actionButton: {
    backgroundColor: "#0ea5e9",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryAction: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  secondaryActionText: {
    color: "#334155",
    fontWeight: "600",
  },
  deleteButton: {
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff1f2",
  },
  deleteButtonText: {
    color: "#be123c",
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderColor: "#dbeafe",
    borderWidth: 1,
    padding: 16,
    gap: 10,
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
  modalErrorText: {
    color: "#b91c1c",
    fontSize: 12,
  },
});
