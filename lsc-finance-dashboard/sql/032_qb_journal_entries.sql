-- 032_qb_journal_entries.sql
-- Phase 3 of the QuickBooks Online integration:
--   - qb_account_mappings: internal cost_category_id -> QBO account (per connection)
--   - qb_journal_entries:  audit log of every JE post attempt (success + failure)
--
-- Both tables are scoped to a qb_connection so the integration stays
-- multi-realm from day one.

-- ──────────────────────────────────────────────────────────────
-- qb_account_mappings — per-connection, per-cost-category mapping
-- ──────────────────────────────────────────────────────────────
create table if not exists qb_account_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references qb_connections(id) on delete cascade,
  cost_category_id uuid not null references cost_categories(id) on delete cascade,

  -- Debit side — where the expense hits (typically an Expense-classification account)
  debit_qb_account_id text not null,

  -- Credit side — the cash / accrual account the expense draws from.
  -- Optional: when null, we fall back to the connection's default
  -- credit account (configured separately per realm — future work).
  credit_qb_account_id text,

  notes text,

  created_by_user_id uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (connection_id, cost_category_id)
);

create index if not exists idx_qb_account_mappings_connection
  on qb_account_mappings(connection_id);
create index if not exists idx_qb_account_mappings_category
  on qb_account_mappings(cost_category_id);

-- ──────────────────────────────────────────────────────────────
-- qb_journal_entries — full log of posting attempts
-- ──────────────────────────────────────────────────────────────
create table if not exists qb_journal_entries (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references qb_connections(id) on delete cascade,

  -- Source context
  source_entity_type text not null,        -- e.g. 'expense_submission'
  source_entity_id uuid not null,          -- submissionId
  initiated_by_user_id uuid references app_users(id),

  -- QBO response (populated on success; null on failure)
  qb_journal_entry_id text,
  qb_sync_token text,
  total_amount_usd numeric(14, 2) not null,
  txn_date date,

  -- Outcome
  status text not null check (status in ('posted', 'failed', 'skipped')),
  error_message text,

  -- Request/response payloads for debugging (JSON blobs)
  request_payload jsonb,
  response_payload jsonb,

  -- Structured line details — serialized so the UI can render without
  -- joining back to potentially-mutated source rows.
  line_items jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_qb_je_source
  on qb_journal_entries(source_entity_type, source_entity_id);
create index if not exists idx_qb_je_connection
  on qb_journal_entries(connection_id);
create index if not exists idx_qb_je_status
  on qb_journal_entries(status);
