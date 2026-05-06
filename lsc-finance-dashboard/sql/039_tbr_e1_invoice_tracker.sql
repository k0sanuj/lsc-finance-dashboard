-- 039_tbr_e1_invoice_tracker.sql
-- Adds editable E1 invoice tracking views and a derived bridge into the Costs module.
-- E1 rows remain the canonical control source; Costs reads approved/active E1 invoice rows
-- through a view so status changes propagate without duplicating spreadsheet imports.

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
  e1.comments,
  ts.season_year,
  e1.source_amount,
  e1.source_currency,
  e1.fx_rate,
  e1.due_amount_source,
  e1.source_document_id,
  sd.source_name as source_document_name
from tbr_e1_accounting_lines e1
join (
  select id as season_id, season_code, season_number, season_year, season_label from tbr_seasons
) ts on ts.season_id = e1.season_id
left join variance_groups vg
  on vg.season_id = e1.season_id
 and vg.overlap_category_key = e1.overlap_category_key
left join source_documents sd on sd.id = e1.source_document_id;

create or replace view tbr_e1_invoice_tracker_by_season as
select
  ts.id as season_id,
  ts.season_code,
  ts.season_number,
  ts.season_year,
  ts.season_label,
  ts.status as season_status,
  e1.invoice_number,
  count(*)::integer as line_count,
  coalesce(sum(e1.reporting_amount_usd), 0)::numeric(14,2) as total_amount_usd,
  coalesce(sum(e1.due_amount_reporting_usd), 0)::numeric(14,2) as due_amount_usd,
  case
    when bool_and(e1.normalized_status = 'paid') then 'paid'
    when bool_or(e1.normalized_status = 'partially_paid') then 'partially_paid'
    when bool_or(e1.normalized_status in ('due', 'unpaid')) then 'due'
    when bool_or(e1.normalized_status = 'issued') then 'issued'
    when bool_or(e1.normalized_status = 'pending_review') then 'pending_review'
    when bool_or(e1.normalized_status = 'credit_note') then 'credit_note'
    when bool_or(e1.normalized_status = 'not_applicable') then 'not_applicable'
    when bool_or(e1.normalized_status = 'void') then 'void'
    else 'pending_review'
  end as rollup_status,
  count(distinct e1.source_document_id) filter (where e1.source_document_id is not null)::integer as document_count,
  (array_agg(distinct e1.source_document_id) filter (where e1.source_document_id is not null))[1] as source_document_id,
  max(sd.source_name) filter (where sd.id is not null) as source_document_name,
  string_agg(distinct nullif(e1.comments, ''), E'\n') as notes,
  max(e1.updated_at) as latest_line_updated_at
from tbr_e1_accounting_lines e1
join tbr_seasons ts on ts.id = e1.season_id
left join source_documents sd on sd.id = e1.source_document_id
where e1.line_type <> 'source_check'
group by ts.id, ts.season_code, ts.season_number, ts.season_year, ts.season_label, ts.status, e1.invoice_number;

create or replace view tbr_e1_cost_module_lines as
select
  e1.id as e1_line_id,
  e1.company_id,
  ts.season_code,
  ts.season_year,
  e1.invoice_number,
  e1.item,
  e1.normalized_status,
  e1.pnl_treatment,
  e1.reporting_amount_usd,
  e1.source_document_id,
  case
    when e1.overlap_category_key = 'food_beverages' or e1.item ilike '%catering%' then 'CATERING'
    when e1.overlap_category_key = 'vip_passes' or e1.item ilike '%vip%' then 'VIP_PASSES'
    when e1.overlap_category_key = 'spare_parts' or e1.item ilike '%foil%' or e1.item ilike '%spare%' then 'FOIL_DAMAGE'
    when e1.overlap_category_key = 'pilot_training' or e1.item ilike '%pilot%' or e1.item ilike '%academy%' or e1.item ilike '%competency%' then 'PILOT_TRAINING'
    when e1.overlap_category_key = 'team_insurance' or e1.item ilike '%insurance%' then 'TEAM_INSURANCE'
    when e1.overlap_category_key = 'pre_season_testing_fee' or e1.item ilike '%pre-season%' or e1.item ilike '%testing%' then 'LICENSING_FEE'
    when e1.item ilike '%travel%' then 'TRAVEL'
    else 'E1_ACCOUNTING'
  end as cost_category_code,
  case
    when e1.overlap_category_key = 'food_beverages' or e1.item ilike '%catering%' then 'Catering'
    when e1.overlap_category_key = 'vip_passes' or e1.item ilike '%vip%' then 'VIP Passes'
    when e1.overlap_category_key = 'spare_parts' or e1.item ilike '%foil%' or e1.item ilike '%spare%' then 'Foil Damage'
    when e1.overlap_category_key = 'pilot_training' or e1.item ilike '%pilot%' or e1.item ilike '%academy%' or e1.item ilike '%competency%' then 'Pilot Training'
    when e1.overlap_category_key = 'team_insurance' or e1.item ilike '%insurance%' then 'Team Insurance'
    when e1.overlap_category_key = 'pre_season_testing_fee' or e1.item ilike '%pre-season%' or e1.item ilike '%testing%' then 'Licensing Fee'
    when e1.item ilike '%travel%' then 'Travel'
    else 'E1 Accounting'
  end as cost_category_name
from tbr_e1_accounting_lines e1
join tbr_seasons ts on ts.id = e1.season_id
where e1.line_type <> 'source_check'
  and e1.normalized_status in ('paid', 'issued', 'partially_paid', 'due', 'unpaid')
  and e1.pnl_treatment in ('overlap_variance', 'incremental');
