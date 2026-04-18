-- 028_audit_log.sql
-- Canonical audit trail for every mutation in the finance platform.
-- Written by skills/shared/audit-log.ts via the cascade engine.

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  trigger text not null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  cascade_result jsonb,
  performed_by text,
  agent_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_entity on audit_log (entity_type, entity_id, created_at desc);
create index if not exists idx_audit_log_trigger on audit_log (trigger, created_at desc);
create index if not exists idx_audit_log_performed_by on audit_log (performed_by, created_at desc);
create index if not exists idx_audit_log_created_at on audit_log (created_at desc);
