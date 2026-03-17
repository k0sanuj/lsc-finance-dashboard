create table if not exists document_intake_events (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents(id) on delete cascade,
  analysis_run_id uuid references document_analysis_runs(id) on delete set null,
  company_id uuid not null references companies(id),
  app_user_id uuid not null references app_users(id),
  source_file_name text,
  workflow_context text,
  intake_status text not null default 'uploaded',
  intake_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_intake_events_user_created
  on document_intake_events(app_user_id, created_at desc);

create index if not exists idx_document_intake_events_run_created
  on document_intake_events(analysis_run_id, created_at desc);
