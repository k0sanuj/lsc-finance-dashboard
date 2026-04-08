-- 025: Per-event budget tracker, unified deal pipeline, AI ingestion queue,
--      sport infrastructure costs, treasury projections

-- ============================================================
-- 1. Per-event budget tracker
-- ============================================================
create table if not exists fsp_events (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  event_name text not null,
  city text not null,
  venue_name text,
  event_date date,
  event_end_date date,
  status text not null default 'planning',
  total_budget numeric(14,2) not null default 0,
  total_actual numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fsp_event_budget_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references fsp_events(id) on delete cascade,
  category text not null,
  sub_category text not null,
  description text,
  vendor_name text,
  budget_amount numeric(14,2) not null default 0,
  actual_amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  status text not null default 'pending',
  verification_proof text,
  is_verified boolean not null default false,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fsp_event_checklist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references fsp_events(id) on delete cascade,
  category text not null,
  requirement text not null,
  what_to_check text,
  verification_proof_required text,
  status text not null default 'pending',
  owner text,
  due_date date,
  completed_at timestamptz,
  notes text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_fsp_events_sport on fsp_events(sport_id);
create index if not exists idx_fsp_event_budget_items_event on fsp_event_budget_items(event_id);
create index if not exists idx_fsp_event_checklist_event on fsp_event_checklist(event_id);

-- ============================================================
-- 2. Unified deal pipeline (cross-department)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_stage') then
    create type deal_stage as enum (
      'lead', 'intro', 'discovery', 'proposal', 'negotiation', 'closing', 'won', 'lost'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'deal_risk_level') then
    create type deal_risk_level as enum ('low', 'medium', 'high');
  end if;
end $$;

create table if not exists deal_pipeline (
  id uuid primary key default gen_random_uuid(),
  deal_name text not null,
  deal_type text not null,
  description text,
  department text not null,
  deal_owner text not null,
  internal_champion text,
  -- Economics
  deal_value numeric(14,2) not null default 0,
  revenue_type text,
  currency_code text not null default 'USD',
  -- Progression
  stage deal_stage not null default 'lead',
  date_opened date not null default current_date,
  expected_close_date date,
  last_activity_date date,
  days_in_stage integer not null default 0,
  -- Relationship
  source_of_intro text,
  relationship_strength text,
  primary_decision_maker text,
  -- Strategic
  value_score integer not null default 5,
  brand_impact text,
  network_effect_potential text,
  -- Risk
  risk_level deal_risk_level not null default 'medium',
  blockers text,
  -- Dependencies
  legal_review_required boolean not null default false,
  tech_required boolean not null default false,
  ceo_approval_required boolean not null default false,
  -- Activity
  next_action text,
  action_owner text,
  action_deadline date,
  -- AI signals
  momentum_score integer,
  at_risk boolean not null default false,
  ai_recommended_action text,
  -- Metadata
  sport_vertical text,
  linked_entity_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deal_pipeline_dept on deal_pipeline(department, stage);
create index if not exists idx_deal_pipeline_stage on deal_pipeline(stage);
create index if not exists idx_deal_pipeline_owner on deal_pipeline(deal_owner);

-- ============================================================
-- 3. AI ingestion queue
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ingestion_source_type') then
    create type ingestion_source_type as enum ('text', 'document', 'excel', 'csv', 'voice_note', 'email');
  end if;
  if not exists (select 1 from pg_type where typname = 'ingestion_status') then
    create type ingestion_status as enum ('queued', 'processing', 'completed', 'failed', 'needs_review');
  end if;
end $$;

create table if not exists ai_ingestion_queue (
  id uuid primary key default gen_random_uuid(),
  source_type ingestion_source_type not null,
  source_name text,
  raw_content text,
  file_url text,
  target_module text,
  target_sport_id uuid references fsp_sports(id),
  target_event_id uuid references fsp_events(id),
  status ingestion_status not null default 'queued',
  extracted_data jsonb not null default '{}'::jsonb,
  ai_classification jsonb not null default '{}'::jsonb,
  records_created integer not null default 0,
  error_message text,
  submitted_by uuid references app_users(id),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_ingestion_status on ai_ingestion_queue(status);
create index if not exists idx_ai_ingestion_created on ai_ingestion_queue(created_at desc);

-- ============================================================
-- 4. Sport infrastructure requirements (per-sport technical specs)
-- ============================================================
create table if not exists fsp_sport_infrastructure (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  component text not null,
  critical_requirement text not null,
  what_to_check text,
  verification_proof text,
  estimated_cost numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  vendor_name text,
  status text not null default 'pending',
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fsp_sport_infra_sport on fsp_sport_infrastructure(sport_id);

-- ============================================================
-- 5. Broadcast production specs (per-sport)
-- ============================================================
create table if not exists fsp_broadcast_specs (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  category text not null,
  spec_name text not null,
  technical_requirement text not null,
  what_to_check text,
  verification_proof text,
  estimated_cost numeric(14,2) not null default 0,
  vendor_name text,
  status text not null default 'pending',
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fsp_broadcast_sport on fsp_broadcast_specs(sport_id);

-- ============================================================
-- 6. Treasury projections
-- ============================================================
create table if not exists treasury_projections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  projection_date date not null,
  projected_balance numeric(14,2) not null default 0,
  committed_outflows numeric(14,2) not null default 0,
  expected_inflows numeric(14,2) not null default 0,
  net_position numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  projection_type text not null default '30_day',
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_treasury_proj_company on treasury_projections(company_id, projection_date);
