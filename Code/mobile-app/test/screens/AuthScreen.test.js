import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AuthScreen from "../../src/screens/AuthScreen";
import { supabase } from "../../src/supabase";

const panResponderConfig = () => global.__getLatestPanResponderConfig();

jest.mock("../../src/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
    },
  },
}));

describe("AuthScreen", () => {
  beforeEach(() => {
    supabase.auth.signInWithPassword.mockResolvedValue({ error: null });
    supabase.auth.signUp.mockResolvedValue({ error: null });
  });

  it("signs in successfully", async () => {
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret");
    fireEvent.press(screen.getByText("Sign In"));
    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "user@test.com",
        password: "secret",
      })
    );
  });

  it("shows friendly message for invalid credentials", async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "bad");
    fireEvent.press(screen.getByText("Sign In"));
    await waitFor(() =>
      expect(screen.getByText("Incorrect email or password.")).toBeTruthy()
    );
  });

  it("creates an account and switches back to sign in", async () => {
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.press(screen.getByText("Need an account? Sign up"));
    fireEvent.changeText(screen.getByPlaceholderText("Display name"), "Alice");
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "alice@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret123");
    fireEvent.press(screen.getByText("Create Account"));
    await waitFor(() =>
      expect(supabase.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "alice@test.com",
          password: "secret123",
        })
      )
    );
    expect(
      screen.getByText(/We sent a confirmation link to alice@test\.com/)
    ).toBeTruthy();
    expect(
      screen.getByText(/Open it to verify your email, then return here and sign in/)
    ).toBeTruthy();
  });

  it("shows signup hint in sign-up mode", () => {
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.press(screen.getByText("Need an account? Sign up"));
    expect(
      screen.getByText(/You need to verify your email before you can sign in/)
    ).toBeTruthy();
  });

  it("shows friendly message when email is not confirmed", async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: "Email not confirmed" },
    });
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret");
    fireEvent.press(screen.getByText("Sign In"));
    await waitFor(() =>
      expect(
        screen.getByText(/Please confirm your email first/)
      ).toBeTruthy()
    );
  });

  it("shows generic auth errors", async () => {
    supabase.auth.signUp.mockResolvedValueOnce({
      error: { message: "Email already registered" },
    });
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.press(screen.getByText("Need an account? Sign up"));
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "alice@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret123");
    fireEvent.press(screen.getByText("Create Account"));
    await waitFor(() =>
      expect(screen.getByText("Email already registered")).toBeTruthy()
    );
  });

  it("evaluates swipe gesture thresholds", () => {
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    expect(
      panResponderConfig().onMoveShouldSetPanResponder({}, { dx: 40, dy: 0, vx: 0.2 })
    ).toBe(true);
    expect(
      panResponderConfig().onMoveShouldSetPanResponder({}, { dx: 10, dy: 0, vx: 0.2 })
    ).toBe(false);
  });

  it("opens intro on swipe gesture", () => {
    const onOpenIntro = jest.fn();
    render(<AuthScreen onOpenIntro={onOpenIntro} />);
    act(() => {
      panResponderConfig().onPanResponderRelease({}, { dx: 100, dy: 0 });
    });
    expect(onOpenIntro).toHaveBeenCalled();
  });

  it("shows generic sign-in errors from thrown exceptions", async () => {
    supabase.auth.signInWithPassword.mockRejectedValueOnce(new Error("network down"));
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret");
    fireEvent.press(screen.getByText("Sign In"));
    await waitFor(() => expect(screen.getByText("network down")).toBeTruthy());
  });

  it("ignores short swipe gestures", () => {
    const onOpenIntro = jest.fn();
    render(<AuthScreen onOpenIntro={onOpenIntro} />);
    act(() => {
      panResponderConfig().onPanResponderRelease({}, { dx: 40, dy: 0 });
    });
    expect(onOpenIntro).not.toHaveBeenCalled();
  });

  it("shows loading state and pressed styles on the auth button", async () => {
    let resolveSignIn;
    supabase.auth.signInWithPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = () => resolve({ error: null });
        })
    );
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret");
    let node = screen.getByText("Sign In");
    while (node && typeof node.props?.style !== "function") {
      node = node.parent;
    }
    expect(node.props.style({ pressed: true })).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.85 })])
    );
    fireEvent.press(screen.getByText("Sign In"));
    expect(screen.queryByText("Sign In")).toBeNull();
    await act(async () => {
      resolveSignIn();
    });
  });

  it("clears auth error when password changes", async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "bad");
    fireEvent.press(screen.getByText("Sign In"));
    await waitFor(() =>
      expect(screen.getByText("Incorrect email or password.")).toBeTruthy()
    );
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "other");
    expect(screen.queryByText("Incorrect email or password.")).toBeNull();
  });

  it("shows a generic message when auth throws without details", async () => {
    supabase.auth.signInWithPassword.mockRejectedValueOnce({});
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "secret");
    fireEvent.press(screen.getByText("Sign In"));
    await waitFor(() =>
      expect(screen.getByText("Authentication failed.")).toBeTruthy()
    );
  });

  it("switches back to sign in from sign up", async () => {
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.press(screen.getByText("Need an account? Sign up"));
    expect(screen.getByText("Create Account")).toBeTruthy();
    fireEvent.press(screen.getByText("Already have an account? Sign in"));
    expect(screen.getByText("Sign In")).toBeTruthy();
  });

  it("clears auth error when switching between sign-in and sign-up", async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "bad");
    fireEvent.press(screen.getByText("Sign In"));
    await waitFor(() =>
      expect(screen.getByText("Incorrect email or password.")).toBeTruthy()
    );
    fireEvent.press(screen.getByText("Need an account? Sign up"));
    expect(screen.queryByText("Incorrect email or password.")).toBeNull();
  });

  it("clears auth error when email changes", async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });
    render(<AuthScreen onOpenIntro={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "user@test.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "bad");
    fireEvent.press(screen.getByText("Sign In"));
    await waitFor(() =>
      expect(screen.getByText("Incorrect email or password.")).toBeTruthy()
    );
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "other@test.com");
    expect(screen.queryByText("Incorrect email or password.")).toBeNull();
  });
});
