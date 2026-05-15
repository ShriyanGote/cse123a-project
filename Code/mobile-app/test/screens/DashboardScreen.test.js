import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { exercisePressableStyles } from "../helpers/exercisePressableStyles";
import { renderDashboard } from "../helpers/screenTestUtils";
import {
  createGroup,
  fetchMyDevices,
  fetchMyGroups,
  joinGroupByInvite,
} from "../../src/api";

jest.mock("../../src/api", () => ({
  createGroup: jest.fn(),
  fetchMyDevices: jest.fn(),
  fetchMyGroups: jest.fn(),
  joinGroupByInvite: jest.fn(),
}));

const user = { id: "u1", email: "user@test.com" };
const navigation = { navigate: jest.fn() };

function renderScreen(overrides = {}) {
  return renderDashboard({
    user,
    navigation,
    onOpenIntro: jest.fn(),
    onSignOut: jest.fn(),
    ...overrides,
  });
}

describe("DashboardScreen", () => {
  beforeEach(() => {
    fetchMyGroups.mockResolvedValue({
      groups: [
        {
          id: "g1",
          name: "Kitchen",
          invite_code: "ABCD12",
          device_id: "dev-1",
          role: "owner",
        },
      ],
    });
    fetchMyDevices.mockResolvedValue({
      devices: [
        { id: "row-1", device_id: "dev-1", device_name: "ESP", status: "online" },
      ],
    });
    createGroup.mockResolvedValue({});
    joinGroupByInvite.mockResolvedValue({});
  });

  it("loads and displays groups and devices", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    expect(screen.getAllByText(/ESP/).length).toBeGreaterThan(0);
    fireEvent.press(screen.getByText("Kitchen"));
    expect(navigation.navigate).toHaveBeenCalledWith("Group", {
      groupId: "g1",
      groupName: "Kitchen",
    });
  });

  it("validates create group name", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    fireEvent.press(screen.getByText("Create Group"));
    expect(screen.getByText("Please enter a group name.")).toBeTruthy();
  });

  it("creates a group and refreshes", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText("e.g. Apartment Kitchen"), "Garage");
    fireEvent.press(screen.getByText("ESP"));
    fireEvent.press(screen.getByText("Create Group"));
    await waitFor(() =>
      expect(createGroup).toHaveBeenCalledWith({
        name: "Garage",
        device_id: "dev-1",
      })
    );
  });

  it("validates join code and prevents duplicate membership", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    fireEvent.press(screen.getByText("Join Group"));
    expect(screen.getByText("Please enter an invite code.")).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText("Enter code"), "abcd12");
    fireEvent.press(screen.getByText("Join Group"));
    expect(screen.getByText("You are already in this group.")).toBeTruthy();
  });

  it("shows generic errors when create or join fail without messages", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    createGroup.mockRejectedValueOnce({});
    fireEvent.changeText(screen.getByPlaceholderText("e.g. Apartment Kitchen"), "Garage");
    fireEvent.press(screen.getByText("Create Group"));
    await waitFor(() =>
      expect(screen.getByText("Could not create group.")).toBeTruthy()
    );

    joinGroupByInvite.mockRejectedValueOnce({});
    fireEvent.changeText(screen.getByPlaceholderText("Enter code"), "NEWCODE");
    fireEvent.press(screen.getByText("Join Group"));
    await waitFor(() =>
      expect(screen.getByText("Could not join group.")).toBeTruthy()
    );
  });

  it("surfaces API errors for create and join actions", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    createGroup.mockRejectedValueOnce(new Error("create failed"));
    fireEvent.changeText(screen.getByPlaceholderText("e.g. Apartment Kitchen"), "Garage");
    fireEvent.press(screen.getByText("Create Group"));
    await waitFor(() => expect(screen.getByText("create failed")).toBeTruthy());

    joinGroupByInvite.mockRejectedValueOnce(new Error("join failed"));
    fireEvent.changeText(screen.getByPlaceholderText("Enter code"), "NEWCODE");
    fireEvent.press(screen.getByText("Join Group"));
    await waitFor(() => expect(screen.getByText("join failed")).toBeTruthy());
  });

  it("joins a group with invite code", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText("Enter code"), "NEWCODE");
    fireEvent.press(screen.getByText("Join Group"));
    await waitFor(() =>
      expect(joinGroupByInvite).toHaveBeenCalledWith("NEWCODE")
    );
  });

  it("shows errors when loading fails and handles sign out errors", async () => {
    fetchMyGroups.mockRejectedValueOnce(new Error("load failed"));
    const onSignOut = jest.fn().mockRejectedValueOnce(new Error("signout failed"));
    renderScreen({ onSignOut });
    await waitFor(() => expect(screen.getByText("load failed")).toBeTruthy());
    fireEvent.press(screen.getByText("Sign out"));
    await waitFor(() => expect(screen.getByText("signout failed")).toBeTruthy());
  });

  it("clears selected device when choosing no device", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("ESP")).toBeTruthy());
    fireEvent.press(screen.getByText("ESP"));
    let node = screen.getByText("No device");
    while (node && typeof node.props?.style !== "function") {
      node = node.parent;
    }
    expect(node.props.style({ pressed: true })).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.86 })])
    );
    fireEvent.press(screen.getByText("No device"));
    fireEvent.changeText(screen.getByPlaceholderText("e.g. Apartment Kitchen"), "Pantry");
    fireEvent.press(screen.getByText("Create Group"));
    await waitFor(() =>
      expect(createGroup).toHaveBeenCalledWith(
        expect.objectContaining({ device_id: null })
      )
    );
  });

  it("refreshes on pull-to-refresh", async () => {
    const { UNSAFE_getByType } = renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    fetchMyGroups.mockClear();
    const scrollView = UNSAFE_getByType(require("react-native").ScrollView);
    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(fetchMyGroups).toHaveBeenCalled());
  });

  it("exercises selected device row styles", async () => {
    const view = renderScreen();
    await waitFor(() => expect(screen.getByText("ESP")).toBeTruthy());
    fireEvent.press(screen.getByText("ESP"));
    exercisePressableStyles(view);
    fireEvent.press(screen.getByText("No device"));
    exercisePressableStyles(view);
  });

  it("exercises pressable style branches after data loads", async () => {
    const view = renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    exercisePressableStyles(view);
  });

  it("handles refresh failures and missing list fields", async () => {
    fetchMyGroups.mockRejectedValueOnce({});
    fetchMyDevices.mockResolvedValueOnce({});
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Failed to load groups.")).toBeTruthy()
    );

    fetchMyGroups.mockResolvedValueOnce({});
    fetchMyDevices.mockRejectedValueOnce(new Error("devices down"));
    const scrollView = screen.UNSAFE_getByType(require("react-native").ScrollView);
    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });
    await waitFor(() =>
      expect(
        screen.getByText("No groups yet. Create one or join with a code.")
      ).toBeTruthy()
    );
  });

  it("omits intro link when onOpenIntro is not provided", async () => {
    renderDashboard({ user, navigation, onSignOut: jest.fn(), onOpenIntro: null });
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    expect(screen.queryByText("How it works")).toBeNull();
  });

  it("handles join when invite_code is missing on a group", async () => {
    fetchMyGroups.mockResolvedValue({
      groups: [{ id: "g1", name: "Kitchen", device_id: null, role: "owner" }],
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText("Enter code"), "NEWCODE");
    fireEvent.press(screen.getByText("Join Group"));
    await waitFor(() => expect(joinGroupByInvite).toHaveBeenCalledWith("NEWCODE"));
  });

  it("shows generic sign-out error when rejection has no message", async () => {
    const onSignOut = jest.fn().mockRejectedValueOnce({});
    renderScreen({ onSignOut });
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    fireEvent.press(screen.getByText("Sign out"));
    await waitFor(() =>
      expect(screen.getByText("Could not sign out.")).toBeTruthy()
    );
  });

  it("labels devices without status using unknown", async () => {
    fetchMyDevices.mockResolvedValue({
      devices: [{ id: "row-3", device_id: "dev-3", device_name: "Bare" }],
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText(/unknown/)).toBeTruthy());
  });

  it("exercises busy pressable styles during create and join", async () => {
    let resolveCreate;
    createGroup.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    const view = renderScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText("e.g. Apartment Kitchen"), "Garage");
    fireEvent.press(screen.getByText("Create Group"));
    exercisePressableStyles(view);
    await act(async () => {
      resolveCreate();
    });
  });

  it("opens the intro walkthrough when requested", async () => {
    const onOpenIntro = jest.fn();
    renderScreen({ onOpenIntro });
    await waitFor(() => expect(screen.getByText("How it works")).toBeTruthy());
    fireEvent.press(screen.getByText("How it works"));
    expect(onOpenIntro).toHaveBeenCalled();
  });

  it("labels devices without a name using device id", async () => {
    fetchMyDevices.mockResolvedValue({
      devices: [{ id: "row-2", device_id: "dev-raw", device_name: "  ", status: "offline" }],
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("dev-raw")).toBeTruthy());
  });

  it("covers device and group row style branches", async () => {
    fetchMyDevices.mockResolvedValue({
      devices: [{ id: "row-4", device_name: "Bare", status: "offline" }],
    });
    fetchMyGroups.mockResolvedValue({
      groups: [
        {
          id: "g2",
          name: "Pantry",
          invite_code: "CODE99",
          device_id: null,
          role: "owner",
        },
      ],
    });
    let resolveCreate;
    createGroup.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    renderScreen();
    await waitFor(() => expect(screen.getByText("Bare")).toBeTruthy());
    let deviceRow = screen.getByText("Bare");
    while (deviceRow && typeof deviceRow.props?.style !== "function") {
      deviceRow = deviceRow.parent;
    }
    expect(deviceRow.props.style({ pressed: true })).toBeTruthy();
    expect(deviceRow.props.style({ pressed: false })).toBeTruthy();
    fireEvent.press(screen.getByText("Bare"));

    let createButton = screen.getByText("Create Group");
    while (createButton && typeof createButton.props?.style !== "function") {
      createButton = createButton.parent;
    }
    fireEvent.changeText(screen.getByPlaceholderText("e.g. Apartment Kitchen"), "Garage");
    fireEvent.press(screen.getByText("Create Group"));
    expect(createButton.props.style({ pressed: true })).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.65 })])
    );
    expect(createButton.props.style({ pressed: false })).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.65 })])
    );

    let joinButton = screen.getByText("Join Group");
    while (joinButton && typeof joinButton.props?.style !== "function") {
      joinButton = joinButton.parent;
    }
    expect(joinButton.props.style({ pressed: true })).toBeTruthy();

    let groupCard = screen.getByText("Pantry");
    while (groupCard && typeof groupCard.props?.style !== "function") {
      groupCard = groupCard.parent;
    }
    expect(groupCard.props.style({ pressed: true })).toBeTruthy();
    expect(screen.getByText("Device: Not set")).toBeTruthy();

    await act(async () => {
      resolveCreate();
    });
  });

  it("handles device load failure and empty states", async () => {
    fetchMyDevices.mockRejectedValue(new Error("devices down"));
    fetchMyGroups.mockResolvedValue({ groups: [] });
    renderScreen();
    await waitFor(
      () => {
        expect(
          screen.getByText("No groups yet. Create one or join with a code.")
        ).toBeTruthy();
      },
      { timeout: 3000 }
    );
    expect(
      screen.getByText(/No devices yet. Use Provision to register one/)
    ).toBeTruthy();
    fireEvent.press(screen.getByText("Provision"));
    expect(navigation.navigate).toHaveBeenCalledWith("ProvisionDevice");
  });
});
