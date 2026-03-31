import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type GigWorkerRow = {
  id: string;
  name: string;
  location: string;
  countryCode: string;
  roleType: string;
  paymentMethod: string;
  paymentFrequency: string;
  rateAmount: string;
  rateCurrency: string;
  taxWithholdingRate: number;
  isActive: boolean;
  mtdPaid: string;
  ytdPaid: string;
};

export type GigPayoutRow = {
  id: string;
  workerName: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: string;
  deductions: string;
  netAmount: string;
  currency: string;
  paymentMethod: string;
  status: string;
  paidAt: string;
};

export type GigPayoutSummary = {
  totalWorkers: number;
  activeWorkers: number;
  indiaWorkers: number;
  kenyaWorkers: number;
  pendingPayouts: number;
  pendingAmount: number;
  mtdPaid: number;
  ytdPaid: number;
};

export async function getGigWorkers(companyCode?: string): Promise<GigWorkerRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    name: string;
    location: string;
    country_code: string;
    role_type: string | null;
    payment_method: string;
    payment_frequency: string;
    rate_amount: string;
    rate_currency: string;
    tax_withholding_rate: string;
    is_active: boolean;
    mtd_paid: string;
    ytd_paid: string;
  }>(
    `select
       gw.id, gw.name, gw.location, gw.country_code, gw.role_type,
       gw.payment_method, gw.payment_frequency,
       gw.rate_amount, gw.rate_currency, gw.tax_withholding_rate, gw.is_active,
       coalesce(sum(gwp.net_amount) filter (
         where gwp.status = 'paid' and gwp.paid_at >= date_trunc('month', current_date)
       ), 0)::numeric(14,2)::text as mtd_paid,
       coalesce(sum(gwp.net_amount) filter (
         where gwp.status = 'paid' and gwp.paid_at >= date_trunc('year', current_date)
       ), 0)::numeric(14,2)::text as ytd_paid
     from gig_workers gw
     join companies c on c.id = gw.company_id
     left join gig_worker_payouts gwp on gwp.gig_worker_id = gw.id
     ${where}
     group by gw.id, gw.name, gw.location, gw.country_code, gw.role_type,
              gw.payment_method, gw.payment_frequency, gw.rate_amount,
              gw.rate_currency, gw.tax_withholding_rate, gw.is_active
     order by gw.name`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    location: r.location,
    countryCode: r.country_code,
    roleType: r.role_type ?? "",
    paymentMethod: r.payment_method.replace(/_/g, " "),
    paymentFrequency: r.payment_frequency.replace(/_/g, " "),
    rateAmount: formatCurrency(r.rate_amount),
    rateCurrency: r.rate_currency,
    taxWithholdingRate: Number(r.tax_withholding_rate),
    isActive: r.is_active,
    mtdPaid: formatCurrency(r.mtd_paid),
    ytdPaid: formatCurrency(r.ytd_paid)
  }));
}

export async function getGigPayouts(companyCode?: string): Promise<GigPayoutRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    worker_name: string;
    period_start: string;
    period_end: string;
    gross_amount: string;
    deductions: string;
    net_amount: string;
    currency_code: string;
    payment_method: string;
    status: string;
    paid_at: string | null;
  }>(
    `select gwp.id, gw.name as worker_name,
            gwp.period_start::text, gwp.period_end::text,
            gwp.gross_amount, gwp.deductions, gwp.net_amount,
            gwp.currency_code, gwp.payment_method, gwp.status,
            gwp.paid_at::text
     from gig_worker_payouts gwp
     join gig_workers gw on gw.id = gwp.gig_worker_id
     join companies c on c.id = gwp.company_id
     ${where}
     order by gwp.period_end desc
     limit 100`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    workerName: r.worker_name,
    periodStart: formatDateLabel(r.period_start),
    periodEnd: formatDateLabel(r.period_end),
    grossAmount: formatCurrency(r.gross_amount),
    deductions: formatCurrency(r.deductions),
    netAmount: formatCurrency(r.net_amount),
    currency: r.currency_code,
    paymentMethod: r.payment_method.replace(/_/g, " "),
    status: r.status,
    paidAt: formatDateLabel(r.paid_at)
  }));
}

export async function getGigPayoutSummary(companyCode?: string): Promise<GigPayoutSummary> {
  if (getBackend() !== "database") {
    return { totalWorkers: 0, activeWorkers: 0, indiaWorkers: 0, kenyaWorkers: 0, pendingPayouts: 0, pendingAmount: 0, mtdPaid: 0, ytdPaid: 0 };
  }

  const where = companyCode ? "and c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const [workers, payouts] = await Promise.all([
    queryRows<{
      total: string;
      active: string;
      india: string;
      kenya: string;
    }>(
      `select
         count(*)::text as total,
         count(*) filter (where gw.is_active)::text as active,
         count(*) filter (where gw.country_code = 'IN')::text as india,
         count(*) filter (where gw.country_code = 'KE')::text as kenya
       from gig_workers gw
       join companies c on c.id = gw.company_id
       where true ${where}`,
      params
    ),
    queryRows<{
      pending_count: string;
      pending_amount: string;
      mtd_paid: string;
      ytd_paid: string;
    }>(
      `select
         count(*) filter (where gwp.status = 'pending')::text as pending_count,
         coalesce(sum(gwp.net_amount) filter (where gwp.status = 'pending'), 0)::numeric(14,2)::text as pending_amount,
         coalesce(sum(gwp.net_amount) filter (
           where gwp.status = 'paid' and gwp.paid_at >= date_trunc('month', current_date)
         ), 0)::numeric(14,2)::text as mtd_paid,
         coalesce(sum(gwp.net_amount) filter (
           where gwp.status = 'paid' and gwp.paid_at >= date_trunc('year', current_date)
         ), 0)::numeric(14,2)::text as ytd_paid
       from gig_worker_payouts gwp
       join companies c on c.id = gwp.company_id
       where true ${where}`,
      params
    )
  ]);

  const w = workers[0];
  const p = payouts[0];
  return {
    totalWorkers: Number(w?.total ?? 0),
    activeWorkers: Number(w?.active ?? 0),
    indiaWorkers: Number(w?.india ?? 0),
    kenyaWorkers: Number(w?.kenya ?? 0),
    pendingPayouts: Number(p?.pending_count ?? 0),
    pendingAmount: Number(p?.pending_amount ?? 0),
    mtdPaid: Number(p?.mtd_paid ?? 0),
    ytdPaid: Number(p?.ytd_paid ?? 0)
  };
}
