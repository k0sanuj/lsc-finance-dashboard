-- 035_ai_intake_drafts.sql
-- Shared AI intake review workflow:
-- Upload/type -> AI extract -> editable preview -> user approval -> canonical post.

create table if not exists ai_intake_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  source_document_id uuid references source_documents(id) on delete set null,
  submitted_by_user_id uuid references app_users(id) on delete set null,
  approved_by_user_id uuid references app_users(id) on delete set null,
  rejected_by_user_id uuid references app_users(id) on delete set null,
  discarded_by_user_id uuid references app_users(id) on delete set null,
  source_type text not null check (source_type in ('upload', 'typed_input')),
  target_kind text not null check (
    target_kind in (
      'vendor_invoice',
      'expense_receipt',
      'reimbursement_bundle',
      'sponsorship_commercial_document',
      'fsp_sport_media_kit',
      'fsp_sport_sponsorship_document',
      'xtz_payroll_vendor_invoice_support'
    )
  ),
  target_entity_type text,
  target_entity_id uuid,
  workflow_context text,
  source_name text,
  input_text text,
  status text not null default 'draft' check (
    status in (
      'draft',
      'extracting',
      'needs_review',
      'approved',
      'posted',
      'rejected',
      'discarded',
      'failed'
    )
  ),
  detected_document_type text,
  proposed_target text,
  finance_interpretation text,
  extracted_summary jsonb not null default '{}'::jsonb,
  overall_confidence numeric(5,2),
  error_message text,
  submitted_at timestamptz not null default now(),
  extracted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  discarded_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_intake_draft_fields (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references ai_intake_drafts(id) on delete cascade,
  field_key text not null,
  field_label text not null,
  extracted_value jsonb not null default 'null'::jsonb,
  preview_value jsonb not null default 'null'::jsonb,
  normalized_value text,
  confidence numeric(5,2),
  approval_status text not null default 'pending' check (
    approval_status in ('pending', 'edited', 'approved', 'rejected')
  ),
  canonical_target_table text,
  canonical_target_column text,
  reviewer_notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, field_key)
);

create table if not exists ai_intake_posting_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references ai_intake_drafts(id) on delete cascade,
  posting_status text not null default 'pending' check (
    posting_status in ('pending', 'posted', 'manual_review', 'failed')
  ),
  canonical_target_table text not null,
  canonical_target_id uuid,
  posting_summary text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_ai_intake_drafts_company_status
  on ai_intake_drafts(company_id, status, created_at desc);

create index if not exists idx_ai_intake_drafts_source_document
  on ai_intake_drafts(source_document_id);

create index if not exists idx_ai_intake_drafts_submitter
  on ai_intake_drafts(submitted_by_user_id, created_at desc);

create index if not exists idx_ai_intake_drafts_workflow
  on ai_intake_drafts(workflow_context, created_at desc);

create index if not exists idx_ai_intake_draft_fields_draft
  on ai_intake_draft_fields(draft_id, sort_order);

create index if not exists idx_ai_intake_posting_events_draft
  on ai_intake_posting_events(draft_id, created_at desc);
