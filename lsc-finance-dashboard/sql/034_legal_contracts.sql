-- 034_legal_contracts.sql
-- Phase L1.5: contracts originate in Legal and sync into Finance via webhook.
-- Adds the same legal_external_id pattern we already use on contract_tranches
-- and cap_table_entries (migration 033) so contract.created/updated events
-- can upsert without needing Finance UUIDs.

alter table contracts
  add column if not exists legal_external_id text;

create unique index if not exists idx_contracts_legal_external_id
  on contracts(legal_external_id) where legal_external_id is not null;
