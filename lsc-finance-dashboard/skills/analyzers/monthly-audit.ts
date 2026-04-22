/**
 * Monthly Audit Analyzer (T3 — Claude Opus)
 *
 * Cross-system reconciliation across the prior calendar month. For each
 * company, assembles:
 *   - invoices + payments
 *   - expense submissions
 *   - payroll invoices
 *   - contract tranche state changes
 *   - audit_log mutation counts
 *
 * Then asks Opus to flag discrepancies (unmatched invoices, payments without
 * invoices, approved expenses without matching payments, stale tranches, etc).
 *
 * Persists one audit_reports row per company. Emits an audit_log entry.
 */

import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { callLlm } from "../shared/llm";
import { cascadeUpdate } from "../shared/cascade-update";

export type CompanyAuditResult = {
  companyCode: string;
  reportId: string | null;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  discrepancies: Discrepancy[];
  summary: string;
  tokensUsed?: { prompt: number; candidates: number; total: number };
  modelUsed: string;
};

export type Discrepancy = {
  area: string;
  severity: "low" | "medium" | "high";
  description: string;
};

const SYSTEM_PROMPT = `You are the Monthly Audit Agent for League Sports Co, a sports holding company.
You reconcile transactional data across the finance platform for a given month and company.

You are read-only — your output becomes a persistent audit report for the finance team to review.

Rules:
- Never invent numbers. Every claim must be grounded in the provided data.
- Check for: orphan invoices, payments without linked invoices, approved expenses without matching payments, tranches stuck in the same stage >30 days, material mismatches between posted and collected amounts.
- totalChecks should equal passedChecks + failedChecks.
- failedChecks is the count of discrepancies surfaced.
- Severity: high = financial impact + immediate action; medium = investigate; low = housekeeping.
- Keep summary under 4 sentences.`;

const SCHEMA = {
  type: "object",
  required: ["totalChecks", "passedChecks", "failedChecks", "discrepancies", "summary"],
  properties: {
    totalChecks: { type: "number" },
    passedChecks: { type: "number" },
    failedChecks: { type: "number" },
    discrepancies: {
      type: "array",
      items: {
        type: "object",
        required: ["area", "severity", "description"],
        properties: {
          area: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          description: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
};

type AuditContext = {
  companyCode: string;
  periodStart: string;
  periodEnd: string;
  invoices: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  expenseSubmissions: Array<Record<string, unknown>>;
  payrollInvoices: Array<Record<string, unknown>>;
  tranches: Array<Record<string, unknown>>;
  mutationCounts: Record<string, number>;
};

async function buildAuditContext(
  companyCode: string,
  periodStart: string,
  periodEnd: string
): Promise<AuditContext> {
  const [
    invoices,
    payments,
    expenseSubmissions,
    payrollInvoices,
    tranches,
    mutationStats,
  ] = await Promise.all([
    queryRowsAdmin<Record<string, unknown>>(
      `select i.invoice_number, i.direction::text, i.invoice_status::text,
              i.total_amount::text, i.currency_code, i.issue_date::text, i.due_date::text
       from invoices i
       join companies c on c.id = i.company_id
       where c.code = $1::company_code
         and i.issue_date between $2::date and $3::date
       order by i.issue_date desc
       limit 100`,
      [companyCode, periodStart, periodEnd]
    ).catch(() => []),
    queryRowsAdmin<Record<string, unknown>>(
      `select p.amount::text, p.currency_code, p.direction::text,
              p.payment_status::text, p.payment_date::text, p.invoice_id::text
       from payments p
       join companies c on c.id = p.company_id
       where c.code = $1::company_code
         and p.payment_date between $2::date and $3::date
       order by p.payment_date desc
       limit 100`,
      [companyCode, periodStart, periodEnd]
    ).catch(() => []),
    queryRowsAdmin<Record<string, unknown>>(
      `select es.submission_title, es.submission_status::text, es.submitted_at::text,
              es.reviewed_at::text
       from expense_submissions es
       join companies c on c.id = es.company_id
       where c.code = $1::company_code
         and es.submitted_at::date between $2::date and $3::date
       order by es.submitted_at desc
       limit 100`,
      [companyCode, periodStart, periodEnd]
    ).catch(() => []),
    queryRowsAdmin<Record<string, unknown>>(
      `select pi.invoice_number, pi.status::text, pi.total_amount::text,
              pi.currency_code, pi.invoice_date::text, pi.paid_at::text
       from payroll_invoices pi
       join companies c on c.id = pi.from_company_id
       where c.code = $1::company_code
         and pi.invoice_date between $2::date and $3::date
       order by pi.invoice_date desc
       limit 100`,
      [companyCode, periodStart, periodEnd]
    ).catch(() => []),
    queryRowsAdmin<Record<string, unknown>>(
      `select ct.tranche_label, ct.tranche_status::text, ct.tranche_amount::text,
              ct.trigger_date::text, ct.invoiced_at::text, ct.collected_at::text
       from contract_tranches ct
       join companies c on c.id = ct.company_id
       where c.code = $1::company_code
         and (ct.trigger_date between $2::date and $3::date or ct.updated_at between $2::timestamptz and $3::timestamptz)
       order by coalesce(ct.invoiced_at, ct.trigger_date) desc
       limit 100`,
      [companyCode, periodStart, periodEnd]
    ).catch(() => []),
    queryRowsAdmin<{ trigger: string; c: number }>(
      `select trigger, count(*)::int as c
       from audit_log
       where created_at::date between $1::date and $2::date
       group by trigger
       order by c desc`,
      [periodStart, periodEnd]
    ).catch(() => []),
  ]);

  const mutationCounts: Record<string, number> = {};
  for (const row of mutationStats as Array<{ trigger: string; c: number }>) {
    mutationCounts[row.trigger] = row.c;
  }

  return {
    companyCode,
    periodStart,
    periodEnd,
    invoices,
    payments,
    expenseSubmissions,
    payrollInvoices,
    tranches,
    mutationCounts,
  };
}

/**
 * Run the audit for a single company. Persists an audit_reports row and
 * emits an audit_log entry tagged with audit-agent.
 */
export async function runMonthlyAudit(opts: {
  companyCode: string;
  periodStart: string;
  periodEnd: string;
  performedBy?: string;
}): Promise<CompanyAuditResult> {
  const { companyCode, periodStart, periodEnd, performedBy } = opts;

  // Resolve company id up front so we can persist the report regardless of LLM outcome
  const companyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = $1::company_code limit 1`,
    [companyCode]
  );
  const companyId = companyRows[0]?.id ?? null;

  if (!companyId) {
    return {
      companyCode,
      reportId: null,
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 1,
      discrepancies: [
        { area: "setup", severity: "high", description: `Company ${companyCode} not found.` },
      ],
      summary: `Cannot audit — company ${companyCode} missing.`,
      modelUsed: "n/a",
    };
  }

  const context = await buildAuditContext(companyCode, periodStart, periodEnd);

  const result = await callLlm<Omit<CompanyAuditResult, "companyCode" | "reportId" | "modelUsed" | "tokensUsed">>(
    {
      tier: "T3",
      purpose: "monthly-audit",
      systemPrompt: SYSTEM_PROMPT,
      prompt: `Reconcile finance data for ${companyCode}, period ${periodStart} to ${periodEnd}. Return JSON matching the schema.\n\nDATA:\n${JSON.stringify(
        context,
        null,
        2
      )}`,
      jsonSchema: SCHEMA,
      maxOutputTokens: 3000,
      timeoutMs: 60_000,
    }
  );

  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 1;
  let discrepancies: Discrepancy[] = [
    { area: "analyzer", severity: "high", description: `Audit LLM call failed: ${result.error ?? "no data"}` },
  ];
  let summary = `Auto-generated audit for ${companyCode} (${periodStart} → ${periodEnd}).`;

  if (result.ok && result.data) {
    totalChecks = Number(result.data.totalChecks ?? 0);
    passedChecks = Number(result.data.passedChecks ?? 0);
    failedChecks = Number(result.data.failedChecks ?? 0);
    discrepancies = Array.isArray(result.data.discrepancies) ? result.data.discrepancies : [];
    summary = String(result.data.summary ?? summary);
  }

  // Persist to audit_reports (always, even on LLM failure so we have the attempt)
  const insertRows = await queryRowsAdmin<{ id: string }>(
    `insert into audit_reports (
       company_id, audit_period_start, audit_period_end,
       status, total_checks, passed_checks, failed_checks,
       discrepancies, summary, completed_at
     )
     values ($1, $2::date, $3::date, 'completed', $4, $5, $6, $7::jsonb, $8, now())
     returning id`,
    [
      companyId,
      periodStart,
      periodEnd,
      totalChecks,
      passedChecks,
      failedChecks,
      JSON.stringify(discrepancies),
      summary,
    ]
  );

  const reportId = insertRows[0]?.id ?? null;

  if (reportId) {
    await cascadeUpdate({
      trigger: "invoice:status:changed", // reuse an existing trigger; audit-specific trigger can be added later
      entityType: "audit_report",
      entityId: reportId,
      action: "monthly-audit-completed",
      after: { companyCode, periodStart, periodEnd, totalChecks, failedChecks },
      performedBy: performedBy ?? "system-cron",
      agentId: "audit-agent",
    });
  }

  return {
    companyCode,
    reportId,
    totalChecks,
    passedChecks,
    failedChecks,
    discrepancies,
    summary,
    tokensUsed: result.tokensUsed,
    modelUsed: result.modelUsed,
  };
}

/**
 * Run audits for every active company in a given period.
 */
export async function runMonthlyAuditAll(opts: {
  periodStart: string;
  periodEnd: string;
  performedBy?: string;
}): Promise<CompanyAuditResult[]> {
  const companies = await queryRowsAdmin<{ code: string }>(
    `select code::text from companies where code in ('LSC','TBR','FSP','XTZ','XTE') order by code`
  ).catch(() => []);

  const results: CompanyAuditResult[] = [];
  for (const { code } of companies) {
    // Run sequentially to avoid hitting Anthropic rate limits on T3
    // eslint-disable-next-line no-await-in-loop
    const r = await runMonthlyAudit({ ...opts, companyCode: code });
    results.push(r);
  }

  // Also log the overall execution
  await executeAdmin(
    `insert into audit_log (entity_type, entity_id, trigger, action,
       before_state, after_state, performed_by, agent_id)
     values ('audit_run', $1, 'invoice:status:changed', 'monthly-audit-run',
       null, $2::jsonb, $3, 'audit-agent')`,
    [
      `${opts.periodStart}_${opts.periodEnd}`,
      JSON.stringify({
        periodStart: opts.periodStart,
        periodEnd: opts.periodEnd,
        companies: results.map((r) => ({ code: r.companyCode, failed: r.failedChecks })),
      }),
      opts.performedBy ?? "system-cron",
    ]
  ).catch((err) => {
    console.error("[monthly-audit] overall log failed:", err);
  });

  return results;
}
