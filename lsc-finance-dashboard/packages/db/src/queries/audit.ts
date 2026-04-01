import "server-only";

import { queryRows } from "../query";
import { formatDateLabel, getBackend } from "./shared";

export type AuditReportRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  passRate: number;
  summary: string;
  completedAt: string;
  createdAt: string;
  companyCode: string;
  discrepancies: AuditDiscrepancy[];
};

export type AuditDiscrepancy = {
  area: string;
  description: string;
  severity: string;
};

export type AuditSummaryStats = {
  totalAudits: number;
  lastAuditDate: string;
  averagePassRate: number;
  totalDiscrepancies: number;
};

export async function getAuditReports(): Promise<AuditReportRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    audit_period_start: string;
    audit_period_end: string;
    status: string;
    total_checks: string;
    passed_checks: string;
    failed_checks: string;
    summary: string | null;
    completed_at: string | null;
    created_at: string;
    company_code: string | null;
    discrepancies: string;
  }>(
    `select ar.id, ar.audit_period_start::text, ar.audit_period_end::text,
            ar.status, ar.total_checks::text, ar.passed_checks::text,
            ar.failed_checks::text, ar.summary, ar.completed_at::text,
            ar.created_at::text, c.code::text as company_code,
            ar.discrepancies::text
     from audit_reports ar
     left join companies c on c.id = ar.company_id
     order by ar.created_at desc
     limit 50`
  );

  return rows.map((r) => {
    let discs: AuditDiscrepancy[] = [];
    try {
      const parsed = JSON.parse(r.discrepancies);
      if (Array.isArray(parsed)) {
        discs = parsed.map((d: { area?: string; description?: string; severity?: string }) => ({
          area: d.area ?? "General",
          description: d.description ?? "",
          severity: d.severity ?? "low"
        }));
      }
    } catch { /* empty */ }

    const total = Number(r.total_checks);
    const passed = Number(r.passed_checks);

    return {
      id: r.id,
      periodStart: formatDateLabel(r.audit_period_start),
      periodEnd: formatDateLabel(r.audit_period_end),
      status: r.status,
      totalChecks: total,
      passedChecks: passed,
      failedChecks: Number(r.failed_checks),
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
      summary: r.summary ?? "",
      completedAt: formatDateLabel(r.completed_at),
      createdAt: formatDateLabel(r.created_at),
      companyCode: r.company_code ?? "All",
      discrepancies: discs
    };
  });
}

export async function getAuditSummaryStats(): Promise<AuditSummaryStats> {
  if (getBackend() !== "database") {
    return { totalAudits: 0, lastAuditDate: "Never", averagePassRate: 0, totalDiscrepancies: 0 };
  }

  const rows = await queryRows<{
    total_audits: string;
    last_audit: string | null;
    avg_pass_rate: string;
    total_failed: string;
  }>(
    `select count(*)::text as total_audits,
            max(completed_at)::text as last_audit,
            case when count(*) > 0
              then round(avg(
                case when total_checks > 0
                  then (passed_checks::numeric / total_checks * 100)
                  else 0
                end
              ), 1)::text
              else '0'
            end as avg_pass_rate,
            coalesce(sum(failed_checks), 0)::text as total_failed
     from audit_reports
     where status = 'completed'`
  );

  return {
    totalAudits: Number(rows[0]?.total_audits ?? 0),
    lastAuditDate: formatDateLabel(rows[0]?.last_audit),
    averagePassRate: Number(rows[0]?.avg_pass_rate ?? 0),
    totalDiscrepancies: Number(rows[0]?.total_failed ?? 0)
  };
}
