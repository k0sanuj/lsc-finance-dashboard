-- 038_fsp_consolidation_policy.sql
-- Keep FSP sport scenario/planning values outside the LSC holding rollup.
--
-- FSP remains visible as its own entity row. The LSC row consolidates current
-- approved operating entities only: LSC/Dubai, TBR, and XTZ India. Future FSP
-- actuals can be promoted through an explicit consolidation gate rather than
-- being inferred from scenario tables or placeholder planning values.

create or replace view consolidated_company_metrics as
with normalized_companies as (
  select
    id,
    case when code::text = 'XTE' then 'LSC' else code::text end as company_code,
    name
  from companies
),
revenue_totals as (
  select
    nc.company_code,
    sum(rr.amount) as recognized_revenue
  from revenue_records rr
  join normalized_companies nc on nc.id = rr.company_id
  group by nc.company_code
),
expense_totals as (
  select
    nc.company_code,
    sum(e.amount) as approved_expenses
  from expenses e
  join normalized_companies nc on nc.id = e.company_id
  where e.expense_status in ('approved', 'paid')
  group by nc.company_code
),
payroll_invoice_revenue as (
  select
    fc.company_code,
    sum(pi.total_amount) as recognized_revenue
  from payroll_invoices pi
  join normalized_companies fc on fc.id = pi.from_company_id
  join normalized_companies tc on tc.id = pi.to_company_id
  where pi.status = 'paid'
    and fc.company_code <> tc.company_code
  group by fc.company_code
),
payroll_invoice_expenses as (
  select
    tc.company_code,
    sum(pi.total_amount) as approved_expenses
  from payroll_invoices pi
  join normalized_companies tc on tc.id = pi.to_company_id
  where pi.status = 'paid'
  group by tc.company_code
),
direct_company_totals as (
  select
    requested.company_code::company_code as company_code,
    coalesce(
      min(nc.name) filter (where nc.company_code = requested.company_code),
      requested.company_name
    ) as company_name,
    (
      coalesce(rt.recognized_revenue, 0) +
      coalesce(pir.recognized_revenue, 0)
    ) as recognized_revenue,
    (
      coalesce(et.approved_expenses, 0) +
      coalesce(pie.approved_expenses, 0)
    ) as approved_expenses
  from (
    values
      ('LSC', 'LSC / XTZ Esports Tech Ltd (Dubai)'),
      ('TBR', 'Team Blue Rising'),
      ('FSP', 'Future of Sports'),
      ('XTZ', 'XTZ India')
  ) as requested(company_code, company_name)
  left join normalized_companies nc on nc.company_code = requested.company_code
  left join revenue_totals rt on rt.company_code = requested.company_code
  left join payroll_invoice_revenue pir on pir.company_code = requested.company_code
  left join expense_totals et on et.company_code = requested.company_code
  left join payroll_invoice_expenses pie on pie.company_code = requested.company_code
  group by
    requested.company_code,
    requested.company_name,
    rt.recognized_revenue,
    pir.recognized_revenue,
    et.approved_expenses,
    pie.approved_expenses
),
holding_rollup as (
  select
    'LSC'::company_code as company_code,
    coalesce((select name from companies where code = 'LSC'::company_code limit 1), 'League Sports Co') as company_name,
    coalesce(sum(recognized_revenue), 0) as recognized_revenue,
    coalesce(sum(approved_expenses), 0) as approved_expenses
  from direct_company_totals
  where company_code <> 'FSP'::company_code
),
operating_rows as (
  select *
  from direct_company_totals
  where company_code in ('TBR'::company_code, 'FSP'::company_code, 'XTZ'::company_code)
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
  union
  select nc.company_code, date_trunc('month', e.expense_date)::date as month_start
  from expenses e
  join normalized_companies nc on nc.id = e.company_id
  where e.expense_status in ('approved', 'paid')
  union
  select nc.company_code, date_trunc('month', p.payment_date)::date as month_start
  from payments p
  join normalized_companies nc on nc.id = p.company_id
  where p.payment_status = 'settled'
  union
  select tc.company_code, date_trunc('month', coalesce(pi.paid_at::date, pi.invoice_date))::date as month_start
  from payroll_invoices pi
  join normalized_companies tc on tc.id = pi.to_company_id
  where pi.status = 'paid'
  union
  select fc.company_code, date_trunc('month', coalesce(pi.paid_at::date, pi.invoice_date))::date as month_start
  from payroll_invoices pi
  join normalized_companies fc on fc.id = pi.from_company_id
  join normalized_companies tc on tc.id = pi.to_company_id
  where pi.status = 'paid'
    and fc.company_code <> tc.company_code
),
revenue_monthly as (
  select
    nc.company_code,
    date_trunc('month', rr.recognition_date)::date as month_start,
    sum(rr.amount) as recognized_revenue
  from revenue_records rr
  join normalized_companies nc on nc.id = rr.company_id
  group by nc.company_code, date_trunc('month', rr.recognition_date)::date
),
expense_monthly as (
  select
    nc.company_code,
    date_trunc('month', e.expense_date)::date as month_start,
    sum(e.amount) as approved_expenses
  from expenses e
  join normalized_companies nc on nc.id = e.company_id
  where e.expense_status in ('approved', 'paid')
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
  group by fc.company_code, date_trunc('month', coalesce(pi.paid_at::date, pi.invoice_date))::date
),
direct_monthly as (
  select
    mk.company_code::company_code as company_code,
    mk.month_start,
    (
      coalesce(rm.recognized_revenue, 0) +
      coalesce(pirm.recognized_revenue, 0)
    ) as recognized_revenue,
    (
      coalesce(em.approved_expenses, 0) +
      coalesce(piem.approved_expenses, 0)
    ) as approved_expenses,
    (
      coalesce(pm.cash_in, 0) +
      coalesce(pirm.cash_in, 0)
    ) as cash_in,
    (
      coalesce(pm.cash_out, 0) +
      coalesce(piem.cash_out, 0)
    ) as cash_out
  from monthly_keys mk
  left join revenue_monthly rm on rm.company_code = mk.company_code and rm.month_start = mk.month_start
  left join payroll_invoice_revenue_monthly pirm on pirm.company_code = mk.company_code and pirm.month_start = mk.month_start
  left join expense_monthly em on em.company_code = mk.company_code and em.month_start = mk.month_start
  left join payroll_invoice_expense_monthly piem on piem.company_code = mk.company_code and piem.month_start = mk.month_start
  left join payment_monthly pm on pm.company_code = mk.company_code and pm.month_start = mk.month_start
  where mk.month_start is not null
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
  where company_code <> 'FSP'::company_code
  group by month_start
),
operating_monthly as (
  select *
  from direct_monthly
  where company_code in ('TBR'::company_code, 'FSP'::company_code, 'XTZ'::company_code)
)
select
  monthly.company_code,
  monthly.month_start,
  monthly.recognized_revenue::numeric(14,2) as recognized_revenue,
  monthly.approved_expenses::numeric(14,2) as approved_expenses,
  monthly.cash_in::numeric(14,2) as cash_in,
  monthly.cash_out::numeric(14,2) as cash_out
from (
  select * from holding_monthly
  union all
  select * from operating_monthly
) monthly;
