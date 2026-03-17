create table if not exists document_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents(id) on delete cascade,
  company_id uuid not null references companies(id),
  analyzer_type text not null,
  analysis_status text not null default 'pending_review',
  source_file_name text,
  source_file_type text,
  detected_document_type text,
  extracted_summary jsonb not null default '{}'::jsonb,
  overall_confidence numeric(5,2),
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_extracted_fields (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references document_analysis_runs(id) on delete cascade,
  field_key text not null,
  field_label text not null,
  extracted_value jsonb not null default 'null'::jsonb,
  normalized_value text,
  confidence numeric(5,2),
  approval_status text not null default 'pending',
  canonical_target_table text,
  canonical_target_column text,
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id, field_key)
);

create table if not exists document_posting_events (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references document_analysis_runs(id) on delete cascade,
  posting_status text not null default 'pending',
  canonical_target_table text not null,
  canonical_target_id uuid,
  posting_summary text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_document_analysis_runs_company_status
  on document_analysis_runs(company_id, analysis_status);

create index if not exists idx_document_extracted_fields_run_status
  on document_extracted_fields(analysis_run_id, approval_status);

create index if not exists idx_document_posting_events_run_status
  on document_posting_events(analysis_run_id, posting_status);
