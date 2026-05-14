import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendExpoPushNotifications } from "../../../api/_lib/expoPush.js";

describe("sendExpoPushNotifications", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns empty result for non-array or empty input", async () => {
    await expect(sendExpoPushNotifications(null)).resolves.toEqual({
      tickets: [],
      invalidTokens: [],
      failures: [],
    });
    await expect(sendExpoPushNotifications([])).resolves.toEqual({
      tickets: [],
      invalidTokens: [],
      failures: [],
    });
  });

  it("maps ok tickets and records failures for error tickets", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { status: "ok", id: "t1" },
          {
            status: "error",
            message: "bad",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      }),
      text: async () => "",
    });

    const out = await sendExpoPushNotifications([
      { to: "ExponentPushToken[a]", title: "T", body: "B", data: {} },
      { to: "ExponentPushToken[b]", title: "T", body: "B", data: {} },
    ]);

    expect(out.invalidTokens).toEqual(["ExponentPushToken[b]"]);
    expect(out.failures.some((f) => f.token === "ExponentPushToken[b]")).toBe(true);
    expect(out.tickets).toHaveLength(2);
  });

  it("records failures when fetch repeatedly fails with retryable then gives up", async () => {
    vi.useFakeTimers();
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "down",
    });

    const p = sendExpoPushNotifications([
      { to: "ExponentPushToken[z]", title: "T", body: "B", data: {} },
    ]);
    await vi.runAllTimersAsync();
    const out = await p;

    expect(out.failures.length).toBeGreaterThan(0);
    expect(globalThis.fetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    vi.useRealTimers();
  });

  it("does not retry non-retryable HTTP errors", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "bad body",
    });
    const out = await sendExpoPushNotifications([
      { to: "ExponentPushToken[z]", title: "T", body: "B", data: {} },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(out.failures.length).toBe(1);
    expect(out.failures[0].message).toMatch(/400/);
  });

  it("uses empty body text when response.text fails on HTTP error", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 418,
      statusText: "Teapot",
      text: async () => {
        throw new Error("read fail");
      },
    });
    const out = await sendExpoPushNotifications([
      { to: "ExponentPushToken[z]", title: "T", body: "B", data: {} },
    ]);
    expect(out.failures[0].message).toMatch(/418/);
    expect(out.failures[0].message).toMatch(/Teapot/);
  });

  it("treats non-array JSON data as empty ticket list", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { not: "array" } }),
      text: async () => "",
    });
    const out = await sendExpoPushNotifications([
      { to: "ExponentPushToken[a]", title: "T", body: "B", data: {} },
    ]);
    expect(out.tickets).toEqual([{ token: "ExponentPushToken[a]", ticket: undefined }]);
  });

  it("chunks requests larger than 100 messages", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
      text: async () => "",
    });
    const notifications = Array.from({ length: 101 }, (_, i) => ({
      to: `ExponentPushToken[${i}]`,
      title: "T",
      body: "B",
      data: {},
    }));
    await sendExpoPushNotifications(notifications);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("maps ticket errors without details to defaults", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ status: "error" }],
      }),
      text: async () => "",
    });
    const out = await sendExpoPushNotifications([
      { to: "ExponentPushToken[q]", title: "T", body: "B", data: {} },
    ]);
    expect(out.failures[0].message).toBe("Expo ticket error");
    expect(out.failures[0].details).toBeNull();
  });
});
