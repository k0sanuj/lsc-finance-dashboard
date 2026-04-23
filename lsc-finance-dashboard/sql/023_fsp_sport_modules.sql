-- 023: FSP Sport-Level Financial Modules
-- 9 sub-modules per sport: P&L Summary, Sponsorship, Media Metrics, Media Revenue,
-- OPEX, Event Production, League Payroll, Tech Services, Revenue Share

-- Add foundation sport code (padel was removed from the product)
alter type fsp_sport_code add value if not exists 'foundation';

-- ============================================================
-- Scenarios and Financial Years
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'fsp_scenario') then
    create type fsp_scenario as enum ('conservative', 'base', 'optimistic');
  end if;
end $$;

create table if not exists fsp_financial_years (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  year_label text not null,
  year_number integer not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  unique (sport_id, year_number)
);

-- ============================================================
-- Module 1: P&L Line Items (Revenue, COGS, OPEX all in one table)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pnl_section') then
    create type pnl_section as enum ('revenue', 'cogs', 'opex');
  end if;
end $$;

create table if not exists fsp_pnl_line_items (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  section pnl_section not null,
  category text not null,
  sub_category text,
  display_order integer not null default 0,
  year_1_budget numeric(14,2) not null default 0,
  year_2_budget numeric(14,2) not null default 0,
  year_3_budget numeric(14,2) not null default 0,
  year_1_actual numeric(14,2) not null default 0,
  year_2_actual numeric(14,2) not null default 0,
  year_3_actual numeric(14,2) not null default 0,
  scenario fsp_scenario not null default 'base',
  source_module text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fsp_pnl_sport on fsp_pnl_line_items(sport_id, section, scenario);

-- ============================================================
-- Module 2: Sponsorship Revenue
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sponsorship_tier') then
    create type sponsorship_tier as enum ('title', 'primary', 'secondary', 'official', 'supplier');
  end if;
  if not exists (select 1 from pg_type where typname = 'sponsorship_contract_status') then
    create type sponsorship_contract_status as enum ('pipeline', 'loi', 'signed', 'active', 'expired');
  end if;
end $$;

create table if not exists fsp_sponsorships (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  segment text not null,
  sponsor_name text,
  tier sponsorship_tier not null default 'official',
  contract_status sponsorship_contract_status not null default 'pipeline',
  year_1_value numeric(14,2) not null default 0,
  year_2_value numeric(14,2) not null default 0,
  year_3_value numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  contract_start date,
  contract_end date,
  payment_schedule text,
  deliverables_summary text,
  document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fsp_sponsorships_sport on fsp_sponsorships(sport_id);

-- ============================================================
-- Module 3: Media Metrics
-- ============================================================
create table if not exists fsp_media_metrics (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  metric_name text not null,
  metric_category text not null default 'engagement',
  year_1_value numeric(16,2) not null default 0,
  year_2_value numeric(16,2) not null default 0,
  year_3_value numeric(16,2) not null default 0,
  unit text not null default 'count',
  source text,
  confidence text not null default 'estimated',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fsp_media_metrics_sport on fsp_media_metrics(sport_id);

-- ============================================================
-- Module 4: Media Revenue (CPM model + Influencer economics)
-- ============================================================
create table if not exists fsp_media_revenue (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  channel_type text not null,
  metric_name text not null,
  year_1_value numeric(16,2) not null default 0,
  year_2_value numeric(16,2) not null default 0,
  year_3_value numeric(16,2) not null default 0,
  unit text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fsp_broadcast_partners (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  channel_name text not null,
  channel_type text not null default 'OTT',
  region text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists fsp_influencer_tiers (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  tier_name text not null,
  follower_range text not null,
  cpm_lower numeric(10,2) not null default 0,
  cpm_higher numeric(10,2) not null default 0,
  cpm_average numeric(10,2) not null default 0,
  avg_reach_rate numeric(8,4) not null default 0,
  year_1_onboarded integer not null default 0,
  year_2_onboarded integer not null default 0,
  year_3_onboarded integer not null default 0,
  impressions_per_influencer numeric(14,0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fsp_regional_cpms (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  region_name text not null,
  non_linear_cpm_lower numeric(10,2) not null default 0,
  non_linear_cpm_higher numeric(10,2) not null default 0,
  non_linear_cpm_avg numeric(10,2) not null default 0,
  linear_cpm_lower numeric(10,2) not null default 0,
  linear_cpm_higher numeric(10,2) not null default 0,
  linear_cpm_avg numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Module 5: OPEX Detailed (sub-categories)
-- ============================================================
create table if not exists fsp_opex_items (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  opex_category text not null,
  sub_category text not null,
  display_order integer not null default 0,
  year_1_budget numeric(14,2) not null default 0,
  year_2_budget numeric(14,2) not null default 0,
  year_3_budget numeric(14,2) not null default 0,
  year_1_actual numeric(14,2) not null default 0,
  year_2_actual numeric(14,2) not null default 0,
  year_3_actual numeric(14,2) not null default 0,
  scenario fsp_scenario not null default 'base',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fsp_opex_sport on fsp_opex_items(sport_id, opex_category);

-- ============================================================
-- Module 6: Event Production Costs
-- ============================================================
create table if not exists fsp_event_production (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  cost_category text not null,
  sub_category text not null,
  unit_cost numeric(14,2) not null default 0,
  quantity integer not null default 1,
  line_total numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fsp_event_config (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  segments_per_event integer not null default 4,
  events_per_year_1 integer not null default 1,
  events_per_year_2 integer not null default 2,
  events_per_year_3 integer not null default 4,
  venue_cost_per_event numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sport_id)
);

-- ============================================================
-- Module 7: League / Event Payroll
-- ============================================================
create table if not exists fsp_league_payroll (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  role_title text not null,
  department text,
  employment_type text not null default 'full_time',
  year_1_salary numeric(14,2) not null default 0,
  year_2_salary numeric(14,2) not null default 0,
  year_3_salary numeric(14,2) not null default 0,
  annual_raise_pct numeric(6,2) not null default 5,
  currency_code text not null default 'USD',
  start_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fsp_league_payroll_sport on fsp_league_payroll(sport_id);

-- ============================================================
-- Module 8: Tech Services Team
-- ============================================================
create table if not exists fsp_tech_payroll (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  role_title text not null,
  department text default 'Technology',
  employment_type text not null default 'full_time',
  year_1_salary numeric(14,2) not null default 0,
  year_2_salary numeric(14,2) not null default 0,
  year_3_salary numeric(14,2) not null default 0,
  allocation_pct numeric(5,2) not null default 100,
  annual_raise_pct numeric(6,2) not null default 10,
  currency_code text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fsp_tech_payroll_sport on fsp_tech_payroll(sport_id);

-- ============================================================
-- Module 9: Revenue Share (Central Pool vs Teams vs Governing Body)
-- ============================================================
create table if not exists fsp_revenue_share (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  year_number integer not null,
  team_count integer not null default 6,
  team_licensing_fee numeric(14,2) not null default 0,
  teams_share_pct numeric(6,2) not null default 40,
  governing_body_name text,
  governing_body_share_pct numeric(6,2) not null default 5,
  currency_code text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sport_id, year_number)
);

-- ============================================================
-- P&L Summary View (auto-computed from line items)
-- ============================================================
create or replace view fsp_pnl_summary as
select
  fs.id as sport_id,
  fs.sport_code,
  fs.display_name as sport_name,
  pli.scenario,
  sum(case when pli.section = 'revenue' then pli.year_1_budget else 0 end)::numeric(14,2) as revenue_y1,
  sum(case when pli.section = 'revenue' then pli.year_2_budget else 0 end)::numeric(14,2) as revenue_y2,
  sum(case when pli.section = 'revenue' then pli.year_3_budget else 0 end)::numeric(14,2) as revenue_y3,
  sum(case when pli.section = 'cogs' then pli.year_1_budget else 0 end)::numeric(14,2) as cogs_y1,
  sum(case when pli.section = 'cogs' then pli.year_2_budget else 0 end)::numeric(14,2) as cogs_y2,
  sum(case when pli.section = 'cogs' then pli.year_3_budget else 0 end)::numeric(14,2) as cogs_y3,
  sum(case when pli.section = 'opex' then pli.year_1_budget else 0 end)::numeric(14,2) as opex_y1,
  sum(case when pli.section = 'opex' then pli.year_2_budget else 0 end)::numeric(14,2) as opex_y2,
  sum(case when pli.section = 'opex' then pli.year_3_budget else 0 end)::numeric(14,2) as opex_y3,
  (sum(case when pli.section = 'revenue' then pli.year_1_budget else 0 end)
   - sum(case when pli.section = 'cogs' then pli.year_1_budget else 0 end)
   - sum(case when pli.section = 'opex' then pli.year_1_budget else 0 end))::numeric(14,2) as ebitda_y1,
  (sum(case when pli.section = 'revenue' then pli.year_2_budget else 0 end)
   - sum(case when pli.section = 'cogs' then pli.year_2_budget else 0 end)
   - sum(case when pli.section = 'opex' then pli.year_2_budget else 0 end))::numeric(14,2) as ebitda_y2,
  (sum(case when pli.section = 'revenue' then pli.year_3_budget else 0 end)
   - sum(case when pli.section = 'cogs' then pli.year_3_budget else 0 end)
   - sum(case when pli.section = 'opex' then pli.year_3_budget else 0 end))::numeric(14,2) as ebitda_y3
from fsp_sports fs
left join fsp_pnl_line_items pli on pli.sport_id = fs.id
group by fs.id, fs.sport_code, fs.display_name, pli.scenario;
