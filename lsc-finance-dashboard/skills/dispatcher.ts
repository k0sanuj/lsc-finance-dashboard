/**
 * Skill Dispatcher
 *
 * The single entry point for routing an (agentId, skill) pair to a concrete
 * implementation. Every skill listed in agents/agent-graph.ts AGENT_SKILLS
 * should have a registered handler here — if it doesn't, dispatch() throws
 * "skill not registered" so misconfigurations surface immediately.
 *
 * Design:
 *  - Read-only skills (T0 workflows + analyzers' query portion) are registered here.
 *  - Mutation skills are registered with explicit allowWrite=true and always
 *    emit a cascadeUpdate() on success.
 *  - HITL skills (DocumentAgent, AuditAgent, analyzers) go through dispatch but
 *    the caller (orchestrator) is responsible for the human-confirm gate.
 *
 * The payload type is validated at the skill's entry — invalid input returns
 * { ok: false, error } rather than throwing, so the orchestrator can continue
 * executing other steps in the plan.
 */

import { AgentId, AGENT_GRAPH, hasSkill } from "../agents/agent-graph";
import * as queries from "@lsc/db";
import { cascadeUpdate } from "./shared/cascade-update";
import type { CascadeTrigger } from "../ontology/cascades";

// ─── Types ─────────────────────────────────────────────────

export type SkillResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export type SkillPayload = Record<string, unknown>;

export type SkillHandler = (payload: SkillPayload) => Promise<SkillResult>;

type SkillKey = `${AgentId}:${string}`;

// ─── Handler Helpers ───────────────────────────────────────

function ok<T>(data: T): SkillResult<T> {
  return { ok: true, data };
}

function fail<T = unknown>(error: string, code?: string): SkillResult<T> {
  return { ok: false, error, code };
}

function requireString(payload: SkillPayload, key: string): string | null {
  const v = payload[key];
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

function optionalString(payload: SkillPayload, key: string): string | undefined {
  const v = payload[key];
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return undefined;
}

function requireNumber(payload: SkillPayload, key: string): number | null {
  const v = payload[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function requireBoolean(payload: SkillPayload, key: string): boolean {
  return payload[key] === true || payload[key] === "true" || payload[key] === "1";
}

function requireApprovedMutation(payload: SkillPayload, skillKey: string): string | SkillResult {
  const idempotencyKey = requireString(payload, "idempotencyKey");
  if (!requireBoolean(payload, "approved")) {
    return fail(`${skillKey} requires approved=true before mutating canonical records.`, "APPROVAL_REQUIRED");
  }
  if (!idempotencyKey) {
    return fail(`${skillKey} requires an idempotencyKey.`, "IDEMPOTENCY_REQUIRED");
  }
  return idempotencyKey;
}

async function runApprovedMutation<T>(
  agentId: AgentId,
  skill: string,
  payload: SkillPayload,
  entityType: string,
  action: string,
  mutate: () => Promise<{ entityId: string; data: T; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null }>
): Promise<SkillResult<T>> {
  const skillKey = `${agentId}:${skill}`;
  const idempotencyKey = requireApprovedMutation(payload, skillKey);
  if (typeof idempotencyKey !== "string") return idempotencyKey as SkillResult<T>;

  try {
    return await queries.withAdminTransaction<SkillResult<T>>(async () => {
      const started = await queries.queryRowsAdmin<{ id: string }>(
        `insert into agent_mutation_idempotency (
           agent_id, skill, idempotency_key, request_payload
         )
         values ($1, $2, $3, $4::jsonb)
         on conflict (agent_id, skill, idempotency_key) do nothing
         returning id`,
        [agentId, skill, idempotencyKey, JSON.stringify(payload)]
      );

      if (started.length === 0) {
        return fail<T>(`${skillKey} already processed idempotencyKey ${idempotencyKey}.`, "IDEMPOTENCY_REPLAY");
      }

      const result = await mutate();
      await queries.executeAdmin(
        `update agent_mutation_idempotency
         set entity_type = $4, entity_id = $5, status = 'succeeded',
             result_payload = $6::jsonb, updated_at = now()
         where agent_id = $1 and skill = $2 and idempotency_key = $3`,
        [agentId, skill, idempotencyKey, entityType, result.entityId, JSON.stringify(result.data ?? {})]
      );
      await cascadeUpdate({
        trigger: cascadeTriggerFor(entityType, action),
        entityType,
        entityId: result.entityId,
        action,
        before: result.before ?? undefined,
        after: result.after ?? (typeof result.data === "object" && result.data ? (result.data as Record<string, unknown>) : { result: result.data }),
        performedBy: optionalString(payload, "performedBy") ?? optionalString(payload, "appUserId") ?? undefined,
        agentId,
      });
      return ok(result.data);
    });
  } catch (err) {
    await queries.executeAdmin(
      `insert into agent_mutation_idempotency (
         agent_id, skill, idempotency_key, status, request_payload, result_payload
       )
       values ($1, $2, $3, 'failed', $4::jsonb, $5::jsonb)
       on conflict (agent_id, skill, idempotency_key)
       do update set status = 'failed', result_payload = excluded.result_payload, updated_at = now()`,
      [
        agentId,
        skill,
        idempotencyKey,
        JSON.stringify(payload),
        JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
      ]
    );
    return fail<T>(err instanceof Error ? err.message : String(err), "MUTATION_FAILED");
  }
}

function inferIntent(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("invoice")) return "invoice";
  if (normalized.includes("expense") || normalized.includes("receipt")) return "expense";
  if (normalized.includes("share") || normalized.includes("cap table")) return "cap_table";
  if (normalized.includes("legal") || normalized.includes("contract")) return "legal";
  if (normalized.includes("payroll") || normalized.includes("salary")) return "payroll";
  return "general_finance";
}

function normalizeChannel(value: string | undefined) {
  if (value === "email" || value === "whatsapp" || value === "slack" || value === "internal") return value;
  return "internal";
}

function cascadeTriggerFor(entityType: string, action: string): CascadeTrigger {
  if (entityType === "invoice") return "invoice:created";
  if (entityType === "invoice_intake" && action === "approved") return "invoice-intake:approved";
  if (entityType === "invoice_intake") return "invoice-intake:posted";
  if (entityType === "expense_submission" && action === "approved") return "expense-submission:approved";
  if (entityType === "expense_submission") return "expense-submission:posted";
  if (entityType === "race_budget_rule") return "race-budget-rule:created";
  if (entityType === "source_document" || entityType === "document_analysis_run") return "document:analyzed";
  if (entityType === "vendor" && action === "updated") return "vendor:updated";
  if (entityType === "vendor") return "vendor:created";
  if (entityType === "subscription") return "subscription:updated";
  if (entityType === "employee" && action === "salary-changed") return "employee:salary:changed";
  if (entityType === "employee" && action === "created") return "employee:created";
  if (entityType === "employee") return "employee:updated";
  if (entityType === "payroll_invoice") return "payroll-invoice:generated";
  if (entityType === "gig_worker_payout" && action === "processed") return "gig-payout:processed";
  if (entityType === "gig_worker_payout" && action === "confirmed") return "gig-payout:confirmed";
  if (entityType === "gig_worker_payout") return "gig-payout:generated";
  if (entityType === "cap_table_event") return "contract:status:changed";
  return "document:posted";
}

// ─── Skill Registry ────────────────────────────────────────
// Keys are `${AgentId}:${skillName}`. Register read-only skills first;
// mutation skills are added in Phase 6.

const SKILL_REGISTRY: Record<string, SkillHandler> = {
  // ── FinanceAgent (workflow) ───────────────────────────────
  "finance-agent:company-metrics": async () => ok(await queries.getOverviewMetrics()),
  "finance-agent:entity-snapshots": async () => ok(await queries.getEntitySnapshots()),
  "finance-agent:cash-flow": async () => ok(await queries.getMonthlyCashFlow()),
  "finance-agent:upcoming-payments": async () => ok(await queries.getUpcomingPayments()),
  "finance-agent:monthly-summary": async () => ok(await queries.getMonthlyCashFlow()),

  // ── InvoiceAgent (workflow) ───────────────────────────────
  "invoice-agent:invoice-workflow-summary": async () => ok(await queries.getInvoiceWorkflowSummary()),
  "invoice-agent:invoice-approval-queue": async () => ok(await queries.getInvoiceApprovalQueue()),

  // ── ExpenseAgent (workflow) ───────────────────────────────
  "expense-agent:expense-workflow-summary": async () => ok(await queries.getExpenseWorkflowSummary()),
  "expense-agent:expense-approval-queue": async (p) => {
    const filters = {
      companyCode: optionalString(p, "companyCode"),
      raceEventId: optionalString(p, "raceEventId"),
    };
    return ok(await queries.getExpenseApprovalQueue(filters));
  },
  "expense-agent:expense-submission-detail": async (p) => {
    const id = requireString(p, "submissionId");
    if (!id) return fail("submissionId is required", "INVALID_INPUT");
    return ok(await queries.getExpenseSubmissionDetail(id));
  },
  "expense-agent:my-expense-submissions": async (p) => {
    const appUserId = requireString(p, "appUserId");
    if (!appUserId) return fail("appUserId is required", "INVALID_INPUT");
    const raceId = optionalString(p, "raceId");
    return ok(await queries.getMyExpenseSubmissions(appUserId, raceId));
  },

  // ── VendorAgent (workflow) ────────────────────────────────
  "vendor-agent:vendor-list": async (p) => {
    const company = optionalString(p, "companyCode");
    return ok(await queries.getVendorsWithBank(company));
  },

  // ── SubscriptionAgent (workflow) ──────────────────────────
  "subscription-agent:subscription-list": async () => ok(await queries.getSubscriptions()),
  "subscription-agent:subscription-summary": async () => ok(await queries.getSubscriptionSummary()),
  "subscription-agent:subscription-alerts": async () => ok(await queries.getSubscriptionAlerts()),

  // ── PayrollAgent (workflow) ───────────────────────────────
  "payroll-agent:employee-list": async (p) => {
    const company = optionalString(p, "companyCode");
    return ok(await queries.getEmployees(company));
  },
  "payroll-agent:payroll-by-month": async (p) => {
    const company = requireString(p, "companyCode");
    if (!company) return fail("companyCode is required", "INVALID_INPUT");
    return ok(await queries.getPayrollByMonth(company));
  },
  "payroll-agent:payroll-detail": async (p) => {
    const company = requireString(p, "companyCode");
    if (!company) return fail("companyCode is required", "INVALID_INPUT");
    const month = optionalString(p, "month");
    return ok(await queries.getPayrollDetail(company, month));
  },
  "payroll-agent:fx-rate-lookup": async () => ok(await queries.getFxRatesForDisplay()),
  "payroll-agent:currency-convert": async (p) => {
    const amount = requireNumber(p, "amount");
    const from = requireString(p, "fromCurrency");
    const to = requireString(p, "toCurrency");
    if (amount === null || !from || !to) {
      return fail("amount, fromCurrency, toCurrency are required", "INVALID_INPUT");
    }
    return ok(await queries.convertCurrency(amount, from, to));
  },

  // ── CapTableAgent (workflow) ──────────────────────────────
  "cap-table-agent:cap-table-entries": async (p) => {
    const company = requireString(p, "companyCode");
    if (!company) return fail("companyCode is required", "INVALID_INPUT");
    return ok(await queries.getCapTableEntries(company));
  },
  "cap-table-agent:cap-table-summary": async (p) => {
    const company = requireString(p, "companyCode");
    if (!company) return fail("companyCode is required", "INVALID_INPUT");
    return ok(await queries.getCapTableSummary(company));
  },
  "cap-table-agent:cap-table-events": async (p) => {
    const company = requireString(p, "companyCode");
    if (!company) return fail("companyCode is required", "INVALID_INPUT");
    return ok(await queries.getCapTableEvents(company));
  },
  "cap-table-agent:investor-list": async (p) => {
    const company = requireString(p, "companyCode");
    if (!company) return fail("companyCode is required", "INVALID_INPUT");
    return ok(await queries.getInvestors(company));
  },

  // ── LitigationAgent (workflow) ────────────────────────────
  "litigation-agent:litigation-costs": async (p) =>
    ok(await queries.getLitigationCosts(optionalString(p, "companyCode"))),
  "litigation-agent:litigation-reserves": async (p) =>
    ok(await queries.getLitigationReserves(optionalString(p, "companyCode"))),
  "litigation-agent:litigation-summary": async (p) =>
    ok(await queries.getLitigationSummary(optionalString(p, "companyCode"))),
  "litigation-agent:compliance-costs": async (p) =>
    ok(await queries.getComplianceCosts(optionalString(p, "companyCode"))),
  "litigation-agent:subsidies-list": async (p) =>
    ok(await queries.getSubsidies(optionalString(p, "companyCode"))),

  // ── GigWorkerAgent (workflow) ─────────────────────────────
  "gig-worker-agent:gig-worker-list": async (p) =>
    ok(await queries.getGigWorkers(optionalString(p, "companyCode"))),
  "gig-worker-agent:gig-payouts": async (p) =>
    ok(await queries.getGigPayouts(optionalString(p, "companyCode"))),
  "gig-worker-agent:gig-payout-summary": async (p) =>
    ok(await queries.getGigPayoutSummary(optionalString(p, "companyCode"))),

  // ── TaxAgent (workflow) ───────────────────────────────────
  "tax-agent:tax-calculations": async (p) =>
    ok(await queries.getTaxCalculations(optionalString(p, "companyCode"))),
  "tax-agent:tax-filings": async (p) =>
    ok(await queries.getTaxFilings(optionalString(p, "companyCode"))),
  "tax-agent:tax-summary": async () => ok(await queries.getTaxSummary()),

  // ── CommercialAgent (workflow) ────────────────────────────
  "commercial-agent:commercial-goals": async () => ok(await queries.getCommercialGoals()),
  "commercial-agent:partner-performance": async () => ok(await queries.getPartnerPerformance()),
  "commercial-agent:sponsor-breakdown": async () => ok(await queries.getSponsorBreakdown()),

  // ── RaceAgent (workflow) ──────────────────────────────────
  "race-agent:season-summary": async () => ok(await queries.getTbrSeasonSummaries()),
  "race-agent:race-list": async (p) => {
    const year = requireNumber(p, "seasonYear");
    if (year === null) return fail("seasonYear is required", "INVALID_INPUT");
    return ok(await queries.getTbrRaceCards(year));
  },
  "race-agent:race-detail": async (p) => {
    const id = requireString(p, "raceId");
    if (!id) return fail("raceId is required", "INVALID_INPUT");
    return ok(await queries.getTbrRaceCardById(id));
  },

  // ── SportsModuleAgent (workflow) ──────────────────────────
  "sports-module-agent:sport-list": async () => ok(await queries.getFspSports()),
  "sports-module-agent:consolidated-fsp-pnl": async (p) => {
    const scenario = optionalString(p, "scenario") ?? "base";
    return ok(await queries.getFspPnlSummaries(scenario));
  },
  "sports-module-agent:sport-pnl": async (p) => {
    const sportId = requireString(p, "sportId");
    if (!sportId) return fail("sportId is required", "INVALID_INPUT");
    const scenario = optionalString(p, "scenario") ?? "base";
    return ok(await queries.getSportPnlLineItems(sportId, scenario));
  },

  // ── TreasuryAgent (workflow) ──────────────────────────────
  "treasury-agent:cash-position": async (p) =>
    ok(await queries.getTreasurySummary(optionalString(p, "companyCode"))),
  "treasury-agent:liquidity-plan": async (p) =>
    ok(await queries.getTreasuryProjections(optionalString(p, "companyCode"))),

  // ── CrossDashboardAgent (agent, T1 — will layer LLM classify later) ──
  "cross-dashboard-agent:inbound-messages": async () => ok(await queries.getInboundMessages()),
  "cross-dashboard-agent:outbound-messages": async () => ok(await queries.getOutboundMessages()),
  "cross-dashboard-agent:messaging-summary": async () => ok(await queries.getMessagingSummary()),

  // ── DocumentAgent (HITL, T2) ──────────────────────────────
  "document-agent:document-queue": async (p) => {
    const userId = optionalString(p, "appUserId");
    const prefix = optionalString(p, "workflowContextPrefix");
    return ok(await queries.getDocumentAnalysisQueue(userId, prefix));
  },
  "document-agent:document-detail": async (p) => {
    const analysisRunId = optionalString(p, "analysisRunId");
    const userId = optionalString(p, "appUserId");
    return ok(await queries.getDocumentAnalysisDetail(analysisRunId, userId));
  },

  // ── HITL analyzers (T1/T2 — narrative reasoning, read-only) ──
  "cash-flow-analyzer:analyze-cash-position": async (p) => {
    const { analyzeCashFlow } = await import("./analyzers/cash-flow");
    return ok(await analyzeCashFlow({ companyCode: optionalString(p, "companyCode") }));
  },
  "cash-flow-analyzer:forecast-liquidity": async (p) => {
    const { analyzeCashFlow } = await import("./analyzers/cash-flow");
    return ok(await analyzeCashFlow({ companyCode: optionalString(p, "companyCode") }));
  },
  "cash-flow-analyzer:financial-forecast": async (p) => {
    const { runFinancialForecast } = await import("./analyzers/financial-forecast");
    return ok(await runFinancialForecast({ companyCode: optionalString(p, "companyCode") }));
  },
  "cash-flow-analyzer:break-even-analysis": async (p) => {
    const { runFinancialForecast } = await import("./analyzers/financial-forecast");
    return ok(await runFinancialForecast({ companyCode: optionalString(p, "companyCode") }));
  },
  "receivables-analyzer:analyze-aging": async (p) => {
    const { analyzeReceivables } = await import("./analyzers/receivables");
    return ok(await analyzeReceivables({ companyCode: optionalString(p, "companyCode") }));
  },
  "receivables-analyzer:assess-collection-risk": async (p) => {
    const { analyzeReceivables } = await import("./analyzers/receivables");
    return ok(await analyzeReceivables({ companyCode: optionalString(p, "companyCode") }));
  },
  "margin-analyzer:analyze-race-margin": async (p) => {
    const { analyzeMargins } = await import("./analyzers/margin");
    const seasonYear = (p.seasonYear as number) ?? undefined;
    return ok(await analyzeMargins({ seasonYear }));
  },
  "margin-analyzer:explain-margin-variance": async (p) => {
    const { analyzeMargins } = await import("./analyzers/margin");
    const seasonYear = (p.seasonYear as number) ?? undefined;
    return ok(await analyzeMargins({ seasonYear }));
  },
  "budget-analyzer:analyze-budget-utilization": async () => {
    const { analyzeBudget } = await import("./analyzers/budget");
    return ok(await analyzeBudget());
  },
  "budget-analyzer:detect-overspend": async () => {
    const { analyzeBudget } = await import("./analyzers/budget");
    return ok(await analyzeBudget());
  },
  "goal-tracker:track-goal-progress": async () => {
    const { analyzeGoals } = await import("./analyzers/goal-tracker");
    return ok(await analyzeGoals());
  },
  "goal-tracker:project-closure-rate": async () => {
    const { analyzeGoals } = await import("./analyzers/goal-tracker");
    return ok(await analyzeGoals());
  },

  // ── AuditAgent (HITL, T3) ─────────────────────────────────
  "audit-agent:run-monthly-audit": async (p) => {
    const { runMonthlyAuditAll, runMonthlyAudit } = await import("./analyzers/monthly-audit");
    const companyCode = optionalString(p, "companyCode");
    const periodStart = requireString(p, "periodStart");
    const periodEnd = requireString(p, "periodEnd");
    if (!periodStart || !periodEnd) {
      return fail("periodStart and periodEnd are required (YYYY-MM-DD)", "INVALID_INPUT");
    }
    if (companyCode) {
      return ok(await runMonthlyAudit({ companyCode, periodStart, periodEnd }));
    }
    return ok(await runMonthlyAuditAll({ periodStart, periodEnd }));
  },
  "audit-agent:reconcile-invoices": async (p) => {
    const invoiceId = requireString(p, "invoiceId");
    if (!invoiceId) return fail("invoiceId is required", "INVALID_INPUT");
    const target = optionalString(p, "target") ?? "payroll-invoice";
    if (target === "canonical-invoice") {
      const { verifyCanonicalInvoiceMath } = await import("./analyzers/invoice-math-verify");
      return ok(await verifyCanonicalInvoiceMath(invoiceId));
    }
    const { verifyPayrollInvoiceMath } = await import("./analyzers/invoice-math-verify");
    return ok(await verifyPayrollInvoiceMath(invoiceId));
  },

  "cross-dashboard-agent:classify-inbound-message": async (p) => {
    const text = optionalString(p, "message") ?? JSON.stringify(p.payload ?? {});
    return ok({ intent: inferIntent(text), confidence: text.trim() ? 0.72 : 0.2, source: "deterministic-keyword" });
  },
  "cross-dashboard-agent:process-message": async (p) =>
    runApprovedMutation(AgentId.CrossDashboardAgent, "process-message", p, "cross_dashboard_message", "processed", async () => {
      const messageId = requireString(p, "messageId");
      if (!messageId) throw new Error("messageId is required");
      await queries.executeAdmin(
        `update cross_dashboard_messages
         set is_processed = true, processed_at = now(),
             response_payload = coalesce(response_payload, '{}'::jsonb) || $2::jsonb
         where id = $1`,
        [messageId, JSON.stringify({ processedBy: optionalString(p, "performedBy") ?? "agent", note: optionalString(p, "note") ?? null })]
      );
      return { entityId: messageId, data: { messageId, processed: true }, after: { processed: true } };
    }),
  "cross-dashboard-agent:send-message": async (p) =>
    runApprovedMutation(AgentId.CrossDashboardAgent, "send-message", p, "cross_dashboard_message", "created", async () => {
      const intent = optionalString(p, "intent") ?? inferIntent(optionalString(p, "body") ?? "");
      const toSystem = optionalString(p, "toSystem") ?? "finance";
      const fromSystem = optionalString(p, "fromSystem") ?? "lsc-dashboard";
      const payload = { body: optionalString(p, "body") ?? "", subject: optionalString(p, "subject") ?? null, context: p.context ?? null };
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into cross_dashboard_messages (from_system, to_system, intent, payload, priority, requires_response)
         values ($1, $2, $3, $4::jsonb, 'normal', $5)
         returning id`,
        [fromSystem, toSystem, intent, JSON.stringify(payload), requireBoolean(p, "requiresResponse")]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("message insert failed");
      return { entityId: id, data: { id, intent, toSystem, fromSystem }, after: { intent, toSystem, fromSystem } };
    }),

  "notification-agent:draft-email": async (p) => ok({
    channel: "email",
    recipient: optionalString(p, "recipient") ?? "",
    subject: optionalString(p, "subject") ?? "LSC finance update",
    body: optionalString(p, "body") ?? optionalString(p, "message") ?? "",
    status: "draft"
  }),
  "notification-agent:draft-whatsapp": async (p) => ok({
    channel: "whatsapp",
    recipient: optionalString(p, "recipient") ?? "",
    body: optionalString(p, "body") ?? optionalString(p, "message") ?? "",
    status: "draft"
  }),
  "notification-agent:draft-slack": async (p) => ok({
    channel: "slack",
    recipient: optionalString(p, "recipient") ?? optionalString(p, "channel") ?? "",
    body: optionalString(p, "body") ?? optionalString(p, "message") ?? "",
    status: "draft"
  }),
  "notification-agent:send-notification": async (p) =>
    runApprovedMutation(AgentId.NotificationAgent, "send-notification", p, "outbound_notification", "queued", async () => {
      const recipient = requireString(p, "recipient");
      const body = requireString(p, "body") ?? requireString(p, "message");
      if (!recipient || !body) throw new Error("recipient and body are required");
      const channel = normalizeChannel(optionalString(p, "channel"));
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into outbound_notifications (
           channel, recipient, subject, body, status, source_agent_id, source_skill, idempotency_key, metadata
         )
         values ($1, $2, $3, $4, 'queued', $5, 'send-notification', $6, $7::jsonb)
         returning id`,
        [
          channel,
          recipient,
          optionalString(p, "subject") ?? null,
          body,
          AgentId.NotificationAgent,
          requireString(p, "idempotencyKey"),
          JSON.stringify({ transport: "queued_for_external_delivery", context: p.context ?? null })
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("notification insert failed");
      return { entityId: id, data: { id, channel, recipient, status: "queued" }, after: { channel, recipient, status: "queued" } };
    }),

  "document-agent:upload-document": async (p) =>
    runApprovedMutation(AgentId.DocumentAgent, "upload-document", p, "source_document", "created", async () => {
      const companyCode = optionalString(p, "companyCode") ?? "LSC";
      const sourceName = requireString(p, "sourceName") ?? requireString(p, "fileName");
      if (!sourceName) throw new Error("sourceName or fileName is required");
      const company = await queries.queryRowsAdmin<{ id: string }>(
        `select id from companies where code = $1::company_code limit 1`,
        [companyCode]
      );
      if (!company[0]?.id) throw new Error(`company ${companyCode} not found`);
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into source_documents (
           company_id, document_type, source_system, source_identifier, source_name, source_url, metadata
         )
         values ($1, 'manual_upload', $2, $3, $4, $5, $6::jsonb)
         returning id`,
        [
          company[0].id,
          optionalString(p, "sourceSystem") ?? "agent-upload",
          optionalString(p, "sourceIdentifier") ?? requireString(p, "idempotencyKey"),
          sourceName,
          optionalString(p, "sourceUrl") ?? null,
          JSON.stringify({ uploadedByAgent: true, mimeType: optionalString(p, "mimeType") ?? null })
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("source document insert failed");
      return { entityId: id, data: { id, sourceName, companyCode }, after: { sourceName, companyCode } };
    }),
  "document-agent:analyze-document": async (p) =>
    runApprovedMutation(AgentId.DocumentAgent, "analyze-document", p, "document_analysis_run", "created", async () => {
      const sourceDocumentId = requireString(p, "sourceDocumentId");
      if (!sourceDocumentId) throw new Error("sourceDocumentId is required");
      const source = await queries.queryRowsAdmin<{ company_id: string; source_name: string }>(
        `select company_id, source_name from source_documents where id = $1 limit 1`,
        [sourceDocumentId]
      );
      if (!source[0]) throw new Error("source document not found");
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into document_analysis_runs (
           source_document_id, company_id, analyzer_type, analysis_status,
           source_file_name, detected_document_type, extracted_summary, overall_confidence, submitted_at
         )
         values ($1, $2, $3, 'needs_review', $4, $5, $6::jsonb, $7, now())
         returning id`,
        [
          sourceDocumentId,
          source[0].company_id,
          optionalString(p, "analyzerType") ?? "agent-document-analysis",
          source[0].source_name,
          optionalString(p, "detectedDocumentType") ?? "unknown",
          JSON.stringify(p.extractedSummary ?? {}),
          requireNumber(p, "confidence") ?? 0.5
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("analysis run insert failed");
      return { entityId: id, data: { id, sourceDocumentId, status: "needs_review" }, after: { sourceDocumentId, status: "needs_review" } };
    }),
  "document-agent:extract-invoice-fields": async (p) => {
    const analysisRunId = requireString(p, "analysisRunId");
    if (!analysisRunId) return fail("analysisRunId is required", "INVALID_INPUT");
    return ok(await queries.getDocumentExtractedFields(analysisRunId));
  },
  "document-agent:extract-receipt-fields": async (p) => {
    const analysisRunId = requireString(p, "analysisRunId");
    if (!analysisRunId) return fail("analysisRunId is required", "INVALID_INPUT");
    return ok(await queries.getDocumentExtractedFields(analysisRunId));
  },

  "audit-agent:audit-reports": async () => ok(await queries.getAuditReports()),
  "audit-agent:audit-summary": async () => ok({
    reports: await queries.getAuditSummaryStats(),
    log: await queries.getAuditLogSummary()
  }),
  "audit-agent:verify-subscriptions": async () => ok({
    summary: await queries.getSubscriptionSummary(),
    alerts: await queries.getSubscriptionAlerts()
  }),
  "audit-agent:verify-cap-table": async (p) => {
    const companyCode = optionalString(p, "companyCode") ?? "LSC";
    return ok({
      summary: await queries.getCapTableSummary(companyCode),
      entries: await queries.getCapTableEntries(companyCode),
      events: await queries.getCapTableEvents(companyCode)
    });
  },

  "invoice-agent:create-invoice-intake": async (p) =>
    runApprovedMutation(AgentId.InvoiceAgent, "create-invoice-intake", p, "invoice_intake", "created", async () => {
      const companyCode = optionalString(p, "companyCode") ?? "TBR";
      const vendorName = requireString(p, "vendorName");
      const totalAmount = requireNumber(p, "totalAmount");
      const appUserId = requireString(p, "appUserId");
      if (!vendorName || totalAmount === null || totalAmount <= 0) throw new Error("vendorName and positive totalAmount are required");
      if (!appUserId) throw new Error("appUserId is required for invoice intake ownership");
      const company = await queries.queryRowsAdmin<{ id: string }>(`select id from companies where code = $1::company_code limit 1`, [companyCode]);
      if (!company[0]?.id) throw new Error(`company ${companyCode} not found`);
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into invoice_intakes (
           company_id, submitted_by_user_id, source_document_id, intake_status,
           vendor_name, invoice_number, due_date, currency_code, total_amount, category_hint, operator_note, submitted_at
         )
         values ($1, $2, $3, 'submitted', $4, $5, $6, $7, $8, $9, $10, now())
         returning id`,
        [
          company[0].id,
          appUserId,
          optionalString(p, "sourceDocumentId") ?? null,
          vendorName,
          optionalString(p, "invoiceNumber") ?? null,
          optionalString(p, "dueDate") ?? null,
          optionalString(p, "currencyCode") ?? "USD",
          totalAmount,
          optionalString(p, "categoryHint") ?? null,
          optionalString(p, "operatorNote") ?? null
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("invoice intake insert failed");
      return { entityId: id, data: { id, vendorName, totalAmount }, after: { vendorName, totalAmount } };
    }),
  "invoice-agent:approve-invoice-intake": async (p) =>
    runApprovedMutation(AgentId.InvoiceAgent, "approve-invoice-intake", p, "invoice_intake", "approved", async () => {
      const intakeId = requireString(p, "intakeId");
      if (!intakeId) throw new Error("intakeId is required");
      await queries.executeAdmin(
        `update invoice_intakes
         set intake_status = 'in_review', reviewed_by_user_id = $2, reviewed_at = now(), updated_at = now()
         where id = $1`,
        [intakeId, optionalString(p, "appUserId") ?? null]
      );
      return { entityId: intakeId, data: { intakeId, status: "in_review" }, after: { status: "in_review" } };
    }),
  "invoice-agent:post-invoice": async (p) =>
    runApprovedMutation<{ id: string; alreadyPosted?: boolean; intakeId?: string }>(AgentId.InvoiceAgent, "post-invoice", p, "invoice", "created", async () => {
      const intakeId = requireString(p, "intakeId");
      if (!intakeId) throw new Error("intakeId is required");
      const intakeRows = await queries.queryRowsAdmin<{
        id: string; company_id: string; race_event_id: string | null; source_document_id: string | null;
        vendor_name: string; invoice_number: string | null; due_date: string | null; currency_code: string | null; total_amount: string; operator_note: string | null; canonical_invoice_id: string | null;
      }>(
        `select id, company_id, race_event_id, source_document_id, vendor_name, invoice_number,
                due_date::text, currency_code, total_amount::text, operator_note, canonical_invoice_id
         from invoice_intakes where id = $1 limit 1`,
        [intakeId]
      );
      const intake = intakeRows[0];
      if (!intake) throw new Error("invoice intake not found");
      if (intake.canonical_invoice_id) return { entityId: intake.canonical_invoice_id, data: { id: intake.canonical_invoice_id, alreadyPosted: true } };
      const counterparty = await queries.queryRowsAdmin<{ id: string }>(
        `insert into sponsors_or_customers (company_id, name, normalized_name, counterparty_type, notes)
         values ($1, $2, lower($2), 'vendor', 'Created from agent invoice workflow')
         on conflict (company_id, normalized_name) do update set name = excluded.name, updated_at = now()
         returning id`,
        [intake.company_id, intake.vendor_name]
      );
      const invoice = await queries.queryRowsAdmin<{ id: string }>(
        `insert into invoices (
           company_id, sponsor_or_customer_id, race_event_id, source_document_id,
           direction, invoice_number, invoice_status, issue_date, due_date,
           currency_code, subtotal_amount, total_amount, notes
         )
         values ($1, $2, $3, $4, 'payable', $5, 'issued', current_date, $6, $7, $8, $8, $9)
         returning id`,
        [
          intake.company_id,
          counterparty[0]?.id ?? null,
          intake.race_event_id,
          intake.source_document_id,
          intake.invoice_number,
          intake.due_date,
          intake.currency_code ?? "USD",
          intake.total_amount,
          intake.operator_note ?? "Posted from agent invoice workflow."
        ]
      );
      const invoiceId = invoice[0]?.id;
      if (!invoiceId) throw new Error("canonical invoice insert failed");
      await queries.executeAdmin(
        `update invoice_intakes
         set intake_status = 'posted', canonical_invoice_id = $2, posted_at = now(), updated_at = now()
         where id = $1`,
        [intakeId, invoiceId]
      );
      return { entityId: invoiceId, data: { id: invoiceId, intakeId }, after: { intakeId, status: "posted" } };
    }),

  "expense-agent:manage-budget-rules": async (p) =>
    runApprovedMutation(AgentId.ExpenseAgent, "manage-budget-rules", p, "race_budget_rule", "saved", async () => {
      const raceEventId = requireString(p, "raceEventId");
      const costCategoryId = requireString(p, "costCategoryId");
      const amount = requireNumber(p, "approvedAmountUsd");
      if (!raceEventId || !costCategoryId || amount === null) throw new Error("raceEventId, costCategoryId, approvedAmountUsd are required");
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into race_budget_rules (
           race_event_id, cost_category_id, rule_kind, rule_label, approved_amount_usd, notes, created_by_user_id, updated_by_user_id
         )
         values ($1, $2, 'budget_cap', $3, $4, $5, $6, $6)
         returning id`,
        [raceEventId, costCategoryId, optionalString(p, "ruleLabel") ?? "Agent budget rule", amount, optionalString(p, "notes") ?? null, optionalString(p, "appUserId") ?? null]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("budget rule insert failed");
      return { entityId: id, data: { id, amount }, after: { raceEventId, costCategoryId, amount } };
    }),
  "expense-agent:create-expense-submission": async (p) =>
    runApprovedMutation(AgentId.ExpenseAgent, "create-expense-submission", p, "expense_submission", "created", async () => {
      const title = requireString(p, "submissionTitle") ?? requireString(p, "title");
      const amount = requireNumber(p, "amount");
      const appUserId = requireString(p, "appUserId");
      if (!title || amount === null || amount <= 0) throw new Error("title and positive amount are required");
      if (!appUserId) throw new Error("appUserId is required for expense submission ownership");
      const companyCode = optionalString(p, "companyCode") ?? "TBR";
      const company = await queries.queryRowsAdmin<{ id: string }>(`select id from companies where code = $1::company_code limit 1`, [companyCode]);
      if (!company[0]?.id) throw new Error(`company ${companyCode} not found`);
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into expense_submissions (
           company_id, race_event_id, submitted_by_user_id, submission_status, submission_title, operator_note, submitted_at
         )
         values ($1, $2, $3, 'submitted', $4, $5, now())
         returning id`,
        [company[0].id, optionalString(p, "raceEventId") ?? null, appUserId, title, optionalString(p, "operatorNote") ?? null]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("expense submission insert failed");
      return { entityId: id, data: { id, title, amount }, after: { title, amount } };
    }),
  "expense-agent:approve-expense-submission": async (p) =>
    runApprovedMutation(AgentId.ExpenseAgent, "approve-expense-submission", p, "expense_submission", "approved", async () => {
      const submissionId = requireString(p, "submissionId");
      if (!submissionId) throw new Error("submissionId is required");
      await queries.executeAdmin(
        `update expense_submissions
         set submission_status = 'approved', reviewed_by_user_id = $2, reviewed_at = now(), updated_at = now()
         where id = $1`,
        [submissionId, optionalString(p, "appUserId") ?? null]
      );
      return { entityId: submissionId, data: { submissionId, status: "approved" }, after: { status: "approved" } };
    }),

  "vendor-agent:vendor-detail": async (p) => {
    const vendorId = requireString(p, "vendorId");
    if (!vendorId) return fail("vendorId is required", "INVALID_INPUT");
    const rows = await queries.queryRows<{ id: string }>(`select * from vendors where id = $1 limit 1`, [vendorId]);
    return ok(rows[0] ?? null);
  },
  "vendor-agent:vendor-spend-summary": async (p) => {
    const vendorName = optionalString(p, "vendorName");
    const rows = await queries.queryRows<{
      vendor_name: string;
      approved_spend: string;
      row_count: string;
    }>(
      `select coalesce(vendor_name, 'Unassigned') as vendor_name,
              coalesce(sum(amount), 0)::numeric(14,2)::text as approved_spend,
              count(*)::text as row_count
       from expenses
       where expense_status in ('approved', 'paid')
         and ($1::text is null or vendor_name ilike '%' || $1 || '%')
       group by coalesce(vendor_name, 'Unassigned')
       order by coalesce(sum(amount), 0) desc
       limit 20`,
      [vendorName ?? null]
    );
    return ok(rows);
  },
  "vendor-agent:add-vendor": async (p) =>
    runApprovedMutation(AgentId.VendorAgent, "add-vendor", p, "vendor", "created", async () => {
      const name = requireString(p, "name");
      if (!name) throw new Error("name is required");
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into vendors (name, vendor_type, status, payment_terms, email, phone, currency_code, tax_id, notes)
         values ($1, $2::vendor_type, 'active', $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          name,
          optionalString(p, "vendorType") ?? "service_provider",
          optionalString(p, "paymentTerms") ?? null,
          optionalString(p, "email") ?? null,
          optionalString(p, "phone") ?? null,
          optionalString(p, "currencyCode") ?? "USD",
          optionalString(p, "taxId") ?? null,
          optionalString(p, "notes") ?? null
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("vendor insert failed");
      return { entityId: id, data: { id, name }, after: { name } };
    }),
  "vendor-agent:update-vendor": async (p) =>
    runApprovedMutation(AgentId.VendorAgent, "update-vendor", p, "vendor", "updated", async () => {
      const vendorId = requireString(p, "vendorId");
      if (!vendorId) throw new Error("vendorId is required");
      const before = await queries.queryRowsAdmin<Record<string, unknown>>(`select * from vendors where id = $1 limit 1`, [vendorId]);
      await queries.executeAdmin(
        `update vendors
         set name = coalesce($2, name),
             status = coalesce($3::vendor_status, status),
             email = coalesce($4, email),
             phone = coalesce($5, phone),
             notes = coalesce($6, notes),
             updated_at = now()
         where id = $1`,
        [
          vendorId,
          optionalString(p, "name") ?? null,
          optionalString(p, "status") ?? null,
          optionalString(p, "email") ?? null,
          optionalString(p, "phone") ?? null,
          optionalString(p, "notes") ?? null
        ]
      );
      return { entityId: vendorId, data: { vendorId, updated: true }, before: before[0] ?? null, after: { updated: true } };
    }),

  "subscription-agent:generate-alerts": async () => ok(await queries.getSubscriptionAlerts()),
  "subscription-agent:dismiss-alert": async (p) =>
    runApprovedMutation(AgentId.SubscriptionAgent, "dismiss-alert", p, "subscription", "alert-dismissed", async () => {
      const subscriptionId = requireString(p, "subscriptionId");
      if (!subscriptionId) throw new Error("subscriptionId is required");
      await queries.executeAdmin(
        `update subscriptions set notes = concat(coalesce(notes, ''), $2), updated_at = now() where id = $1`,
        [subscriptionId, `\nAlert dismissed ${new Date().toISOString()}: ${optionalString(p, "note") ?? "No note"}`]
      );
      return { entityId: subscriptionId, data: { subscriptionId, dismissed: true }, after: { dismissed: true } };
    }),

  "payroll-agent:employee-add": async (p) =>
    runApprovedMutation(AgentId.PayrollAgent, "employee-add", p, "employee", "created", async () => {
      const fullName = requireString(p, "fullName");
      const companyCode = optionalString(p, "companyCode") ?? "XTZ";
      if (!fullName) throw new Error("fullName is required");
      const company = await queries.queryRowsAdmin<{ id: string }>(`select id from companies where code = $1::company_code limit 1`, [companyCode]);
      if (!company[0]?.id) throw new Error(`company ${companyCode} not found`);
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into employees (
           company_id, full_name, email, designation, department, region, employment_type,
           base_salary, salary_currency, status, start_date
         )
         values ($1, $2, $3, $4, $5, $6, $7::employment_type, $8, $9, 'active', current_date)
         returning id`,
        [
          company[0].id,
          fullName,
          optionalString(p, "email") ?? null,
          optionalString(p, "designation") ?? "",
          optionalString(p, "department") ?? null,
          optionalString(p, "region") ?? null,
          optionalString(p, "employmentType") ?? "full_time",
          requireNumber(p, "baseSalary") ?? 0,
          optionalString(p, "salaryCurrency") ?? "INR"
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("employee insert failed");
      return { entityId: id, data: { id, fullName, companyCode }, after: { fullName, companyCode } };
    }),
  "payroll-agent:employee-update": async (p) =>
    runApprovedMutation(AgentId.PayrollAgent, "employee-update", p, "employee", "updated", async () => {
      const employeeId = requireString(p, "employeeId");
      if (!employeeId) throw new Error("employeeId is required");
      const before = await queries.queryRowsAdmin<Record<string, unknown>>(`select * from employees where id = $1 limit 1`, [employeeId]);
      await queries.executeAdmin(
        `update employees
         set designation = coalesce($2, designation),
             department = coalesce($3, department),
             region = coalesce($4, region),
             status = coalesce($5::employee_status, status),
             updated_at = now()
         where id = $1`,
        [employeeId, optionalString(p, "designation") ?? null, optionalString(p, "department") ?? null, optionalString(p, "region") ?? null, optionalString(p, "status") ?? null]
      );
      return { entityId: employeeId, data: { employeeId, updated: true }, before: before[0] ?? null, after: { updated: true } };
    }),
  "payroll-agent:salary-update": async (p) =>
    runApprovedMutation(AgentId.PayrollAgent, "salary-update", p, "employee", "salary-changed", async () => {
      const employeeId = requireString(p, "employeeId");
      const baseSalary = requireNumber(p, "baseSalary");
      if (!employeeId || baseSalary === null) throw new Error("employeeId and baseSalary are required");
      const before = await queries.queryRowsAdmin<Record<string, unknown>>(`select base_salary, salary_currency from employees where id = $1 limit 1`, [employeeId]);
      await queries.executeAdmin(
        `update employees
         set base_salary = $2, salary_currency = coalesce($3, salary_currency), updated_at = now()
         where id = $1`,
        [employeeId, baseSalary, optionalString(p, "salaryCurrency") ?? null]
      );
      return { entityId: employeeId, data: { employeeId, baseSalary }, before: before[0] ?? null, after: { baseSalary } };
    }),
  "payroll-agent:generate-payroll-invoice": async (p) =>
    runApprovedMutation(AgentId.PayrollAgent, "generate-payroll-invoice", p, "payroll_invoice", "generated", async () => {
      const payrollMonth = requireString(p, "payrollMonth");
      if (!payrollMonth) throw new Error("payrollMonth is required");
      return {
        entityId: payrollMonth,
        data: {
          payrollMonth,
          status: "request-recorded",
          nextStep: "Use /payroll-invoices/generator for full line-item staging and server recalculation."
        },
        after: { payrollMonth, status: "request-recorded" }
      };
    }),

  "cap-table-agent:share-grant-process": async (p) =>
    runApprovedMutation(AgentId.CapTableAgent, "share-grant-process", p, "cap_table_event", "created", async () => {
      const companyCode = optionalString(p, "companyCode") ?? "LSC";
      const shares = requireNumber(p, "sharesAffected");
      if (shares === null || shares <= 0) throw new Error("sharesAffected is required");
      const company = await queries.queryRowsAdmin<{ id: string }>(`select id from companies where code = $1::company_code limit 1`, [companyCode]);
      if (!company[0]?.id) throw new Error(`company ${companyCode} not found`);
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into cap_table_events (
           company_id, event_type, event_date, shares_affected, to_holder, round_name, notes
         )
         values ($1, 'issuance', current_date, $2, $3, $4, $5)
         returning id`,
        [company[0].id, shares, optionalString(p, "toHolder") ?? "Unassigned", optionalString(p, "roundName") ?? null, optionalString(p, "notes") ?? "Agent share grant process"]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("cap table event insert failed");
      return { entityId: id, data: { id, shares }, after: { shares, companyCode } };
    }),

  "gig-worker-agent:generate-payouts": async (p) =>
    runApprovedMutation(AgentId.GigWorkerAgent, "generate-payouts", p, "gig_worker_payout", "generated", async () => {
      const gigWorkerId = requireString(p, "gigWorkerId");
      const companyCode = optionalString(p, "companyCode") ?? "XTZ";
      const amount = requireNumber(p, "netAmount");
      if (!gigWorkerId || amount === null) throw new Error("gigWorkerId and netAmount are required");
      const company = await queries.queryRowsAdmin<{ id: string }>(`select id from companies where code = $1::company_code limit 1`, [companyCode]);
      if (!company[0]?.id) throw new Error(`company ${companyCode} not found`);
      const rows = await queries.queryRowsAdmin<{ id: string }>(
        `insert into gig_worker_payouts (
           company_id, gig_worker_id, period_start, period_end, gross_amount, deductions, net_amount, currency_code, status, notes
         )
         values ($1, $2, coalesce($3::date, current_date), coalesce($4::date, current_date), $5, 0, $5, $6, 'pending', $7)
         returning id`,
        [company[0].id, gigWorkerId, optionalString(p, "periodStart") ?? null, optionalString(p, "periodEnd") ?? null, amount, optionalString(p, "currencyCode") ?? "INR", optionalString(p, "notes") ?? null]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("gig payout insert failed");
      return { entityId: id, data: { id, amount }, after: { amount, status: "pending" } };
    }),
  "gig-worker-agent:process-payout": async (p) =>
    runApprovedMutation(AgentId.GigWorkerAgent, "process-payout", p, "gig_worker_payout", "processed", async () => {
      const payoutId = requireString(p, "payoutId");
      if (!payoutId) throw new Error("payoutId is required");
      await queries.executeAdmin(`update gig_worker_payouts set status = 'processing', updated_at = now() where id = $1`, [payoutId]);
      return { entityId: payoutId, data: { payoutId, status: "processing" }, after: { status: "processing" } };
    }),
  "gig-worker-agent:confirm-payout": async (p) =>
    runApprovedMutation(AgentId.GigWorkerAgent, "confirm-payout", p, "gig_worker_payout", "confirmed", async () => {
      const payoutId = requireString(p, "payoutId");
      if (!payoutId) throw new Error("payoutId is required");
      await queries.executeAdmin(
        `update gig_worker_payouts
         set status = 'paid', payment_reference = coalesce($2, payment_reference), paid_at = now(), updated_at = now()
         where id = $1`,
        [payoutId, optionalString(p, "paymentReference") ?? null]
      );
      return { entityId: payoutId, data: { payoutId, status: "paid" }, after: { status: "paid" } };
    }),

  "tax-agent:gst-calculate": async (p) => {
    const taxableAmount = requireNumber(p, "taxableAmount");
    const rate = requireNumber(p, "taxRate") ?? 18;
    if (taxableAmount === null) return fail("taxableAmount is required", "INVALID_INPUT");
    return ok({ taxType: "GST", taxableAmount, taxRate: rate, taxAmount: Number((taxableAmount * rate / 100).toFixed(2)) });
  },
  "tax-agent:vat-calculate": async (p) => {
    const taxableAmount = requireNumber(p, "taxableAmount");
    const rate = requireNumber(p, "taxRate") ?? 5;
    if (taxableAmount === null) return fail("taxableAmount is required", "INVALID_INPUT");
    return ok({ taxType: "VAT", taxableAmount, taxRate: rate, taxAmount: Number((taxableAmount * rate / 100).toFixed(2)) });
  },

  "race-agent:race-pnl": async (p) => {
    const seasonCode = optionalString(p, "seasonCode");
    const dashboard = await queries.getTbrOverallPnlDashboard(seasonCode);
    return ok(dashboard);
  },
  "race-agent:race-budget": async (p) => {
    const raceEventId = requireString(p, "raceEventId");
    if (!raceEventId) return fail("raceEventId is required", "INVALID_INPUT");
    return ok(await queries.getRaceBudgetRules(raceEventId));
  },

  "sports-module-agent:sport-detail": async (p) => {
    const sportId = requireString(p, "sportId") ?? (optionalString(p, "sportCode") ? await queries.getSportIdByCode(optionalString(p, "sportCode") as string) : null);
    if (!sportId) return fail("sportId or sportCode is required", "INVALID_INPUT");
    return ok({
      cockpit: await queries.getFspSportCockpitMetrics(sportId),
      pnl: await queries.getSportPnlLineItems(sportId, optionalString(p, "scenario") ?? "base"),
      sponsorships: await queries.getSportSponsorships(sportId),
      completeness: await queries.getSportModuleCompleteness(sportId),
    });
  },
  "sports-module-agent:sp-multiplier-lookup": async () => {
    const rows = await queries.queryRows(
      `select spm.id, spm.multiplier_ratio::text, spm.trigger_threshold::text,
              spm.is_active, spm.notes, spm.updated_at::text
       from sp_multipliers spm
       join companies c on c.id = spm.company_id
       where c.code = 'FSP'::company_code
       order by spm.is_active desc, spm.trigger_threshold`
    );
    return ok(rows);
  },

  "treasury-agent:bank-balances": async (p) => ok(await queries.getTreasurySummary(optionalString(p, "companyCode"))),
  "treasury-agent:fx-positions": async () => ok(await queries.getFxRatesForDisplay()),
};

// ─── Introspection ─────────────────────────────────────────

export function listRegisteredSkills(): string[] {
  return Object.keys(SKILL_REGISTRY).sort();
}

export function getUnregisteredSkills(): Array<{ agentId: AgentId; skill: string }> {
  const gaps: Array<{ agentId: AgentId; skill: string }> = [];
  const { AGENT_SKILLS } = require("../agents/agent-graph") as {
    AGENT_SKILLS: Record<AgentId, string[]>;
  };

  for (const [agentIdStr, skills] of Object.entries(AGENT_SKILLS)) {
    const agentId = agentIdStr as AgentId;
    for (const skill of skills) {
      // ontology-query, cascade-update, audit-log are infrastructure skills
      // handled by the cascade/audit layer, not the dispatcher.
      if (["ontology-query", "cascade-update", "audit-log"].includes(skill)) continue;
      // route-intent, merge-results are orchestrator-internal.
      if (agentId === AgentId.Orchestrator) continue;
      const key: SkillKey = `${agentId}:${skill}`;
      if (!SKILL_REGISTRY[key]) gaps.push({ agentId, skill });
    }
  }
  return gaps;
}

// ─── Dispatch ──────────────────────────────────────────────

export async function dispatch(
  agentId: AgentId,
  skill: string,
  payload: SkillPayload = {}
): Promise<SkillResult> {
  // 1. Agent must exist
  if (!AGENT_GRAPH[agentId]) {
    return fail(`Unknown agent: ${agentId}`, "UNKNOWN_AGENT");
  }

  // 2. Skill must be declared on that agent
  if (!hasSkill(agentId, skill)) {
    return fail(`Agent ${agentId} does not declare skill "${skill}"`, "SKILL_NOT_DECLARED");
  }

  // 3. Handler must be registered
  const key: SkillKey = `${agentId}:${skill}`;
  const handler = SKILL_REGISTRY[key];
  if (!handler) {
    return fail(`No handler registered for ${key}`, "HANDLER_NOT_REGISTERED");
  }

  // 4. Execute — catch any unhandled throws so the caller always gets a SkillResult
  try {
    return await handler(payload);
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : String(err),
      "HANDLER_THREW"
    );
  }
}
