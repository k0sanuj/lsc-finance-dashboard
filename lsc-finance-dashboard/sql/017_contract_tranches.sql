-- 017: Contract tranches for scheduled payment milestones
-- Breaks contracts into calendar-linked payment tranches with deliverable gating

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tranche_trigger_type') then
    create type tranche_trigger_type as enum ('on_signing', 'pre_event', 'post_event', 'on_milestone', 'on_date');
  end if;
  if not exists (select 1 from pg_type where typname = 'tranche_status') then
    create type tranche_status as enum ('scheduled', 'active', 'invoiced', 'collected');
  end if;
end
$$;

create table if not exists contract_tranches (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id),
  company_id uuid not null references companies(id),
  sponsor_or_customer_id uuid not null references sponsors_or_customers(id),
  tranche_number integer not null,
  tranche_label text not null,
  tranche_percentage numeric(5,2) not null default 0,
  tranche_amount numeric(14,2) not null default 0,
  trigger_type tranche_trigger_type not null,
  trigger_race_event_id uuid references race_events(id) on delete set null,
  trigger_date date,
  trigger_offset_days integer not null default 0,
  deliverable_checklist_id uuid references deliverable_checklists(id) on delete set null,
  tranche_status tranche_status not null default 'scheduled',
  activated_at timestamptz,
  invoiced_at timestamptz,
  collected_at timestamptz,
  linked_invoice_id uuid references invoices(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contract_tranches_contract on contract_tranches(contract_id);
create index if not exists idx_contract_tranches_company on contract_tranches(company_id, tranche_status);
create index if not exists idx_contract_tranches_trigger_date on contract_tranches(trigger_date) where trigger_date is not null;

-- Per-contract tranche summary view
create or replace view tranche_schedule_summary as
select
  ct.contract_id,
  ct.company_id,
  c.code as company_code,
  con.contract_name,
  sc.name as sponsor_name,
  con.contract_value as full_contract_value,
  con.currency_code,
  count(*)::integer as total_tranches,
  count(*) filter (where ct.tranche_status = 'active')::integer as active_count,
  count(*) filter (where ct.tranche_status = 'invoiced')::integer as invoiced_count,
  count(*) filter (where ct.tranche_status = 'collected')::integer as collected_count,
  coalesce(sum(ct.tranche_amount), 0)::numeric(14,2) as total_scheduled_value,
  coalesce(sum(ct.tranche_amount) filter (where ct.tranche_status in ('invoiced', 'collected')), 0)::numeric(14,2) as invoiced_value,
  coalesce(sum(ct.tranche_amount) filter (where ct.tranche_status = 'collected'), 0)::numeric(14,2) as collected_value,
  (select ct_next.tranche_label
   from contract_tranches ct_next
   where ct_next.contract_id = ct.contract_id
     and ct_next.tranche_status = 'scheduled'
   order by ct_next.tranche_number
   limit 1) as next_tranche_label,
  (select
     case ct_next.trigger_type
       when 'on_date' then ct_next.trigger_date
       when 'on_signing' then con.start_date
       when 'pre_event' then (re_next.event_start_date + ct_next.trigger_offset_days)
       when 'post_event' then (coalesce(re_next.event_end_date, re_next.event_start_date) + ct_next.trigger_offset_days)
       else ct_next.trigger_date
     end
   from contract_tranches ct_next
   left join race_events re_next on re_next.id = ct_next.trigger_race_event_id
   where ct_next.contract_id = ct.contract_id
     and ct_next.tranche_status = 'scheduled'
   order by ct_next.tranche_number
   limit 1) as next_tranche_date,
  exists(
    select 1 from contract_tranches ct_blocked
    join deliverable_checklist_summary dcs on dcs.checklist_id = ct_blocked.deliverable_checklist_id
    where ct_blocked.contract_id = ct.contract_id
      and ct_blocked.tranche_status = 'active'
      and dcs.invoice_eligible = false
  ) as has_blocked_tranche
from contract_tranches ct
join contracts con on con.id = ct.contract_id
join companies c on c.id = ct.company_id
join sponsors_or_customers sc on sc.id = ct.sponsor_or_customer_id
group by ct.contract_id, ct.company_id, c.code,
         con.contract_name, con.contract_value, con.currency_code, con.start_date,
         sc.name;
