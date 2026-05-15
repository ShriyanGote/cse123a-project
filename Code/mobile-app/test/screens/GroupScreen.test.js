import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { exercisePressableStyles } from "../helpers/exercisePressableStyles";
import {
  groupPayload,
  navigation,
  renderGroupScreen,
  route,
  user,
} from "../helpers/screenTestUtils";
import {
  calibrateGroup,
  deleteGroup,
  fetchGroupDetails,
  removeGroupMember,
  updateGroup,
  updateGroupMemberRole,
} from "../../src/api";
import { updateGroupWaterLevelState } from "../../src/groupLowWaterAlerts";

jest.mock("../../src/api", () => ({
  calibrateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  fetchGroupDetails: jest.fn(),
  removeGroupMember: jest.fn(),
  updateGroup: jest.fn(),
  updateGroupMemberRole: jest.fn(),
}));

jest.mock("../../src/groupLowWaterAlerts", () => ({
  updateGroupWaterLevelState: jest.fn(() => Promise.resolve()),
}));

describe("GroupScreen", () => {
  let alertPressHandler = null;

  beforeEach(() => {
    fetchGroupDetails.mockResolvedValue(groupPayload);
    updateGroup.mockResolvedValue({});
    updateGroupMemberRole.mockResolvedValue({});
    removeGroupMember.mockResolvedValue({});
    deleteGroup.mockResolvedValue({});
    calibrateGroup.mockResolvedValue({});
    alertPressHandler = null;
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      const action = buttons?.find((b) => b.text !== "Cancel");
      alertPressHandler = action?.onPress ?? null;
    });
  });

  afterEach(() => {
    Alert.alert.mockRestore();
  });

  it("loads group details and updates low-water state", async () => {
    const view = renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    expect(updateGroupWaterLevelState).toHaveBeenCalled();
    expect(screen.getByText("Water detected")).toBeTruthy();
    exercisePressableStyles(view);
  });

  it("saves group edits from the modal", async () => {
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.press(screen.getByText("Edit"));
    fireEvent.changeText(screen.getByPlaceholderText("Group name"), "Pantry");
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(updateGroup).toHaveBeenCalledWith("g1", {
        name: "Pantry",
        device_id: "dev-1",
      })
    );
  });

  it("validates empty group name on save", async () => {
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.press(screen.getByText("Edit"));
    fireEvent.changeText(screen.getByPlaceholderText("Group name"), "   ");
    fireEvent.press(screen.getByText("Save changes"));
    expect(screen.getByText("Group name cannot be empty.")).toBeTruthy();
  });

  it("transfers ownership and removes members", async () => {
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Set owner")).toBeTruthy());
    fireEvent.press(screen.getByText("Set owner"));
    await act(async () => {
      await alertPressHandler?.();
    });
    await waitFor(() =>
      expect(updateGroupMemberRole).toHaveBeenCalledWith("g1", "member-2", "owner")
    );
    fireEvent.press(screen.getByText("Remove"));
    await waitFor(() =>
      expect(removeGroupMember).toHaveBeenCalledWith("g1", "member-2")
    );
  });

  it("prevents owner from removing themselves", async () => {
    fetchGroupDetails.mockResolvedValue({
      ...groupPayload,
      members: [
        { user_id: "owner-1", display_name: "Owner", role: "owner" },
        { user_id: "owner-1", display_name: "Owner duplicate", role: "member" },
      ],
    });
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Owner (You)")).toBeTruthy());
    fireEvent.press(screen.getAllByText("Remove")[0]);
    expect(screen.getByText("Owner cannot remove themselves.")).toBeTruthy();
  });

  it("deletes the group after confirmation", async () => {
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.press(screen.getByText("Edit"));
    await waitFor(() => expect(screen.getByText("Delete group")).toBeTruthy());
    fireEvent.press(screen.getByText("Delete group"));
    await act(async () => {
      await alertPressHandler?.();
    });
    await waitFor(() => expect(deleteGroup).toHaveBeenCalledWith("g1"));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it.each([
    ["Calibrate empty", "empty"],
    ["Calibrate full", "full"],
    ["Reset", "reset"],
  ])("calibrates via %s", async (buttonLabel, mode) => {
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText(buttonLabel)).toBeTruthy());
    fireEvent.press(screen.getByText(buttonLabel));
    await waitFor(() => expect(calibrateGroup).toHaveBeenCalledWith("g1", mode));
  });

  it("shows load errors", async () => {
    fetchGroupDetails.mockRejectedValueOnce(new Error("group load failed"));
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("group load failed")).toBeTruthy());
  });

  it("shows calibration error when no reading exists", async () => {
    fetchGroupDetails.mockResolvedValue({
      ...groupPayload,
      latestReading: null,
    });
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Calibrate empty")).toBeTruthy());
    fireEvent.press(screen.getByText("Calibrate empty"));
    expect(
      screen.getByText("No sensor reading available for calibration.")
    ).toBeTruthy();
  });

  it("cancels edit modal and shows save errors", async () => {
    updateGroup.mockRejectedValueOnce(new Error("save failed"));
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.press(screen.getByText("Edit"));
    fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByText("Edit Group")).toBeNull();
    fireEvent.press(screen.getByText("Edit"));
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() => expect(screen.getByText("save failed")).toBeTruthy());
  });

  it("shows delete and remove member failures", async () => {
    deleteGroup.mockRejectedValueOnce(new Error("delete failed"));
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.press(screen.getByText("Edit"));
    fireEvent.press(screen.getByText("Delete group"));
    await act(async () => {
      await alertPressHandler?.();
    });
    await waitFor(() => expect(screen.getByText("delete failed")).toBeTruthy());

    removeGroupMember.mockRejectedValueOnce(new Error("remove failed"));
    fireEvent.press(screen.getByText("Remove"));
    await waitFor(() => expect(screen.getByText("remove failed")).toBeTruthy());
  });

  it("polls group details on an interval while focused", async () => {
    jest.useFakeTimers();
    renderGroupScreen();
    await waitFor(() => expect(fetchGroupDetails).toHaveBeenCalled());
    fetchGroupDetails.mockClear();
    fetchGroupDetails.mockRejectedValueOnce(new Error("poll failed"));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(fetchGroupDetails).toHaveBeenCalled());
    jest.useRealTimers();
  });

  it("shows calibration API errors", async () => {
    calibrateGroup.mockRejectedValueOnce(new Error("calibration failed"));
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Calibrate empty")).toBeTruthy());
    fireEvent.press(screen.getByText("Calibrate empty"));
    await waitFor(() =>
      expect(screen.getByText("calibration failed")).toBeTruthy()
    );
  });

  it("refreshes from the member list pull control", async () => {
    const { UNSAFE_getByType } = renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
    fetchGroupDetails.mockClear();
    const list = UNSAFE_getByType(require("react-native").FlatList);
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(fetchGroupDetails).toHaveBeenCalled());
  });

  it("closes the edit modal from onRequestClose", async () => {
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.press(screen.getByText("Edit"));
    const modal = screen.UNSAFE_getByType(require("react-native").Modal);
    await act(async () => {
      modal.props.onRequestClose();
    });
    await waitFor(() => expect(screen.queryByText("Edit Group")).toBeNull());
  });

  it("shows transfer failure message", async () => {
    updateGroupMemberRole.mockRejectedValueOnce(new Error("transfer failed"));
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Set owner")).toBeTruthy());
    fireEvent.press(screen.getByText("Set owner"));
    await act(async () => {
      await alertPressHandler?.();
    });
    await waitFor(() => expect(screen.getByText("transfer failed")).toBeTruthy());
  });

  it("handles sparse API payloads and member rows without display names", async () => {
    fetchGroupDetails.mockResolvedValue({
      group: { id: "g1", name: null, device_id: null },
      latestReading: null,
      members: [
        { user_id: "owner-1", display_name: "Owner", role: "owner" },
        { user_id: "member-2", display_name: "  ", role: "member" },
      ],
    });
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Group member")).toBeTruthy());
    expect(screen.getByText("Set owner")).toBeTruthy();
  });

  it("shows load errors without a message and saves with no device id", async () => {
    fetchGroupDetails.mockRejectedValueOnce({});
    renderGroupScreen();
    await waitFor(() =>
      expect(screen.getByText("Could not load group details.")).toBeTruthy()
    );

    fetchGroupDetails.mockResolvedValue(groupPayload);
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.press(screen.getByText("Edit"));
    fireEvent.changeText(screen.getByPlaceholderText("Group name"), "Pantry");
    fireEvent.changeText(screen.getByPlaceholderText("Device ID"), "   ");
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(updateGroup).toHaveBeenCalledWith("g1", {
        name: "Pantry",
        device_id: null,
      })
    );
  });

  it("shows deleting state while group deletion is in progress", async () => {
    let resolveDelete;
    deleteGroup.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        })
    );
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.press(screen.getByText("Edit"));
    fireEvent.press(screen.getByText("Delete group"));
    await act(async () => {
      alertPressHandler?.();
    });
    await waitFor(() => expect(screen.getByText("Deleting...")).toBeTruthy());
    await act(async () => {
      resolveDelete();
    });
  });

  it("shows calibration errors without a message", async () => {
    calibrateGroup.mockRejectedValueOnce({});
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Calibrate empty")).toBeTruthy());
    fireEvent.press(screen.getByText("Calibrate empty"));
    await waitFor(() =>
      expect(screen.getByText("Could not calibrate water filter.")).toBeTruthy()
    );
  });

  it("shows generic errors when APIs reject without messages", async () => {
    updateGroupMemberRole.mockRejectedValueOnce({});
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Set owner")).toBeTruthy());
    fireEvent.press(screen.getByText("Set owner"));
    await act(async () => {
      await alertPressHandler?.();
    });
    await waitFor(() =>
      expect(screen.getByText("Could not update member role.")).toBeTruthy()
    );

    removeGroupMember.mockRejectedValueOnce({});
    fireEvent.press(screen.getByText("Remove"));
    await waitFor(() =>
      expect(screen.getByText("Could not remove member.")).toBeTruthy()
    );

    updateGroup.mockRejectedValueOnce({});
    fireEvent.press(screen.getByText("Edit"));
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(screen.getByText("Could not save group details.")).toBeTruthy()
    );

    deleteGroup.mockRejectedValueOnce({});
    fireEvent.press(screen.getByText("Delete group"));
    await act(async () => {
      await alertPressHandler?.();
    });
    await waitFor(() =>
      expect(screen.getByText("Could not delete group.")).toBeTruthy()
    );
  });

  it("blocks save when membership is lost while edit modal is open", async () => {
    jest.useFakeTimers();
    fetchGroupDetails
      .mockResolvedValueOnce(groupPayload)
      .mockResolvedValue({
        ...groupPayload,
        members: [{ user_id: "owner-1", display_name: "Owner", role: "member" }],
      });
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.press(screen.getByText("Edit"));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    fireEvent.press(screen.getByText("Save changes"));
    expect(updateGroup).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("handles sparse group payloads from the API", async () => {
    fetchGroupDetails.mockResolvedValue({
      members: [],
    });
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Group")).toBeTruthy());
  });

  it("renders member actions using logical AND guards", async () => {
    fetchGroupDetails.mockResolvedValue({
      ...groupPayload,
      members: [
        { user_id: "owner-1", display_name: "Owner", role: "owner" },
        { user_id: "member-2", display_name: "Member", role: "member" },
      ],
    });
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Set owner")).toBeTruthy());
    expect(screen.getByText("Remove")).toBeTruthy();
  });

  it("shows owner members without management actions", async () => {
    fetchGroupDetails.mockResolvedValue({
      ...groupPayload,
      members: [
        { user_id: "owner-1", display_name: "Owner", role: "owner" },
        { user_id: "owner-2", display_name: "Co-owner", role: "owner" },
      ],
    });
    renderGroupScreen();
    await waitFor(() => expect(screen.getByText("Co-owner")).toBeTruthy());
    expect(screen.queryByText("Set owner")).toBeNull();
    expect(screen.queryAllByText("Remove")).toHaveLength(0);
  });

  it("renders read-only view for non-owner members", async () => {
    fetchGroupDetails.mockResolvedValueOnce({
      ...groupPayload,
      members: [{ user_id: "member-2", display_name: "Member", role: "member" }],
    });
    renderGroupScreen({
      user: { id: "member-2", email: "member@test.com" },
    });
    await waitFor(() => expect(screen.getByText("Member (You)")).toBeTruthy());
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Calibrate empty")).toBeNull();
  });
});
