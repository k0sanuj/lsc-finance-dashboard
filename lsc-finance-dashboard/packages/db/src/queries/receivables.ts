import "server-only";

import { queryRows } from "../query";
import {
  formatCurrency,
  formatDateLabel,
  getBackend
} from "./shared";

export type ReceivablesAgingRow = {
  invoiceId: string;
  invoiceNumber: string;
  counterpartyName: string;
  dueDate: string;
  totalAmount: string;
  collectedAmount: string;
  outstandingAmount: string;
  daysOverdue: number;
  daysUntilDue: number;
  agingBucket: string;
  agingLabel: string;
};

export type AgingBucketSummary = {
  bucket: string;
  label: string;
  count: number;
  totalOutstanding: string;
  rawTotal: number;
};

export type EnhancedPayableRow = {
  invoiceNumber: string;
  dueDate: string;
  totalAmount: string;
  status: string;
  raceName: string;
  description: string;
  daysOverdue: number;
  daysUntilDue: number;
  agingBucket: string;
  agingLabel: string;
};

const BUCKET_LABELS: Record<string, string> = {
  current: "Current",
  "1_30": "1-30 days",
  "31_60": "31-60 days",
  "61_90": "61-90 days",
  "90_plus": "90+ days"
};

const BUCKET_ORDER = ["current", "1_30", "31_60", "61_90", "90_plus"];

function bucketLabel(bucket: string): string {
  return BUCKET_LABELS[bucket] ?? bucket;
}

type ReceivablesAgingSource = {
  invoice_id: string;
  invoice_number: string | null;
  counterparty_name: string | null;
  due_date: string | null;
  total_amount: string;
  collected_amount: string;
  outstanding_amount: string;
  days_overdue: string;
  days_until_due: string;
  aging_bucket: string;
};

type PayablesAgingSource = {
  invoice_number: string | null;
  due_date: string | null;
  total_amount: string;
  invoice_status: string;
  race_name: string | null;
  description: string | null;
  days_overdue: string;
  days_until_due: string;
  aging_bucket: string;
};

export async function getReceivablesAgingDetail(
  companyCode?: string
): Promise<ReceivablesAgingRow[]> {
  if (getBackend() !== "database") {
    return [];
  }

  const whereClause = companyCode
    ? "where company_code = $1::company_code"
    : "";
  const values = companyCode ? [companyCode] : [];

  const rows = await queryRows<ReceivablesAgingSource>(
    `select
       invoice_id,
       invoice_number,
       counterparty_name,
       due_date,
       total_amount,
       collected_amount,
       outstanding_amount,
       days_overdue,
       days_until_due,
       aging_bucket
     from receivables_aging_buckets
     ${whereClause}
     order by days_overdue desc, outstanding_amount desc`,
    values
  );

  return rows.map((row) => ({
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number ?? "Receivable",
    counterpartyName: row.counterparty_name ?? "Unknown",
    dueDate: formatDateLabel(row.due_date),
    totalAmount: formatCurrency(row.total_amount),
    collectedAmount: formatCurrency(row.collected_amount),
    outstandingAmount: formatCurrency(row.outstanding_amount),
    daysOverdue: Number(row.days_overdue),
    daysUntilDue: Number(row.days_until_due),
    agingBucket: row.aging_bucket,
    agingLabel: bucketLabel(row.aging_bucket)
  }));
}

export async function getReceivablesAgingSummary(
  companyCode?: string
): Promise<AgingBucketSummary[]> {
  if (getBackend() !== "database") {
    return BUCKET_ORDER.map((bucket) => ({
      bucket,
      label: bucketLabel(bucket),
      count: 0,
      totalOutstanding: formatCurrency(0),
      rawTotal: 0
    }));
  }

  const whereClause = companyCode
    ? "where company_code = $1::company_code"
    : "";
  const values = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    aging_bucket: string;
    bucket_count: string;
    bucket_total: string;
  }>(
    `select
       aging_bucket,
       count(*)::text as bucket_count,
       coalesce(sum(outstanding_amount), 0)::numeric(14,2)::text as bucket_total
     from receivables_aging_buckets
     ${whereClause}
     group by aging_bucket`,
    values
  );

  const bucketMap = new Map(rows.map((row) => [row.aging_bucket, row]));

  return BUCKET_ORDER.map((bucket) => {
    const row = bucketMap.get(bucket);
    const total = row ? Number(row.bucket_total) : 0;
    return {
      bucket,
      label: bucketLabel(bucket),
      count: row ? Number(row.bucket_count) : 0,
      totalOutstanding: formatCurrency(total),
      rawTotal: total
    };
  });
}

export async function getEnhancedPayables(
  companyCode?: string
): Promise<EnhancedPayableRow[]> {
  if (getBackend() !== "database") {
    return [];
  }

  const whereClause = companyCode
    ? "where company_code = $1::company_code"
    : "";
  const values = companyCode ? [companyCode] : [];

  const rows = await queryRows<PayablesAgingSource>(
    `select
       invoice_number,
       due_date,
       total_amount,
       invoice_status,
       race_name,
       description,
       days_overdue,
       days_until_due,
       aging_bucket
     from payables_aging
     ${whereClause}
     order by due_date nulls last
     limit 50`,
    values
  );

  return rows.map((row) => ({
    invoiceNumber: row.invoice_number ?? "Payable",
    dueDate: formatDateLabel(row.due_date),
    totalAmount: formatCurrency(row.total_amount),
    status: row.invoice_status,
    raceName: row.race_name ?? "General",
    description: row.description ?? "Operational",
    daysOverdue: Number(row.days_overdue),
    daysUntilDue: Number(row.days_until_due),
    agingBucket: row.aging_bucket,
    agingLabel: bucketLabel(row.aging_bucket)
  }));
}
