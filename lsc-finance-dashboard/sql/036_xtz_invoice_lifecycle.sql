-- 036_xtz_invoice_lifecycle.sql
-- XTZ invoice lifecycle safety:
-- dashboard/edit/clone/void support, invoice-number uniqueness, AI item lineage,
-- and generated-draft cleanup for terminated employee payroll lines.

alter type payroll_invoice_status add value if not exists 'void';

alter table payroll_invoices
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_user_id uuid references app_users(id) on delete set null,
  add column if not exists void_reason text,
  add column if not exists cloned_from_invoice_id uuid references payroll_invoices(id) on delete set null;

alter table payroll_invoice_items
  add column if not exists ai_intake_draft_id uuid references ai_intake_drafts(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_payroll_invoices_invoice_number_unique
  on payroll_invoices(invoice_number);

create index if not exists idx_payroll_invoices_status_month
  on payroll_invoices(status, payroll_month desc, invoice_date desc);

create index if not exists idx_payroll_invoices_cloned_from
  on payroll_invoices(cloned_from_invoice_id);

create index if not exists idx_payroll_invoice_items_ai_draft
  on payroll_invoice_items(ai_intake_draft_id);

with terminated_generated_items as (
  select pii.id
  from payroll_invoice_items pii
  join payroll_invoices pi on pi.id = pii.payroll_invoice_id
  join employees e on e.id = pii.employee_id
  where pi.status = 'generated'
    and pii.section = 'payroll'
    and e.status = 'terminated'
)
delete from payroll_invoice_items pii
using terminated_generated_items tgi
where pii.id = tgi.id;

with totals as (
  select
    pi.id as invoice_id,
    coalesce(sum(pii.amount), 0)::numeric(14,2) as subtotal
  from payroll_invoices pi
  left join payroll_invoice_items pii on pii.payroll_invoice_id = pi.id
  where pi.status = 'generated'
  group by pi.id
)
update payroll_invoices pi
set subtotal = totals.subtotal,
    total_amount = (totals.subtotal + pi.tax_amount)::numeric(14,2),
    updated_at = now()
from totals
where pi.id = totals.invoice_id;
