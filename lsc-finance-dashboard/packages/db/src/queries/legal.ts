import "server-only";

import { queryRowsAdmin, executeAdmin } from "../query";
import { getBackend } from "./shared";

// ──────────────────────────────────────────────────────────────
// legal_api_keys
// ──────────────────────────────────────────────────────────────

export type LegalApiKeyRow = {
  id: string;
  keyPrefix: string;
  label: string;
  createdByUserId: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revocationReason: string | null;
};

type LegalApiKeySource = {
  id: string;
  key_prefix: string;
  label: string;
  created_by_user_id: string | null;
  last_used_at: string | null;
  usage_count: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
  revocation_reason: string | null;
};

function rowToKey(r: LegalApiKeySource): LegalApiKeyRow {
  return {
    id: r.id,
    keyPrefix: r.key_prefix,
    label: r.label,
    createdByUserId: r.created_by_user_id,
    lastUsedAt: r.last_used_at,
    usageCount: Number(r.usage_count) || 0,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
    revokedByUserId: r.revoked_by_user_id,
    revocationReason: r.revocation_reason,
  };
}

export async function listLegalApiKeys(): Promise<LegalApiKeyRow[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRowsAdmin<LegalApiKeySource>(
    `select id, key_prefix, label,
            created_by_user_id::text,
            last_used_at::text,
            usage_count::text,
            created_at::text,
            revoked_at::text,
            revoked_by_user_id::text,
            revocation_reason
     from legal_api_keys
     order by created_at desc`
  );
  return rows.map(rowToKey);
}

export async function getActiveLegalApiKeyByPrefix(keyPrefix: string): Promise<{
  id: string;
  secretCiphertext: string;
  secretIv: string;
  secretAuthTag: string;
} | null> {
  if (getBackend() !== "database") return null;
  const rows = await queryRowsAdmin<{
    id: string;
    secret_ciphertext: string;
    secret_iv: string;
    secret_auth_tag: string;
  }>(
    `select id,
            secret_ciphertext,
            secret_iv,
            secret_auth_tag
     from legal_api_keys
     where key_prefix = $1 and revoked_at is null
     limit 1`,
    [keyPrefix]
  );
  const r = rows[0];
  return r
    ? {
        id: r.id,
        secretCiphertext: r.secret_ciphertext,
        secretIv: r.secret_iv,
        secretAuthTag: r.secret_auth_tag,
      }
    : null;
}

export async function insertLegalApiKey(input: {
  keyPrefix: string;
  secretCiphertext: string;
  secretIv: string;
  secretAuthTag: string;
  label: string;
  createdByUserId: string | null;
}): Promise<string> {
  const rows = await queryRowsAdmin<{ id: string }>(
    `insert into legal_api_keys (
       key_prefix, secret_ciphertext, secret_iv, secret_auth_tag,
       label, created_by_user_id
     )
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      input.keyPrefix,
      input.secretCiphertext,
      input.secretIv,
      input.secretAuthTag,
      input.label,
      input.createdByUserId,
    ]
  );
  return rows[0].id;
}

export async function revokeLegalApiKey(
  id: string,
  revokedByUserId: string | null,
  reason: string | null
): Promise<void> {
  await executeAdmin(
    `update legal_api_keys
     set revoked_at = now(),
         revoked_by_user_id = $2,
         revocation_reason = $3
     where id = $1 and revoked_at is null`,
    [id, revokedByUserId, reason]
  );
}

export async function recordLegalApiKeyUse(id: string): Promise<void> {
  await executeAdmin(
    `update legal_api_keys
     set last_used_at = now(),
         usage_count = usage_count + 1
     where id = $1`,
    [id]
  );
}

// ──────────────────────────────────────────────────────────────
// legal_webhook_events
// ──────────────────────────────────────────────────────────────

export type LegalWebhookEventRow = {
  id: string;
  apiKeyId: string | null;
  signatureVerified: boolean;
  requestTsHeader: string | null;
  requestTsSkewSeconds: number | null;
  externalEventId: string | null;
  eventType: string;
  occurredAtIso: string | null;
  status: "accepted" | "processed" | "failed" | "rejected" | "duplicate";
  targetEntityType: string | null;
  targetEntityId: string | null;
  errorMessage: string | null;
  rawPayload: unknown;
  responseBody: unknown;
  createdAt: string;
};

type LegalWebhookEventSource = {
  id: string;
  api_key_id: string | null;
  signature_verified: boolean;
  request_ts_header: string | null;
  request_ts_skew_seconds: number | null;
  external_event_id: string | null;
  event_type: string;
  occurred_at_iso: string | null;
  status: LegalWebhookEventRow["status"];
  target_entity_type: string | null;
  target_entity_id: string | null;
  error_message: string | null;
  raw_payload: unknown;
  response_body: unknown;
  created_at: string;
};

function rowToEvent(r: LegalWebhookEventSource): LegalWebhookEventRow {
  return {
    id: r.id,
    apiKeyId: r.api_key_id,
    signatureVerified: r.signature_verified,
    requestTsHeader: r.request_ts_header,
    requestTsSkewSeconds: r.request_ts_skew_seconds,
    externalEventId: r.external_event_id,
    eventType: r.event_type,
    occurredAtIso: r.occurred_at_iso,
    status: r.status,
    targetEntityType: r.target_entity_type,
    targetEntityId: r.target_entity_id,
    errorMessage: r.error_message,
    rawPayload: r.raw_payload,
    responseBody: r.response_body,
    createdAt: r.created_at,
  };
}

export async function listLegalWebhookEvents(
  limit = 50
): Promise<LegalWebhookEventRow[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRowsAdmin<LegalWebhookEventSource>(
    `select id::text,
            api_key_id::text,
            signature_verified,
            request_ts_header,
            request_ts_skew_seconds,
            external_event_id,
            event_type,
            occurred_at_iso,
            status,
            target_entity_type,
            target_entity_id::text,
            error_message,
            raw_payload,
            response_body,
            created_at::text
     from legal_webhook_events
     order by created_at desc
     limit $1`,
    [Math.min(limit, 500)]
  );
  return rows.map(rowToEvent);
}

export async function findLegalWebhookEventByExternalId(
  externalEventId: string
): Promise<{ id: string; status: string } | null> {
  if (getBackend() !== "database") return null;
  const rows = await queryRowsAdmin<{ id: string; status: string }>(
    `select id::text, status
     from legal_webhook_events
     where external_event_id = $1
     limit 1`,
    [externalEventId]
  );
  return rows[0] ?? null;
}

export type InsertLegalWebhookEventInput = {
  apiKeyId: string | null;
  signatureVerified: boolean;
  requestTsHeader: string | null;
  requestTsSkewSeconds: number | null;
  externalEventId: string | null;
  eventType: string;
  occurredAtIso: string | null;
  status: LegalWebhookEventRow["status"];
  targetEntityType: string | null;
  targetEntityId: string | null;
  errorMessage: string | null;
  rawPayload: unknown;
  responseBody: unknown;
};

export async function insertLegalWebhookEvent(
  input: InsertLegalWebhookEventInput
): Promise<string> {
  const rows = await queryRowsAdmin<{ id: string }>(
    `insert into legal_webhook_events (
       api_key_id, signature_verified,
       request_ts_header, request_ts_skew_seconds,
       external_event_id, event_type, occurred_at_iso,
       status, target_entity_type, target_entity_id,
       error_message, raw_payload, response_body
     )
     values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb
     )
     returning id`,
    [
      input.apiKeyId,
      input.signatureVerified,
      input.requestTsHeader,
      input.requestTsSkewSeconds,
      input.externalEventId,
      input.eventType,
      input.occurredAtIso,
      input.status,
      input.targetEntityType,
      input.targetEntityId,
      input.errorMessage,
      JSON.stringify(input.rawPayload ?? null),
      JSON.stringify(input.responseBody ?? null),
    ]
  );
  return rows[0].id;
}

// ──────────────────────────────────────────────────────────────
// Entity upserts by legal_external_id (tranches + cap table)
// ──────────────────────────────────────────────────────────────

export type UpsertTrancheByExternalIdInput = {
  legalExternalId: string;
  contractId: string;
  companyId: string;
  sponsorOrCustomerId: string;
  trancheNumber: number;
  trancheLabel: string;
  tranchePercentage: number;
  trancheAmount: number;
  triggerType:
    | "on_signing"
    | "pre_event"
    | "post_event"
    | "on_milestone"
    | "on_date";
  triggerDate: string | null;
  triggerOffsetDays: number;
  notes: string | null;
};

export async function upsertTrancheByExternalId(
  input: UpsertTrancheByExternalIdInput
): Promise<{ id: string; action: "inserted" | "updated" }> {
  // See if a row with this legal_external_id already exists
  const existing = await queryRowsAdmin<{ id: string }>(
    `select id::text from contract_tranches where legal_external_id = $1 limit 1`,
    [input.legalExternalId]
  );
  if (existing[0]) {
    await executeAdmin(
      `update contract_tranches set
         tranche_number = $2,
         tranche_label = $3,
         tranche_percentage = $4::numeric,
         tranche_amount = $5::numeric,
         trigger_type = $6::tranche_trigger_type,
         trigger_date = $7::date,
         trigger_offset_days = $8,
         notes = $9,
         updated_at = now()
       where id = $1`,
      [
        existing[0].id,
        input.trancheNumber,
        input.trancheLabel,
        input.tranchePercentage,
        input.trancheAmount,
        input.triggerType,
        input.triggerDate,
        input.triggerOffsetDays,
        input.notes,
      ]
    );
    return { id: existing[0].id, action: "updated" };
  }
  const rows = await queryRowsAdmin<{ id: string }>(
    `insert into contract_tranches (
       legal_external_id, contract_id, company_id, sponsor_or_customer_id,
       tranche_number, tranche_label, tranche_percentage, tranche_amount,
       trigger_type, trigger_date, trigger_offset_days, notes
     )
     values ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric,
             $9::tranche_trigger_type, $10::date, $11, $12)
     returning id::text`,
    [
      input.legalExternalId,
      input.contractId,
      input.companyId,
      input.sponsorOrCustomerId,
      input.trancheNumber,
      input.trancheLabel,
      input.tranchePercentage,
      input.trancheAmount,
      input.triggerType,
      input.triggerDate,
      input.triggerOffsetDays,
      input.notes,
    ]
  );
  return { id: rows[0].id, action: "inserted" };
}

export type UpsertCapTableEntryByExternalIdInput = {
  legalExternalId: string;
  companyId: string;
  holderName: string;
  holderType: string;
  shareClass: string;
  sharesHeld: number;
  exercisePrice: number;
  vestingStartDate: string | null;
  vestingEndDate: string | null;
  vestingCliffMonths: number | null;
  vestingTotalMonths: number | null;
  sharesVested: number;
  agreementReference: string | null;
  notes: string | null;
};

export async function upsertCapTableEntryByExternalId(
  input: UpsertCapTableEntryByExternalIdInput
): Promise<{ id: string; action: "inserted" | "updated" }> {
  const existing = await queryRowsAdmin<{ id: string }>(
    `select id::text from cap_table_entries where legal_external_id = $1 limit 1`,
    [input.legalExternalId]
  );
  if (existing[0]) {
    await executeAdmin(
      `update cap_table_entries set
         holder_name = $2,
         holder_type = $3,
         share_class = $4::share_class,
         shares_held = $5,
         exercise_price = $6::numeric,
         vesting_start_date = $7::date,
         vesting_end_date = $8::date,
         vesting_cliff_months = $9,
         vesting_total_months = $10,
         shares_vested = $11,
         agreement_reference = $12,
         notes = $13,
         updated_at = now()
       where id = $1`,
      [
        existing[0].id,
        input.holderName,
        input.holderType,
        input.shareClass,
        input.sharesHeld,
        input.exercisePrice,
        input.vestingStartDate,
        input.vestingEndDate,
        input.vestingCliffMonths,
        input.vestingTotalMonths,
        input.sharesVested,
        input.agreementReference,
        input.notes,
      ]
    );
    return { id: existing[0].id, action: "updated" };
  }
  const rows = await queryRowsAdmin<{ id: string }>(
    `insert into cap_table_entries (
       legal_external_id, company_id, holder_name, holder_type, share_class,
       shares_held, exercise_price,
       vesting_start_date, vesting_end_date,
       vesting_cliff_months, vesting_total_months, shares_vested,
       agreement_reference, notes
     )
     values ($1, $2, $3, $4, $5::share_class, $6, $7::numeric,
             $8::date, $9::date, $10, $11, $12, $13, $14)
     returning id::text`,
    [
      input.legalExternalId,
      input.companyId,
      input.holderName,
      input.holderType,
      input.shareClass,
      input.sharesHeld,
      input.exercisePrice,
      input.vestingStartDate,
      input.vestingEndDate,
      input.vestingCliffMonths,
      input.vestingTotalMonths,
      input.sharesVested,
      input.agreementReference,
      input.notes,
    ]
  );
  return { id: rows[0].id, action: "inserted" };
}

// ──────────────────────────────────────────────────────────────
// Resolvers — natural keys Legal can send instead of our UUIDs
// ──────────────────────────────────────────────────────────────

export async function resolveCompanyByCode(code: string): Promise<string | null> {
  if (getBackend() !== "database") return null;
  const rows = await queryRowsAdmin<{ id: string }>(
    `select id::text from companies where code = $1::company_code limit 1`,
    [code]
  );
  return rows[0]?.id ?? null;
}

export async function resolveContractByExternalRef(
  companyId: string,
  contractName: string
): Promise<{ id: string; sponsorOrCustomerId: string } | null> {
  if (getBackend() !== "database") return null;
  const rows = await queryRowsAdmin<{
    id: string;
    sponsor_or_customer_id: string;
  }>(
    `select id::text, sponsor_or_customer_id::text
     from contracts
     where company_id = $1 and contract_name = $2
     limit 1`,
    [companyId, contractName]
  );
  return rows[0]
    ? { id: rows[0].id, sponsorOrCustomerId: rows[0].sponsor_or_customer_id }
    : null;
}
