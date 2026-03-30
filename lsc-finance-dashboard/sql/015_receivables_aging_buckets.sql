-- 015: Receivables aging buckets + payables aging views
-- Extends existing receivables_aging and payments_due with computed aging columns

create or replace view receivables_aging_buckets as
select
  ra.company_code,
  ra.invoice_id,
  ra.invoice_number,
  ra.counterparty_name,
  ra.due_date,
  ra.total_amount,
  ra.collected_amount,
  ra.outstanding_amount,
  greatest(0, current_date - ra.due_date) as days_overdue,
  (ra.due_date - current_date) as days_until_due,
  case
    when ra.due_date >= current_date then 'current'
    when (current_date - ra.due_date) between 1 and 30 then '1_30'
    when (current_date - ra.due_date) between 31 and 60 then '31_60'
    when (current_date - ra.due_date) between 61 and 90 then '61_90'
    else '90_plus'
  end as aging_bucket
from receivables_aging ra
where ra.outstanding_amount > 0;

create or replace view payables_aging as
select
  pd.company_code,
  pd.invoice_number,
  pd.due_date,
  pd.total_amount,
  pd.invoice_status,
  pd.race_name,
  pd.description,
  greatest(0, current_date - pd.due_date) as days_overdue,
  (pd.due_date - current_date) as days_until_due,
  case
    when pd.due_date is null then 'current'
    when pd.due_date >= current_date then 'current'
    when (current_date - pd.due_date) between 1 and 30 then '1_30'
    when (current_date - pd.due_date) between 31 and 60 then '31_60'
    when (current_date - pd.due_date) between 61 and 90 then '61_90'
    else '90_plus'
  end as aging_bucket
from payments_due pd;
