-- 042_universal_pnl_statements.sql
-- Shared P&L statement and scenario layer for entities, sports, and future assets.
-- Source modules remain canonical/detail owners; this layer is the reporting statement contract.

create table if not exists finance_pnl_scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null
    check (owner_type in ('entity', 'sport', 'asset')),
  owner_code text not null,
  company_id uuid references companies(id) on delete set null,
  sport_id uuid references fsp_sports(id) on delete set null,
  scenario_code text not null,
  scenario_name text not null,
  scenario_type text not null default 'management'
    check (scenario_type in ('actual', 'management', 'forecast', 'budget', 'sensitivity')),
  is_default boolean not null default false,
  reporting_currency text not null default 'USD',
  source_document_id uuid references source_documents(id) on delete set null,
  assumptions jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_code, scenario_code)
);

create unique index if not exists idx_finance_pnl_default_scenario
  on finance_pnl_scenarios(owner_type, owner_code)
  where is_default;

create index if not exists idx_finance_pnl_scenarios_owner
  on finance_pnl_scenarios(owner_type, owner_code, scenario_type);

create table if not exists finance_pnl_periods (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references finance_pnl_scenarios(id) on delete cascade,
  period_code text not null,
  period_label text not null,
  period_order integer not null default 1000,
  fiscal_year integer,
  period_type text not null default 'season'
    check (period_type in ('season', 'year', 'forecast_year', 'month', 'custom')),
  status text not null default 'management'
    check (status in ('actual', 'management', 'forecast', 'budget')),
  period_start date,
  period_end date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scenario_id, period_code)
);

create index if not exists idx_finance_pnl_periods_scenario
  on finance_pnl_periods(scenario_id, period_order);

create table if not exists finance_pnl_line_items (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references finance_pnl_scenarios(id) on delete cascade,
  period_id uuid not null references finance_pnl_periods(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  sport_id uuid references fsp_sports(id) on delete set null,
  source_document_id uuid references source_documents(id) on delete set null,
  import_batch_id uuid references import_batches(id) on delete set null,
  raw_import_row_id uuid references raw_import_rows(id) on delete set null,
  source_import_key text not null unique,
  source_module text not null default 'manual',
  source_workbook_name text,
  source_sheet_name text,
  source_row_number integer,
  line_code text not null,
  parent_line_code text,
  line_label text not null,
  line_order integer not null default 1000,
  section_code text not null,
  section_label text not null,
  section_order integer not null default 1000,
  statement_role text not null
    check (statement_role in ('revenue', 'expense', 'net_result', 'memo')),
  line_kind text not null default 'detail'
    check (line_kind in ('detail', 'subtotal', 'total', 'net_result', 'source_check')),
  data_status text not null default 'actual'
    check (data_status in ('actual', 'partial_actual', 'forecast', 'pending', 'contingency', 'non_cash', 'mixed_actual_forecast', 'source_check')),
  include_in_pnl boolean not null default true,
  source_amount numeric(14,2) not null default 0,
  source_currency text not null default 'USD',
  fx_rate numeric(18,8) not null default 1,
  fx_source text not null default 'source_usd',
  reporting_amount_usd numeric(14,2) not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_finance_pnl_line_items_period
  on finance_pnl_line_items(period_id, section_order, line_order);

create index if not exists idx_finance_pnl_line_items_scenario_status
  on finance_pnl_line_items(scenario_id, data_status)
  where include_in_pnl;

create index if not exists idx_finance_pnl_line_items_source_document
  on finance_pnl_line_items(source_document_id)
  where source_document_id is not null;

create table if not exists finance_pnl_assumptions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references finance_pnl_scenarios(id) on delete cascade,
  assumption_key text not null,
  assumption_label text not null,
  assumption_type text not null default 'amount'
    check (assumption_type in ('amount', 'rate', 'text', 'scenario_option', 'boolean')),
  option_order integer not null default 1000,
  source_amount numeric(14,2),
  source_currency text,
  fx_rate numeric(18,8),
  reporting_amount_usd numeric(14,2),
  value_text text,
  is_selected boolean not null default false,
  source_document_id uuid references source_documents(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scenario_id, assumption_key)
);

create index if not exists idx_finance_pnl_assumptions_scenario
  on finance_pnl_assumptions(scenario_id, option_order);

create or replace view finance_pnl_statement_lines as
select
  sc.id as scenario_id,
  sc.owner_type,
  sc.owner_code,
  sc.scenario_code,
  sc.scenario_name,
  sc.scenario_type,
  sc.is_default,
  p.id as period_id,
  p.period_code,
  p.period_label,
  p.period_order,
  p.fiscal_year,
  p.period_type,
  p.status as period_status,
  li.id as line_id,
  li.company_id,
  c.code as company_code,
  li.sport_id,
  fs.sport_code,
  fs.display_name as sport_name,
  li.source_document_id,
  sd.source_name as source_document_name,
  li.import_batch_id,
  li.raw_import_row_id,
  li.source_import_key,
  li.source_module,
  li.source_workbook_name,
  li.source_sheet_name,
  li.source_row_number,
  li.line_code,
  li.parent_line_code,
  li.line_label,
  li.line_order,
  li.section_code,
  li.section_label,
  li.section_order,
  li.statement_role,
  li.line_kind,
  li.data_status,
  li.include_in_pnl,
  li.source_amount,
  li.source_currency,
  li.fx_rate,
  li.fx_source,
  li.reporting_amount_usd,
  case
    when li.statement_role = 'expense' then -abs(li.reporting_amount_usd)
    when li.statement_role = 'net_result' then li.reporting_amount_usd
    else li.reporting_amount_usd
  end::numeric(14,2) as signed_amount_usd,
  li.notes,
  li.metadata,
  li.created_at,
  li.updated_at
from finance_pnl_line_items li
join finance_pnl_scenarios sc on sc.id = li.scenario_id
join finance_pnl_periods p on p.id = li.period_id
left join companies c on c.id = li.company_id
left join fsp_sports fs on fs.id = li.sport_id
left join source_documents sd on sd.id = li.source_document_id;

create or replace view finance_pnl_summary_by_period as
select
  scenario_id,
  owner_type,
  owner_code,
  scenario_code,
  scenario_name,
  scenario_type,
  is_default,
  period_id,
  period_code,
  period_label,
  period_order,
  fiscal_year,
  period_type,
  period_status,
  coalesce(sum(reporting_amount_usd) filter (
    where statement_role = 'revenue'
      and line_kind = 'detail'
      and include_in_pnl
  ), 0)::numeric(14,2) as revenue_usd,
  coalesce(sum(abs(reporting_amount_usd)) filter (
    where statement_role = 'expense'
      and line_kind = 'detail'
      and include_in_pnl
  ), 0)::numeric(14,2) as expense_usd,
  (
    coalesce(sum(reporting_amount_usd) filter (
      where statement_role = 'revenue'
        and line_kind = 'detail'
        and include_in_pnl
    ), 0)
    -
    coalesce(sum(abs(reporting_amount_usd)) filter (
      where statement_role = 'expense'
        and line_kind = 'detail'
        and include_in_pnl
    ), 0)
  )::numeric(14,2) as net_income_usd,
  coalesce(sum(abs(reporting_amount_usd)) filter (
    where data_status in ('actual', 'partial_actual')
      and line_kind = 'detail'
      and include_in_pnl
  ), 0)::numeric(14,2) as actual_or_partial_usd,
  coalesce(sum(abs(reporting_amount_usd)) filter (
    where data_status in ('forecast', 'mixed_actual_forecast')
      and line_kind = 'detail'
      and include_in_pnl
  ), 0)::numeric(14,2) as forecast_usd,
  coalesce(sum(abs(reporting_amount_usd)) filter (
    where data_status = 'contingency'
      and line_kind = 'detail'
      and include_in_pnl
  ), 0)::numeric(14,2) as contingency_usd,
  coalesce(sum(abs(reporting_amount_usd)) filter (
    where data_status = 'non_cash'
      and line_kind = 'detail'
      and include_in_pnl
  ), 0)::numeric(14,2) as non_cash_usd,
  count(*) filter (
    where line_kind = 'detail'
      and include_in_pnl
  )::integer as included_line_count
from finance_pnl_statement_lines
group by
  scenario_id,
  owner_type,
  owner_code,
  scenario_code,
  scenario_name,
  scenario_type,
  is_default,
  period_id,
  period_code,
  period_label,
  period_order,
  fiscal_year,
  period_type,
  period_status;

create or replace view finance_pnl_section_summary_by_period as
select
  scenario_id,
  owner_type,
  owner_code,
  scenario_code,
  period_id,
  period_code,
  period_label,
  period_order,
  section_code,
  section_label,
  section_order,
  statement_role,
  coalesce(sum(abs(reporting_amount_usd)) filter (
    where line_kind = 'detail'
      and include_in_pnl
  ), 0)::numeric(14,2) as section_amount_usd,
  count(*) filter (
    where line_kind = 'detail'
      and include_in_pnl
  )::integer as included_line_count
from finance_pnl_statement_lines
group by
  scenario_id,
  owner_type,
  owner_code,
  scenario_code,
  period_id,
  period_code,
  period_label,
  period_order,
  section_code,
  section_label,
  section_order,
  statement_role;

create or replace view finance_pnl_status_mix_by_period as
select
  scenario_id,
  owner_type,
  owner_code,
  scenario_code,
  period_id,
  period_code,
  period_label,
  data_status,
  coalesce(sum(abs(reporting_amount_usd)) filter (
    where line_kind = 'detail'
      and include_in_pnl
  ), 0)::numeric(14,2) as amount_usd,
  count(*) filter (
    where line_kind = 'detail'
      and include_in_pnl
  )::integer as line_count
from finance_pnl_statement_lines
group by
  scenario_id,
  owner_type,
  owner_code,
  scenario_code,
  period_id,
  period_code,
  period_label,
  data_status;

create or replace view finance_pnl_source_coverage_view as
select
  owner_type,
  owner_code,
  scenario_code,
  period_code,
  source_module,
  data_status,
  count(*)::integer as line_count,
  coalesce(sum(abs(reporting_amount_usd)) filter (where include_in_pnl), 0)::numeric(14,2) as included_amount_usd,
  count(*) filter (where source_document_id is not null)::integer as source_document_count,
  count(*) filter (where import_batch_id is not null)::integer as import_batch_count
from finance_pnl_statement_lines
where line_kind = 'detail'
group by owner_type, owner_code, scenario_code, period_code, source_module, data_status;

create or replace view tbr_overall_pnl_by_season as
with selected as (
  select id
  from finance_pnl_scenarios
  where owner_type = 'entity'
    and owner_code = 'TBR'
    and scenario_code = 'tbr-management-reference'
  limit 1
),
summaries as (
  select s.*
  from finance_pnl_summary_by_period s
  join selected x on x.id = s.scenario_id
),
revenue as (
  select
    period_id,
    coalesce(sum(reporting_amount_usd) filter (where line_code = 'sponsorship'), 0)::numeric as sponsorship_revenue_usd,
    coalesce(sum(reporting_amount_usd) filter (where line_code = 'prize_pool'), 0)::numeric as prize_money_revenue_usd,
    coalesce(sum(reporting_amount_usd) filter (
      where statement_role = 'revenue'
        and line_kind = 'detail'
        and include_in_pnl
        and line_code not in ('sponsorship', 'prize_pool')
    ), 0)::numeric as other_revenue_usd
  from finance_pnl_statement_lines
  where scenario_id in (select id from selected)
  group by period_id
),
spares as (
  select
    period_id,
    coalesce(sum(abs(reporting_amount_usd)) filter (
      where section_code = 'spare_parts'
        and statement_role = 'expense'
        and line_kind = 'detail'
        and include_in_pnl
    ), 0)::numeric as spare_parts_usd
  from finance_pnl_statement_lines
  where scenario_id in (select id from selected)
  group by period_id
)
select
  p.period_id as season_id,
  p.period_code as season_code,
  case p.period_code when 'S1' then 1 when 'S2' then 2 when 'S3' then 3 else p.period_order end as season_number,
  coalesce(p.fiscal_year, 2000 + p.period_order) as season_year,
  p.period_label as season_label,
  p.period_status as status,
  coalesce(r.sponsorship_revenue_usd, 0)::numeric as sponsorship_revenue_usd,
  coalesce(r.prize_money_revenue_usd, 0)::numeric as prize_money_revenue_usd,
  coalesce(r.other_revenue_usd, 0)::numeric as other_revenue_usd,
  p.revenue_usd::numeric(14,2) as total_revenue_usd,
  p.expense_usd::numeric as operating_baseline_usd,
  (p.expense_usd - coalesce(sp.spare_parts_usd, 0))::numeric as operating_baseline_ex_spares_usd,
  coalesce(sp.spare_parts_usd, 0)::numeric as spare_parts_usd,
  0::numeric as e1_incremental_cost_usd,
  0::numeric as e1_overlap_variance_usd,
  p.expense_usd::numeric(14,2) as total_cost_usd,
  p.net_income_usd::numeric(14,2) as ebitda_usd
from summaries p
left join revenue r on r.period_id = p.period_id
left join spares sp on sp.period_id = p.period_id
order by season_number;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'lsc_app_read') then
    grant select on
      finance_pnl_scenarios,
      finance_pnl_periods,
      finance_pnl_line_items,
      finance_pnl_assumptions,
      finance_pnl_statement_lines,
      finance_pnl_summary_by_period,
      finance_pnl_section_summary_by_period,
      finance_pnl_status_mix_by_period,
      finance_pnl_source_coverage_view,
      tbr_overall_pnl_by_season
    to lsc_app_read;
  end if;

  if exists (select 1 from pg_roles where rolname = 'lsc_app_rw') then
    grant select, insert, update, delete on
      finance_pnl_scenarios,
      finance_pnl_periods,
      finance_pnl_line_items,
      finance_pnl_assumptions
    to lsc_app_rw;
    grant select on
      finance_pnl_statement_lines,
      finance_pnl_summary_by_period,
      finance_pnl_section_summary_by_period,
      finance_pnl_status_mix_by_period,
      finance_pnl_source_coverage_view,
      tbr_overall_pnl_by_season
    to lsc_app_rw;
  end if;

  if exists (select 1 from pg_roles where rolname = 'lsc_import_rw') then
    grant select, insert, update, delete on
      finance_pnl_scenarios,
      finance_pnl_periods,
      finance_pnl_line_items,
      finance_pnl_assumptions
    to lsc_import_rw;
    grant select on
      finance_pnl_statement_lines,
      finance_pnl_summary_by_period,
      finance_pnl_section_summary_by_period,
      finance_pnl_status_mix_by_period,
      finance_pnl_source_coverage_view,
      tbr_overall_pnl_by_season
    to lsc_import_rw;
  end if;
end $$;
