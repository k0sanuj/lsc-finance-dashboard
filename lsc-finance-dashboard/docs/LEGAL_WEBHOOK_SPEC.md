# Legal → Finance Webhook Spec

The Legal platform pushes events to the Finance platform via signed HTTP POSTs.
This spec defines the exact contract — endpoint, auth, payload shapes, errors.

**Endpoint:**
- Dev (localhost): `POST http://localhost:3000/api/legal/webhook`
- Prod: `POST https://lsc-finance-dashboard.vercel.app/api/legal/webhook`

**Content-Type:** `application/json`

---

## Authentication

Every request MUST include an `Authorization` header in this exact format:

```
Authorization: LEGAL-HMAC key=<key_prefix>, ts=<unix_seconds>, sig=<hmac_b64>
```

- `key_prefix` — the public key prefix issued by Finance (looks like `lk_3a9f4b21`)
- `ts` — Unix timestamp in seconds when the request is sent. Must be within
  ±300 seconds of the server clock (protects against replay).
- `sig` — base64 of `HMAC-SHA256(secret, ts + "." + raw_body_string)`

The **secret** is the full token Finance shows you once when the key is
generated (format: `<key_prefix>.<random_base64url>`). Store it in your
`.env` as `LSC_FINANCE_WEBHOOK_SECRET`. You will NEVER see it again — if
lost, revoke the key and generate a new one.

### Signing example (Node.js)

```js
import crypto from "node:crypto";

const LSC_FINANCE_WEBHOOK_KEY = process.env.LSC_FINANCE_WEBHOOK_KEY;      // e.g. "lk_3a9f4b21"
const LSC_FINANCE_WEBHOOK_SECRET = process.env.LSC_FINANCE_WEBHOOK_SECRET; // e.g. "lk_3a9f4b21.abcd…"
const ENDPOINT = process.env.LSC_FINANCE_WEBHOOK_URL; // e.g. "https://lsc-finance-dashboard.vercel.app/api/legal/webhook"

async function postLegalEvent(envelope) {
  const body = JSON.stringify(envelope);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto
    .createHmac("sha256", LSC_FINANCE_WEBHOOK_SECRET)
    .update(`${ts}.${body}`)
    .digest("base64");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `LEGAL-HMAC key=${LSC_FINANCE_WEBHOOK_KEY}, ts=${ts}, sig=${sig}`,
    },
    body,
  });
  return { status: res.status, json: await res.json() };
}
```

**Critical:** sign the exact `body` string you send. `JSON.stringify` key
ordering changes break the signature. Serialize once, sign that exact
string, send that exact string.

---

## Envelope

Every event uses this outer shape:

```jsonc
{
  "eventId": "string",      // Legal's stable unique id for this event.
                            // Used to dedupe on retry — sending the same
                            // eventId twice is safe.
  "eventType": "string",    // e.g. "tranche.created"
  "occurredAt": "string",   // ISO 8601 timestamp
  "payload": {}             // Event-specific, see below
}
```

Finance stores every event (successful or not) for audit, keyed on
`eventId`. Duplicates return HTTP 200 with `{ "ok": true, "duplicate": true }`.

---

## Supported event types

### `contract.created` / `contract.updated`

Creates or updates a row in `contracts`. Legal is the source of truth for
contract metadata; Finance stores a synced copy keyed on
`legal_external_id`. Send this **before** any tranche events that reference
the same contract.

The receiver also creates a `sponsors_or_customers` row on the fly if one
doesn't exist for `(companyCode, sponsorName)`, so Legal doesn't need to
pre-register sponsors in Finance.

```jsonc
{
  "eventId": "leg_evt_a1b2c3d4",
  "eventType": "contract.created",
  "occurredAt": "2026-04-29T12:00:00Z",
  "payload": {
    "legalExternalId": "leg_doc_0001",          // Legal's stable Document/contract id (REQUIRED)
    "companyCode": "TBR",                        // "LSC" | "TBR" | "FSP" | "XTZ" | "XTE"
    "contractName": "ACME 2026 Title Sponsorship",
    "sponsorName": "ACME Beverages Inc.",        // Counterparty (REQUIRED)
    "counterpartyType": "sponsor",                // "sponsor" | "customer" — defaults to sponsor
    "contractStatus": "active",                   // "draft" | "active" | "completed" | "cancelled"
    "contractValue": 200000.0,                    // Total contract value, USD
    "currencyCode": "USD",
    "startDate": "2026-06-01",                    // YYYY-MM-DD or null
    "endDate": "2027-05-31",                      // YYYY-MM-DD or null
    "isRecurring": false,
    "billingFrequency": null,                     // optional: "monthly" | "quarterly" | etc.
    "notes": "Multi-year title sponsorship; signed via Hellosign #abc123."
  }
}
```

**Response on success (200):**

```json
{ "ok": true, "status": "processed", "eventLogId": "…", "action": "inserted", "contractId": "…", "sponsorId": "…" }
```

### `tranche.created` / `tranche.updated`

Creates or updates a row in `contract_tranches`. The payload identifies
the parent contract one of two ways:

1. **Preferred:** `contractLegalExternalId` — Legal's stable id for the
   contract Document, which Finance has already received via a
   `contract.created` event. This is the right path when Legal owns the
   contract row.
2. **Fallback:** `companyCode` + `contractName` — used when the contract
   was created manually in Finance (legacy / one-off cases).

If neither path resolves to a contract, the event is **rejected** (400).
Always send `contract.created` for a Document before any tranche events
that reference it.

```jsonc
{
  "eventId": "leg_evt_9f3a2b1c",
  "eventType": "tranche.created",
  "occurredAt": "2026-05-12T14:30:00Z",
  "payload": {
    "legalExternalId": "leg_tr_0001",         // Legal's stable tranche id (REQUIRED)
    "contractLegalExternalId": "leg_doc_0001", // Legal's stable contract id (PREFERRED)
    "companyCode": "TBR",                      // Required only as fallback if contractLegalExternalId is omitted
    "contractName": "ACME 2026 Title Sponsorship", // Required only as fallback
    "trancheNumber": 1,
    "trancheLabel": "Signing fee",
    "tranchePercentage": 25.0,                 // 0..100
    "trancheAmount": 50000.0,                  // USD
    "triggerType": "on_signing",               // on_signing | pre_event | post_event | on_milestone | on_date
    "triggerDate": "2026-06-01",               // YYYY-MM-DD; ignored for on_signing
    "triggerOffsetDays": 0,                    // for pre_event / post_event
    "notes": "Payable within 30 days of signing."
  }
}
```

**Response on success (200):**

```json
{ "ok": true, "status": "processed", "eventLogId": "…", "action": "inserted", "trancheId": "…" }
```

### `share_grant.created` / `share_grant.updated`

Upserts a row in `cap_table_entries` (the share-grant table). Keyed on
`legalExternalId` — same id in an `updated` event will find and update
the existing row.

```jsonc
{
  "eventId": "leg_evt_2c1d9e88",
  "eventType": "share_grant.created",
  "occurredAt": "2026-05-12T14:30:00Z",
  "payload": {
    "legalExternalId": "leg_grant_0042",    // Legal's stable grant id (REQUIRED)
    "companyCode": "LSC",
    "holderName": "Jane Doe",
    "holderType": "employee",               // founder | employee | investor | advisor
    "shareClass": "common",                 // common | preferred_a | preferred_b | options
    "sharesHeld": 10000,
    "exercisePrice": 0.01,
    "vestingStartDate": "2026-05-01",       // optional
    "vestingEndDate": "2030-05-01",         // optional
    "vestingCliffMonths": 12,                // optional
    "vestingTotalMonths": 48,                // optional
    "sharesVested": 0,
    "agreementReference": "ESA-0042",        // optional
    "notes": "Initial grant; see ESA-0042 executed 2026-05-01."
  }
}
```

**Response on success (200):**
```json
{ "ok": true, "status": "processed", "eventLogId": "…", "action": "inserted", "capTableEntryId": "…" }
```

### Unknown event types

Any eventType we don't recognize is **accepted (200) but not processed**.
The raw payload is stored in `legal_webhook_events` for later replay. This
means Legal can add new event types without Finance needing to ship code
first — Finance will start processing them once the matching handler is
added.

---

## Errors

| HTTP | `error`            | Meaning                                                   |
|------|--------------------|-----------------------------------------------------------|
| 400  | `missing_header`   | No `Authorization` header.                                |
| 400  | `malformed_header` | Auth header doesn't match `LEGAL-HMAC key=…, ts=…, sig=…` |
| 401  | `unknown_key`      | `key_prefix` not found or revoked.                        |
| 401  | `bad_signature`    | HMAC doesn't match the body.                              |
| 401  | `timestamp_skew`   | `ts` differs from server clock by more than 300s.         |
| 400  | (malformed)        | Envelope JSON is missing eventId/eventType/occurredAt/payload. |
| 400  | (rejected)         | Payload validation failed (e.g., contract not found).     |
| 500  | (failed)           | Server-side error during processing. Safe to retry.       |

Always retry on 500. Do NOT retry on 400/401 — fix the cause.

---

## Idempotency + retries

- `eventId` is the dedupe key. Reusing it returns 200 with `duplicate: true`.
- For failed deliveries (network error, 500), use exponential backoff:
  1s, 4s, 16s, 60s, 300s. Give up after 5 attempts and surface a
  monitorable alert in Legal.
- Do NOT change `eventId` on retry. Do not mutate the payload either —
  stable payload + stable eventId = safe retry.

---

## Worked example (cURL)

After generating a key in Finance at `/legal-integration`, you'll have
values for `LSC_FINANCE_WEBHOOK_KEY` and `LSC_FINANCE_WEBHOOK_SECRET`. Try:

```bash
KEY="lk_3a9f4b21"                   # replace with your prefix
SECRET="lk_3a9f4b21.abcd…"           # replace with your full secret
TS=$(date +%s)
BODY='{"eventId":"test-001","eventType":"share_grant.created","occurredAt":"2026-05-12T00:00:00Z","payload":{"legalExternalId":"leg_grant_test_001","companyCode":"LSC","holderName":"Test Holder","holderType":"employee","shareClass":"common","sharesHeld":1000,"exercisePrice":0.01}}'
SIG=$(printf "%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

curl -s -X POST http://localhost:3000/api/legal/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: LEGAL-HMAC key=$KEY, ts=$TS, sig=$SIG" \
  -d "$BODY" | jq .
```

Expected output:
```json
{
  "ok": true,
  "status": "processed",
  "eventLogId": "…",
  "action": "inserted",
  "capTableEntryId": "…"
}
```

Rerun the exact same command and you'll get:
```json
{ "ok": true, "duplicate": true, "priorEventId": "…" }
```

---

## Key management

- Keys are issued from `/legal-integration` on the Finance dashboard
  (super_admin / finance_admin only).
- The full secret is shown **once** at generation. Finance stores an
  AES-256-GCM encrypted copy; no plaintext is stored.
- Keys can be revoked at any time — revoked keys return HTTP 401.
- Rotate annually or after any suspected leak: generate a new key, deploy
  to Legal's env, revoke the old key.
