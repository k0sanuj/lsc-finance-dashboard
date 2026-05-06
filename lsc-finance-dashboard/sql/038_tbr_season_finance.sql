-- 038_tbr_season_finance.sql
-- Canonical/control layer for TBR season operating expenses, E1 accounting,
-- reconciliation, and overall season P&L.

alter table revenue_records
  add column if not exists source_amount numeric(14,2),
  add column if not exists source_currency text,
  add column if not exists fx_rate numeric(18,8),
  add column if not exists fx_source text,
  add column if not exists reporting_amount_usd numeric(14,2);

update revenue_records
set source_amount = coalesce(source_amount, amount),
    source_currency = coalesce(source_currency, currency_code),
    fx_rate = coalesce(fx_rate, 1),
    fx_source = coalesce(fx_source, 'legacy_amount'),
    reporting_amount_usd = coalesce(reporting_amount_usd, amount)
where source_amount is null
   or source_currency is null
   or fx_rate is null
   or fx_source is null
   or reporting_amount_usd is null;

create table if not exists tbr_seasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  season_code text not null,
  season_number integer not null,
  season_year integer not null,
  season_label text not null,
  status text not null default 'planning',
  reporting_currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, season_code),
  unique (company_id, season_number)
);

create table if not exists tbr_operating_expense_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  season_id uuid not null references tbr_seasons(id) on delete cascade,
  source_document_id uuid references source_documents(id) on delete set null,
  import_batch_id uuid references import_batches(id) on delete set null,
  source_import_key text not null unique,
  source_row_key text,
  source_workbook_name text,
  source_sheet_name text,
  source_row_number integer,
  line_kind text not null default 'season_category_summary'
    check (line_kind in ('workbook_summary_category', 'season_category_summary', 'race_category_matrix', 'manual_entry', 'source_check')),
  season_code text not null,
  race_code text,
  race_name text,
  category_key text not null,
  category_name text not null,
  display_order integer not null default 1000,
  source_amount numeric(14,2) not null default 0,
  source_currency text not null default 'USD',
  fx_rate numeric(18,8) not null default 1,
  fx_source text not null default 'source_usd',
  reporting_amount_usd numeric(14,2) not null default 0,
  is_spare_parts boolean not null default false,
  is_check_total boolean not null default false,
  include_in_operating_baseline boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tbr_operating_expense_lines_season
  on tbr_operating_expense_lines(season_id, line_kind, include_in_operating_baseline);

create index if not exists idx_tbr_operating_expense_lines_category
  on tbr_operating_expense_lines(season_id, category_key);

create index if not exists idx_tbr_operating_expense_lines_race
  on tbr_operating_expense_lines(season_id, race_code);

create table if not exists tbr_e1_accounting_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  season_id uuid not null references tbr_seasons(id) on delete cascade,
  source_document_id uuid references source_documents(id) on delete set null,
  import_batch_id uuid references import_batches(id) on delete set null,
  source_import_key text not null unique,
  source_row_key text,
  source_workbook_name text,
  source_sheet_name text,
  source_row_number integer,
  season_code text not null,
  invoice_number text,
  item text not null,
  status_text text,
  normalized_status text not null default 'pending_review'
    check (normalized_status in ('paid', 'issued', 'partially_paid', 'due', 'unpaid', 'credit_note', 'void', 'not_applicable', 'pending_review', 'source_check')),
  line_type text not null default 'invoice'
    check (line_type in ('invoice', 'credit_note', 'support', 'source_check')),
  pnl_treatment text not null default 'pending_review'
    check (pnl_treatment in ('overlap_variance', 'incremental', 'excluded_duplicate', 'excluded_inapplicable', 'excluded_contingent', 'source_check', 'pending_review')),
  overlap_category_key text,
  source_amount numeric(14,2),
  source_currency text not null default 'USD',
  fx_rate numeric(18,8) not null default 1,
  fx_source text not null default 'source_usd',
  reporting_amount_usd numeric(14,2) not null default 0,
  due_amount_source numeric(14,2),
  due_amount_reporting_usd numeric(14,2) not null default 0,
  comments text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tbr_e1_accounting_lines_season
  on tbr_e1_accounting_lines(season_id, normalized_status, pnl_treatment);

create index if not exists idx_tbr_e1_accounting_lines_invoice
  on tbr_e1_accounting_lines(invoice_number);

create index if not exists idx_tbr_e1_accounting_lines_overlap
  on tbr_e1_accounting_lines(season_id, overlap_category_key);

create table if not exists tbr_e1_operating_reconciliation_links (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references tbr_seasons(id) on delete cascade,
  e1_line_id uuid not null references tbr_e1_accounting_lines(id) on delete cascade,
  operating_line_id uuid references tbr_operating_expense_lines(id) on delete set null,
  overlap_policy text not null default 'variance_only',
  overlap_category_key text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (e1_line_id, overlap_category_key)
);

create index if not exists idx_tbr_e1_reconciliation_links_season
  on tbr_e1_operating_reconciliation_links(season_id, overlap_category_key);

create or replace view tbr_operating_expense_summary_by_season as
select
  ts.id as season_id,
  ts.season_code,
  ts.season_number,
  ts.season_year,
  ts.season_label,
  ts.status,
  count(*) filter (
    where toel.line_kind = 'season_category_summary'
      and toel.include_in_operating_baseline
      and not toel.is_check_total
  )::integer as category_count,
  coalesce(sum(toel.reporting_amount_usd) filter (
    where toel.line_kind = 'season_category_summary'
      and toel.include_in_operating_baseline
      and not toel.is_check_total
  ), 0)::numeric(14,2) as total_operating_expense_usd,
  coalesce(sum(toel.reporting_amount_usd) filter (
    where toel.line_kind = 'season_category_summary'
      and toel.include_in_operating_baseline
      and not toel.is_check_total
      and not toel.is_spare_parts
  ), 0)::numeric(14,2) as total_operating_expense_ex_spares_usd,
  coalesce(sum(toel.reporting_amount_usd) filter (
    where toel.line_kind = 'season_category_summary'
      and toel.include_in_operating_baseline
      and toel.is_spare_parts
      and not toel.is_check_total
  ), 0)::numeric(14,2) as spare_parts_usd
from tbr_seasons ts
left join tbr_operating_expense_lines toel on toel.season_id = ts.id
group by ts.id, ts.season_code, ts.season_number, ts.season_year, ts.season_label, ts.status;

create or replace view tbr_operating_expense_by_category as
select
  ts.id as season_id,
  ts.season_code,
  ts.season_number,
  ts.season_label,
  toel.category_key,
  toel.category_name,
  min(toel.display_order) as display_order,
  bool_or(toel.is_spare_parts) as is_spare_parts,
  coalesce(sum(toel.reporting_amount_usd), 0)::numeric(14,2) as reporting_amount_usd
from tbr_operating_expense_lines toel
join tbr_seasons ts on ts.id = toel.season_id
where toel.line_kind = 'season_category_summary'
  and toel.include_in_operating_baseline
  and not toel.is_check_total
group by ts.id, ts.season_code, ts.season_number, ts.season_label, toel.category_key, toel.category_name;

create or replace view tbr_operating_expense_by_race as
select
  ts.id as season_id,
  ts.season_code,
  ts.season_number,
  ts.season_label,
  toel.race_code,
  coalesce(toel.race_name, toel.race_code, 'Unassigned') as race_name,
  coalesce(sum(toel.reporting_amount_usd), 0)::numeric(14,2) as total_operating_expense_usd,
  coalesce(sum(toel.reporting_amount_usd) filter (where not toel.is_spare_parts), 0)::numeric(14,2) as total_operating_expense_ex_spares_usd,
  coalesce(sum(toel.reporting_amount_usd) filter (where toel.is_spare_parts), 0)::numeric(14,2) as spare_parts_usd
from tbr_operating_expense_lines toel
join tbr_seasons ts on ts.id = toel.season_id
where toel.line_kind = 'race_category_matrix'
  and toel.include_in_operating_baseline
  and not toel.is_check_total
group by ts.id, ts.season_code, ts.season_number, ts.season_label, toel.race_code, toel.race_name;

create or replace view tbr_operating_expense_matrix as
select
  ts.id as season_id,
  ts.season_code,
  ts.season_number,
  ts.season_label,
  toel.race_code,
  toel.race_name,
  toel.category_key,
  toel.category_name,
  toel.display_order,
  toel.reporting_amount_usd,
  toel.is_spare_parts,
  toel.notes
from tbr_operating_expense_lines toel
join tbr_seasons ts on ts.id = toel.season_id
where toel.line_kind = 'race_category_matrix'
  and toel.include_in_operating_baseline
  and not toel.is_check_total;

create or replace view tbr_e1_accounting_status_by_season as
select
  ts.id as season_id,
  ts.season_code,
  ts.season_number,
  ts.season_label,
  count(e1.id)::integer as line_count,
  coalesce(sum(abs(e1.reporting_amount_usd)) filter (where e1.line_type <> 'source_check'), 0)::numeric(14,2) as gross_e1_amount_usd,
  coalesce(sum(abs(e1.reporting_amount_usd)) filter (where e1.normalized_status = 'paid'), 0)::numeric(14,2) as paid_amount_usd,
  coalesce(sum(abs(e1.due_amount_reporting_usd)), 0)::numeric(14,2) as due_amount_usd,
  coalesce(sum(abs(e1.reporting_amount_usd)) filter (where e1.line_type = 'credit_note'), 0)::numeric(14,2) as credit_note_amount_usd,
  coalesce(sum(abs(e1.reporting_amount_usd)) filter (where e1.pnl_treatment = 'overlap_variance'), 0)::numeric(14,2) as overlap_visible_amount_usd,
  coalesce(sum(abs(e1.reporting_amount_usd)) filter (where e1.pnl_treatment = 'incremental'), 0)::numeric(14,2) as incremental_visible_amount_usd,
  count(*) filter (where e1.pnl_treatment like 'excluded_%')::integer as excluded_line_count,
  count(*) filter (where e1.pnl_treatment = 'pending_review')::integer as pending_review_count,
  ts.season_year,
  ts.status
from tbr_seasons ts
left join tbr_e1_accounting_lines e1 on e1.season_id = ts.id
group by ts.id, ts.season_code, ts.season_number, ts.season_year, ts.season_label, ts.status;

create or replace view tbr_e1_reconciliation_view as
with overlap_groups as (
  select
    e1.season_id,
    e1.overlap_category_key,
    coalesce(sum(abs(e1.reporting_amount_usd)), 0) as e1_overlap_amount_usd
  from tbr_e1_accounting_lines e1
  join tbr_e1_operating_reconciliation_links rel
    on rel.e1_line_id = e1.id
   and rel.operating_line_id is not null
  where e1.pnl_treatment = 'overlap_variance'
    and e1.overlap_category_key is not null
  group by e1.season_id, e1.overlap_category_key
),
linked_baselines as (
  select
    rel.season_id,
    rel.overlap_category_key,
    coalesce(sum(distinct abs(toel.reporting_amount_usd)), 0) as operating_baseline_amount_usd
  from tbr_e1_operating_reconciliation_links rel
  left join tbr_operating_expense_lines toel on toel.id = rel.operating_line_id
  where rel.operating_line_id is not null
  group by rel.season_id, rel.overlap_category_key
),
variance_groups as (
  select
    og.season_id,
    og.overlap_category_key,
    og.e1_overlap_amount_usd,
    coalesce(lb.operating_baseline_amount_usd, 0) as operating_baseline_amount_usd,
    greatest(og.e1_overlap_amount_usd - coalesce(lb.operating_baseline_amount_usd, 0), 0)::numeric(14,2) as counted_variance_usd
  from overlap_groups og
  left join linked_baselines lb
    on lb.season_id = og.season_id
   and lb.overlap_category_key = og.overlap_category_key
)
select
  e1.id as e1_line_id,
  ts.season_id,
  ts.season_code,
  ts.season_number,
  ts.season_label,
  e1.invoice_number,
  e1.item,
  e1.normalized_status,
  e1.line_type,
  e1.pnl_treatment,
  e1.overlap_category_key,
  e1.reporting_amount_usd,
  e1.due_amount_reporting_usd,
  coalesce(vg.e1_overlap_amount_usd, 0)::numeric(14,2) as overlap_group_e1_amount_usd,
  coalesce(vg.operating_baseline_amount_usd, 0)::numeric(14,2) as overlap_group_baseline_usd,
  coalesce(vg.counted_variance_usd, 0)::numeric(14,2) as overlap_group_variance_usd,
  e1.comments
from tbr_e1_accounting_lines e1
join (
  select id as season_id, season_code, season_number, season_label from tbr_seasons
) ts on ts.season_id = e1.season_id
left join variance_groups vg
  on vg.season_id = e1.season_id
 and vg.overlap_category_key = e1.overlap_category_key;

create or replace view tbr_overall_pnl_by_season as
with operating as (
  select
    season_id,
    total_operating_expense_usd,
    total_operating_expense_ex_spares_usd,
    spare_parts_usd
  from tbr_operating_expense_summary_by_season
),
revenue as (
  select
    ts.id as season_id,
    coalesce(sum(coalesce(rr.reporting_amount_usd, rr.amount)) filter (where rr.revenue_type = 'sponsorship'), 0)::numeric(14,2) as sponsorship_revenue_usd,
    coalesce(sum(coalesce(rr.reporting_amount_usd, rr.amount)) filter (where rr.revenue_type = 'prize_money'), 0)::numeric(14,2) as prize_money_revenue_usd,
    coalesce(sum(coalesce(rr.reporting_amount_usd, rr.amount)) filter (where rr.revenue_type not in ('sponsorship', 'prize_money')), 0)::numeric(14,2) as other_revenue_usd
  from tbr_seasons ts
  join companies c on c.id = ts.company_id and c.code = 'TBR'::company_code
  left join revenue_records rr
    on rr.company_id = c.id
   and extract(year from rr.recognition_date)::int = ts.season_year
  group by ts.id
),
e1_incremental as (
  select
    e1.season_id,
    coalesce(
      sum(abs(e1.reporting_amount_usd)) filter (
        where e1.pnl_treatment = 'incremental'
           or (
             e1.pnl_treatment = 'overlap_variance'
             and not exists (
               select 1
               from tbr_e1_operating_reconciliation_links rel
               where rel.e1_line_id = e1.id
                 and rel.operating_line_id is not null
             )
           )
      ),
      0
    )::numeric(14,2) as non_overlap_incremental_usd
  from tbr_e1_accounting_lines e1
  group by e1.season_id
),
e1_variance as (
  select
    season_id,
    coalesce(sum(counted_variance_usd), 0)::numeric(14,2) as overlap_variance_usd
  from (
    select distinct
      season_id,
      overlap_category_key,
      overlap_group_variance_usd as counted_variance_usd
    from tbr_e1_reconciliation_view
    where pnl_treatment = 'overlap_variance'
      and overlap_category_key is not null
  ) variances
  group by season_id
)
select
  ts.id as season_id,
  ts.season_code,
  ts.season_number,
  ts.season_year,
  ts.season_label,
  ts.status,
  coalesce(r.sponsorship_revenue_usd, 0) as sponsorship_revenue_usd,
  coalesce(r.prize_money_revenue_usd, 0) as prize_money_revenue_usd,
  coalesce(r.other_revenue_usd, 0) as other_revenue_usd,
  (
    coalesce(r.sponsorship_revenue_usd, 0) +
    coalesce(r.prize_money_revenue_usd, 0) +
    coalesce(r.other_revenue_usd, 0)
  )::numeric(14,2) as total_revenue_usd,
  coalesce(o.total_operating_expense_usd, 0) as operating_baseline_usd,
  coalesce(o.total_operating_expense_ex_spares_usd, 0) as operating_baseline_ex_spares_usd,
  coalesce(o.spare_parts_usd, 0) as spare_parts_usd,
  coalesce(ei.non_overlap_incremental_usd, 0) as e1_incremental_cost_usd,
  coalesce(ev.overlap_variance_usd, 0) as e1_overlap_variance_usd,
  (
    coalesce(o.total_operating_expense_usd, 0) +
    coalesce(ei.non_overlap_incremental_usd, 0) +
    coalesce(ev.overlap_variance_usd, 0)
  )::numeric(14,2) as total_cost_usd,
  (
    coalesce(r.sponsorship_revenue_usd, 0) +
    coalesce(r.prize_money_revenue_usd, 0) +
    coalesce(r.other_revenue_usd, 0) -
    coalesce(o.total_operating_expense_usd, 0) -
    coalesce(ei.non_overlap_incremental_usd, 0) -
    coalesce(ev.overlap_variance_usd, 0)
  )::numeric(14,2) as ebitda_usd
from tbr_seasons ts
left join operating o on o.season_id = ts.id
left join revenue r on r.season_id = ts.id
left join e1_incremental ei on ei.season_id = ts.id
left join e1_variance ev on ev.season_id = ts.id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'lsc_app_read') then
    grant select on
      tbr_seasons,
      tbr_operating_expense_lines,
      tbr_e1_accounting_lines,
      tbr_e1_operating_reconciliation_links,
      tbr_operating_expense_summary_by_season,
      tbr_operating_expense_by_race,
      tbr_operating_expense_by_category,
      tbr_operating_expense_matrix,
      tbr_e1_accounting_status_by_season,
      tbr_e1_reconciliation_view,
      tbr_overall_pnl_by_season
    to lsc_app_read;
  end if;

  if exists (select 1 from pg_roles where rolname = 'lsc_import_rw') then
    grant select, insert, update, delete on
      tbr_seasons,
      tbr_operating_expense_lines,
      tbr_e1_accounting_lines,
      tbr_e1_operating_reconciliation_links
    to lsc_import_rw;
  end if;
end $$;
