import "server-only";

import { queryRows, queryRowsAdmin, executeAdmin } from "../query";
import { getBackend } from "./shared";

// ──────────────────────────────────────────────────────────────
// qb_connections
// ──────────────────────────────────────────────────────────────

export type QbConnectionRow = {
  id: string;
  realmId: string;
  companyName: string | null;
  environment: "sandbox" | "production";
  accessTokenCiphertext: string;
  accessTokenIv: string;
  accessTokenAuthTag: string;
  accessTokenExpiresAt: string;
  refreshTokenCiphertext: string;
  refreshTokenIv: string;
  refreshTokenAuthTag: string;
  refreshTokenExpiresAt: string;
  connectedByUserId: string | null;
  connectedAt: string;
  lastRefreshedAt: string | null;
  lastSyncedAt: string | null;
  appId: string | null;
};

type QbConnectionSource = {
  id: string;
  realm_id: string;
  company_name: string | null;
  environment: "sandbox" | "production";
  access_token_ciphertext: string;
  access_token_iv: string;
  access_token_auth_tag: string;
  access_token_expires_at: string;
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  refresh_token_auth_tag: string;
  refresh_token_expires_at: string;
  connected_by_user_id: string | null;
  connected_at: string;
  last_refreshed_at: string | null;
  last_synced_at: string | null;
  app_id: string | null;
};

function rowToConnection(row: QbConnectionSource): QbConnectionRow {
  return {
    id: row.id,
    realmId: row.realm_id,
    companyName: row.company_name,
    environment: row.environment,
    accessTokenCiphertext: row.access_token_ciphertext,
    accessTokenIv: row.access_token_iv,
    accessTokenAuthTag: row.access_token_auth_tag,
    accessTokenExpiresAt: row.access_token_expires_at,
    refreshTokenCiphertext: row.refresh_token_ciphertext,
    refreshTokenIv: row.refresh_token_iv,
    refreshTokenAuthTag: row.refresh_token_auth_tag,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    connectedByUserId: row.connected_by_user_id,
    connectedAt: row.connected_at,
    lastRefreshedAt: row.last_refreshed_at,
    lastSyncedAt: row.last_synced_at,
    appId: row.app_id,
  };
}

export async function getActiveQbConnections(): Promise<QbConnectionRow[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRowsAdmin<QbConnectionSource>(
    `select id, realm_id, company_name, environment,
            access_token_ciphertext, access_token_iv, access_token_auth_tag,
            access_token_expires_at::text,
            refresh_token_ciphertext, refresh_token_iv, refresh_token_auth_tag,
            refresh_token_expires_at::text,
            connected_by_user_id::text,
            connected_at::text,
            last_refreshed_at::text,
            last_synced_at::text,
            app_id
     from qb_connections
     where deleted_at is null
     order by connected_at desc`
  );
  return rows.map(rowToConnection);
}

export async function getQbConnectionByRealm(
  realmId: string
): Promise<QbConnectionRow | null> {
  if (getBackend() !== "database") return null;
  const rows = await queryRowsAdmin<QbConnectionSource>(
    `select id, realm_id, company_name, environment,
            access_token_ciphertext, access_token_iv, access_token_auth_tag,
            access_token_expires_at::text,
            refresh_token_ciphertext, refresh_token_iv, refresh_token_auth_tag,
            refresh_token_expires_at::text,
            connected_by_user_id::text,
            connected_at::text,
            last_refreshed_at::text,
            last_synced_at::text,
            app_id
     from qb_connections
     where realm_id = $1 and deleted_at is null
     limit 1`,
    [realmId]
  );
  return rows[0] ? rowToConnection(rows[0]) : null;
}

export type UpsertQbConnectionInput = {
  realmId: string;
  environment: "sandbox" | "production";
  companyName: string | null;
  appId: string | null;
  connectedByUserId: string | null;
  accessToken: {
    ciphertext: string;
    iv: string;
    authTag: string;
    expiresAtIso: string;
  };
  refreshToken: {
    ciphertext: string;
    iv: string;
    authTag: string;
    expiresAtIso: string;
  };
};

export async function upsertQbConnection(
  input: UpsertQbConnectionInput
): Promise<string> {
  const rows = await queryRowsAdmin<{ id: string }>(
    `insert into qb_connections (
       realm_id, company_name, environment, app_id, connected_by_user_id,
       access_token_ciphertext, access_token_iv, access_token_auth_tag,
       access_token_expires_at,
       refresh_token_ciphertext, refresh_token_iv, refresh_token_auth_tag,
       refresh_token_expires_at,
       connected_at
     )
     values (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9::timestamptz,
       $10, $11, $12, $13::timestamptz,
       now()
     )
     on conflict (realm_id) do update set
       company_name = excluded.company_name,
       environment = excluded.environment,
       app_id = excluded.app_id,
       connected_by_user_id = excluded.connected_by_user_id,
       access_token_ciphertext = excluded.access_token_ciphertext,
       access_token_iv = excluded.access_token_iv,
       access_token_auth_tag = excluded.access_token_auth_tag,
       access_token_expires_at = excluded.access_token_expires_at,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       refresh_token_iv = excluded.refresh_token_iv,
       refresh_token_auth_tag = excluded.refresh_token_auth_tag,
       refresh_token_expires_at = excluded.refresh_token_expires_at,
       last_refreshed_at = now(),
       deleted_at = null,
       updated_at = now()
     returning id`,
    [
      input.realmId,
      input.companyName,
      input.environment,
      input.appId,
      input.connectedByUserId,
      input.accessToken.ciphertext,
      input.accessToken.iv,
      input.accessToken.authTag,
      input.accessToken.expiresAtIso,
      input.refreshToken.ciphertext,
      input.refreshToken.iv,
      input.refreshToken.authTag,
      input.refreshToken.expiresAtIso,
    ]
  );
  return rows[0].id;
}

export async function markQbConnectionSynced(connectionId: string): Promise<void> {
  await executeAdmin(
    `update qb_connections set last_synced_at = now(), updated_at = now() where id = $1`,
    [connectionId]
  );
}

export async function disconnectQbConnection(connectionId: string): Promise<void> {
  await executeAdmin(
    `update qb_connections set deleted_at = now(), updated_at = now() where id = $1`,
    [connectionId]
  );
}

// ──────────────────────────────────────────────────────────────
// qb_accounts (Chart of Accounts mirror)
// ──────────────────────────────────────────────────────────────

export type QbAccountRow = {
  id: string;
  connectionId: string;
  qbAccountId: string;
  qbSyncToken: string | null;
  accountName: string;
  accountType: string;
  accountSubType: string | null;
  accountNumber: string | null;
  classification: string | null;
  fullyQualifiedName: string | null;
  description: string | null;
  currentBalance: number | null;
  currencyCode: string | null;
  isActive: boolean;
  parentQbAccountId: string | null;
};

type QbAccountSource = {
  id: string;
  connection_id: string;
  qb_account_id: string;
  qb_sync_token: string | null;
  account_name: string;
  account_type: string;
  account_sub_type: string | null;
  account_number: string | null;
  classification: string | null;
  fully_qualified_name: string | null;
  description: string | null;
  current_balance: string | null;
  currency_code: string | null;
  is_active: boolean;
  parent_qb_account_id: string | null;
};

function rowToAccount(row: QbAccountSource): QbAccountRow {
  return {
    id: row.id,
    connectionId: row.connection_id,
    qbAccountId: row.qb_account_id,
    qbSyncToken: row.qb_sync_token,
    accountName: row.account_name,
    accountType: row.account_type,
    accountSubType: row.account_sub_type,
    accountNumber: row.account_number,
    classification: row.classification,
    fullyQualifiedName: row.fully_qualified_name,
    description: row.description,
    currentBalance: row.current_balance === null ? null : Number(row.current_balance),
    currencyCode: row.currency_code,
    isActive: row.is_active,
    parentQbAccountId: row.parent_qb_account_id,
  };
}

export async function getQbAccounts(connectionId: string): Promise<QbAccountRow[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRows<QbAccountSource>(
    `select id, connection_id, qb_account_id, qb_sync_token,
            account_name, account_type, account_sub_type, account_number,
            classification, fully_qualified_name, description,
            current_balance::text as current_balance,
            currency_code, is_active, parent_qb_account_id
     from qb_accounts
     where connection_id = $1
     order by classification nulls last, account_number nulls last, account_name`,
    [connectionId]
  );
  return rows.map(rowToAccount);
}

export type UpsertQbAccountInput = {
  connectionId: string;
  qbAccountId: string;
  qbSyncToken: string | null;
  accountName: string;
  accountType: string;
  accountSubType: string | null;
  accountNumber: string | null;
  classification: string | null;
  fullyQualifiedName: string | null;
  description: string | null;
  currentBalance: number | null;
  currencyCode: string | null;
  isActive: boolean;
  parentQbAccountId: string | null;
};

export async function upsertQbAccounts(
  accounts: UpsertQbAccountInput[]
): Promise<number> {
  if (accounts.length === 0) return 0;
  let upserted = 0;
  for (const a of accounts) {
    await executeAdmin(
      `insert into qb_accounts (
         connection_id, qb_account_id, qb_sync_token,
         account_name, account_type, account_sub_type, account_number,
         classification, fully_qualified_name, description,
         current_balance, currency_code, is_active, parent_qb_account_id
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (connection_id, qb_account_id) do update set
         qb_sync_token = excluded.qb_sync_token,
         account_name = excluded.account_name,
         account_type = excluded.account_type,
         account_sub_type = excluded.account_sub_type,
         account_number = excluded.account_number,
         classification = excluded.classification,
         fully_qualified_name = excluded.fully_qualified_name,
         description = excluded.description,
         current_balance = excluded.current_balance,
         currency_code = excluded.currency_code,
         is_active = excluded.is_active,
         parent_qb_account_id = excluded.parent_qb_account_id,
         updated_at = now()`,
      [
        a.connectionId,
        a.qbAccountId,
        a.qbSyncToken,
        a.accountName,
        a.accountType,
        a.accountSubType,
        a.accountNumber,
        a.classification,
        a.fullyQualifiedName,
        a.description,
        a.currentBalance,
        a.currencyCode,
        a.isActive,
        a.parentQbAccountId,
      ]
    );
    upserted += 1;
  }
  return upserted;
}

// ──────────────────────────────────────────────────────────────
// qb_account_mappings (cost_category -> QBO account)
// ──────────────────────────────────────────────────────────────

export type QbAccountMappingRow = {
  id: string;
  connectionId: string;
  costCategoryId: string;
  costCategoryCode: string;
  costCategoryName: string;
  categoryScope: string;
  debitQbAccountId: string;
  debitAccountName: string | null;
  creditQbAccountId: string | null;
  creditAccountName: string | null;
  notes: string | null;
};

/**
 * List every cost_category with its current mapping (if any) for a given
 * QB connection. Returns one row per cost_category — missing mappings
 * come through with null QBO fields so the UI can show "not mapped".
 */
export async function getQbAccountMappings(
  connectionId: string
): Promise<QbAccountMappingRow[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRowsAdmin<{
    mapping_id: string | null;
    cost_category_id: string;
    cost_category_code: string;
    cost_category_name: string;
    category_scope: string;
    debit_qb_account_id: string | null;
    debit_account_name: string | null;
    credit_qb_account_id: string | null;
    credit_account_name: string | null;
    notes: string | null;
  }>(
    `select
       m.id::text as mapping_id,
       cc.id::text as cost_category_id,
       cc.code as cost_category_code,
       cc.name as cost_category_name,
       cc.category_scope,
       m.debit_qb_account_id,
       d.account_name as debit_account_name,
       m.credit_qb_account_id,
       cr.account_name as credit_account_name,
       m.notes
     from cost_categories cc
     left join qb_account_mappings m
       on m.cost_category_id = cc.id and m.connection_id = $1
     left join qb_accounts d
       on d.connection_id = $1 and d.qb_account_id = m.debit_qb_account_id
     left join qb_accounts cr
       on cr.connection_id = $1 and cr.qb_account_id = m.credit_qb_account_id
     order by cc.category_scope, cc.name`,
    [connectionId]
  );
  return rows.map((r) => ({
    id: r.mapping_id ?? "",
    connectionId,
    costCategoryId: r.cost_category_id,
    costCategoryCode: r.cost_category_code,
    costCategoryName: r.cost_category_name,
    categoryScope: r.category_scope,
    debitQbAccountId: r.debit_qb_account_id ?? "",
    debitAccountName: r.debit_account_name,
    creditQbAccountId: r.credit_qb_account_id,
    creditAccountName: r.credit_account_name,
    notes: r.notes,
  }));
}

export type UpsertQbAccountMappingInput = {
  connectionId: string;
  costCategoryId: string;
  debitQbAccountId: string;
  creditQbAccountId: string | null;
  notes: string | null;
  createdByUserId: string | null;
};

export async function upsertQbAccountMapping(
  input: UpsertQbAccountMappingInput
): Promise<void> {
  await executeAdmin(
    `insert into qb_account_mappings (
       connection_id, cost_category_id,
       debit_qb_account_id, credit_qb_account_id, notes, created_by_user_id
     )
     values ($1, $2, $3, $4, $5, $6)
     on conflict (connection_id, cost_category_id) do update set
       debit_qb_account_id = excluded.debit_qb_account_id,
       credit_qb_account_id = excluded.credit_qb_account_id,
       notes = excluded.notes,
       updated_at = now()`,
    [
      input.connectionId,
      input.costCategoryId,
      input.debitQbAccountId,
      input.creditQbAccountId,
      input.notes,
      input.createdByUserId,
    ]
  );
}

export async function deleteQbAccountMapping(
  connectionId: string,
  costCategoryId: string
): Promise<void> {
  await executeAdmin(
    `delete from qb_account_mappings
     where connection_id = $1 and cost_category_id = $2`,
    [connectionId, costCategoryId]
  );
}

/**
 * Fetch the mapping for one cost category. Used at JE-posting time.
 * Returns null if the category has not been mapped yet.
 */
export async function getQbMappingForCategory(
  connectionId: string,
  costCategoryId: string
): Promise<{
  debitQbAccountId: string;
  creditQbAccountId: string | null;
} | null> {
  if (getBackend() !== "database") return null;
  const rows = await queryRowsAdmin<{
    debit_qb_account_id: string;
    credit_qb_account_id: string | null;
  }>(
    `select debit_qb_account_id, credit_qb_account_id
     from qb_account_mappings
     where connection_id = $1 and cost_category_id = $2
     limit 1`,
    [connectionId, costCategoryId]
  );
  const r = rows[0];
  return r
    ? {
        debitQbAccountId: r.debit_qb_account_id,
        creditQbAccountId: r.credit_qb_account_id,
      }
    : null;
}

// ──────────────────────────────────────────────────────────────
// qb_journal_entries (post audit log)
// ──────────────────────────────────────────────────────────────

export type QbJournalEntryLogRow = {
  id: string;
  connectionId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  initiatedByUserId: string | null;
  qbJournalEntryId: string | null;
  qbSyncToken: string | null;
  totalAmountUsd: number;
  txnDate: string | null;
  status: "posted" | "failed" | "skipped";
  errorMessage: string | null;
  lineItems: unknown;
  createdAt: string;
};

export async function getQbJournalEntriesForSource(
  sourceEntityType: string,
  sourceEntityId: string
): Promise<QbJournalEntryLogRow[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRowsAdmin<{
    id: string;
    connection_id: string;
    source_entity_type: string;
    source_entity_id: string;
    initiated_by_user_id: string | null;
    qb_journal_entry_id: string | null;
    qb_sync_token: string | null;
    total_amount_usd: string;
    txn_date: string | null;
    status: "posted" | "failed" | "skipped";
    error_message: string | null;
    line_items: unknown;
    created_at: string;
  }>(
    `select id::text, connection_id::text,
            source_entity_type, source_entity_id::text,
            initiated_by_user_id::text,
            qb_journal_entry_id, qb_sync_token,
            total_amount_usd::text,
            txn_date::text,
            status, error_message,
            line_items, created_at::text
     from qb_journal_entries
     where source_entity_type = $1 and source_entity_id = $2
     order by created_at desc`,
    [sourceEntityType, sourceEntityId]
  );
  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    sourceEntityType: r.source_entity_type,
    sourceEntityId: r.source_entity_id,
    initiatedByUserId: r.initiated_by_user_id,
    qbJournalEntryId: r.qb_journal_entry_id,
    qbSyncToken: r.qb_sync_token,
    totalAmountUsd: Number(r.total_amount_usd) || 0,
    txnDate: r.txn_date,
    status: r.status,
    errorMessage: r.error_message,
    lineItems: r.line_items,
    createdAt: r.created_at,
  }));
}

export type InsertQbJournalEntryLogInput = {
  connectionId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  initiatedByUserId: string | null;
  status: "posted" | "failed" | "skipped";
  qbJournalEntryId: string | null;
  qbSyncToken: string | null;
  totalAmountUsd: number;
  txnDate: string | null;
  errorMessage: string | null;
  requestPayload: unknown;
  responsePayload: unknown;
  lineItems: unknown;
};

export async function insertQbJournalEntryLog(
  input: InsertQbJournalEntryLogInput
): Promise<string> {
  const rows = await queryRowsAdmin<{ id: string }>(
    `insert into qb_journal_entries (
       connection_id, source_entity_type, source_entity_id, initiated_by_user_id,
       qb_journal_entry_id, qb_sync_token, total_amount_usd, txn_date,
       status, error_message,
       request_payload, response_payload, line_items
     )
     values ($1, $2, $3, $4,
             $5, $6, $7::numeric, $8::date,
             $9, $10,
             $11::jsonb, $12::jsonb, $13::jsonb)
     returning id`,
    [
      input.connectionId,
      input.sourceEntityType,
      input.sourceEntityId,
      input.initiatedByUserId,
      input.qbJournalEntryId,
      input.qbSyncToken,
      input.totalAmountUsd,
      input.txnDate,
      input.status,
      input.errorMessage,
      JSON.stringify(input.requestPayload ?? null),
      JSON.stringify(input.responsePayload ?? null),
      JSON.stringify(input.lineItems ?? []),
    ]
  );
  return rows[0].id;
}
