import {
  parseQrPayload,
  randomUuidV4,
  resolveUuid,
  toBase64Text,
} from "../../src/lib/provisionQr";

describe("provisionQr helpers", () => {
  it("resolveUuid returns fallback for empty or placeholder values", () => {
    expect(resolveUuid("", "fallback")).toBe("fallback");
    expect(resolveUuid("xxxx-xxxx", "fallback")).toBe("fallback");
    expect(resolveUuid(" real-uuid ", "fallback")).toBe("real-uuid");
    expect(resolveUuid(123, "fallback")).toBe("fallback");
  });

  it("encodes text as base64", () => {
    expect(toBase64Text("hello")).toBe(Buffer.from("hello", "utf8").toString("base64"));
  });

  it("generates uuid v4 values", () => {
    const uuid = randomUuidV4();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("falls back when crypto.randomUUID is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    globalThis.crypto = undefined;
    expect(randomUuidV4()).toMatch(/^[0-9a-f-]{36}$/i);
    globalThis.crypto = originalCrypto;
  });

  it("falls back when crypto exists without randomUUID", () => {
    const originalCrypto = globalThis.crypto;
    globalThis.crypto = {};
    expect(randomUuidV4()).toMatch(/^[0-9a-f-]{36}$/i);
    globalThis.crypto = originalCrypto;
  });

  it("uses crypto.randomUUID when available", () => {
    const originalCrypto = globalThis.crypto;
    globalThis.crypto = { randomUUID: jest.fn(() => "11111111-1111-4111-8111-111111111111") };
    expect(randomUuidV4()).toBe("11111111-1111-4111-8111-111111111111");
    globalThis.crypto = originalCrypto;
  });

  it("parses direct JSON payloads", () => {
    expect(parseQrPayload('{"device_name":"ESP"}')).toEqual({ device_name: "ESP" });
    expect(parseQrPayload("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("parses embedded JSON, single-quoted JSON, URLs, and base64 JSON", () => {
    expect(parseQrPayload('prefix {"device_name":"Slice"} suffix')).toEqual({
      device_name: "Slice",
    });
    expect(parseQrPayload("{'device_name':'Quoted'}")).toEqual({ device_name: "Quoted" });
    expect(parseQrPayload("noise {'device_name':'Embedded'} tail")).toEqual({
      device_name: "Embedded",
    });
    expect(
      parseQrPayload("https://example.com?device_name=URL-ESP&device_id=url-dev")
    ).toEqual({
      device_name: "URL-ESP",
      device_id: "url-dev",
    });
    expect(parseQrPayload("https://example.com/empty")).toBeNull();
    const b64 = Buffer.from(JSON.stringify({ device_name: "B64" }), "utf8").toString("base64");
    expect(parseQrPayload(b64)).toEqual({ device_name: "B64" });
  });

  it("parses base64 payloads with embedded JSON slices", () => {
    const embedded = `noise {"device_name":"SliceB64"} tail`;
    const b64 = Buffer.from(embedded, "utf8").toString("base64");
    expect(parseQrPayload(b64)).toEqual({ device_name: "SliceB64" });
  });

  it("skips invalid embedded JSON slices and base64 brace slices", () => {
    expect(parseQrPayload("noise {not-json} tail")).toBeNull();
    const embedded = "prefix {also-not-json} suffix";
    const b64 = Buffer.from(embedded, "utf8").toString("base64");
    expect(parseQrPayload(b64)).toBeNull();
  });

  it("returns null for invalid payloads", () => {
    expect(parseQrPayload(null)).toBeNull();
    expect(parseQrPayload("not-json")).toBeNull();
    expect(parseQrPayload("42")).toBeNull();
    expect(parseQrPayload(Buffer.from("not-json", "utf8").toString("base64"))).toBeNull();
  });
});
