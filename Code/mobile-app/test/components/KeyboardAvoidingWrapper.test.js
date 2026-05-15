import React from "react";
import { KeyboardAvoidingView, Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import KeyboardAvoidingWrapper from "../../src/components/KeyboardAvoidingWrapper";

describe("KeyboardAvoidingWrapper", () => {
  it("renders children with padding keyboard behavior", () => {
    const { UNSAFE_getByType } = render(
      <KeyboardAvoidingWrapper keyboardVerticalOffset={12}>
        <Text>child content</Text>
      </KeyboardAvoidingWrapper>
    );
    expect(screen.getByText("child content")).toBeTruthy();
    expect(UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe("padding");
    expect(UNSAFE_getByType(KeyboardAvoidingView).props.keyboardVerticalOffset).toBe(12);
  });
});
