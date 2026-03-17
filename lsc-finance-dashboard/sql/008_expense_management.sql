create type expense_submission_status as enum (
  'draft',
  'submitted',
  'in_review',
  'approved',
  'rejected',
  'posted'
);

create type expense_split_method as enum ('solo', 'equal', 'custom');

create table if not exists expense_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  race_event_id uuid references race_events(id) on delete set null,
  submitted_by_user_id uuid not null references app_users(id) on delete restrict,
  reviewed_by_user_id uuid references app_users(id) on delete set null,
  submission_status expense_submission_status not null default 'draft',
  submission_title text not null,
  operator_note text,
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expense_submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references expense_submissions(id) on delete cascade,
  source_document_id uuid references source_documents(id) on delete set null,
  cost_category_id uuid references cost_categories(id) on delete set null,
  team_id uuid references app_teams(id) on delete set null,
  linked_expense_id uuid references expenses(id) on delete set null,
  merchant_name text,
  expense_date date,
  currency_code text not null default 'USD',
  amount numeric(14,2) not null default 0,
  description text,
  split_method expense_split_method not null default 'solo',
  split_count integer not null default 1,
  ai_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expense_item_splits (
  id uuid primary key default gen_random_uuid(),
  expense_submission_item_id uuid not null references expense_submission_items(id) on delete cascade,
  app_user_id uuid references app_users(id) on delete set null,
  split_label text,
  split_percentage numeric(7,4) not null default 0,
  split_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_submissions_status on expense_submissions(submission_status, created_at desc);
create index if not exists idx_expense_submissions_company on expense_submissions(company_id, created_at desc);
create index if not exists idx_expense_submission_items_submission on expense_submission_items(submission_id);
create index if not exists idx_expense_item_splits_item on expense_item_splits(expense_submission_item_id);
