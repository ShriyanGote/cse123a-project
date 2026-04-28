import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabase";
import { createGroup, fetchMyGroups, joinGroupByInvite } from "../api";

export default function DashboardScreen({ user, navigation, onOpenIntro }) {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [createError, setCreateError] = useState("");
  const [joinError, setJoinError] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDeviceId, setNewGroupDeviceId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    const response = await fetchMyGroups();
    setGroups(response.groups ?? []);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setGeneralError("");
      setCreateError("");
      setJoinError("");
      await loadGroups();
    } catch (e) {
      setGeneralError(e.message ?? "Failed to load groups.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [loadGroups]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function handleCreateGroup() {
    Keyboard.dismiss();
    setCreateError("");
    const name = newGroupName.trim();
    if (!name) {
      setCreateError("Please enter a group name.");
      return;
    }

    setIsBusy(true);
    try {
      await createGroup({
        name,
        device_id: newGroupDeviceId.trim() || null,
      });

      setNewGroupName("");
      setNewGroupDeviceId("");
      await refresh();
    } catch (e) {
      setCreateError(e.message ?? "Could not create group.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleJoinGroup() {
    Keyboard.dismiss();
    setJoinError("");
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Please enter an invite code.");
      return;
    }
    const alreadyInGroup = groups.some(
      (group) => (group.invite_code ?? "").toUpperCase() === code
    );
    if (alreadyInGroup) {
      setJoinError("You are already in this group.");
      return;
    }

    setIsBusy(true);
    try {
      await joinGroupByInvite(code);
      setJoinCode("");
      await refresh();
    } catch (e) {
      setJoinError(e.message ?? "Could not join group.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setGeneralError(signOutError.message ?? "Could not sign out.");
    }
  }

  function onRefresh() {
    setIsRefreshing(true);
    refresh();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>My Groups</Text>
            <Text style={styles.subtitle}>{user.email}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("ProvisionDevice")}
            >
              <Text style={styles.secondaryButtonText}>Provision</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleSignOut}>
              <Text style={styles.secondaryButtonText}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Device onboarding</Text>
          <Text style={styles.infoBody}>
            Sign in, open Provision, connect to ESP via Bluetooth, then bind the generated
            device token to your account.
          </Text>
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
          {!!createError && <Text style={styles.cardErrorText}>{createError}</Text>}
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
          {!!joinError && <Text style={styles.cardErrorText}>{joinError}</Text>}
        </View>

        {!!generalError && <Text style={styles.errorText}>{generalError}</Text>}

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0ea5e9" />
          </View>
        ) : groups.length === 0 ? (
          <Text style={styles.emptyText}>
            No groups yet. Create one or join with a code.
          </Text>
        ) : (
          <View style={styles.groupList}>
            {groups.map((item) => (
              <Pressable
                key={item.id}
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
            ))}
          </View>
        )}
      </ScrollView>
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
    gap: 12,
    paddingBottom: 24,
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
  headerActions: {
    flexDirection: "row",
    gap: 8,
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
  infoCard: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  infoBody: {
    fontSize: 12,
    color: "#1e3a8a",
    lineHeight: 18,
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
  cardErrorText: {
    color: "#b91c1c",
    fontSize: 12,
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.65,
  },
});
