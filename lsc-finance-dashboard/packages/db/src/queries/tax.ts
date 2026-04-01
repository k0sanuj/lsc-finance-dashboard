import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type TaxCalculationRow = {
  id: string;
  invoiceId: string | null;
  taxType: string;
  taxableAmount: string;
  taxRate: number;
  taxAmount: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  companyCode: string;
  notes: string;
};

export type TaxFilingRow = {
  id: string;
  taxType: string;
  periodStart: string;
  periodEnd: string;
  totalTaxable: string;
  totalTaxPayable: string;
  currency: string;
  status: string;
  filedAt: string;
  companyCode: string;
  notes: string;
};

export type TaxSummary = {
  totalGst: number;
  totalVat: number;
  totalOther: number;
  filingsDue: number;
  filingsPrepared: number;
  filingsFiled: number;
};

export async function getTaxCalculations(companyCode?: string): Promise<TaxCalculationRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    invoice_id: string | null;
    tax_type: string;
    taxable_amount: string;
    tax_rate: string;
    tax_amount: string;
    currency_code: string;
    period_start: string | null;
    period_end: string | null;
    company_code: string;
    notes: string | null;
  }>(
    `select tc.id, tc.invoice_id, tc.tax_type,
            tc.taxable_amount, tc.tax_rate, tc.tax_amount,
            tc.currency_code, tc.period_start::text, tc.period_end::text,
            c.code::text as company_code, tc.notes
     from tax_calculations tc
     join companies c on c.id = tc.company_id
     ${where}
     order by tc.created_at desc
     limit 100`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    taxType: r.tax_type.toUpperCase(),
    taxableAmount: formatCurrency(r.taxable_amount),
    taxRate: Number(r.tax_rate),
    taxAmount: formatCurrency(r.tax_amount),
    currency: r.currency_code,
    periodStart: formatDateLabel(r.period_start),
    periodEnd: formatDateLabel(r.period_end),
    companyCode: r.company_code,
    notes: r.notes ?? ""
  }));
}

export async function getTaxFilings(companyCode?: string): Promise<TaxFilingRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    tax_type: string;
    filing_period_start: string;
    filing_period_end: string;
    total_taxable: string;
    total_tax_payable: string;
    currency_code: string;
    status: string;
    filed_at: string | null;
    company_code: string;
    notes: string | null;
  }>(
    `select tf.id, tf.tax_type,
            tf.filing_period_start::text, tf.filing_period_end::text,
            tf.total_taxable, tf.total_tax_payable,
            tf.currency_code, tf.status, tf.filed_at::text,
            c.code::text as company_code, tf.notes
     from tax_filings tf
     join companies c on c.id = tf.company_id
     ${where}
     order by tf.filing_period_end desc`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    taxType: r.tax_type.toUpperCase(),
    periodStart: formatDateLabel(r.filing_period_start),
    periodEnd: formatDateLabel(r.filing_period_end),
    totalTaxable: formatCurrency(r.total_taxable),
    totalTaxPayable: formatCurrency(r.total_tax_payable),
    currency: r.currency_code,
    status: r.status.replace(/_/g, " "),
    filedAt: formatDateLabel(r.filed_at),
    companyCode: r.company_code,
    notes: r.notes ?? ""
  }));
}

export async function getTaxSummary(): Promise<TaxSummary> {
  if (getBackend() !== "database") {
    return { totalGst: 0, totalVat: 0, totalOther: 0, filingsDue: 0, filingsPrepared: 0, filingsFiled: 0 };
  }

  const [calcs, filings] = await Promise.all([
    queryRows<{ tax_type: string; total: string }>(
      `select tax_type::text,
              coalesce(sum(tax_amount), 0)::numeric(14,2)::text as total
       from tax_calculations
       group by tax_type`
    ),
    queryRows<{ status: string; cnt: string }>(
      `select status::text,
              count(*)::text as cnt
       from tax_filings
       group by status`
    )
  ]);

  const calcMap = new Map(calcs.map((r) => [r.tax_type, Number(r.total)]));
  const filingMap = new Map(filings.map((r) => [r.status, Number(r.cnt)]));

  return {
    totalGst: calcMap.get("gst") ?? 0,
    totalVat: calcMap.get("vat") ?? 0,
    totalOther: (calcMap.get("corporate_tax") ?? 0) + (calcMap.get("withholding") ?? 0) + (calcMap.get("other") ?? 0),
    filingsDue: filingMap.get("draft") ?? 0,
    filingsPrepared: filingMap.get("prepared") ?? 0,
    filingsFiled: (filingMap.get("filed") ?? 0) + (filingMap.get("accepted") ?? 0)
  };
}
