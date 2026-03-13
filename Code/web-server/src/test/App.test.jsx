import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import {
  calibrationUpserts,
  customCalibration,
  defaultCalibration,
  edgeClampCalibration,
  invalidRangeCalibration,
  readAboveFull,
  readBelowEmpty,
  readCalibrationActions,
  readCustomCalibration,
  readEmpty,
  readInvalidRange,
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

const originalNotification = Object.getOwnPropertyDescriptor(
  window,
  "Notification"
);
const originalServiceWorker = Object.getOwnPropertyDescriptor(
  navigator,
  "serviceWorker"
);
const originalFetch = global.fetch;

vi.mock("../supabase", () => ({
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

// Mock Notification API behavior
function setNotificationMock({ permission = "default", requestPermission } = {}) {
  const notification = {
    permission,
    requestPermission:
      requestPermission ?? vi.fn(async () => permission),
  };

  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: notification,
  });

  return notification;
}

// Mock service worker registration and push subscription behavior
function setServiceWorkerMock({
  existingSubscription = null,
  subscribeResult = { endpoint: "https://example.com/subscription" },
} = {}) {
  const getSubscription = vi.fn(async () => existingSubscription);
  const subscribe = vi.fn(async () => subscribeResult);
  const register = vi.fn(async () => ({
    pushManager: {
      getSubscription,
      subscribe,
    },
  }));

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });

  return { register, getSubscription, subscribe };
}

// Restore original browser APIs after tests to avoid side effects
function restoreBrowserNotificationApis() {
  if (originalNotification) {
    Object.defineProperty(window, "Notification", originalNotification);
  } else {
    delete window.Notification;
  }

  if (originalServiceWorker) {
    Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
  } else {
    delete navigator.serviceWorker;
  }

  global.fetch = originalFetch;
}

describe("App", () => {
  beforeEach(() => {
    mockDb.latest = null;
    mockDb.calibration = null;
    mockDb.upsertCalls = [];
    vi.unstubAllEnvs();
    restoreBrowserNotificationApis();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    restoreBrowserNotificationApis();
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

    // Weight at or below empty calibration should show "Pitcher empty"
    it("shows empty status when weight is at or below empty calibration", async () => {
      renderApp({ latest: readEmpty, calibration: thresholdCalibration });

      expect(await screen.findByText("Pitcher empty")).toBeInTheDocument();
    });

    // Edge case: reading below empty calibration should clamp to 0%
    it("clamps displayed percentage to 0% when reading is below empty calibration", async () => {
      const { container } = renderApp({
        latest: readBelowEmpty,
        calibration: edgeClampCalibration,
      });

      await screen.findByText("Pitcher empty");

      expectPercentFill(container, 0);
    });

    // Edge case: reading above full calibration should clamp to 100%
    it("clamps displayed percentage to 100% when reading is above full calibration", async () => {
      const { container } = renderApp({
        latest: readAboveFull,
        calibration: edgeClampCalibration,
      });

      await screen.findByText("Water in pitcher");

      expectPercentFill(container, 100);
    });

    // Edge case: full calibration at or below empty calibration
    it("shows 0% when calibration range is invalid (full <= empty)", async () => {
      const { container } = renderApp({
        latest: readInvalidRange,
        calibration: invalidRangeCalibration,
      });

      await screen.findByText("Pitcher empty");

      expectPercentFill(container, 0);
    });
  });

  // Calibration button actions
  describe("Calibration actions", () => {

    // Verify that clicking calibration buttons results in correct upsert calls to the database
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

  // Notification enablement behavior
  describe("Notification logic", () => {

    // If Notification API or Service Worker API is unavailable, show unsupported message and do not show enable button
    it("shows unsupported message when notification APIs are unavailable", async () => {
      delete window.Notification;
      delete navigator.serviceWorker;

      renderApp({ latest: defaultCalibration });

      expect(
        await screen.findByText("Push notifications are not supported in this browser.")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Enable notifications" })
      ).not.toBeInTheDocument();
    });

    // Show blocked status if permission is denied, and do not attempt to register service worker
    it("shows blocked status when permission is denied", async () => {
      const user = userEvent.setup();
      vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQAB");
      const requestPermission = vi.fn(async () => "denied");
      const { register } = setServiceWorkerMock();
      setNotificationMock({ permission: "default", requestPermission });

      renderApp({ latest: defaultCalibration });

      await user.click(
        await screen.findByRole("button", { name: "Enable notifications" })
      );

      expect(
        await screen.findByText(
          "Notifications are blocked. Enable them in browser settings."
        )
      ).toBeInTheDocument();
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(register).not.toHaveBeenCalled();
    });

    // Permission granted, service worker registered, subscription created, and token sent to server
    it("subscribes and reports enabled status when permission is granted", async () => {
      const user = userEvent.setup();
      vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQAB");
      setNotificationMock({
        permission: "default",
        requestPermission: vi.fn(async () => "granted"),
      });
      const { register, subscribe } = setServiceWorkerMock({
        existingSubscription: null,
      });
      global.fetch = vi.fn(async () => ({ ok: true }));

      renderApp({ latest: defaultCalibration });

      await user.click(
        await screen.findByRole("button", { name: "Enable notifications" })
      );

      expect(
        await screen.findByText("Notifications are enabled.")
      ).toBeInTheDocument();

      expect(register).toHaveBeenCalledWith("/push-sw.js");
      expect(subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          userVisibleOnly: true,
          applicationServerKey: expect.any(Uint8Array),
        })
      );
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/register-token",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
