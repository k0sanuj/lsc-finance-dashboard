create type invoice_intake_status as enum (
  'draft',
  'submitted',
  'in_review',
  'approved',
  'rejected',
  'posted'
);

create table if not exists invoice_intakes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  race_event_id uuid references race_events(id) on delete set null,
  submitted_by_user_id uuid not null references app_users(id) on delete restrict,
  reviewed_by_user_id uuid references app_users(id) on delete set null,
  source_document_id uuid references source_documents(id) on delete set null,
  intake_status invoice_intake_status not null default 'draft',
  vendor_name text not null,
  invoice_number text,
  due_date date,
  currency_code text not null default 'USD',
  total_amount numeric(14,2) not null default 0,
  category_hint text,
  operator_note text,
  review_note text,
  canonical_invoice_id uuid references invoices(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoice_intakes_status on invoice_intakes(intake_status, created_at desc);
create index if not exists idx_invoice_intakes_company on invoice_intakes(company_id, created_at desc);
