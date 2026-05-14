import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBearerToken, verifyNestedDeviceToken } from "../../../api/_lib/auth.js";

describe("auth helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses bearer tokens", () => {
    expect(parseBearerToken({ headers: {} })).toBeNull();
    expect(parseBearerToken({ headers: { Authorization: "Bearer from-cap-header" } })).toBe(
      "from-cap-header"
    );
    expect(parseBearerToken({ headers: { authorization: "Basic abc" } })).toBeNull();
    expect(parseBearerToken({ headers: { authorization: "Bearer" } })).toBeNull();
    expect(
      parseBearerToken({ headers: { authorization: "Bearer test-token-123" } })
    ).toBe("test-token-123");
    expect(parseBearerToken({ headers: { authorization: "Bearer " } })).toBeNull();
  });

  it("rejects nested verification when server JWE key is missing", async () => {
    delete process.env.DEVICE_JWE_PRIVATE_JWK;
    await expect(verifyNestedDeviceToken("invalid-token")).rejects.toThrow(
      "Server missing DEVICE_JWE_PRIVATE_JWK."
    );
  });
});
