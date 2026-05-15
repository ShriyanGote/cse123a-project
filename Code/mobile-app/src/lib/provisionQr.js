import { Buffer } from "buffer";

export function resolveUuid(envValue, fallbackValue) {
  const value = typeof envValue === "string" ? envValue.trim() : "";
  if (!value) return fallbackValue;
  if (/^x+(-x+)*$/i.test(value.replace(/\{|\}/g, ""))) {
    return fallbackValue;
  }
  return value;
}

export function toBase64Text(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

function getRuntimeCrypto() {
  /* istanbul ignore next -- Hermes/web runtimes without globalThis */
  if (typeof globalThis === "undefined") return undefined;
  return globalThis.crypto;
}

export function randomUuidV4() {
  const c = getRuntimeCrypto();
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function parseQrPayload(rawValue) {
  if (!rawValue || typeof rawValue !== "string") return null;

  const text = rawValue.trim();

  const tryJson = (input) => {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };

  const fromJson = tryJson(text);
  if (fromJson) return fromJson;

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSlice = text.slice(firstBrace, lastBrace + 1);
    const fromSlice = tryJson(jsonSlice);
    if (fromSlice) return fromSlice;

    const singleQuoted = jsonSlice.replace(/'/g, "\"");
    const fromSingleQuoted = tryJson(singleQuoted);
    if (fromSingleQuoted) return fromSingleQuoted;
  }

  try {
    const url = new URL(text);
    const params = Object.fromEntries(url.searchParams.entries());
    if (Object.keys(params).length > 0) return params;
  } catch {
    // Not a URL.
  }

  try {
    const decoded = Buffer.from(text, "base64").toString("utf8");
    const fromBase64Json = tryJson(decoded);
    if (fromBase64Json) return fromBase64Json;

    const b64FirstBrace = decoded.indexOf("{");
    const b64LastBrace = decoded.lastIndexOf("}");
    if (b64FirstBrace !== -1 && b64LastBrace > b64FirstBrace) {
      const b64Slice = decoded.slice(b64FirstBrace, b64LastBrace + 1);
      const fromB64Slice = tryJson(b64Slice);
      if (fromB64Slice) return fromB64Slice;
    }
  } catch {
    // Not base64 JSON.
  }

  return null;
}
