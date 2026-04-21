import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../supabase";
import { generateInviteCode } from "../lib/inviteCode";

export default function DashboardScreen({ user, navigation }) {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDeviceId, setNewGroupDeviceId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("group_members")
      .select(
        "role, groups:group_id(id, name, invite_code, device_id, created_by, created_at)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (loadError) throw loadError;
    const mapped = (data ?? [])
      .map((row) => ({
        role: row.role,
        ...(row.groups ?? {}),
      }))
      .filter((group) => group?.id);
    setGroups(mapped);
  }, [user.id]);

  const refresh = useCallback(async () => {
    try {
      setError("");
      await loadGroups();
    } catch (e) {
      setError(e.message ?? "Failed to load groups.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [loadGroups]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) {
      setError("Please enter a group name.");
      return;
    }

    setIsBusy(true);
    try {
      setError("");
      const inviteCode = generateInviteCode(6);
      const { error: rpcError } = await supabase.rpc("create_group_with_owner", {
        group_name: name,
        invite: inviteCode,
        device: newGroupDeviceId.trim() || null,
      });
      if (rpcError) throw rpcError;

      setNewGroupName("");
      setNewGroupDeviceId("");
      await refresh();
    } catch (e) {
      setError(e.message ?? "Could not create group.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleJoinGroup() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("Please enter an invite code.");
      return;
    }

    setIsBusy(true);
    try {
      setError("");
      const { error: joinError } = await supabase.rpc("join_group_by_invite", {
        invite: code,
      });
      if (joinError) throw joinError;
      setJoinCode("");
      await refresh();
    } catch (e) {
      setError(e.message ?? "Could not join group.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message ?? "Could not sign out.");
    }
  }

  function onRefresh() {
    setIsRefreshing(true);
    refresh();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>My Groups</Text>
            <Text style={styles.subtitle}>{user.email}</Text>
          </View>
          <Pressable style={styles.secondaryButton} onPress={handleSignOut}>
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Create Group</Text>
          <TextInput
            value={newGroupName}
            onChangeText={setNewGroupName}
            placeholder="e.g. Apartment Kitchen"
            style={styles.input}
          />
          <TextInput
            value={newGroupDeviceId}
            onChangeText={setNewGroupDeviceId}
            placeholder="Device ID (optional)"
            autoCapitalize="none"
            style={styles.input}
          />
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              isBusy && styles.disabled,
            ]}
            onPress={handleCreateGroup}
            disabled={isBusy}
          >
            <Text style={styles.primaryButtonText}>Create Group</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Join With Invite Code</Text>
          <TextInput
            value={joinCode}
            onChangeText={setJoinCode}
            placeholder="Enter code"
            autoCapitalize="characters"
            style={styles.input}
          />
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
              isBusy && styles.disabled,
            ]}
            onPress={handleJoinGroup}
            disabled={isBusy}
          >
            <Text style={styles.primaryButtonText}>Join Group</Text>
          </Pressable>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0ea5e9" />
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.groupList}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No groups yet. Create one or join with a code.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() =>
                  navigation.navigate("Group", { groupId: item.id, groupName: item.name })
                }
                style={({ pressed }) => [
                  styles.groupCard,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.groupName}>{item.name}</Text>
                <Text style={styles.groupMeta}>Invite code: {item.invite_code}</Text>
                <Text style={styles.groupMeta}>Device: {item.device_id || "Not set"}</Text>
                <Text style={styles.groupMeta}>Role: {item.role}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    color: "#64748b",
    marginTop: 2,
  },
  card: {
    backgroundColor: "#fff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
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
    fontSize: 15,
    backgroundColor: "#fff",
  },
  primaryButton: {
    backgroundColor: "#0ea5e9",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderColor: "#cbd5e1",
    borderWidth: 1,
    backgroundColor: "#fff",
  },
  secondaryButtonText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 12,
  },
  groupList: {
    paddingBottom: 20,
    gap: 10,
  },
  groupCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  groupName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  groupMeta: {
    color: "#64748b",
    fontSize: 12,
  },
  emptyText: {
    marginTop: 30,
    textAlign: "center",
    color: "#64748b",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#b91c1c",
    textAlign: "center",
    fontSize: 13,
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.65,
  },
});
