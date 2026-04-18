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

function fail(error: string, code?: string): SkillResult {
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
