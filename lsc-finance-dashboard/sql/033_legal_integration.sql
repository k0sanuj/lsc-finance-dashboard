-- 033_legal_integration.sql
-- Receive-side of the Legal -> Finance integration.
--
-- Legal platform pushes events to POST /api/legal/webhook. Events we
-- currently understand:
--   tranche.created, tranche.updated
--   share_grant.created, share_grant.updated
--
-- The integration is deliberately push-only for now: Finance doesn't
-- pull from Legal. A Legal platform creates a tranche, fires a signed
-- webhook, we ingest + audit.

-- ──────────────────────────────────────────────────────────────
-- legal_api_keys: HMAC shared secrets. Prefix is stored for display;
-- the full secret is stored hashed (scrypt) so we can verify but not
-- recover the key from the DB.
-- ──────────────────────────────────────────────────────────────
create table if not exists legal_api_keys (
  id uuid primary key default gen_random_uuid(),
  -- Short opaque identifier shown in the Authorization header. Server uses
  -- this to look up the secret + compute HMAC independently; the secret
  -- itself never crosses the wire.
  key_prefix text not null unique,
  -- The full secret, AES-256-GCM encrypted with LEGAL_API_KEY_ENCRYPTION_KEY.
  -- We need the plaintext to recompute HMAC, so a scrypt hash won't work.
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_auth_tag text not null,
  label text not null,
  created_by_user_id uuid references app_users(id),
  last_used_at timestamptz,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references app_users(id),
  revocation_reason text
);

create index if not exists idx_legal_api_keys_active
  on legal_api_keys(key_prefix) where revoked_at is null;

-- ──────────────────────────────────────────────────────────────
-- legal_webhook_events: idempotent inbound log. Every POST to
-- /api/legal/webhook writes one row, whether it succeeded or not.
-- ──────────────────────────────────────────────────────────────
create table if not exists legal_webhook_events (
  id uuid primary key default gen_random_uuid(),

  -- Authenticity
  api_key_id uuid references legal_api_keys(id) on delete set null,
  signature_verified boolean not null,
  request_ts_header text,
  request_ts_skew_seconds integer,

  -- Event envelope (mirrors what the spec defines)
  -- Legal's stable id for this event — we dedupe on it so retries are safe.
  external_event_id text unique,
  event_type text not null,     -- e.g. 'tranche.created'
  occurred_at_iso text,

  -- Processing outcome
  status text not null check (status in ('accepted', 'processed', 'failed', 'rejected', 'duplicate')),
  target_entity_type text,
  target_entity_id uuid,
  error_message text,

  -- Raw request context (debug)
  raw_payload jsonb,
  response_body jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_legal_webhook_events_type
  on legal_webhook_events(event_type, created_at desc);
create index if not exists idx_legal_webhook_events_status
  on legal_webhook_events(status, created_at desc);

-- ──────────────────────────────────────────────────────────────
-- External-id columns so Legal events can find + update finance rows
-- without needing our internal UUIDs. Unique-when-not-null so the
-- same Legal id can't map to two finance rows.
-- ──────────────────────────────────────────────────────────────
alter table contract_tranches
  add column if not exists legal_external_id text;
create unique index if not exists idx_contract_tranches_legal_external_id
  on contract_tranches(legal_external_id) where legal_external_id is not null;

alter table cap_table_entries
  add column if not exists legal_external_id text;
create unique index if not exists idx_cap_table_entries_legal_external_id
  on cap_table_entries(legal_external_id) where legal_external_id is not null;
