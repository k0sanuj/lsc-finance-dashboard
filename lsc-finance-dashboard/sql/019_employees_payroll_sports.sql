-- 019: Employees, payroll, XTZ Esports Tech Ltd entity, FSP sports
-- Adds employee management, salary payroll, invoice generation, and FSP sport entities

-- ============================================================
-- 1. Add XTE company code (XTZ Esports Tech Limited)
-- ============================================================
alter type company_code add value if not exists 'XTE';

-- ============================================================
-- 2. FSP Sport entities
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'fsp_sport_code') then
    create type fsp_sport_code as enum ('basketball', 'bowling', 'squash', 'world_pong');
  end if;
end $$;

create table if not exists fsp_sports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  sport_code fsp_sport_code not null,
  display_name text not null,
  league_name text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sport_code)
);

-- ============================================================
-- 3. Employees
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'employment_type') then
    create type employment_type as enum ('full_time', 'part_time', 'contract', 'intern');
  end if;
  if not exists (select 1 from pg_type where typname = 'employee_status') then
    create type employee_status as enum ('active', 'on_leave', 'terminated', 'notice_period');
  end if;
end $$;

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  full_name text not null,
  email text,
  designation text not null,
  department text,
  employment_type employment_type not null default 'full_time',
  status employee_status not null default 'active',
  start_date date,
  end_date date,
  base_salary numeric(14,2) not null default 0,
  salary_currency text not null default 'INR',
  bank_account_info text,
  tax_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employees_company on employees(company_id);
create index if not exists idx_employees_status on employees(company_id, status);

-- ============================================================
-- 4. Salary payroll (month-by-month records)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payroll_status') then
    create type payroll_status as enum ('draft', 'approved', 'paid', 'cancelled');
  end if;
end $$;

create table if not exists salary_payroll (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  employee_id uuid not null references employees(id) on delete cascade,
  payroll_month date not null,
  base_salary numeric(14,2) not null default 0,
  allowances numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  tax_withheld numeric(14,2) not null default 0,
  net_salary numeric(14,2) not null default 0,
  currency_code text not null default 'INR',
  status payroll_status not null default 'draft',
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, payroll_month)
);

create index if not exists idx_salary_payroll_company on salary_payroll(company_id, payroll_month);
create index if not exists idx_salary_payroll_employee on salary_payroll(employee_id);

-- ============================================================
-- 5. Payroll invoices (XTZ India -> XTZ Esports Tech Ltd)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payroll_invoice_status') then
    create type payroll_invoice_status as enum ('draft', 'generated', 'sent', 'paid');
  end if;
end $$;

create table if not exists payroll_invoices (
  id uuid primary key default gen_random_uuid(),
  from_company_id uuid not null references companies(id),
  to_company_id uuid not null references companies(id),
  invoice_number text not null,
  invoice_date date not null default current_date,
  payroll_month date not null,
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  currency_code text not null default 'INR',
  status payroll_invoice_status not null default 'draft',
  payment_method text,
  notes text,
  generated_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payroll_invoice_items (
  id uuid primary key default gen_random_uuid(),
  payroll_invoice_id uuid not null references payroll_invoices(id) on delete cascade,
  employee_id uuid references employees(id),
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_invoices_from on payroll_invoices(from_company_id);
create index if not exists idx_payroll_invoices_to on payroll_invoices(to_company_id);
create index if not exists idx_payroll_invoice_items_inv on payroll_invoice_items(payroll_invoice_id);
