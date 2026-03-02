import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import {
  calibrationUpserts,
  customCalibration,
  defaultCalibration,
  readCalibrationActions,
  readCustomCalibration,
  readEmpty,
  thresholdCalibration,
} from "./sampleWaterValues";

const DEFAULT_EMPTY_G = 0;
const DEFAULT_FULL_G = 2500;

function getExpectedPercent(weightG, calibration) {
  if (weightG == null) return 0;

  const empty = calibration?.empty ?? DEFAULT_EMPTY_G;
  const full = calibration?.full ?? DEFAULT_FULL_G;

  if (full <= empty || weightG <= empty) return 0;

  const value = ((weightG - empty) / (full - empty)) * 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

const mockDb = vi.hoisted(() => ({
  latest: null,
  calibration: null,
  upsertCalls: [],
}));

vi.mock("../src/supabase", () => ({
  supabase: {
    from: vi.fn((table) => {
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => {
          if (table === "water_readings") return { data: mockDb.latest };
          if (table === "calibration") return { data: mockDb.calibration };
          return { data: null };
        },
        upsert: async (payload) => {
          if (table === "calibration") {
            mockDb.calibration = payload;
            mockDb.upsertCalls.push(payload);
          }
          return { error: null };
        },
      };

      return query;
    }),
  },
}));

function renderApp({ latest = null, calibration = null } = {}) {
  mockDb.latest = latest;
  mockDb.calibration = calibration;
  return render(<App />);
}

function expectReadMeta(reading) {
  expect(
    screen.getByText(new RegExp(`Weight:\\s*${reading.weight_g}\\s*g`))
  ).toBeInTheDocument();

  if (reading.battery_mv != null) {
    expect(
      screen.getByText(new RegExp(`Battery:\\s*${reading.battery_mv}\\s*mV`))
    ).toBeInTheDocument();
  }
}

function expectPercentFill(container, expectedPercent) {
  const value = container.querySelector(".brita-percent__value");
  const water = container.querySelector(".brita-pitcher__water");

  expect(value).toHaveTextContent(String(expectedPercent));
  expect(water).toHaveStyle({ height: `${expectedPercent}%` });
}

describe("App", () => {
  beforeEach(() => {
    mockDb.latest = null;
    mockDb.calibration = null;
    mockDb.upsertCalls = [];
  });

  // Empty-state rendering
  describe("Empty state", () => {
    it("shows empty state when no reading is available", async () => {
      renderApp();

      expect(
        await screen.findByText("No data yet. Waiting for sensor…")
      ).toBeInTheDocument();
      expect(screen.getByText("Pitcher empty")).toBeInTheDocument();
    });
  });

  // Water level and metadata display
  describe("Level display", () => {
    it("renders metadata and default percent", async () => {
      const { container } = renderApp({ latest: defaultCalibration });

      expect(await screen.findByText("Water in pitcher")).toBeInTheDocument();
      expectReadMeta(defaultCalibration);
      const expectedPercent = getExpectedPercent(defaultCalibration.weight_g);
      expectPercentFill(container, expectedPercent);
    });

    it("uses calibration values to compute displayed percentage", async () => {
      const { container } = renderApp({
        latest: readCustomCalibration,
        calibration: customCalibration,
      });

      await screen.findByText("Water in pitcher");

      const expectedPercent = getExpectedPercent(
        readCustomCalibration.weight_g,
        customCalibration
      );
      expectPercentFill(container, expectedPercent);

      expect(
        screen.getByText(new RegExp(`Empty:\\s*${customCalibration.empty} g`))
      ).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(`Full:\\s*${customCalibration.full} g`))
      ).toBeInTheDocument();
    });

    it("shows empty status when weight is at or below empty calibration", async () => {
      renderApp({ latest: readEmpty, calibration: thresholdCalibration });

      expect(await screen.findByText("Pitcher empty")).toBeInTheDocument();
    });
  });

  // Calibration button actions
  describe("Calibration actions", () => {
    it("saves calibration values when calibration buttons are clicked", async () => {
      const user = userEvent.setup();
      renderApp({ latest: readCalibrationActions });

      await screen.findByText("Water in pitcher");

      const calibrateEmptyButton = screen.getByRole("button", {
        name: "Calibrate empty",
      });
      const calibrateFullButton = screen.getByRole("button", {
        name: "Calibrate full",
      });
      const resetButton = screen.getByRole("button", {
        name: "Reset calibration",
      });

      await user.click(calibrateEmptyButton);
      await user.click(calibrateFullButton);
      await user.click(resetButton);

      await waitFor(() => {
        expect(mockDb.upsertCalls).toHaveLength(3);
      });
      expect(mockDb.upsertCalls).toEqual(calibrationUpserts);
    });
  });
});
