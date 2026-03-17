create extension if not exists "pgcrypto";

create type company_code as enum ('LSC', 'TBR', 'FSP');
create type invoice_direction as enum ('receivable', 'payable');
create type invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void');
create type payment_direction as enum ('inflow', 'outflow');
create type payment_status as enum ('planned', 'scheduled', 'settled', 'failed', 'cancelled');
create type expense_status as enum ('submitted', 'approved', 'paid', 'rejected');
create type contract_status as enum ('draft', 'active', 'completed', 'cancelled');
create type revenue_type as enum ('sponsorship', 'prize_money', 'subscription', 'other');
create type source_document_type as enum ('sheet_row', 'invoice_file', 'expense_report', 'manual_upload');
create type agent_status as enum ('active', 'idle', 'blocked');
create type agent_tier as enum ('core', 'specialist', 'subagent');
create type workflow_status as enum ('pending', 'active', 'blocked', 'complete');

create table companies (
  id uuid primary key default gen_random_uuid(),
  code company_code not null unique,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sponsors_or_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  name text not null,
  normalized_name text not null,
  counterparty_type text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, normalized_name)
);

create table owners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  name text not null,
  email text,
  role text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table race_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  name text not null,
  location text,
  event_start_date date,
  event_end_date date,
  season_year integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table cost_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  code text not null,
  name text not null,
  parent_category_id uuid references cost_categories(id),
  category_scope text not null default 'shared',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  sponsor_or_customer_id uuid not null references sponsors_or_customers(id),
  owner_id uuid references owners(id),
  contract_name text not null,
  contract_status contract_status not null default 'draft',
  contract_value numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  start_date date,
  end_date date,
  is_recurring boolean not null default false,
  billing_frequency text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table source_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  document_type source_document_type not null,
  source_system text not null,
  source_identifier text not null,
  source_name text,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_identifier)
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  source_system text not null,
  source_name text not null,
  imported_at timestamptz not null default now(),
  status text not null default 'completed',
  metadata jsonb not null default '{}'::jsonb
);

create table raw_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references import_batches(id) on delete cascade,
  source_document_id uuid references source_documents(id),
  source_row_key text not null,
  payload jsonb not null,
  canonical_target_table text,
  canonical_target_id uuid,
  created_at timestamptz not null default now(),
  unique (import_batch_id, source_row_key)
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  contract_id uuid references contracts(id),
  sponsor_or_customer_id uuid references sponsors_or_customers(id),
  owner_id uuid references owners(id),
  race_event_id uuid references race_events(id),
  source_document_id uuid references source_documents(id),
  direction invoice_direction not null,
  invoice_number text,
  invoice_status invoice_status not null default 'draft',
  issue_date date,
  due_date date,
  currency_code text not null default 'USD',
  subtotal_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  invoice_id uuid references invoices(id),
  source_document_id uuid references source_documents(id),
  direction payment_direction not null,
  payment_status payment_status not null default 'planned',
  payment_date date,
  due_date date,
  currency_code text not null default 'USD',
  amount numeric(14,2) not null default 0,
  payment_method text,
  reference_number text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  invoice_id uuid references invoices(id),
  payment_id uuid references payments(id),
  race_event_id uuid references race_events(id),
  cost_category_id uuid references cost_categories(id),
  owner_id uuid references owners(id),
  source_document_id uuid references source_documents(id),
  vendor_name text,
  expense_status expense_status not null default 'submitted',
  expense_date date,
  currency_code text not null default 'USD',
  amount numeric(14,2) not null default 0,
  description text,
  is_reimbursable boolean not null default false,
  submitted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table revenue_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  contract_id uuid references contracts(id),
  invoice_id uuid references invoices(id),
  sponsor_or_customer_id uuid references sponsors_or_customers(id),
  owner_id uuid references owners(id),
  race_event_id uuid references race_events(id),
  source_document_id uuid references source_documents(id),
  revenue_type revenue_type not null,
  recognition_date date not null,
  currency_code text not null default 'USD',
  amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table commercial_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  owner_id uuid references owners(id),
  target_period_start date not null,
  target_period_end date not null,
  target_type text not null,
  target_label text not null,
  target_value numeric(14,2) not null default 0,
  target_count integer,
  currency_code text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_nodes (
  id text primary key,
  name text not null,
  role text not null,
  tier agent_tier not null,
  parent_agent_id text references agent_nodes(id),
  status agent_status not null default 'idle',
  current_task text,
  position_x integer not null,
  position_y integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_edges (
  id text primary key,
  from_agent_id text not null references agent_nodes(id),
  to_agent_id text not null references agent_nodes(id),
  interaction_type text not null,
  directionality text not null default 'directed',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table agent_tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references agent_nodes(id),
  task_title text not null,
  task_status text not null,
  task_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table agent_handoffs (
  id uuid primary key default gen_random_uuid(),
  from_agent_id text not null references agent_nodes(id),
  to_agent_id text not null references agent_nodes(id),
  handoff_type text not null,
  task_summary text not null,
  handoff_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table workflow_nodes (
  id text primary key,
  name text not null,
  category text not null,
  sequence_order integer not null,
  status workflow_status not null default 'pending',
  owner_agent_id text references agent_nodes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workflow_edges (
  id text primary key,
  from_node_id text not null references workflow_nodes(id),
  to_node_id text not null references workflow_nodes(id),
  edge_type text not null,
  condition_label text,
  created_at timestamptz not null default now()
);

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_name text not null,
  run_status text not null,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table workflow_stage_events (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  workflow_node_id text not null references workflow_nodes(id),
  event_status workflow_status not null,
  event_message text,
  created_at timestamptz not null default now()
);

create index idx_contracts_company_id on contracts(company_id);
create index idx_race_events_company_id on race_events(company_id);
create index idx_invoices_company_id on invoices(company_id);
create index idx_invoices_due_date on invoices(due_date);
create index idx_payments_company_id on payments(company_id);
create index idx_payments_due_date on payments(due_date);
create index idx_expenses_company_id on expenses(company_id);
create index idx_expenses_race_event_id on expenses(race_event_id);
create index idx_revenue_records_company_id on revenue_records(company_id);
create index idx_revenue_records_recognition_date on revenue_records(recognition_date);
create index idx_commercial_targets_company_id on commercial_targets(company_id);
create index idx_raw_import_rows_batch_id on raw_import_rows(import_batch_id);
create index idx_agent_tasks_agent_id on agent_tasks(agent_id);
create index idx_workflow_stage_events_run_id on workflow_stage_events(workflow_run_id);
