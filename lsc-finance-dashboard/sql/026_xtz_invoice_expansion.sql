-- 026: XTZ India invoice expansion
-- Adds support for MDG fees, provisions, reimbursements, and software expenses
-- inside a single monthly XTZ India → XTE invoice.
--
-- Also extends employees with USD-salary support and payroll_invoice_items with
-- structured sections + FX context + source document linking.

-- ============================================================
-- 1. Employees: support fixed USD salaries
-- ============================================================
alter table employees
  add column if not exists salary_usd numeric(14,2) not null default 0,
  add column if not exists is_usd_salary boolean not null default false,
  add column if not exists end_date date;

-- Backfill: employees with salary_currency = 'USD' should flip is_usd_salary
update employees
set is_usd_salary = true, salary_usd = base_salary
where salary_currency = 'USD' and is_usd_salary = false;

-- ============================================================
-- 2. XTZ invoice sections enum — the kind of line on the invoice
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'xtz_invoice_section') then
    create type xtz_invoice_section as enum (
      'payroll',
      'mdg_fees',
      'reimbursement',
      'provision',
      'software_expense',
      'other'
    );
  end if;
end $$;

-- ============================================================
-- 3. Extend payroll_invoice_items with structure + FX + document link
-- ============================================================
alter table payroll_invoice_items
  add column if not exists section xtz_invoice_section not null default 'payroll',
  add column if not exists original_amount numeric(14,2),
  add column if not exists original_currency text,
  add column if not exists fx_rate numeric(14,6),
  add column if not exists source_document_id uuid references source_documents(id),
  add column if not exists reference_note text,
  add column if not exists vendor_name text,
  add column if not exists is_provision boolean not null default false,
  add column if not exists display_order integer not null default 0;

create index if not exists idx_payroll_invoice_items_section
  on payroll_invoice_items(payroll_invoice_id, section);

-- ============================================================
-- 4. Extend payroll_invoices header with issuer banking metadata
-- ============================================================
alter table payroll_invoices
  add column if not exists issuer_legal_name text,
  add column if not exists issuer_gstin text,
  add column if not exists issuer_cin text,
  add column if not exists issuer_pan text,
  add column if not exists issuer_address text,
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_swift text,
  add column if not exists bank_ad_code text,
  add column if not exists bank_branch text,
  add column if not exists bank_branch_address text,
  add column if not exists recipient_legal_name text,
  add column if not exists recipient_address text;

-- ============================================================
-- 5. MDG fees (fixed monthly professional/management fees)
-- ============================================================
create table if not exists mdg_fees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  fee_month date not null,
  description text not null default 'MDG Fees',
  amount numeric(14,2) not null default 0,
  currency_code text not null default 'INR',
  status text not null default 'pending',
  invoiced_item_id uuid references payroll_invoice_items(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, fee_month)
);

create index if not exists idx_mdg_fees_company_month on mdg_fees(company_id, fee_month);

-- ============================================================
-- 6. Provisions (estimated accruals for items not yet invoiced)
-- ============================================================
create table if not exists provisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  provision_month date not null,
  description text not null,
  category text not null default 'other',
  vendor_name text,
  estimated_amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  status text not null default 'estimated',
  invoiced_item_id uuid references payroll_invoice_items(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_provisions_company_month on provisions(company_id, provision_month);

-- ============================================================
-- 7. Software expenses (monthly bill records per subscription)
--    Separate from `subscriptions` (which is the register) so each
--    month's bill can be independently tracked, attached to a document,
--    and rolled into an XTZ invoice.
-- ============================================================
create table if not exists software_expenses (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id),
  paying_company_id uuid not null references companies(id),
  expense_month date not null,
  vendor_name text not null,
  description text,
  amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  is_yearly_renewal boolean not null default false,
  source_document_id uuid references source_documents(id),
  status text not null default 'unpaid',
  invoiced_item_id uuid references payroll_invoice_items(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_software_expenses_paying on software_expenses(paying_company_id, expense_month);
create index if not exists idx_software_expenses_subscription on software_expenses(subscription_id);

-- ============================================================
-- 8. Reimbursement line items (standalone from expense_submissions)
--    A lightweight record for reimbursements the Finance team wants
--    to put on the XTZ invoice without routing them through the full
--    expense_submissions workflow.
-- ============================================================
create table if not exists reimbursement_items (
  id uuid primary key default gen_random_uuid(),
  reimbursing_company_id uuid not null references companies(id),
  beneficiary_company_id uuid references companies(id),
  expense_month date not null,
  description text not null,
  vendor_name text,
  amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD',
  source_document_id uuid references source_documents(id),
  status text not null default 'pending',
  invoiced_item_id uuid references payroll_invoice_items(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reimbursement_items_month
  on reimbursement_items(reimbursing_company_id, expense_month);

-- ============================================================
-- 9. Seed real employees from XTZ India payroll screenshot
--    USD fixed salaries: Mohit Jain $1500, Siddha Bhongade $800,
--                        Love Chaudhary (offboarded, last payroll),
--                        Dhruv Sharma $700
--    INR salaries (live FX applied at invoice time):
--      Anuj Singh ₹184,520, Sayan Mukherjee ₹322,910
-- ============================================================
do $$
declare
  xtz_id uuid;
begin
  select id into xtz_id from companies where code = 'XTZ'::company_code;
  if xtz_id is null then return; end if;

  -- Anuj Singh (INR, live FX)
  insert into employees (company_id, full_name, email, designation, department, region,
                         employment_type, status, base_salary, salary_currency, is_usd_salary)
  select xtz_id, 'Anuj Singh', 'anuj@lscsports.co', 'Operations & Finance Lead', 'Operations', 'India',
         'full_time'::employment_type, 'active'::employee_status, 184520, 'INR', false
  where not exists (select 1 from employees where full_name = 'Anuj Singh' and company_id = xtz_id);

  -- Sayan Mukherjee (INR, live FX)
  insert into employees (company_id, full_name, email, designation, department, region,
                         employment_type, status, base_salary, salary_currency, is_usd_salary)
  select xtz_id, 'Sayan Mukherjee', 'sayan@lscsports.co', 'Product Lead', 'Product', 'India',
         'full_time'::employment_type, 'active'::employee_status, 322910, 'INR', false
  where not exists (select 1 from employees where full_name = 'Sayan Mukherjee' and company_id = xtz_id);

  -- Mohit Jain (fixed USD $1,500 → approx ₹130,000 shown on screenshot)
  insert into employees (company_id, full_name, email, designation, department, region,
                         employment_type, status, base_salary, salary_currency,
                         is_usd_salary, salary_usd)
  select xtz_id, 'Mohit Jain', null, 'Software Engineer', 'Engineering', 'India',
         'full_time'::employment_type, 'active'::employee_status, 130000, 'INR',
         true, 1500
  where not exists (select 1 from employees where full_name = 'Mohit Jain' and company_id = xtz_id);

  -- Love Chaudhary (offboarded, final payroll ₹60,000 / ~$690)
  insert into employees (company_id, full_name, email, designation, department, region,
                         employment_type, status, base_salary, salary_currency,
                         is_usd_salary, salary_usd, end_date, notes)
  select xtz_id, 'Love Chaudhary', null, 'Software Engineer', 'Engineering', 'India',
         'contract'::employment_type, 'terminated'::employee_status, 60000, 'INR',
         true, 690, current_date, 'Offboarded — final payroll only'
  where not exists (select 1 from employees where full_name = 'Love Chaudhary' and company_id = xtz_id);

  -- Siddha Bhongade (fixed USD $800 → ~₹70,000)
  insert into employees (company_id, full_name, email, designation, department, region,
                         employment_type, status, base_salary, salary_currency,
                         is_usd_salary, salary_usd)
  select xtz_id, 'Siddha Bhongade', null, 'Designer', 'Design', 'India',
         'full_time'::employment_type, 'active'::employee_status, 70000, 'INR',
         true, 800
  where not exists (select 1 from employees where full_name = 'Siddha Bhongade' and company_id = xtz_id);

  -- Dhruv Sharma (fixed USD $700 → ~₹60,000)
  insert into employees (company_id, full_name, email, designation, department, region,
                         employment_type, status, base_salary, salary_currency,
                         is_usd_salary, salary_usd)
  select xtz_id, 'Dhruv Sharma', null, 'Analyst', 'Operations', 'India',
         'full_time'::employment_type, 'active'::employee_status, 60000, 'INR',
         true, 700
  where not exists (select 1 from employees where full_name = 'Dhruv Sharma' and company_id = xtz_id);
end $$;

-- ============================================================
-- 10. Seed LSC-owned software subscriptions from screenshot
--     (G-suite, Hellosign, Fal AI — all LSC-owned, monthly)
--     Domains tracked separately as yearly-renewal placeholders.
-- ============================================================
do $$
declare
  lsc_id uuid;
begin
  select id into lsc_id from companies where code = 'LSC'::company_code;
  if lsc_id is null then return; end if;

  insert into subscriptions (name, provider, company_id, is_shared, monthly_cost, annual_cost,
                             currency_code, billing_cycle, category, status, auto_renew)
  select 'Google Workspace', 'Google', lsc_id, false, 455.61, 5467.32,
         'USD', 'monthly'::billing_cycle, 'communication'::subscription_category,
         'active'::subscription_status, true
  where not exists (select 1 from subscriptions where name = 'Google Workspace' and company_id = lsc_id);

  insert into subscriptions (name, provider, company_id, is_shared, monthly_cost, annual_cost,
                             currency_code, billing_cycle, category, status, auto_renew)
  select 'HelloSign (Dropbox Sign)', 'Dropbox', lsc_id, false, 24.00, 288.00,
         'USD', 'monthly'::billing_cycle, 'legal'::subscription_category,
         'active'::subscription_status, true
  where not exists (select 1 from subscriptions where name = 'HelloSign (Dropbox Sign)' and company_id = lsc_id);

  insert into subscriptions (name, provider, company_id, is_shared, monthly_cost, annual_cost,
                             currency_code, billing_cycle, category, status, auto_renew)
  select 'Fal AI', 'Fal.ai', lsc_id, false, 75.00, 900.00,
         'USD', 'monthly'::billing_cycle, 'other'::subscription_category,
         'active'::subscription_status, true
  where not exists (select 1 from subscriptions where name = 'Fal AI' and company_id = lsc_id);

  -- Domain renewal placeholder (yearly)
  insert into subscriptions (name, provider, company_id, is_shared, monthly_cost, annual_cost,
                             currency_code, billing_cycle, category, status, auto_renew, notes)
  select 'Domain Renewals', 'GoDaddy / Namecheap', lsc_id, false, 0, 0,
         'USD', 'annual'::billing_cycle, 'infrastructure'::subscription_category,
         'active'::subscription_status, true,
         'Yearly domain renewals — update annual_cost as domains are added.'
  where not exists (select 1 from subscriptions where name = 'Domain Renewals' and company_id = lsc_id);
end $$;
