import "server-only";

import { queryRows, queryRowsAdmin } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type ReportingExclusionSummaryRow = {
  sourceTable: string;
  reason: string;
  excludedFromReporting: boolean;
  rowCount: number;
  latestQuarantineAt: string;
};

export type ReportingExclusionRow = {
  id: string;
  sourceTable: string;
  sourceId: string;
  reason: string;
  excludedFromReporting: boolean;
  quarantinedAt: string;
  quarantinedBy: string | null;
  notes: string | null;
};

export type FinanceRecognitionRow = {
  companyCode: "LSC" | "TBR" | "FSP" | "XTZ";
  companyName: string;
  actualRevenue: string;
  actualRevenueUsd: number;
  actualCost: string;
  actualCostUsd: number;
  actualMargin: string;
  actualMarginUsd: number;
  actualCashIn: string;
  actualCashInUsd: number;
  actualCashOut: string;
  actualCashOutUsd: number;
  committedPayables: string;
  committedPayablesUsd: number;
  committedReceivables: string;
  committedReceivablesUsd: number;
  planningRevenue: string;
  planningRevenueUsd: number;
  planningCost: string;
  planningCostUsd: number;
  recognitionPolicy: string;
};

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getFinanceRecognitionByEntity(): Promise<FinanceRecognitionRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    company_code: "LSC" | "TBR" | "FSP" | "XTZ";
    company_name: string;
    actual_revenue: string;
    actual_cost: string;
    actual_margin: string;
    actual_cash_in: string;
    actual_cash_out: string;
    committed_payables: string;
    committed_receivables: string;
    planning_revenue: string;
    planning_cost: string;
    recognition_policy: string;
  }>(
    `select company_code::text, company_name,
            actual_revenue::text, actual_cost::text, actual_margin::text,
            actual_cash_in::text, actual_cash_out::text,
            committed_payables::text, committed_receivables::text,
            planning_revenue::text, planning_cost::text, recognition_policy
     from finance_recognition_by_entity
     order by case company_code::text
       when 'LSC' then 1 when 'TBR' then 2 when 'FSP' then 3 when 'XTZ' then 4 else 99 end`
  );

  return rows.map((row) => ({
    companyCode: row.company_code,
    companyName: row.company_name,
    actualRevenue: formatCurrency(row.actual_revenue),
    actualRevenueUsd: numeric(row.actual_revenue),
    actualCost: formatCurrency(row.actual_cost),
    actualCostUsd: numeric(row.actual_cost),
    actualMargin: formatCurrency(row.actual_margin),
    actualMarginUsd: numeric(row.actual_margin),
    actualCashIn: formatCurrency(row.actual_cash_in),
    actualCashInUsd: numeric(row.actual_cash_in),
    actualCashOut: formatCurrency(row.actual_cash_out),
    actualCashOutUsd: numeric(row.actual_cash_out),
    committedPayables: formatCurrency(row.committed_payables),
    committedPayablesUsd: numeric(row.committed_payables),
    committedReceivables: formatCurrency(row.committed_receivables),
    committedReceivablesUsd: numeric(row.committed_receivables),
    planningRevenue: formatCurrency(row.planning_revenue),
    planningRevenueUsd: numeric(row.planning_revenue),
    planningCost: formatCurrency(row.planning_cost),
    planningCostUsd: numeric(row.planning_cost),
    recognitionPolicy: row.recognition_policy,
  }));
}

export async function getReportingExclusionSummary(): Promise<ReportingExclusionSummaryRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRowsAdmin<{
    source_table: string;
    reason: string;
    excluded_from_reporting: boolean;
    row_count: number;
    latest_quarantine_at: string;
  }>(
    `select source_table, reason, excluded_from_reporting, row_count,
            latest_quarantine_at::text
     from finance_reporting_exclusion_summary
     order by row_count desc, source_table`
  );

  return rows.map((row) => ({
    sourceTable: row.source_table,
    reason: row.reason,
    excludedFromReporting: row.excluded_from_reporting,
    rowCount: Number(row.row_count),
    latestQuarantineAt: formatDateLabel(row.latest_quarantine_at),
  }));
}

export async function getReportingExclusions(limit = 200): Promise<ReportingExclusionRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRowsAdmin<{
    id: string;
    source_table: string;
    source_id: string;
    reason: string;
    excluded_from_reporting: boolean;
    quarantined_at: string;
    quarantined_by: string | null;
    notes: string | null;
  }>(
    `select id, source_table, source_id, reason, excluded_from_reporting,
            quarantined_at::text, quarantined_by, notes
     from finance_reporting_exclusions
     order by quarantined_at desc
     limit $1`,
    [Math.min(Math.max(limit, 1), 500)]
  );

  return rows.map((row) => ({
    id: row.id,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    reason: row.reason,
    excludedFromReporting: row.excluded_from_reporting,
    quarantinedAt: formatDateLabel(row.quarantined_at),
    quarantinedBy: row.quarantined_by,
    notes: row.notes,
  }));
}
