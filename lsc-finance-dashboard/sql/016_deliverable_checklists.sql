-- 016: Deliverable checklists for revenue recognition gating
-- Tracks sponsor deliverables and gates revenue recognition + invoice sending

-- Enum for deliverable completion status
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'deliverable_completion_status'
  ) then
    create type deliverable_completion_status as enum ('pending', 'in_progress', 'completed', 'waived');
  end if;
end
$$;

-- Deliverable checklists: groups deliverables for a contract/sponsor
create table if not exists deliverable_checklists (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id),
  sponsor_or_customer_id uuid not null references sponsors_or_customers(id),
  company_id uuid not null references companies(id),
  checklist_title text not null,
  total_revenue_value numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  created_by_user_id uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deliverable_checklists_contract
  on deliverable_checklists(contract_id);
create index if not exists idx_deliverable_checklists_company
  on deliverable_checklists(company_id, created_at desc);

-- Deliverable items: individual line items within a checklist
create table if not exists deliverable_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references deliverable_checklists(id) on delete cascade,
  item_label text not null,
  item_description text,
  responsible_owner_id uuid references owners(id) on delete set null,
  due_date date,
  revenue_amount numeric(14,2) not null default 0,
  completion_status deliverable_completion_status not null default 'pending',
  evidence_source_document_id uuid references source_documents(id) on delete set null,
  completed_at timestamptz,
  completed_by_user_id uuid references app_users(id) on delete set null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deliverable_items_checklist
  on deliverable_items(checklist_id, sort_order);

-- Per-checklist summary view
create or replace view deliverable_checklist_summary as
select
  dc.id as checklist_id,
  dc.contract_id,
  dc.sponsor_or_customer_id,
  dc.company_id,
  c.code as company_code,
  dc.checklist_title,
  dc.total_revenue_value,
  dc.currency_code,
  sc.name as sponsor_name,
  ct.contract_name,
  ct.contract_value as full_contract_value,
  count(di.id)::integer as total_items,
  count(di.id) filter (where di.completion_status = 'completed')::integer as completed_items,
  count(di.id) filter (where di.completion_status = 'waived')::integer as waived_items,
  count(di.id) filter (where di.completion_status = 'in_progress')::integer as in_progress_items,
  case
    when count(di.id) = 0 then 0
    else round(
      (count(di.id) filter (where di.completion_status in ('completed', 'waived')))::numeric
      / count(di.id) * 100, 1
    )
  end as completion_percentage,
  coalesce(
    sum(di.revenue_amount) filter (where di.completion_status in ('completed', 'waived')),
    0
  )::numeric(14,2) as recognized_revenue,
  (dc.total_revenue_value - coalesce(
    sum(di.revenue_amount) filter (where di.completion_status in ('completed', 'waived')),
    0
  ))::numeric(14,2) as deferred_revenue,
  case
    when count(di.id) > 0
      and count(di.id) = count(di.id) filter (where di.completion_status in ('completed', 'waived'))
    then true
    else false
  end as invoice_eligible,
  min(di.due_date) filter (where di.completion_status not in ('completed', 'waived')) as next_due_date,
  dc.created_at
from deliverable_checklists dc
join companies c on c.id = dc.company_id
join sponsors_or_customers sc on sc.id = dc.sponsor_or_customer_id
join contracts ct on ct.id = dc.contract_id
left join deliverable_items di on di.checklist_id = dc.id
group by dc.id, dc.contract_id, dc.sponsor_or_customer_id, dc.company_id,
         c.code, dc.checklist_title, dc.total_revenue_value, dc.currency_code,
         sc.name, ct.contract_name, ct.contract_value, dc.created_at;

-- Per-sponsor aggregate view
create or replace view sponsor_deliverable_summary as
select
  dcs.company_code,
  dcs.sponsor_or_customer_id,
  dcs.sponsor_name,
  sum(dcs.full_contract_value)::numeric(14,2) as total_contract_value,
  sum(dcs.recognized_revenue)::numeric(14,2) as total_recognized,
  sum(dcs.deferred_revenue)::numeric(14,2) as total_deferred,
  sum(dcs.total_items)::integer as total_items,
  sum(dcs.completed_items)::integer as total_completed,
  case
    when sum(dcs.total_items) = 0 then 0
    else round(sum(dcs.completed_items)::numeric / sum(dcs.total_items) * 100, 1)
  end as overall_completion_pct,
  bool_and(dcs.invoice_eligible) as all_invoiceable
from deliverable_checklist_summary dcs
group by dcs.company_code, dcs.sponsor_or_customer_id, dcs.sponsor_name;
