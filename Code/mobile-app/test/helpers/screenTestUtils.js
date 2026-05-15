import React from "react";
import { render } from "@testing-library/react-native";
import DashboardScreen from "../../src/screens/DashboardScreen";
import GroupScreen from "../../src/screens/GroupScreen";
import { user, route, navigation, groupPayload } from "./groupScreenFixtures";

export const INTRO_TAGLINE = "Household water filter monitoring made simple.";

export { user, route, navigation, groupPayload };

export function renderDashboard(overrides = {}) {
  const {
    user: screenUser = { id: "u1", email: "user@test.com" },
    navigation: screenNavigation = { navigate: jest.fn() },
    ...props
  } = overrides;

  const screenProps = {
    user: screenUser,
    navigation: screenNavigation,
    ...props,
  };
  if (!("onSignOut" in overrides)) {
    screenProps.onSignOut = jest.fn();
  }

  return render(<DashboardScreen {...screenProps} />);
}

export function renderGroupScreen(overrides = {}) {
  const {
    route: screenRoute = route,
    user: screenUser = user,
    navigation: screenNavigation = navigation,
    ...props
  } = overrides;

  return render(
    <GroupScreen
      route={screenRoute}
      user={screenUser}
      navigation={screenNavigation}
      {...props}
    />
  );
}
