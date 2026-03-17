create or replace view consolidated_company_metrics as
with direct_company_totals as (
  select
    c.code as company_code,
    c.name as company_name,
    coalesce(revenue.recognized_revenue, 0) as recognized_revenue,
    coalesce(expenses.approved_expenses, 0) as approved_expenses
  from companies c
  left join (
    select company_id, sum(amount) as recognized_revenue
    from revenue_records
    group by company_id
  ) revenue on revenue.company_id = c.id
  left join (
    select company_id, sum(amount) as approved_expenses
    from expenses
    where expense_status in ('approved', 'paid')
    group by company_id
  ) expenses on expenses.company_id = c.id
),
holding_rollup as (
  select
    'LSC'::company_code as company_code,
    coalesce((select name from companies where code = 'LSC'::company_code limit 1), 'League Sports Co') as company_name,
    coalesce(sum(recognized_revenue), 0) as recognized_revenue,
    coalesce(sum(approved_expenses), 0) as approved_expenses
  from direct_company_totals
),
operating_rows as (
  select *
  from direct_company_totals
  where company_code in ('TBR'::company_code, 'FSP'::company_code)
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
with direct_monthly as (
  select
    c.code as company_code,
    monthly.month_start,
    coalesce(revenue.recognized_revenue, 0) as recognized_revenue,
    coalesce(expenses.approved_expenses, 0) as approved_expenses,
    coalesce(payments.cash_in, 0) as cash_in,
    coalesce(payments.cash_out, 0) as cash_out
  from companies c
  join (
    select company_id, month_start from (
      select company_id, date_trunc('month', recognition_date)::date as month_start from revenue_records
      union
      select company_id, date_trunc('month', expense_date)::date as month_start from expenses where expense_status in ('approved', 'paid')
      union
      select company_id, date_trunc('month', payment_date)::date as month_start from payments where payment_status = 'settled'
    ) months
    where month_start is not null
    group by company_id, month_start
  ) monthly on monthly.company_id = c.id
  left join (
    select company_id, date_trunc('month', recognition_date)::date as month_start, sum(amount) as recognized_revenue
    from revenue_records
    group by company_id, date_trunc('month', recognition_date)::date
  ) revenue on revenue.company_id = c.id and revenue.month_start = monthly.month_start
  left join (
    select company_id, date_trunc('month', expense_date)::date as month_start, sum(amount) as approved_expenses
    from expenses
    where expense_status in ('approved', 'paid')
    group by company_id, date_trunc('month', expense_date)::date
  ) expenses on expenses.company_id = c.id and expenses.month_start = monthly.month_start
  left join (
    select
      company_id,
      date_trunc('month', payment_date)::date as month_start,
      sum(case when direction = 'inflow' then amount else 0 end) as cash_in,
      sum(case when direction = 'outflow' then amount else 0 end) as cash_out
    from payments
    where payment_status = 'settled'
    group by company_id, date_trunc('month', payment_date)::date
  ) payments on payments.company_id = c.id and payments.month_start = monthly.month_start
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
  group by month_start
),
operating_monthly as (
  select *
  from direct_monthly
  where company_code in ('TBR'::company_code, 'FSP'::company_code)
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

create or replace view receivables_aging as
select
  c.code as company_code,
  i.id as invoice_id,
  i.invoice_number,
  sc.name as counterparty_name,
  i.due_date,
  i.total_amount,
  coalesce(sum(case when p.direction = 'inflow' and p.payment_status = 'settled' then p.amount else 0 end), 0)::numeric(14,2) as collected_amount,
  (i.total_amount - coalesce(sum(case when p.direction = 'inflow' and p.payment_status = 'settled' then p.amount else 0 end), 0))::numeric(14,2) as outstanding_amount
from invoices i
join companies c on c.id = i.company_id
left join sponsors_or_customers sc on sc.id = i.sponsor_or_customer_id
left join payments p on p.invoice_id = i.id
where i.direction = 'receivable'
group by c.code, i.id, i.invoice_number, sc.name, i.due_date, i.total_amount;

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
  and i.invoice_status in ('issued', 'partially_paid', 'overdue');

create or replace view tbr_race_cost_summary as
select
  re.code as race_code,
  re.name as race_name,
  coalesce(invoice_totals.event_invoice_total, 0)::numeric(14,2) as event_invoice_total,
  coalesce(expense_totals.reimbursement_total, 0)::numeric(14,2) as reimbursement_total,
  coalesce(expense_totals.total_race_cost, 0)::numeric(14,2) as total_race_cost,
  re.season_year,
  re.event_start_date
from race_events re
join companies c on c.id = re.company_id and c.code = 'TBR'
left join (
  select
    race_event_id,
    sum(total_amount) as event_invoice_total
  from invoices
  where direction = 'payable'
  group by race_event_id
) invoice_totals on invoice_totals.race_event_id = re.id
left join (
  select
    race_event_id,
    sum(case when is_reimbursable then amount else 0 end) as reimbursement_total,
    sum(amount) as total_race_cost
  from expenses
  where expense_status in ('approved', 'paid')
  group by race_event_id
) expense_totals on expense_totals.race_event_id = re.id;

create or replace view tbr_sponsor_revenue_summary as
select
  sc.name as sponsor_name,
  coalesce(contract_totals.total_contract_value, 0)::numeric(14,2) as total_contract_value,
  coalesce(revenue_totals.recognized_revenue, 0)::numeric(14,2) as recognized_revenue,
  coalesce(payment_totals.cash_collected, 0)::numeric(14,2) as cash_collected
from sponsors_or_customers sc
join companies c on c.id = sc.company_id and c.code = 'TBR'
left join (
  select sponsor_or_customer_id, sum(contract_value) as total_contract_value
  from contracts
  group by sponsor_or_customer_id
) contract_totals on contract_totals.sponsor_or_customer_id = sc.id
left join (
  select sponsor_or_customer_id, sum(amount) as recognized_revenue
  from revenue_records
  group by sponsor_or_customer_id
) revenue_totals on revenue_totals.sponsor_or_customer_id = sc.id
left join (
  select
    i.sponsor_or_customer_id,
    sum(case when p.direction = 'inflow' and p.payment_status = 'settled' then p.amount else 0 end) as cash_collected
  from invoices i
  left join payments p on p.invoice_id = i.id
  where i.direction = 'receivable'
  group by i.sponsor_or_customer_id
) payment_totals on payment_totals.sponsor_or_customer_id = sc.id;

create or replace view commercial_goal_progress as
select
  c.code as company_code,
  ct.target_period_start,
  ct.target_period_end,
  ct.target_label,
  ct.target_value,
  coalesce(sum(rr.amount), 0)::numeric(14,2) as actual_revenue,
  (ct.target_value - coalesce(sum(rr.amount), 0))::numeric(14,2) as gap_to_target
from commercial_targets ct
join companies c on c.id = ct.company_id
left join revenue_records rr
  on rr.company_id = ct.company_id
 and rr.recognition_date between ct.target_period_start and ct.target_period_end
group by c.code, ct.target_period_start, ct.target_period_end, ct.target_label, ct.target_value;

create or replace view partner_performance as
select
  o.name as owner_name,
  c.code as company_code,
  coalesce(target_totals.target_revenue, 0)::numeric(14,2) as target_revenue,
  coalesce(revenue_totals.recognized_revenue, 0)::numeric(14,2) as recognized_revenue
from owners o
join companies c on c.id = o.company_id
left join (
  select owner_id, sum(target_value) as target_revenue
  from commercial_targets
  group by owner_id
) target_totals on target_totals.owner_id = o.id
left join (
  select owner_id, sum(amount) as recognized_revenue
  from revenue_records
  group by owner_id
) revenue_totals on revenue_totals.owner_id = o.id;
