-- 018: Finance V2 — vendors, subscriptions, gig workers, cap table, litigation,
--      tax filings, SP multipliers, subsidies, arena/ads, cross-dashboard messaging,
--      audit reports, and agent activity log

-- ============================================================
-- 1. Extend company_code enum to include XTZ
-- ============================================================
alter type company_code add value if not exists 'XTZ';

-- ============================================================
-- 2. Vendors and production partners
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'vendor_type') then
    create type vendor_type as enum (
      'production_partner', 'venue', 'saas', 'service_provider',
      'equipment', 'catering', 'travel', 'legal', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'vendor_status') then
    create type vendor_status as enum ('active', 'inactive', 'under_review');
  end if;
end $$;

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor_type vendor_type not null default 'other',
  status vendor_status not null default 'active',
  payment_terms text,
  tax_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vendor_entity_links (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  company_id uuid not null references companies(id),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (vendor_id, company_id)
);

create table if not exists vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  contact_name text not null,
  email text,
  phone text,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists production_partners (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  scope_of_work text,
  contract_value numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  payment_schedule text,
  performance_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists venue_agreements (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  company_id uuid not null references companies(id),
  venue_name text not null,
  location text,
  rental_cost numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  agreement_start date,
  agreement_end date,
  event_dates text,
  deposit_amount numeric(14,2) not null default 0,
  deposit_status text not null default 'pending',
  outstanding_balance numeric(14,2) not null default 0,
  conditions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vendor spend summary view
create or replace view vendor_spend_summary as
select
  v.id as vendor_id,
  v.name as vendor_name,
  v.vendor_type,
  v.status as vendor_status,
  v.payment_terms,
  vel.company_id,
  c.code as company_code,
  coalesce(sum(inv.total_amount) filter (where inv.direction = 'payable'), 0)::numeric(14,2) as total_spend,
  coalesce(sum(inv.total_amount) filter (
    where inv.direction = 'payable'
    and inv.issue_date >= date_trunc('year', current_date)
  ), 0)::numeric(14,2) as ytd_spend,
  coalesce(sum(inv.total_amount) filter (
    where inv.direction = 'payable'
    and inv.issue_date >= date_trunc('month', current_date)
  ), 0)::numeric(14,2) as mtd_spend,
  max(inv.issue_date) as last_invoice_date,
  count(distinct inv.id) filter (where inv.direction = 'payable') as invoice_count
from vendors v
left join vendor_entity_links vel on vel.vendor_id = v.id
left join companies c on c.id = vel.company_id
left join invoices inv on inv.sponsor_or_customer_id = (
  select sc.id from sponsors_or_customers sc
  where sc.name = v.name and sc.company_id = vel.company_id
  limit 1
)
group by v.id, v.name, v.vendor_type, v.status, v.payment_terms, vel.company_id, c.code;

create index if not exists idx_vendor_entity_links_vendor on vendor_entity_links(vendor_id);
create index if not exists idx_vendor_entity_links_company on vendor_entity_links(company_id);

-- ============================================================
-- 3. Software and subscriptions
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type subscription_status as enum ('active', 'trial', 'cancelled', 'pending_cancellation');
  end if;
  if not exists (select 1 from pg_type where typname = 'billing_cycle') then
    create type billing_cycle as enum ('monthly', 'quarterly', 'annual', 'one_time');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_category') then
    create type subscription_category as enum (
      'infrastructure', 'communication', 'design', 'analytics',
      'legal', 'hr', 'finance', 'marketing', 'security', 'other'
    );
  end if;
end $$;

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null,
  company_id uuid references companies(id),
  is_shared boolean not null default false,
  monthly_cost numeric(14,2) not null default 0,
  annual_cost numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  billing_cycle billing_cycle not null default 'monthly',
  next_billing_date date,
  auto_renew boolean not null default true,
  contract_end_date date,
  category subscription_category not null default 'other',
  status subscription_status not null default 'active',
  last_accessed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_alert_type') then
    create type subscription_alert_type as enum (
      'renewal_30d', 'renewal_15d', 'renewal_7d',
      'cost_change', 'unused_60d', 'cancellation_pending'
    );
  end if;
end $$;

create table if not exists subscription_alerts (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  alert_type subscription_alert_type not null,
  message text not null,
  is_dismissed boolean not null default false,
  triggered_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_company on subscriptions(company_id);
create index if not exists idx_subscriptions_status on subscriptions(status);
create index if not exists idx_subscription_alerts_sub on subscription_alerts(subscription_id);

-- ============================================================
-- 4. Tax and filing
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tax_type') then
    create type tax_type as enum ('gst', 'vat', 'corporate_tax', 'withholding', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'tax_filing_status') then
    create type tax_filing_status as enum ('draft', 'prepared', 'filed', 'accepted', 'rejected');
  end if;
end $$;

create table if not exists tax_calculations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id),
  company_id uuid not null references companies(id),
  tax_type tax_type not null,
  taxable_amount numeric(14,2) not null default 0,
  tax_rate numeric(6,4) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  period_start date,
  period_end date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists tax_filings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  tax_type tax_type not null,
  filing_period_start date not null,
  filing_period_end date not null,
  total_taxable numeric(14,2) not null default 0,
  total_tax_payable numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  status tax_filing_status not null default 'draft',
  filed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tax_calculations_invoice on tax_calculations(invoice_id);
create index if not exists idx_tax_calculations_company on tax_calculations(company_id, tax_type);
create index if not exists idx_tax_filings_company on tax_filings(company_id, tax_type);

-- ============================================================
-- 5. Gig workers (XTZ India / Kenya)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'gig_payment_method') then
    create type gig_payment_method as enum ('bank_transfer', 'mobile_money', 'upi', 'paypal', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'gig_payment_frequency') then
    create type gig_payment_frequency as enum ('per_task', 'weekly', 'bi_weekly', 'monthly');
  end if;
  if not exists (select 1 from pg_type where typname = 'payout_status') then
    create type payout_status as enum ('pending', 'processing', 'paid', 'failed', 'cancelled');
  end if;
end $$;

create table if not exists gig_workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  location text not null,
  country_code text not null default 'IN',
  role_type text,
  payment_method gig_payment_method not null default 'bank_transfer',
  payment_frequency gig_payment_frequency not null default 'monthly',
  rate_amount numeric(14,2) not null default 0,
  rate_currency text not null default 'INR',
  tax_withholding_rate numeric(6,4) not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gig_worker_tasks (
  id uuid primary key default gen_random_uuid(),
  gig_worker_id uuid not null references gig_workers(id) on delete cascade,
  task_description text not null,
  task_date date not null default current_date,
  hours_worked numeric(6,2),
  units_completed integer,
  gross_amount numeric(14,2) not null default 0,
  currency_code text not null default 'INR',
  is_approved boolean not null default false,
  approved_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists gig_worker_payouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  gig_worker_id uuid not null references gig_workers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_amount numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  currency_code text not null default 'INR',
  payment_method gig_payment_method not null default 'bank_transfer',
  status payout_status not null default 'pending',
  payment_reference text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gig_workers_company on gig_workers(company_id);
create index if not exists idx_gig_worker_tasks_worker on gig_worker_tasks(gig_worker_id);
create index if not exists idx_gig_worker_payouts_worker on gig_worker_payouts(gig_worker_id);
create index if not exists idx_gig_worker_payouts_company on gig_worker_payouts(company_id, status);

-- ============================================================
-- 6. Cap table
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'share_class') then
    create type share_class as enum ('common', 'preferred_a', 'preferred_b', 'esop_pool', 'warrant');
  end if;
  if not exists (select 1 from pg_type where typname = 'cap_table_event_type') then
    create type cap_table_event_type as enum ('grant', 'exercise', 'transfer', 'repurchase', 'round', 'vesting');
  end if;
end $$;

create table if not exists cap_table_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  holder_name text not null,
  holder_type text not null default 'founder',
  share_class share_class not null default 'common',
  shares_held integer not null default 0,
  exercise_price numeric(14,4) not null default 0,
  vesting_start_date date,
  vesting_end_date date,
  vesting_cliff_months integer,
  vesting_total_months integer,
  shares_vested integer not null default 0,
  notes text,
  agreement_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cap_table_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  cap_table_entry_id uuid references cap_table_entries(id) on delete set null,
  event_type cap_table_event_type not null,
  event_date date not null default current_date,
  shares_affected integer not null default 0,
  price_per_share numeric(14,4),
  from_holder text,
  to_holder text,
  round_name text,
  pre_money_valuation numeric(16,2),
  post_money_valuation numeric(16,2),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists investors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  investor_type text not null default 'institutional',
  investment_amount numeric(14,2) not null default 0,
  investment_date date,
  share_class share_class not null default 'preferred_a',
  shares_held integer not null default 0,
  ownership_percentage numeric(6,4) not null default 0,
  round_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cap_table_entries_company on cap_table_entries(company_id);
create index if not exists idx_cap_table_events_company on cap_table_events(company_id);
create index if not exists idx_investors_company on investors(company_id);

-- Cap table summary view
create or replace view cap_table_summary as
select
  cte.company_id,
  c.code as company_code,
  cte.holder_name,
  cte.holder_type,
  cte.share_class,
  cte.shares_held,
  cte.shares_vested,
  cte.exercise_price,
  round(
    cte.shares_held::numeric / nullif(
      (select sum(cte2.shares_held) from cap_table_entries cte2 where cte2.company_id = cte.company_id), 0
    ) * 100, 2
  ) as ownership_pct,
  cte.vesting_start_date,
  cte.vesting_end_date,
  cte.agreement_reference,
  cte.created_at
from cap_table_entries cte
join companies c on c.id = cte.company_id;

-- ============================================================
-- 7. Litigation finance
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'litigation_cost_type') then
    create type litigation_cost_type as enum ('counsel_fees', 'filing_fees', 'court_costs', 'settlement', 'insurance', 'other');
  end if;
end $$;

create table if not exists litigation_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  case_reference text not null,
  case_name text not null,
  cost_type litigation_cost_type not null,
  amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  incurred_date date not null default current_date,
  description text,
  source_system text default 'finance',
  created_at timestamptz not null default now()
);

create table if not exists litigation_reserves (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  case_reference text not null,
  case_name text not null,
  estimated_exposure numeric(14,2) not null default 0,
  reserve_amount numeric(14,2) not null default 0,
  insurance_coverage numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_litigation_costs_company on litigation_costs(company_id);
create index if not exists idx_litigation_reserves_company on litigation_reserves(company_id);

-- ============================================================
-- 8. Compliance costs (received from Legal Dashboard)
-- ============================================================
create table if not exists compliance_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  cost_category text not null,
  description text,
  amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  jurisdiction text,
  period_start date,
  period_end date,
  source_system text default 'legal',
  created_at timestamptz not null default now()
);

create index if not exists idx_compliance_costs_company on compliance_costs(company_id);

-- ============================================================
-- 9. FSP SP Multiplier system
-- ============================================================
create table if not exists sp_multipliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  multiplier_ratio numeric(8,4) not null default 1.0,
  trigger_threshold numeric(14,2) not null default 0,
  is_active boolean not null default true,
  configured_by uuid references app_users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sp_release_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  sp_amount numeric(14,2) not null default 0,
  revenue_amount numeric(14,2) not null default 0,
  sp_revenue_ratio numeric(8,4),
  released_by uuid references app_users(id),
  release_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sp_multipliers_company on sp_multipliers(company_id);
create index if not exists idx_sp_release_log_company on sp_release_log(company_id);

-- ============================================================
-- 10. Subsidies finance
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'subsidy_status') then
    create type subsidy_status as enum ('approved', 'disbursed', 'partially_disbursed', 'completed', 'cancelled');
  end if;
end $$;

create table if not exists subsidies_finance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  subsidy_name text not null,
  granting_body text,
  approved_amount numeric(14,2) not null default 0,
  disbursed_amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  status subsidy_status not null default 'approved',
  conditions text,
  reporting_requirements text,
  approval_date date,
  next_disbursement_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subsidies_invoices (
  id uuid primary key default gen_random_uuid(),
  subsidy_id uuid not null references subsidies_finance(id) on delete cascade,
  company_id uuid not null references companies(id),
  invoice_number text,
  amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  disbursement_date date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_subsidies_finance_company on subsidies_finance(company_id);
create index if not exists idx_subsidies_invoices_subsidy on subsidies_invoices(subsidy_id);

-- ============================================================
-- 11. Arena and Ads finance
-- ============================================================
create table if not exists arena_financials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  partner_name text not null,
  agreement_type text not null default 'msa',
  revenue numeric(14,2) not null default 0,
  cost_of_services numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  period_start date,
  period_end date,
  participant_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ads_revenue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  ad_partner text not null,
  revenue_amount numeric(14,2) not null default 0,
  payment_amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  period_start date,
  period_end date,
  impressions integer,
  clicks integer,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_arena_financials_company on arena_financials(company_id);
create index if not exists idx_ads_revenue_company on ads_revenue(company_id);

-- ============================================================
-- 12. Cross-dashboard messaging
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'cross_message_priority') then
    create type cross_message_priority as enum ('critical', 'high', 'normal', 'low');
  end if;
end $$;

create table if not exists cross_dashboard_messages (
  id uuid primary key default gen_random_uuid(),
  from_system text not null,
  to_system text not null,
  intent text not null,
  payload jsonb not null default '{}'::jsonb,
  priority cross_message_priority not null default 'normal',
  requires_response boolean not null default false,
  is_processed boolean not null default false,
  processed_at timestamptz,
  response_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cross_messages_system on cross_dashboard_messages(to_system, is_processed);
create index if not exists idx_cross_messages_created on cross_dashboard_messages(created_at desc);

-- ============================================================
-- 13. Agent activity log
-- ============================================================
create table if not exists agent_activity_log (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  performed_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_activity_agent on agent_activity_log(agent_id);
create index if not exists idx_agent_activity_created on agent_activity_log(created_at desc);

-- ============================================================
-- 14. Audit reports
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'audit_report_status') then
    create type audit_report_status as enum ('running', 'completed', 'failed');
  end if;
end $$;

create table if not exists audit_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  audit_period_start date not null,
  audit_period_end date not null,
  status audit_report_status not null default 'running',
  total_checks integer not null default 0,
  passed_checks integer not null default 0,
  failed_checks integer not null default 0,
  discrepancies jsonb not null default '[]'::jsonb,
  summary text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_reports_company on audit_reports(company_id);

-- ============================================================
-- 15. Invoice line items (for math verification)
-- ============================================================
create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  tax_rate numeric(6,4) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_line_items_invoice on invoice_line_items(invoice_id);
