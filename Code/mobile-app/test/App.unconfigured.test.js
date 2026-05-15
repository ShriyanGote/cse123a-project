import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";

jest.mock("../src/supabase", () => ({
  isSupabaseConfigured: false,
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signOut: jest.fn(),
    },
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

jest.mock("../src/useLowWaterMonitor", () => ({
  useLowWaterMonitor: jest.fn(),
}));

describe("App without Supabase configuration", () => {
  it("shows configuration instructions", async () => {
    const App = require("../App").default;
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Supabase Config Required")).toBeTruthy()
    );
  });
});
