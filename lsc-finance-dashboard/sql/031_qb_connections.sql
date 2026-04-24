-- 031_qb_connections.sql
-- QuickBooks Online integration: OAuth 2.0 token storage and
-- a local mirror of the QBO Chart of Accounts.
--
-- Tokens are AES-256-GCM encrypted at the application layer before they
-- reach the database — the DB only ever sees ciphertext. The schema
-- below stores the ciphertext, per-row IV, and auth tag separately so
-- decryption is unambiguous.

-- ──────────────────────────────────────────────────────────────
-- qb_connections: one row per authorized QBO company (realm)
-- ──────────────────────────────────────────────────────────────
create table if not exists qb_connections (
  id uuid primary key default gen_random_uuid(),
  realm_id text not null unique,
  company_name text,
  environment text not null check (environment in ('sandbox', 'production')),

  -- AES-256-GCM encrypted tokens (base64-encoded ciphertext + iv + authTag)
  access_token_ciphertext text not null,
  access_token_iv text not null,
  access_token_auth_tag text not null,
  access_token_expires_at timestamptz not null,

  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  refresh_token_auth_tag text not null,
  -- Intuit refresh tokens are valid for 100 days from issue and are
  -- rotated on every successful refresh.
  refresh_token_expires_at timestamptz not null,

  connected_by_user_id uuid references app_users(id),
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_synced_at timestamptz,

  -- Intuit app metadata (useful for support / debugging but not sensitive)
  app_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_qb_connections_realm
  on qb_connections(realm_id) where deleted_at is null;

-- ──────────────────────────────────────────────────────────────
-- qb_accounts: local mirror of Chart of Accounts, synced periodically
-- ──────────────────────────────────────────────────────────────
create table if not exists qb_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references qb_connections(id) on delete cascade,
  qb_account_id text not null,
  qb_sync_token text,

  account_name text not null,
  account_type text not null,      -- e.g. "Bank", "Accounts Receivable", "Expense"
  account_sub_type text,           -- e.g. "Checking", "Savings", "CostOfGoodsSold"
  account_number text,             -- GL code, may be null if the company doesn't use numbers
  classification text,             -- Asset / Liability / Equity / Revenue / Expense
  fully_qualified_name text,       -- includes parent path, e.g. "Expenses:Travel"
  description text,

  current_balance numeric(14, 2),
  currency_code text,
  is_active boolean not null default true,

  parent_qb_account_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (connection_id, qb_account_id)
);

create index if not exists idx_qb_accounts_connection
  on qb_accounts(connection_id);
create index if not exists idx_qb_accounts_classification
  on qb_accounts(connection_id, classification) where is_active = true;
