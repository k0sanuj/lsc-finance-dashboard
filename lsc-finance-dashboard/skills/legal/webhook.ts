import "server-only";

import crypto from "node:crypto";
import {
  getActiveLegalApiKeyByPrefix,
  recordLegalApiKeyUse,
  resolveCompanyByCode,
  resolveContractByExternalRef,
  upsertCapTableEntryByExternalId,
  upsertTrancheByExternalId,
} from "@lsc/db";

// ──────────────────────────────────────────────────────────────
// AES-256-GCM encryption for Legal API key secrets.
// Required env: LEGAL_API_KEY_ENCRYPTION_KEY (base64 of 32 bytes)
// ──────────────────────────────────────────────────────────────

export type EncryptedSecret = {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
};

function loadEncryptionKey(): Buffer {
  const raw = process.env.LEGAL_API_KEY_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      "LEGAL_API_KEY_ENCRYPTION_KEY is not set. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) {
    throw new Error(
      `LEGAL_API_KEY_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}).`
    );
  }
  return key;
}

export function encryptLegalSecret(plaintext: string): EncryptedSecret {
  const key = loadEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptLegalSecret(enc: EncryptedSecret): string {
  const key = loadEncryptionKey();
  const iv = Buffer.from(enc.iv, "base64");
  const authTag = Buffer.from(enc.authTag, "base64");
  const ct = Buffer.from(enc.ciphertext, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

// ──────────────────────────────────────────────────────────────
// HMAC header parsing + verification
// ──────────────────────────────────────────────────────────────

/**
 * Expected Authorization header format:
 *
 *   Authorization: LEGAL-HMAC key=<prefix>, ts=<unix_seconds>, sig=<base64_hmac>
 *
 * The signature is computed as:
 *   HMAC-SHA256(secret, `${ts}.${raw_body_string}`).toString("base64")
 *
 * We reject requests where ts differs from our clock by more than 300s.
 */
export type ParsedLegalAuth = {
  keyPrefix: string;
  ts: string;
  sig: string;
};

export function parseLegalAuthHeader(header: string | null): ParsedLegalAuth | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toUpperCase().startsWith("LEGAL-HMAC")) return null;
  const body = trimmed.slice("LEGAL-HMAC".length).trim();
  const parts: Record<string, string> = {};
  for (const chunk of body.split(",")) {
    const [k, v] = chunk.split("=").map((s) => s.trim());
    if (k && v) parts[k] = v;
  }
  if (!parts.key || !parts.ts || !parts.sig) return null;
  return { keyPrefix: parts.key, ts: parts.ts, sig: parts.sig };
}

/**
 * Verify that `sig` matches HMAC-SHA256(secret, `${ts}.${body}`). Uses
 * timing-safe comparison. Returns false on any signal of tampering.
 */
export function verifyHmac(
  secret: string,
  ts: string,
  body: string,
  providedSigBase64: string
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedSigBase64, "base64");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

export type AuthenticateResult =
  | { ok: true; apiKeyId: string; signatureVerified: true; skewSeconds: number }
  | {
      ok: false;
      reason:
        | "missing_header"
        | "malformed_header"
        | "unknown_key"
        | "timestamp_skew"
        | "bad_signature";
      apiKeyId: string | null;
      signatureVerified: false;
      skewSeconds: number | null;
    };

const MAX_TS_SKEW_SECONDS = 300;

export async function authenticateLegalWebhook(
  authHeader: string | null,
  rawBody: string
): Promise<AuthenticateResult> {
  const parsed = parseLegalAuthHeader(authHeader);
  if (!parsed) {
    return {
      ok: false,
      reason: authHeader ? "malformed_header" : "missing_header",
      apiKeyId: null,
      signatureVerified: false,
      skewSeconds: null,
    };
  }

  // Timestamp window check
  const tsNum = Number(parsed.ts);
  if (!Number.isFinite(tsNum)) {
    return {
      ok: false,
      reason: "malformed_header",
      apiKeyId: null,
      signatureVerified: false,
      skewSeconds: null,
    };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const skew = Math.abs(nowSec - tsNum);
  if (skew > MAX_TS_SKEW_SECONDS) {
    return {
      ok: false,
      reason: "timestamp_skew",
      apiKeyId: null,
      signatureVerified: false,
      skewSeconds: nowSec - tsNum,
    };
  }

  // Look up the (encrypted) secret by its public prefix
  const keyRow = await getActiveLegalApiKeyByPrefix(parsed.keyPrefix);
  if (!keyRow) {
    return {
      ok: false,
      reason: "unknown_key",
      apiKeyId: null,
      signatureVerified: false,
      skewSeconds: nowSec - tsNum,
    };
  }

  // Decrypt the stored secret and recompute the HMAC independently.
  let secret: string;
  try {
    secret = decryptLegalSecret({
      ciphertext: keyRow.secretCiphertext,
      iv: keyRow.secretIv,
      authTag: keyRow.secretAuthTag,
    });
  } catch {
    return {
      ok: false,
      reason: "unknown_key",
      apiKeyId: keyRow.id,
      signatureVerified: false,
      skewSeconds: nowSec - tsNum,
    };
  }

  if (!verifyHmac(secret, parsed.ts, rawBody, parsed.sig)) {
    return {
      ok: false,
      reason: "bad_signature",
      apiKeyId: keyRow.id,
      signatureVerified: false,
      skewSeconds: nowSec - tsNum,
    };
  }

  await recordLegalApiKeyUse(keyRow.id);
  return {
    ok: true,
    apiKeyId: keyRow.id,
    signatureVerified: true,
    skewSeconds: nowSec - tsNum,
  };
}

// ──────────────────────────────────────────────────────────────
// Event envelope + dispatcher
// ──────────────────────────────────────────────────────────────

export type LegalEventEnvelope = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type DispatchResult = {
  status: "processed" | "failed" | "rejected";
  targetEntityType: string | null;
  targetEntityId: string | null;
  errorMessage: string | null;
  responseBody: Record<string, unknown>;
};

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" ? v : null;
}
function payloadNumber(payload: Record<string, unknown>, key: string, fallback = 0): number {
  const v = payload[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}
function payloadBoolean(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

/**
 * Dispatch a verified envelope. Never throws — failures are captured in
 * the returned DispatchResult and persisted to legal_webhook_events by
 * the route handler.
 *
 * Unknown event types return { status: "processed", targetEntityType: null }
 * — we accept them gracefully so Legal can add new event types without
 * needing finance-side changes on day 1. The raw payload is still stored.
 */
export async function dispatchLegalEvent(
  env: LegalEventEnvelope
): Promise<DispatchResult> {
  try {
    switch (env.eventType) {
      case "tranche.created":
      case "tranche.updated":
        return await handleTrancheUpsert(env);
      case "share_grant.created":
      case "share_grant.updated":
        return await handleShareGrantUpsert(env);
      default:
        return {
          status: "processed",
          targetEntityType: null,
          targetEntityId: null,
          errorMessage: `Unknown event type "${env.eventType}" — accepted and logged but not processed.`,
          responseBody: {
            note: "event type not yet supported; raw payload stored for future replay",
          },
        };
    }
  } catch (err) {
    return {
      status: "failed",
      targetEntityType: null,
      targetEntityId: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      responseBody: {},
    };
  }
}

async function handleTrancheUpsert(
  env: LegalEventEnvelope
): Promise<DispatchResult> {
  const p = env.payload;
  const legalExternalId = payloadString(p, "legalExternalId");
  const contractName = payloadString(p, "contractName");
  const companyCode = payloadString(p, "companyCode");
  const trancheNumber = Math.max(1, Math.floor(payloadNumber(p, "trancheNumber", 1)));
  const trancheLabel = payloadString(p, "trancheLabel") ?? `Tranche ${trancheNumber}`;
  const tranchePercentage = payloadNumber(p, "tranchePercentage", 0);
  const trancheAmount = payloadNumber(p, "trancheAmount", 0);
  const triggerType = payloadString(p, "triggerType");
  const triggerDate = payloadString(p, "triggerDate");
  const triggerOffsetDays = Math.floor(payloadNumber(p, "triggerOffsetDays", 0));
  const notes = payloadString(p, "notes");

  const validTriggerTypes = [
    "on_signing",
    "pre_event",
    "post_event",
    "on_milestone",
    "on_date",
  ];

  if (!legalExternalId) {
    return {
      status: "rejected",
      targetEntityType: "contract_tranche",
      targetEntityId: null,
      errorMessage: "Missing payload.legalExternalId.",
      responseBody: {},
    };
  }
  if (!contractName) {
    return {
      status: "rejected",
      targetEntityType: "contract_tranche",
      targetEntityId: null,
      errorMessage: "Missing payload.contractName.",
      responseBody: {},
    };
  }
  if (!companyCode) {
    return {
      status: "rejected",
      targetEntityType: "contract_tranche",
      targetEntityId: null,
      errorMessage: "Missing payload.companyCode.",
      responseBody: {},
    };
  }
  if (!triggerType || !validTriggerTypes.includes(triggerType)) {
    return {
      status: "rejected",
      targetEntityType: "contract_tranche",
      targetEntityId: null,
      errorMessage: `Invalid triggerType "${triggerType ?? ""}". Must be one of ${validTriggerTypes.join(", ")}.`,
      responseBody: {},
    };
  }

  const companyId = await resolveCompanyByCode(companyCode);
  if (!companyId) {
    return {
      status: "rejected",
      targetEntityType: "contract_tranche",
      targetEntityId: null,
      errorMessage: `No company with code "${companyCode}".`,
      responseBody: {},
    };
  }
  const contract = await resolveContractByExternalRef(companyId, contractName);
  if (!contract) {
    return {
      status: "rejected",
      targetEntityType: "contract_tranche",
      targetEntityId: null,
      errorMessage: `No contract named "${contractName}" under company "${companyCode}". Create the contract first in Finance.`,
      responseBody: {},
    };
  }

  const result = await upsertTrancheByExternalId({
    legalExternalId,
    contractId: contract.id,
    companyId,
    sponsorOrCustomerId: contract.sponsorOrCustomerId,
    trancheNumber,
    trancheLabel,
    tranchePercentage,
    trancheAmount,
    triggerType: triggerType as
      | "on_signing"
      | "pre_event"
      | "post_event"
      | "on_milestone"
      | "on_date",
    triggerDate,
    triggerOffsetDays,
    notes,
  });

  return {
    status: "processed",
    targetEntityType: "contract_tranche",
    targetEntityId: result.id,
    errorMessage: null,
    responseBody: { action: result.action, trancheId: result.id },
  };
}

async function handleShareGrantUpsert(
  env: LegalEventEnvelope
): Promise<DispatchResult> {
  const p = env.payload;
  const legalExternalId = payloadString(p, "legalExternalId");
  const companyCode = payloadString(p, "companyCode");
  const holderName = payloadString(p, "holderName");
  const holderType = payloadString(p, "holderType") ?? "employee";
  const shareClass = payloadString(p, "shareClass") ?? "common";
  const sharesHeld = Math.max(0, Math.floor(payloadNumber(p, "sharesHeld", 0)));
  const exercisePrice = payloadNumber(p, "exercisePrice", 0);
  const vestingStartDate = payloadString(p, "vestingStartDate");
  const vestingEndDate = payloadString(p, "vestingEndDate");
  const vestingCliffMonthsRaw = p.vestingCliffMonths;
  const vestingCliffMonths =
    typeof vestingCliffMonthsRaw === "number"
      ? vestingCliffMonthsRaw
      : typeof vestingCliffMonthsRaw === "string"
        ? Number(vestingCliffMonthsRaw)
        : null;
  const vestingTotalMonthsRaw = p.vestingTotalMonths;
  const vestingTotalMonths =
    typeof vestingTotalMonthsRaw === "number"
      ? vestingTotalMonthsRaw
      : typeof vestingTotalMonthsRaw === "string"
        ? Number(vestingTotalMonthsRaw)
        : null;
  const sharesVested = Math.max(0, Math.floor(payloadNumber(p, "sharesVested", 0)));
  const agreementReference = payloadString(p, "agreementReference");
  const notes = payloadString(p, "notes");

  if (!legalExternalId) {
    return {
      status: "rejected",
      targetEntityType: "cap_table_entry",
      targetEntityId: null,
      errorMessage: "Missing payload.legalExternalId.",
      responseBody: {},
    };
  }
  if (!companyCode) {
    return {
      status: "rejected",
      targetEntityType: "cap_table_entry",
      targetEntityId: null,
      errorMessage: "Missing payload.companyCode.",
      responseBody: {},
    };
  }
  if (!holderName) {
    return {
      status: "rejected",
      targetEntityType: "cap_table_entry",
      targetEntityId: null,
      errorMessage: "Missing payload.holderName.",
      responseBody: {},
    };
  }

  const companyId = await resolveCompanyByCode(companyCode);
  if (!companyId) {
    return {
      status: "rejected",
      targetEntityType: "cap_table_entry",
      targetEntityId: null,
      errorMessage: `No company with code "${companyCode}".`,
      responseBody: {},
    };
  }

  const result = await upsertCapTableEntryByExternalId({
    legalExternalId,
    companyId,
    holderName,
    holderType,
    shareClass,
    sharesHeld,
    exercisePrice,
    vestingStartDate,
    vestingEndDate,
    vestingCliffMonths:
      vestingCliffMonths !== null && Number.isFinite(vestingCliffMonths)
        ? Math.floor(vestingCliffMonths)
        : null,
    vestingTotalMonths:
      vestingTotalMonths !== null && Number.isFinite(vestingTotalMonths)
        ? Math.floor(vestingTotalMonths)
        : null,
    sharesVested,
    agreementReference,
    notes,
  });

  return {
    status: "processed",
    targetEntityType: "cap_table_entry",
    targetEntityId: result.id,
    errorMessage: null,
    responseBody: { action: result.action, capTableEntryId: result.id },
  };
}

/**
 * Generate a new API key for the Legal platform.
 * Returns { keyPrefix, plaintextSecret, encryptedSecret } — the
 * plaintextSecret must be shown to the admin ONCE (the admin hands it
 * to the Legal platform); the encryptedSecret is what goes into the DB.
 * After the admin page shows it, we never have the plaintext again.
 */
export function generateLegalApiKey(): {
  keyPrefix: string;
  plaintextSecret: string;
  encryptedSecret: EncryptedSecret;
} {
  const keyPrefix = `lk_${crypto.randomBytes(4).toString("hex")}`;
  const secretBody = crypto.randomBytes(32).toString("base64url");
  const plaintextSecret = `${keyPrefix}.${secretBody}`;
  const encryptedSecret = encryptLegalSecret(plaintextSecret);
  return { keyPrefix, plaintextSecret, encryptedSecret };
}

// Suppress unused-import hint for payloadBoolean; keeping exported in case
// future event handlers need it.
export const _payloadBoolean = payloadBoolean;
