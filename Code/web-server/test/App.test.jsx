import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";

const mockGetSession = vi.fn(() =>
  Promise.resolve({ data: { session: null }, error: null })
);
const mockUnsubscribe = vi.fn();

vi.mock("../src/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      })),
    },
  },
}));

describe("App", () => {
  it("renders account and setup guide sections", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Setup guide" })).toBeInTheDocument();
  });

  it("shows sign-in when there is no session", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign In" })).toBeInTheDocument();
  });
});
