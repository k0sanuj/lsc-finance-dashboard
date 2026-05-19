-- 041_reporting_hardening.sql
-- Production-safe reporting hardening:
-- - quarantine/exclude QA rows without deleting source truth
-- - expose a shared finance recognition contract
-- - include TBR management P&L costs in core entity metrics
-- - keep FSP scenario planning outside LSC actual consolidation
-- - support idempotent audited agent mutations

create table if not exists finance_reporting_exclusions (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text not null,
  reason text not null,
  excluded_from_reporting boolean not null default true,
  quarantined_at timestamptz not null default now(),
  quarantined_by text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_table, source_id, reason)
);

create index if not exists idx_finance_reporting_exclusions_source
  on finance_reporting_exclusions(source_table, source_id)
  where excluded_from_reporting;

create index if not exists idx_finance_reporting_exclusions_reason
  on finance_reporting_exclusions(reason, quarantined_at desc);

create table if not exists agent_mutation_idempotency (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  skill text not null,
  idempotency_key text not null,
  entity_type text,
  entity_id text,
  status text not null default 'started'
    check (status in ('started', 'succeeded', 'failed')),
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, skill, idempotency_key)
);

create table if not exists outbound_notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp', 'slack', 'internal')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'sent', 'failed')),
  source_agent_id text,
  source_skill text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_outbound_notifications_status
  on outbound_notifications(status, created_at desc);

create table if not exists cascade_action_events (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  entity_type text not null,
  entity_id text not null,
  action_type text not null,
  execution_status text not null default 'executed'
    check (execution_status in ('executed', 'skipped_live_view', 'queued', 'failed')),
  error_message text,
  performed_by text,
  agent_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cascade_action_events_entity
  on cascade_action_events(entity_type, entity_id, created_at desc);

create index if not exists idx_cascade_action_events_trigger
  on cascade_action_events(trigger, created_at desc);

create or replace view finance_reporting_exclusion_summary as
select
  source_table,
  reason,
  excluded_from_reporting,
  count(*)::integer as row_count,
  max(quarantined_at) as latest_quarantine_at
from finance_reporting_exclusions
group by source_table, reason, excluded_from_reporting;

create or replace view fsp_consolidation_eligible_actuals as
select
  null::uuid as source_id,
  'none'::text as source_table,
  'FSP scenario/planning values are intentionally excluded until actual consolidation is approved.'::text as policy_note,
  0::numeric(14,2) as recognized_revenue,
  0::numeric(14,2) as approved_expenses
where false;

create or replace view finance_recognition_by_entity as
with normalized_companies as (
  select
    id,
    case when code::text = 'XTE' then 'LSC' else code::text end as company_code,
    name
  from companies
),
revenue_actuals as (
  select nc.company_code, coalesce(sum(rr.amount), 0) as actual_revenue
  from revenue_records rr
  join normalized_companies nc on nc.id = rr.company_id
  where not exists (
    select 1 from finance_reporting_exclusions fre
    where fre.excluded_from_reporting
      and fre.source_table = 'revenue_records'
      and fre.source_id = rr.id::text
  )
  group by nc.company_code
),
expense_actuals as (
  select nc.company_code, coalesce(sum(e.amount), 0) as actual_cost
  from expenses e
  join normalized_companies nc on nc.id = e.company_id
  where e.expense_status in ('approved', 'paid')
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting
        and fre.source_table = 'expenses'
        and fre.source_id = e.id::text
    )
  group by nc.company_code
),
cash_actuals as (
  select
    nc.company_code,
    coalesce(sum(case when p.direction = 'inflow' then p.amount else 0 end), 0) as cash_in,
    coalesce(sum(case when p.direction = 'outflow' then p.amount else 0 end), 0) as cash_out
  from payments p
  join normalized_companies nc on nc.id = p.company_id
  where p.payment_status = 'settled'
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting
        and fre.source_table = 'payments'
        and fre.source_id = p.id::text
    )
  group by nc.company_code
),
payroll_invoice_actuals as (
  select
    fc.company_code as from_company_code,
    tc.company_code as to_company_code,
    coalesce(sum(pi.total_amount) filter (where pi.status = 'paid' and fc.company_code <> tc.company_code), 0) as issuer_revenue,
    coalesce(sum(pi.total_amount) filter (where pi.status = 'paid'), 0) as recipient_cost,
    coalesce(sum(pi.total_amount) filter (where pi.status in ('generated', 'sent')), 0) as recipient_committed_payable
  from payroll_invoices pi
  join normalized_companies fc on fc.id = pi.from_company_id
  join normalized_companies tc on tc.id = pi.to_company_id
  where pi.status <> 'void'
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting
        and fre.source_table = 'payroll_invoices'
        and fre.source_id = pi.id::text
    )
  group by fc.company_code, tc.company_code
),
payroll_revenue as (
  select from_company_code as company_code, sum(issuer_revenue) as actual_revenue, sum(issuer_revenue) as cash_in
  from payroll_invoice_actuals
  group by from_company_code
),
payroll_cost as (
  select to_company_code as company_code, sum(recipient_cost) as actual_cost, sum(recipient_cost) as cash_out, sum(recipient_committed_payable) as committed_payables
  from payroll_invoice_actuals
  group by to_company_code
),
tbr_management_pnl as (
  select
    'TBR'::text as company_code,
    coalesce(sum(total_revenue_usd), 0) as management_revenue,
    coalesce(sum(total_cost_usd), 0) as management_cost
  from tbr_overall_pnl_by_season
),
fsp_planning as (
  select
    'FSP'::text as company_code,
    coalesce(sum(revenue_y1), 0) as planning_revenue,
    coalesce(sum(cogs_y1 + opex_y1), 0) as planning_cost
  from fsp_pnl_summary
  where scenario::text = 'base'
),
direct as (
  select
    requested.company_code,
    requested.company_name,
    coalesce(ra.actual_revenue, 0) + coalesce(pr.actual_revenue, 0) as base_actual_revenue,
    coalesce(ea.actual_cost, 0) + coalesce(pc.actual_cost, 0) as base_actual_cost,
    coalesce(ca.cash_in, 0) + coalesce(pr.cash_in, 0) as actual_cash_in,
    coalesce(ca.cash_out, 0) + coalesce(pc.cash_out, 0) as actual_cash_out,
    coalesce(pc.committed_payables, 0) as committed_payables,
    coalesce(fsp.planning_revenue, 0) as planning_revenue,
    coalesce(fsp.planning_cost, 0) as planning_cost,
    coalesce(tbr.management_revenue, 0) as tbr_management_revenue,
    coalesce(tbr.management_cost, 0) as tbr_management_cost
  from (
    values
      ('LSC', 'LSC / XTZ Esports Tech Ltd (Dubai)'),
      ('TBR', 'Team Blue Rising'),
      ('FSP', 'Future of Sports'),
      ('XTZ', 'XTZ India')
  ) requested(company_code, company_name)
  left join revenue_actuals ra on ra.company_code = requested.company_code
  left join expense_actuals ea on ea.company_code = requested.company_code
  left join cash_actuals ca on ca.company_code = requested.company_code
  left join payroll_revenue pr on pr.company_code = requested.company_code
  left join payroll_cost pc on pc.company_code = requested.company_code
  left join tbr_management_pnl tbr on tbr.company_code = requested.company_code
  left join fsp_planning fsp on fsp.company_code = requested.company_code
),
direct_final as (
  select
    company_code,
    company_name,
    case
      when company_code = 'TBR' then greatest(tbr_management_revenue, base_actual_revenue)
      else base_actual_revenue
    end as actual_revenue,
    case
      when company_code = 'TBR' then greatest(tbr_management_cost, base_actual_cost)
      else base_actual_cost
    end as actual_cost,
    actual_cash_in,
    actual_cash_out,
    committed_payables,
    0::numeric as committed_receivables,
    planning_revenue,
    planning_cost,
    case
      when company_code = 'FSP' then 'scenario_only_not_consolidated'
      when company_code = 'TBR' then 'management_pnl_includes_tbr_season_views'
      when company_code = 'XTZ' then 'xtz_invoice_ladder'
      else 'approved_actuals'
    end as recognition_policy
  from direct
)
select
  company_code::company_code as company_code,
  company_name,
  actual_revenue::numeric(14,2) as actual_revenue,
  actual_cost::numeric(14,2) as actual_cost,
  (actual_revenue - actual_cost)::numeric(14,2) as actual_margin,
  actual_cash_in::numeric(14,2) as actual_cash_in,
  actual_cash_out::numeric(14,2) as actual_cash_out,
  committed_payables::numeric(14,2) as committed_payables,
  committed_receivables::numeric(14,2) as committed_receivables,
  planning_revenue::numeric(14,2) as planning_revenue,
  planning_cost::numeric(14,2) as planning_cost,
  recognition_policy
from direct_final;

create or replace view consolidated_company_metrics as
with direct as (
  select *
  from finance_recognition_by_entity
),
holding_rollup as (
  select
    'LSC'::company_code as company_code,
    coalesce((select name from companies where code = 'LSC'::company_code limit 1), 'League Sports Co') as company_name,
    coalesce(sum(actual_revenue), 0) as recognized_revenue,
    coalesce(sum(actual_cost), 0) as approved_expenses
  from direct
  where company_code::text <> 'FSP'
),
operating_rows as (
  select
    company_code,
    company_name,
    actual_revenue as recognized_revenue,
    actual_cost as approved_expenses
  from direct
  where company_code::text in ('TBR', 'FSP', 'XTZ')
)
select
  totals.company_code,
  totals.company_name,
  totals.recognized_revenue::numeric(14,2) as recognized_revenue,
  totals.approved_expenses::numeric(14,2) as approved_expenses,
  (totals.recognized_revenue - totals.approved_expenses)::numeric(14,2) as margin
from (
  select * from holding_rollup
  union all
  select * from operating_rows
) totals;

create or replace view monthly_financial_summary as
with normalized_companies as (
  select
    id,
    case when code::text = 'XTE' then 'LSC' else code::text end as company_code
  from companies
),
monthly_keys as (
  select nc.company_code, date_trunc('month', rr.recognition_date)::date as month_start
  from revenue_records rr
  join normalized_companies nc on nc.id = rr.company_id
  where not exists (
    select 1 from finance_reporting_exclusions fre
    where fre.excluded_from_reporting and fre.source_table = 'revenue_records' and fre.source_id = rr.id::text
  )
  union
  select nc.company_code, date_trunc('month', e.expense_date)::date as month_start
  from expenses e
  join normalized_companies nc on nc.id = e.company_id
  where e.expense_status in ('approved', 'paid')
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting and fre.source_table = 'expenses' and fre.source_id = e.id::text
    )
  union
  select nc.company_code, date_trunc('month', p.payment_date)::date as month_start
  from payments p
  join normalized_companies nc on nc.id = p.company_id
  where p.payment_status = 'settled'
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting and fre.source_table = 'payments' and fre.source_id = p.id::text
    )
  union
  select tc.company_code, date_trunc('month', coalesce(pi.paid_at::date, pi.invoice_date))::date as month_start
  from payroll_invoices pi
  join normalized_companies tc on tc.id = pi.to_company_id
  where pi.status = 'paid'
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting and fre.source_table = 'payroll_invoices' and fre.source_id = pi.id::text
    )
  union
  select fc.company_code, date_trunc('month', coalesce(pi.paid_at::date, pi.invoice_date))::date as month_start
  from payroll_invoices pi
  join normalized_companies fc on fc.id = pi.from_company_id
  join normalized_companies tc on tc.id = pi.to_company_id
  where pi.status = 'paid'
    and fc.company_code <> tc.company_code
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting and fre.source_table = 'payroll_invoices' and fre.source_id = pi.id::text
    )
  union
  select 'TBR'::text as company_code, make_date(season_year, 1, 1) as month_start
  from tbr_overall_pnl_by_season
),
revenue_monthly as (
  select nc.company_code, date_trunc('month', rr.recognition_date)::date as month_start, sum(rr.amount) as recognized_revenue
  from revenue_records rr
  join normalized_companies nc on nc.id = rr.company_id
  where not exists (
    select 1 from finance_reporting_exclusions fre
    where fre.excluded_from_reporting and fre.source_table = 'revenue_records' and fre.source_id = rr.id::text
  )
  group by nc.company_code, date_trunc('month', rr.recognition_date)::date
),
expense_monthly as (
  select nc.company_code, date_trunc('month', e.expense_date)::date as month_start, sum(e.amount) as approved_expenses
  from expenses e
  join normalized_companies nc on nc.id = e.company_id
  where e.expense_status in ('approved', 'paid')
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting and fre.source_table = 'expenses' and fre.source_id = e.id::text
    )
  group by nc.company_code, date_trunc('month', e.expense_date)::date
),
payment_monthly as (
  select
    nc.company_code,
    date_trunc('month', p.payment_date)::date as month_start,
    sum(case when p.direction = 'inflow' then p.amount else 0 end) as cash_in,
    sum(case when p.direction = 'outflow' then p.amount else 0 end) as cash_out
  from payments p
  join normalized_companies nc on nc.id = p.company_id
  where p.payment_status = 'settled'
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting and fre.source_table = 'payments' and fre.source_id = p.id::text
    )
  group by nc.company_code, date_trunc('month', p.payment_date)::date
),
payroll_invoice_expense_monthly as (
  select
    tc.company_code,
    date_trunc('month', coalesce(pi.paid_at::date, pi.invoice_date))::date as month_start,
    sum(pi.total_amount) as approved_expenses,
    sum(pi.total_amount) as cash_out
  from payroll_invoices pi
  join normalized_companies tc on tc.id = pi.to_company_id
  where pi.status = 'paid'
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting and fre.source_table = 'payroll_invoices' and fre.source_id = pi.id::text
    )
  group by tc.company_code, date_trunc('month', coalesce(pi.paid_at::date, pi.invoice_date))::date
),
payroll_invoice_revenue_monthly as (
  select
    fc.company_code,
    date_trunc('month', coalesce(pi.paid_at::date, pi.invoice_date))::date as month_start,
    sum(pi.total_amount) as recognized_revenue,
    sum(pi.total_amount) as cash_in
  from payroll_invoices pi
  join normalized_companies fc on fc.id = pi.from_company_id
  join normalized_companies tc on tc.id = pi.to_company_id
  where pi.status = 'paid'
    and fc.company_code <> tc.company_code
    and not exists (
      select 1 from finance_reporting_exclusions fre
      where fre.excluded_from_reporting and fre.source_table = 'payroll_invoices' and fre.source_id = pi.id::text
    )
  group by fc.company_code, date_trunc('month', coalesce(pi.paid_at::date, pi.invoice_date))::date
),
tbr_management_monthly as (
  select
    'TBR'::text as company_code,
    make_date(season_year, 1, 1) as month_start,
    total_revenue_usd as recognized_revenue,
    total_cost_usd as approved_expenses
  from tbr_overall_pnl_by_season
),
direct_monthly as (
  select
    mk.company_code::company_code as company_code,
    mk.month_start,
    case
      when mk.company_code = 'TBR' then greatest(
        coalesce(tbr.recognized_revenue, 0),
        coalesce(rm.recognized_revenue, 0) + coalesce(pirm.recognized_revenue, 0)
      )
      else coalesce(rm.recognized_revenue, 0) + coalesce(pirm.recognized_revenue, 0)
    end as recognized_revenue,
    case
      when mk.company_code = 'TBR' then greatest(
        coalesce(tbr.approved_expenses, 0),
        coalesce(em.approved_expenses, 0) + coalesce(piem.approved_expenses, 0)
      )
      else coalesce(em.approved_expenses, 0) + coalesce(piem.approved_expenses, 0)
    end as approved_expenses,
    coalesce(pm.cash_in, 0) + coalesce(pirm.cash_in, 0) as cash_in,
    coalesce(pm.cash_out, 0) + coalesce(piem.cash_out, 0) as cash_out
  from monthly_keys mk
  left join revenue_monthly rm on rm.company_code = mk.company_code and rm.month_start = mk.month_start
  left join expense_monthly em on em.company_code = mk.company_code and em.month_start = mk.month_start
  left join payment_monthly pm on pm.company_code = mk.company_code and pm.month_start = mk.month_start
  left join payroll_invoice_expense_monthly piem on piem.company_code = mk.company_code and piem.month_start = mk.month_start
  left join payroll_invoice_revenue_monthly pirm on pirm.company_code = mk.company_code and pirm.month_start = mk.month_start
  left join tbr_management_monthly tbr on tbr.company_code = mk.company_code and tbr.month_start = mk.month_start
),
holding_monthly as (
  select
    'LSC'::company_code as company_code,
    month_start,
    coalesce(sum(recognized_revenue), 0) as recognized_revenue,
    coalesce(sum(approved_expenses), 0) as approved_expenses,
    coalesce(sum(cash_in), 0) as cash_in,
    coalesce(sum(cash_out), 0) as cash_out
  from direct_monthly
  where company_code::text <> 'FSP'
  group by month_start
),
operating_monthly as (
  select *
  from direct_monthly
  where company_code::text in ('TBR', 'FSP', 'XTZ')
)
select
  company_code,
  month_start,
  recognized_revenue::numeric(14,2) as recognized_revenue,
  approved_expenses::numeric(14,2) as approved_expenses,
  cash_in::numeric(14,2) as cash_in,
  cash_out::numeric(14,2) as cash_out,
  (recognized_revenue - approved_expenses)::numeric(14,2) as margin
from (
  select * from holding_monthly
  union all
  select * from operating_monthly
) rows
where month_start is not null;

create or replace view payments_due as
select
  c.code as company_code,
  i.invoice_number,
  i.due_date,
  i.total_amount,
  i.invoice_status,
  re.name as race_name,
  coalesce(i.notes, e.description) as description
from invoices i
join companies c on c.id = i.company_id
left join race_events re on re.id = i.race_event_id
left join expenses e on e.invoice_id = i.id
where i.direction = 'payable'
  and i.invoice_status in ('issued', 'partially_paid', 'overdue')
  and not exists (
    select 1 from finance_reporting_exclusions fre
    where fre.excluded_from_reporting
      and fre.source_table = 'invoices'
      and fre.source_id = i.id::text
  );

grant select on finance_reporting_exclusions, finance_reporting_exclusion_summary,
  finance_recognition_by_entity, fsp_consolidation_eligible_actuals,
  outbound_notifications, agent_mutation_idempotency, cascade_action_events
to lsc_app_read;
