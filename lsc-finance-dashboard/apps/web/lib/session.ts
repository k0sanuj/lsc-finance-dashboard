export const AUTH_COOKIE_NAME = "lsc_finance_session";

export type SessionPayload = {
  sub: string;
  email: string;
  role: string;
  name: string;
  exp: number;
};

const encoder = new TextEncoder();

function toBase64Url(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(`${normalized}${padding}`);
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signText(value: string, secret: string) {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const bytes = Array.from(new Uint8Array(signature));
  const binary = String.fromCharCode(...bytes);
  return toBase64Url(binary);
}

export async function createSessionToken(payload: SessionPayload, secret: string) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await signText(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token: string, secret: string) {
  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = await signText(encodedPayload, secret);

  if (expectedSignature !== providedSignature) {
    return null;
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;

  if (!payload.exp || payload.exp * 1000 <= Date.now()) {
    return null;
  }

  return payload;
}
