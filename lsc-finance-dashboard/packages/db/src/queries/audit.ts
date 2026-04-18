import "server-only";

import { queryRows, queryRowsAdmin } from "../query";
import { formatDateLabel, getBackend } from "./shared";

// ─── audit_log (mutation trail — written by skills/shared/cascade-update.ts) ───

export type AuditLogRow = {
  id: string;
  entityType: string;
  entityId: string;
  trigger: string;
  action: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  cascadeResult: { actions: string[]; errors: Array<{ action: string; error: string }> } | null;
  performedBy: string | null;
  agentId: string | null;
  createdAt: string;
};

function rowToLogEntry(row: Record<string, unknown>): AuditLogRow {
  return {
    id: String(row.id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    trigger: String(row.trigger),
    action: String(row.action),
    beforeState: (row.before_state as AuditLogRow["beforeState"]) ?? null,
    afterState: (row.after_state as AuditLogRow["afterState"]) ?? null,
    cascadeResult: (row.cascade_result as AuditLogRow["cascadeResult"]) ?? null,
    performedBy: row.performed_by ? String(row.performed_by) : null,
    agentId: row.agent_id ? String(row.agent_id) : null,
    createdAt: String(row.created_at),
  };
}

export type AuditLogFilter = {
  entityType?: string;
  entityId?: string;
  trigger?: string;
  agentId?: string;
  performedBy?: string;
  sinceHours?: number;
  limit?: number;
};

export async function getAuditLog(filter: AuditLogFilter = {}): Promise<AuditLogRow[]> {
  if (getBackend() !== "database") return [];

  const where: string[] = [];
  const values: unknown[] = [];

  if (filter.entityType) {
    values.push(filter.entityType);
    where.push(`entity_type = $${values.length}`);
  }
  if (filter.entityId) {
    values.push(filter.entityId);
    where.push(`entity_id = $${values.length}`);
  }
  if (filter.trigger) {
    values.push(filter.trigger);
    where.push(`trigger = $${values.length}`);
  }
  if (filter.agentId) {
    values.push(filter.agentId);
    where.push(`agent_id = $${values.length}`);
  }
  if (filter.performedBy) {
    values.push(filter.performedBy);
    where.push(`performed_by = $${values.length}`);
  }
  if (filter.sinceHours !== undefined) {
    where.push(`created_at >= now() - interval '${Math.max(1, filter.sinceHours)} hours'`);
  }

  const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const limit = Math.min(filter.limit ?? 100, 500);
  values.push(limit);

  const rows = await queryRowsAdmin<Record<string, unknown>>(
    `select id, entity_type, entity_id, trigger, action,
            before_state, after_state, cascade_result,
            performed_by, agent_id, created_at::text as created_at
     from audit_log
     ${whereClause}
     order by created_at desc
     limit $${values.length}`,
    values
  );
  return rows.map(rowToLogEntry);
}

export type AuditLogSummary = {
  totalEntries: number;
  entriesLast24h: number;
  entriesLast7d: number;
  byTrigger: Array<{ trigger: string; count: number }>;
  byAgent: Array<{ agentId: string; count: number }>;
  byEntityType: Array<{ entityType: string; count: number }>;
};

export async function getAuditLogSummary(): Promise<AuditLogSummary> {
  if (getBackend() !== "database") {
    return {
      totalEntries: 0,
      entriesLast24h: 0,
      entriesLast7d: 0,
      byTrigger: [],
      byAgent: [],
      byEntityType: [],
    };
  }

  const [total, last24h, last7d, byTrigger, byAgent, byEntity] = await Promise.all([
    queryRowsAdmin<{ c: number }>(`select count(*)::int as c from audit_log`),
    queryRowsAdmin<{ c: number }>(
      `select count(*)::int as c from audit_log where created_at >= now() - interval '24 hours'`
    ),
    queryRowsAdmin<{ c: number }>(
      `select count(*)::int as c from audit_log where created_at >= now() - interval '7 days'`
    ),
    queryRowsAdmin<{ trigger: string; c: number }>(
      `select trigger, count(*)::int as c from audit_log group by trigger order by c desc limit 20`
    ),
    queryRowsAdmin<{ agent_id: string | null; c: number }>(
      `select agent_id, count(*)::int as c from audit_log
       where agent_id is not null group by agent_id order by c desc limit 20`
    ),
    queryRowsAdmin<{ entity_type: string; c: number }>(
      `select entity_type, count(*)::int as c from audit_log group by entity_type order by c desc limit 20`
    ),
  ]);

  return {
    totalEntries: total[0]?.c ?? 0,
    entriesLast24h: last24h[0]?.c ?? 0,
    entriesLast7d: last7d[0]?.c ?? 0,
    byTrigger: byTrigger.map((r) => ({ trigger: r.trigger, count: r.c })),
    byAgent: byAgent
      .filter((r) => r.agent_id !== null)
      .map((r) => ({ agentId: r.agent_id as string, count: r.c })),
    byEntityType: byEntity.map((r) => ({ entityType: r.entity_type, count: r.c })),
  };
}

// ─── audit_reports (monthly reconciliation — written by AuditAgent) ───

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
