export const user = { id: "owner-1", email: "owner@test.com" };
export const route = { params: { groupId: "g1", groupName: "Kitchen" } };
export const navigation = { goBack: jest.fn() };

export const groupPayload = {
  group: {
    id: "g1",
    name: "Kitchen",
    invite_code: "ABCD12",
    device_id: "dev-1",
    empty_g: 0,
    full_g: 100,
  },
  latestReading: {
    weight_g: 50,
    battery_mv: 3200,
    created_at: "2026-05-15T12:00:00.000Z",
  },
  members: [
    { user_id: "owner-1", display_name: "Owner", role: "owner" },
    { user_id: "member-2", display_name: "Member", role: "member" },
  ],
};
