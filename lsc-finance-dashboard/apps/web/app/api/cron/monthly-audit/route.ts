/**
 * GET /api/cron/monthly-audit
 *
 * Vercel Cron endpoint — runs on day 1 of each month at 03:00 UTC.
 * Audits the previous calendar month across all companies.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` (set by Vercel
 * automatically for registered crons). Also accepts manual triggers from
 * admin sessions so you can re-run on demand.
 *
 * Query params (optional, manual runs only):
 *   ?start=YYYY-MM-DD&end=YYYY-MM-DD   — override the default prior-month range
 *   ?company=TBR                        — audit only one company
 */
import { NextResponse } from "next/server";
import { runMonthlyAudit, runMonthlyAuditAll } from "@lsc/skills/analyzers/monthly-audit";
import { requireRole } from "../../../../lib/auth";

function priorMonthRange(): { start: string; end: string } {
  const now = new Date();
  // First day of current month → subtract 1 ms to get last day of prior month
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endDate = new Date(firstOfMonth.getTime() - 1);
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expectedAuth = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const isVercelCron = process.env.CRON_SECRET && authHeader === expectedAuth;

  // If it's not a valid Vercel cron call, require an admin session
  if (!isVercelCron) {
    try {
      await requireRole(["super_admin", "finance_admin"]);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const overrideStart = url.searchParams.get("start");
  const overrideEnd = url.searchParams.get("end");
  const companyCode = url.searchParams.get("company");

  const range = overrideStart && overrideEnd
    ? { start: overrideStart, end: overrideEnd }
    : priorMonthRange();

  const started = Date.now();
  try {
    const results = companyCode
      ? [await runMonthlyAudit({
          companyCode,
          periodStart: range.start,
          periodEnd: range.end,
          performedBy: isVercelCron ? "vercel-cron" : "manual-trigger",
        })]
      : await runMonthlyAuditAll({
          periodStart: range.start,
          periodEnd: range.end,
          performedBy: isVercelCron ? "vercel-cron" : "manual-trigger",
        });

    return NextResponse.json({
      ok: true,
      period: range,
      triggeredBy: isVercelCron ? "vercel-cron" : "manual-trigger",
      durationMs: Date.now() - started,
      reports: results.map((r) => ({
        companyCode: r.companyCode,
        reportId: r.reportId,
        totalChecks: r.totalChecks,
        passedChecks: r.passedChecks,
        failedChecks: r.failedChecks,
        discrepancyCount: r.discrepancies.length,
        modelUsed: r.modelUsed,
        tokensUsed: r.tokensUsed,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      },
      { status: 500 }
    );
  }
}
