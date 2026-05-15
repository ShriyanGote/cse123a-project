import React from "react";
import * as ReactNative from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import IntroScreen, { isCompactLayout } from "../../src/screens/IntroScreen";
import { findAncestor } from "../helpers/testUtils";

const tagline = "Household water filter monitoring made simple.";

function stylesFrom(node) {
  const style = node?.props?.style;
  return Array.isArray(style) ? style : [style];
}

describe("IntroScreen", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("derives compact layout from width", () => {
    expect(isCompactLayout(379)).toBe(true);
    expect(isCompactLayout(380)).toBe(false);
  });

  it("renders feature content and calls onContinue", () => {
    const onContinue = jest.fn();
    render(<IntroScreen onContinue={onContinue} />);
    expect(screen.getByText(tagline)).toBeTruthy();
    const button = screen.getByText("Get Started");
    fireEvent(button, "pressIn");
    fireEvent.press(button);
    expect(onContinue).toHaveBeenCalled();
  });

  it.each([
    [420, 30],
    [320, 26],
  ])("uses layout styles for width %i", (width, fontSize) => {
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width,
      height: 800,
      scale: 2,
      fontScale: 2,
    });
    render(<IntroScreen onContinue={jest.fn()} />);
    const node = findAncestor(
      screen.getByText(tagline),
      (n) => typeof n.props?.style === "object"
    );
    expect(stylesFrom(node)).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize })])
    );
  });

  it("uses compact scroll padding on narrow screens", () => {
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 320,
      height: 700,
      scale: 2,
      fontScale: 2,
    });
    render(<IntroScreen onContinue={jest.fn()} />);
    const scroll = screen.UNSAFE_getByType(ReactNative.ScrollView);
    const containerStyles = stylesFrom({ props: { style: scroll.props.contentContainerStyle } });
    expect(containerStyles).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingTop: 14 })])
    );
  });

  it("applies pressed styles on the continue button", () => {
    render(<IntroScreen onContinue={jest.fn()} />);
    const node = findAncestor(
      screen.getByText("Get Started"),
      (n) => typeof n.props?.style === "function"
    );
    expect(node.props.style({ pressed: true })).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.88 })])
    );
    expect(node.props.style({ pressed: false })).toBeTruthy();
  });
});
