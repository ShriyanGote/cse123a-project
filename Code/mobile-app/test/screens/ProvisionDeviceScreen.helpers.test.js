import {
  rawQrValue,
  resolveDeviceRegistrationName,
} from "../../src/screens/ProvisionDeviceScreen";

describe("ProvisionDeviceScreen helpers", () => {
  it("resolveDeviceRegistrationName prefers nickname, then esp name, then device id", () => {
    expect(resolveDeviceRegistrationName("Nick", "ESP", "dev-1")).toBe("Nick");
    expect(resolveDeviceRegistrationName("", "ESP", "dev-1")).toBe("ESP");
    expect(resolveDeviceRegistrationName("", "", "dev-1")).toBe("dev-1");
  });

  it("rawQrValue defaults nullish raw payloads to an empty string", () => {
    expect(rawQrValue(null)).toBe("");
    expect(rawQrValue("payload")).toBe("payload");
  });
});
