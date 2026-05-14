import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/_lib/auth.js", () => ({
  requireDeviceAuth: vi.fn(),
}));

vi.mock("../../api/_lib/expoPush.js", () => ({
  sendExpoPushNotifications: vi.fn(),
}));

vi.mock("../../api/_lib/supabaseAdmin.js", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import handler, { getLevelPercent } from "../../api/ingest.js";
import { requireDeviceAuth } from "../../api/_lib/auth.js";
import { sendExpoPushNotifications } from "../../api/_lib/expoPush.js";
import { supabaseAdmin } from "../../api/_lib/supabaseAdmin.js";
import { createMockRes as mockRes } from "../createMockRes.js";

describe("getLevelPercent", () => {
  it("uses default calibration when calibration is null or undefined", () => {
    expect(getLevelPercent(1250, null)).toBe(50);
    expect(getLevelPercent(1250, undefined)).toBe(50);
  });
});

describe("ingest handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requireDeviceAuth.mockReset();
    sendExpoPushNotifications.mockReset();
    supabaseAdmin.from.mockReset();
  });

  it("returns 405 for non-POST", async () => {
    const res = mockRes();
    await handler({ method: "GET", body: {} }, res);
    expect(res._status).toBe(405);
  });

  it("returns early when device auth fails", async () => {
    requireDeviceAuth.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: "POST", body: {} }, res);
    expect(res._status).toBeNull();
  });

  it("returns 400 when device_id cannot be resolved", async () => {
    requireDeviceAuth.mockResolvedValue({ type: "device", token: "t", device: {} });
    const res = mockRes();
    await handler({ method: "POST", body: {} }, res);
    expect(res._status).toBe(400);
  });

  it("returns 500 when group resolution returns an error string", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "dev-a" },
    });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "group lookup failed" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "dev-a", weight_g: 100 } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("group lookup failed");
  });

  it("returns 404 when no group is linked", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "dev-b" },
    });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "dev-b", weight_g: 50 } }, res);
    expect(res._status).toBe(404);
    expect(res._json.code).toBe("INGEST_NO_GROUP");
  });

  it("returns 500 when previous reading query fails", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "dev-c" },
    });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 2500 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "read fail" } }),
          insert: vi.fn(),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "dev-c", weight_g: 100 } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("read fail");
  });

  it("returns 200 on successful insert without notifications", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "DEV-CAPS" },
    });
    sendExpoPushNotifications.mockResolvedValue({
      tickets: [],
      invalidTokens: [],
      failures: [],
    });

    let waterPhase = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 10, name: "Home", empty_g: 0, full_g: 2500 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        waterPhase += 1;
        if (waterPhase === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 2000 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "group_members" || table === "notification_tokens") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    });

    const res = mockRes();
    await handler(
      { method: "POST", body: { device_id: "DEV-CAPS", weight_g: 1800, battery_mv: 3300 } },
      res
    );
    expect(res._status).toBe(200);
    expect(res._json.ok).toBe(true);
    expect(sendExpoPushNotifications).not.toHaveBeenCalled();
  });

  it("returns 500 for unhandled errors in the outer try", async () => {
    requireDeviceAuth.mockRejectedValue(new Error("boom"));
    const res = mockRes();
    await handler({ method: "POST", body: {} }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("Internal server error");
  });

  it("uses numeric device_id from body when auth has no deviceId", async () => {
    requireDeviceAuth.mockResolvedValue({ type: "device", token: "t", device: {} });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 2500 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "notification_tokens") {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        chain.eq.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: 12345, weight_g: 100 } }, res);
    expect(res._status).toBe(200);
  });

  it("returns 500 on insert error after successful read", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "ins-err" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 2500 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ error: { message: "insert blocked" } }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: { message: "insert blocked" } }) };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "ins-err", weight_g: 1 } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("insert blocked");
  });

  it("returns 500 when first groups lookup returns directErr", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "d-direct-err" },
    });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "direct" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "d-direct-err", weight_g: 1 } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("direct");
  });

  it("uses direct-linked groups without device resolution", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "direct-hw" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 9, name: "OnDevice", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 50 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "direct-hw", weight_g: null } }, res);
    expect(res._status).toBe(200);
  });

  it("returns 500 when listing owned groups fails during auto-link", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "list-fail" },
    });
    let groupsCalls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        groupsCalls += 1;
        if (groupsCalls === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "list owned" } }),
        };
      }
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 1, created_by: "u1" },
            error: null,
          }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "list-fail", weight_g: 1 } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("list owned");
  });

  it("returns reuse rows when owned group already references device", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "REUSE-HW" },
    });
    let groupsCalls = 0;
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        groupsCalls += 1;
        if (groupsCalls === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 77,
                name: "R",
                empty_g: 0,
                full_g: 2500,
                device_id: "reuse-hw",
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 1, created_by: "u1" },
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "REUSE-HW", weight_g: 10 } }, res);
    expect(res._status).toBe(200);
    expect(res._json.auto_linked_group).toBe(false);
  });

  it("auto-links first empty group slot and logs info", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "auto-hw" },
    });
    let groupsCalls = 0;
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        groupsCalls += 1;
        if (groupsCalls === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (groupsCalls === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [{ id: 55, name: "Slot", empty_g: 0, full_g: 2500, device_id: null }],
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 55, name: "Slot", empty_g: 0, full_g: 2500 },
            error: null,
          }),
        };
      }
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 1, created_by: "u1" },
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "auto-hw", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(res._json.auto_linked_group).toBe(true);
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it("logs and continues when group_members read fails during notify", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "mem-err" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "members err" } }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "mem-err", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("skips token query when no member user ids", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "no-users" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: null }], error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "no-users", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(sendExpoPushNotifications).not.toHaveBeenCalled();
  });

  it("logs and continues when notification_tokens query fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "tok-err" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        };
      }
      if (table === "notification_tokens") {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: null, error: { message: "tok err" } }),
        };
        chain.eq.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "tok-err", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("sends push notifications and disables invalid Expo tokens", async () => {
    sendExpoPushNotifications.mockResolvedValue({
      tickets: [
        { token: "ExponentPushToken[a]", ticket: { status: "ok" } },
        {
          token: "ExponentPushToken[b]",
          ticket: {
            status: "error",
            message: "gone",
            details: { error: "DeviceNotRegistered" },
          },
        },
      ],
      invalidTokens: ["ExponentPushToken[b]"],
      failures: [{ message: "fail" }, { token: "t" }],
    });
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "push-ok" },
    });
    let wr = 0;
    const ntChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ token: 123 }, { token: "nope" }, { token: "ExponentPushToken[ok]" }],
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    };
    ntChain.eq.mockReturnValue(ntChain);
    ntChain.update.mockReturnValue(ntChain);
    ntChain.in.mockResolvedValueOnce({
      data: [{ token: "ExponentPushToken[ok]" }],
      error: null,
    });
    ntChain.in.mockResolvedValueOnce({ error: null });

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        };
      }
      if (table === "notification_tokens") {
        return ntChain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "push-ok", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(sendExpoPushNotifications).toHaveBeenCalled();
    expect(res._json.debug.sentCount).toBe(1);
    expect(res._json.debug.failedCount).toBe(2);
    expect(res._json.debug.failedReasons[0].message).toBe("fail");
    expect(res._json.debug.failedReasons[1].message).toBe("Unknown push error");
  });

  it("logs when disabling invalid tokens fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendExpoPushNotifications.mockResolvedValue({
      tickets: [],
      invalidTokens: ["ExponentPushToken[z]"],
      failures: [],
    });
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "push-dis-err" },
    });
    let wr = 0;
    const ntChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn()
        .mockResolvedValueOnce({
          data: [{ token: "ExponentPushToken[z]" }],
          error: null,
        })
        .mockResolvedValueOnce({ error: { message: "disable failed" } }),
      update: vi.fn().mockReturnThis(),
    };
    ntChain.eq.mockReturnValue(ntChain);
    ntChain.update.mockReturnValue(ntChain);

    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        };
      }
      if (table === "notification_tokens") {
        return ntChain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "push-dis-err", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("triggers returnedFromOffSensorLow notification branch", async () => {
    sendExpoPushNotifications.mockResolvedValue({
      tickets: [],
      invalidTokens: [],
      failures: [],
    });
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "off-sensor" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 0 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        };
      }
      if (table === "notification_tokens") {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        chain.eq.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "off-sensor", weight_g: 10 } }, res);
    expect(res._status).toBe(200);
  });

  it("uses default group name in push payload when group name is null", async () => {
    sendExpoPushNotifications.mockResolvedValue({
      tickets: [],
      invalidTokens: [],
      failures: [],
    });
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "noname-push" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: null, empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        };
      }
      if (table === "notification_tokens") {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ token: "ExponentPushToken[gn]" }],
            error: null,
          }),
        };
        chain.eq.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "noname-push", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(sendExpoPushNotifications).toHaveBeenCalled();
    expect(sendExpoPushNotifications.mock.calls[0][0][0].data.groupName).toBe("Group");
  });

  it("returns 404 when device owner has no empty group slot for auto-link", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "NO-SLOT" },
    });
    let groupsCalls = 0;
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        groupsCalls += 1;
        if (groupsCalls === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 1,
                name: "A",
                empty_g: 0,
                full_g: 2500,
                device_id: "other-device",
              },
            ],
            error: null,
          }),
        };
      }
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 1, created_by: "u1" },
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "NO-SLOT", weight_g: 1 } }, res);
    expect(res._status).toBe(404);
    expect(res._json.code).toBe("INGEST_NO_GROUP");
  });

  it("returns 500 when auto-link group patch returns no row", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "patch-fail" },
    });
    let groupsCalls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        groupsCalls += 1;
        if (groupsCalls === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (groupsCalls === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [{ id: 88, name: "E", empty_g: 0, full_g: 2500, device_id: "" }],
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "patch row missing" },
          }),
        };
      }
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 1, created_by: "u1" },
            error: null,
          }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "patch-fail", weight_g: 1 } }, res);
    expect(res._status).toBe(500);
    expect(res._json.error).toBe("patch row missing");
  });

  it("maps push failures without message to Unknown push error", async () => {
    sendExpoPushNotifications.mockResolvedValue({
      tickets: [],
      invalidTokens: [],
      failures: [{}],
    });
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "fail-nomsg" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        };
      }
      if (table === "notification_tokens") {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [{ token: "ExponentPushToken[x]" }], error: null }),
        };
        chain.eq.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "fail-nomsg", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(res._json.debug.failedReasons[0].message).toBe("Unknown push error");
  });

  it("handles null token rows and legacy Expo push token prefix", async () => {
    sendExpoPushNotifications.mockResolvedValue({
      tickets: [],
      invalidTokens: [],
      failures: [],
    });
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "tok-null" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        };
      }
      if (table === "notification_tokens") {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [null, { token: "ExpoPushToken[legacy]" }],
            error: null,
          }),
        };
        chain.eq.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "tok-null", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(sendExpoPushNotifications).toHaveBeenCalled();
    const queued = sendExpoPushNotifications.mock.calls[0][0];
    expect(queued.some((m) => m.to === "ExpoPushToken[legacy]")).toBe(true);
  });

  it("treats undefined tokenRows as empty list", async () => {
    sendExpoPushNotifications.mockResolvedValue({
      tickets: [],
      invalidTokens: [],
      failures: [],
    });
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "undef-tokrows" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ user_id: "u1" }], error: null }),
        };
      }
      if (table === "notification_tokens") {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: undefined, error: null }),
        };
        chain.eq.mockReturnValue(chain);
        return chain;
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "undef-tokrows", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(sendExpoPushNotifications).not.toHaveBeenCalled();
    expect(res._json.debug.notificationsQueued).toBe(0);
    expect(res._json.debug.perGroup[0].pushTokensQueued).toBe(0);
  });

  it("treats undefined owned list as empty during auto-link", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "owned-null-rows" },
    });
    let groupsCalls = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        groupsCalls += 1;
        if (groupsCalls === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: undefined, error: null }),
        };
      }
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 1, created_by: "u1" },
            error: null,
          }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "owned-null-rows", weight_g: 1 } }, res);
    expect(res._status).toBe(404);
  });

  it("uses req.body fallback when body is undefined", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "no-body" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 50 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: undefined, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", headers: {} }, res);
    expect(res._status).toBe(200);
  });

  it("stringifies non-string hardware id from device auth", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: 777001 },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 50 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: {}, headers: {} }, res);
    expect(res._status).toBe(200);
  });

  it("resolves hardware id from non-string device_id in body", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "ignored" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 50 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: {}, weight_g: 1 }, headers: {} }, res);
    expect(res._status).toBe(200);
  });

  it("returns 404 when resolved hardware id is empty", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "   " },
    });
    const res = mockRes();
    await handler({ method: "POST", body: { weight_g: 1 }, headers: {} }, res);
    expect(res._status).toBe(404);
  });

  it("treats undefined direct group rows as empty", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "direct-undef" },
    });
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: undefined, error: null }),
        };
      }
      if (table === "devices") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "direct-undef", weight_g: 1 } }, res);
    expect(res._status).toBe(404);
  });

  it("treats null member list as empty for notifications", async () => {
    sendExpoPushNotifications.mockResolvedValue({
      tickets: [],
      invalidTokens: [],
      failures: [],
    });
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "mem-null" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 0, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 30 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "mem-null", weight_g: 5 } }, res);
    expect(res._status).toBe(200);
    expect(sendExpoPushNotifications).not.toHaveBeenCalled();
  });

  it("treats flat calibration range as zero percent", async () => {
    requireDeviceAuth.mockResolvedValue({
      type: "device",
      token: "t",
      device: { deviceId: "cal-flat" },
    });
    let wr = 0;
    supabaseAdmin.from.mockImplementation((table) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 1, name: "G", empty_g: 100, full_g: 100 }],
            error: null,
          }),
        };
      }
      if (table === "water_readings") {
        wr += 1;
        if (wr === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { weight_g: 50 }, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "group_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    });
    const res = mockRes();
    await handler({ method: "POST", body: { device_id: "cal-flat", weight_g: 120 }, headers: {} }, res);
    expect(res._status).toBe(200);
  });
});
