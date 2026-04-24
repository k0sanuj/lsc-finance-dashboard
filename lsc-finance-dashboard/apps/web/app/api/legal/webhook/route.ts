import { NextResponse } from "next/server";
import {
  findLegalWebhookEventByExternalId,
  insertLegalWebhookEvent,
} from "@lsc/db";
import {
  authenticateLegalWebhook,
  dispatchLegalEvent,
  type LegalEventEnvelope,
} from "@lsc/skills/legal/webhook";

export const runtime = "nodejs";

/**
 * Legal -> Finance webhook receiver.
 *
 * This endpoint is intentionally NOT behind the session middleware — Legal
 * authenticates with an HMAC-signed request (see Authorization header,
 * docs/LEGAL_WEBHOOK_SPEC.md).
 *
 * Flow:
 *   1. Read raw body + headers
 *   2. Parse Authorization header: LEGAL-HMAC key=<prefix>, ts=<unix>, sig=<b64>
 *   3. Look up the encrypted secret by key_prefix, decrypt, recompute HMAC
 *   4. Verify ts is within ±300s of now (replay protection)
 *   5. Parse envelope { eventId, eventType, occurredAt, payload }
 *   6. Dedupe on eventId — if we've seen it before, 200 with duplicate status
 *   7. Dispatch to the right handler; always log to legal_webhook_events
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const rawBody = await request.text();

  // Authenticate
  const auth = await authenticateLegalWebhook(authHeader, rawBody);
  if (!auth.ok) {
    // Log the rejection for forensics, including why it failed.
    await insertLegalWebhookEvent({
      apiKeyId: auth.apiKeyId,
      signatureVerified: false,
      requestTsHeader: null,
      requestTsSkewSeconds: auth.skewSeconds,
      externalEventId: null,
      eventType: "(unauthenticated)",
      occurredAtIso: null,
      status: "rejected",
      targetEntityType: null,
      targetEntityId: null,
      errorMessage: `Auth failed: ${auth.reason}`,
      rawPayload: safeParseJson(rawBody),
      responseBody: { error: auth.reason },
    }).catch(() => {});
    const httpStatus =
      auth.reason === "unknown_key" || auth.reason === "bad_signature"
        ? 401
        : auth.reason === "timestamp_skew"
          ? 401
          : 400;
    return NextResponse.json(
      { ok: false, error: auth.reason },
      { status: httpStatus }
    );
  }

  // Parse envelope
  let envelope: LegalEventEnvelope;
  try {
    const parsed = JSON.parse(rawBody) as Partial<LegalEventEnvelope>;
    if (
      typeof parsed.eventId !== "string" ||
      typeof parsed.eventType !== "string" ||
      typeof parsed.occurredAt !== "string" ||
      typeof parsed.payload !== "object" ||
      parsed.payload === null
    ) {
      throw new Error(
        "Envelope must have string eventId, eventType, occurredAt and object payload."
      );
    }
    envelope = {
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      occurredAt: parsed.occurredAt,
      payload: parsed.payload as Record<string, unknown>,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await insertLegalWebhookEvent({
      apiKeyId: auth.apiKeyId,
      signatureVerified: true,
      requestTsHeader: null,
      requestTsSkewSeconds: auth.skewSeconds,
      externalEventId: null,
      eventType: "(malformed)",
      occurredAtIso: null,
      status: "rejected",
      targetEntityType: null,
      targetEntityId: null,
      errorMessage,
      rawPayload: safeParseJson(rawBody),
      responseBody: { error: errorMessage },
    }).catch(() => {});
    return NextResponse.json(
      { ok: false, error: `Malformed envelope: ${errorMessage}` },
      { status: 400 }
    );
  }

  // Dedupe
  const existing = await findLegalWebhookEventByExternalId(envelope.eventId);
  if (existing) {
    await insertLegalWebhookEvent({
      apiKeyId: auth.apiKeyId,
      signatureVerified: true,
      requestTsHeader: null,
      requestTsSkewSeconds: auth.skewSeconds,
      externalEventId: envelope.eventId,
      eventType: envelope.eventType,
      occurredAtIso: envelope.occurredAt,
      status: "duplicate",
      targetEntityType: null,
      targetEntityId: null,
      errorMessage: `Event already processed as ${existing.id} (status: ${existing.status}).`,
      rawPayload: envelope.payload,
      responseBody: { ok: true, duplicate: true, priorEventId: existing.id },
    }).catch(() => {});
    return NextResponse.json(
      { ok: true, duplicate: true, priorEventId: existing.id },
      { status: 200 }
    );
  }

  // Dispatch
  const result = await dispatchLegalEvent(envelope);

  // Log
  const logId = await insertLegalWebhookEvent({
    apiKeyId: auth.apiKeyId,
    signatureVerified: true,
    requestTsHeader: null,
    requestTsSkewSeconds: auth.skewSeconds,
    externalEventId: envelope.eventId,
    eventType: envelope.eventType,
    occurredAtIso: envelope.occurredAt,
    status: result.status,
    targetEntityType: result.targetEntityType,
    targetEntityId: result.targetEntityId,
    errorMessage: result.errorMessage,
    rawPayload: envelope.payload,
    responseBody: result.responseBody,
  });

  const httpStatus = result.status === "processed" ? 200 : result.status === "rejected" ? 400 : 500;
  return NextResponse.json(
    {
      ok: result.status === "processed",
      status: result.status,
      eventLogId: logId,
      ...result.responseBody,
      ...(result.errorMessage ? { error: result.errorMessage } : {}),
    },
    { status: httpStatus }
  );
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw.slice(0, 2000) };
  }
}
