import "server-only";

import { queryRows, queryRowsAdmin, executeAdmin } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type EmployeeRow = {
  id: string;
  fullName: string;
  email: string;
  designation: string;
  department: string;
  region: string;
  employmentType: string;
  status: string;
  startDate: string;
  baseSalary: string;
  rawBaseSalary: number;
  salaryCurrency: string;
  companyCode: string;
};

export type PayrollRow = {
  id: string;
  employeeName: string;
  designation: string;
  payrollMonth: string;
  payrollMonthRaw: string;
  baseSalary: string;
  allowances: string;
  deductions: string;
  taxWithheld: string;
  netSalary: string;
  currency: string;
  status: string;
  paidAt: string;
};

export type PayrollMonthlySummary = {
  month: string;
  monthRaw: string;
  totalBase: number;
  totalAllowances: number;
  totalDeductions: number;
  totalTax: number;
  totalNet: number;
  headcount: number;
  currency: string;
};

export type PayrollInvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  payrollMonth: string;
  fromCompany: string;
  toCompany: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  status: string;
  paymentMethod: string;
};

export type FspSportRow = {
  id: string;
  sportCode: string;
  displayName: string;
  leagueName: string;
  isActive: boolean;
};

export async function getEmployees(companyCode?: string): Promise<EmployeeRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    full_name: string;
    email: string | null;
    designation: string;
    department: string | null;
    region: string | null;
    employment_type: string;
    status: string;
    start_date: string | null;
    base_salary: string;
    salary_currency: string;
    company_code: string;
  }>(
    `select e.id, e.full_name, e.email, e.designation, e.department, e.region,
            e.employment_type, e.status, e.start_date::text,
            e.base_salary, e.salary_currency, c.code::text as company_code
     from employees e
     join companies c on c.id = e.company_id
     ${where}
     order by e.full_name`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email ?? "",
    designation: r.designation,
    department: r.department ?? "",
    region: r.region ?? "",
    employmentType: r.employment_type.replace(/_/g, " "),
    status: r.status.replace(/_/g, " "),
    startDate: formatDateLabel(r.start_date),
    baseSalary: formatCurrency(r.base_salary),
    rawBaseSalary: Number(r.base_salary),
    salaryCurrency: r.salary_currency,
    companyCode: r.company_code
  }));
}

export async function getPayrollByMonth(companyCode: string): Promise<PayrollMonthlySummary[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    payroll_month: string;
    total_base: string;
    total_allowances: string;
    total_deductions: string;
    total_tax: string;
    total_net: string;
    headcount: string;
    currency_code: string;
  }>(
    `select sp.payroll_month::text,
            sum(sp.base_salary)::numeric(14,2)::text as total_base,
            sum(sp.allowances)::numeric(14,2)::text as total_allowances,
            sum(sp.deductions)::numeric(14,2)::text as total_deductions,
            sum(sp.tax_withheld)::numeric(14,2)::text as total_tax,
            sum(sp.net_salary)::numeric(14,2)::text as total_net,
            count(*)::text as headcount,
            sp.currency_code
     from salary_payroll sp
     join companies c on c.id = sp.company_id
     where c.code = $1::company_code
     group by sp.payroll_month, sp.currency_code
     order by sp.payroll_month desc`,
    [companyCode]
  );

  return rows.map((r) => ({
    month: new Date(r.payroll_month).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    monthRaw: r.payroll_month,
    totalBase: Number(r.total_base),
    totalAllowances: Number(r.total_allowances),
    totalDeductions: Number(r.total_deductions),
    totalTax: Number(r.total_tax),
    totalNet: Number(r.total_net),
    headcount: Number(r.headcount),
    currency: r.currency_code
  }));
}

export async function getPayrollDetail(companyCode: string, month?: string): Promise<PayrollRow[]> {
  if (getBackend() !== "database") return [];

  const monthFilter = month ? "and sp.payroll_month = $2::date" : "";
  const params: string[] = [companyCode];
  if (month) params.push(month);

  const rows = await queryRows<{
    id: string;
    employee_name: string;
    designation: string;
    payroll_month: string;
    base_salary: string;
    allowances: string;
    deductions: string;
    tax_withheld: string;
    net_salary: string;
    currency_code: string;
    status: string;
    paid_at: string | null;
  }>(
    `select sp.id, e.full_name as employee_name, e.designation,
            sp.payroll_month::text, sp.base_salary, sp.allowances,
            sp.deductions, sp.tax_withheld, sp.net_salary,
            sp.currency_code, sp.status, sp.paid_at::text
     from salary_payroll sp
     join employees e on e.id = sp.employee_id
     join companies c on c.id = sp.company_id
     where c.code = $1::company_code ${monthFilter}
     order by sp.payroll_month desc, e.full_name`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    employeeName: r.employee_name,
    designation: r.designation,
    payrollMonth: new Date(r.payroll_month).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    payrollMonthRaw: r.payroll_month,
    baseSalary: formatCurrency(r.base_salary),
    allowances: formatCurrency(r.allowances),
    deductions: formatCurrency(r.deductions),
    taxWithheld: formatCurrency(r.tax_withheld),
    netSalary: formatCurrency(r.net_salary),
    currency: r.currency_code,
    status: r.status,
    paidAt: formatDateLabel(r.paid_at)
  }));
}

export async function getPayrollInvoices(companyCode?: string): Promise<PayrollInvoiceRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode
    ? "where fc.code = $1::company_code or tc.code = $1::company_code"
    : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    payroll_month: string;
    from_company: string;
    to_company: string;
    subtotal: string;
    tax_amount: string;
    total_amount: string;
    currency_code: string;
    status: string;
    payment_method: string | null;
  }>(
    `select pi.id, pi.invoice_number, pi.invoice_date::text,
            pi.payroll_month::text,
            fc.name as from_company, tc.name as to_company,
            pi.subtotal, pi.tax_amount, pi.total_amount,
            pi.currency_code, pi.status, pi.payment_method
     from payroll_invoices pi
     join companies fc on fc.id = pi.from_company_id
     join companies tc on tc.id = pi.to_company_id
     ${where}
     order by pi.invoice_date desc`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    invoiceDate: formatDateLabel(r.invoice_date),
    payrollMonth: new Date(r.payroll_month).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    fromCompany: r.from_company,
    toCompany: r.to_company,
    subtotal: formatCurrency(r.subtotal),
    taxAmount: formatCurrency(r.tax_amount),
    totalAmount: formatCurrency(r.total_amount),
    currency: r.currency_code,
    status: r.status,
    paymentMethod: r.payment_method ?? ""
  }));
}

export async function getFspSports(): Promise<FspSportRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    sport_code: string;
    display_name: string;
    league_name: string | null;
    is_active: boolean;
  }>(
    `select fs.id, fs.sport_code, fs.display_name, fs.league_name, fs.is_active
     from fsp_sports fs
     join companies c on c.id = fs.company_id
     where c.code = 'FSP'::company_code
     order by fs.display_name`
  );

  return rows.map((r) => ({
    id: r.id,
    sportCode: r.sport_code,
    displayName: r.display_name,
    leagueName: r.league_name ?? "",
    isActive: r.is_active
  }));
}
