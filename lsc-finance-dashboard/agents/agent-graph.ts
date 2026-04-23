/**
 * LSC Finance Dashboard — Agent Graph
 *
 * Classifies every capability into one of three kinds (per Anthropic's
 * "Should I build an agent?" checklist):
 *   - workflow — deterministic code, no LLM. Fast, cheap, zero-error.
 *   - hitl     — LLM reasoning but human confirms before any write.
 *   - agent    — autonomous: can reason and commit side effects.
 *
 * Each capability is also tagged with an intelligenceTier:
 *   - T0 — no LLM (pure SQL/math/rules)
 *   - T1 — cheap LLM (Gemini Flash / Haiku)
 *   - T2 — mid LLM (Gemini Pro / Sonnet)
 *   - T3 — heavy LLM (Opus / Sonnet top-tier)
 *
 * Rule: kind === "workflow" ⇒ tier === "T0". Workflows never call LLMs.
 */

// ─── Agent IDs ─────────────────────────────────────────────

export enum AgentId {
  // True autonomous agents (3)
  Orchestrator = "orchestrator",
  CrossDashboardAgent = "cross-dashboard-agent",
  NotificationAgent = "notification-agent",

  // Read-only / HITL agents (7)
  DocumentAgent = "document-agent",
  AuditAgent = "audit-agent",
  CashFlowAnalyzer = "cash-flow-analyzer",
  ReceivablesAnalyzer = "receivables-analyzer",
  MarginAnalyzer = "margin-analyzer",
  BudgetAnalyzer = "budget-analyzer",
  GoalTracker = "goal-tracker",

  // Deterministic workflows (14)
  FinanceAgent = "finance-agent",
  InvoiceAgent = "invoice-agent",
  ExpenseAgent = "expense-agent",
  VendorAgent = "vendor-agent",
  SubscriptionAgent = "subscription-agent",
  PayrollAgent = "payroll-agent",
  CapTableAgent = "cap-table-agent",
  LitigationAgent = "litigation-agent",
  GigWorkerAgent = "gig-worker-agent",
  TaxAgent = "tax-agent",
  CommercialAgent = "commercial-agent",
  RaceAgent = "race-agent",
  SportsModuleAgent = "sports-module-agent",
  TreasuryAgent = "treasury-agent",
}

// ─── Agent Topology ────────────────────────────────────────

export type AgentKind = "workflow" | "hitl" | "agent";
export type IntelligenceTier = "T0" | "T1" | "T2" | "T3";

export type AgentNode = {
  id: AgentId;
  name: string;
  role: string;
  kind: AgentKind;
  tier: IntelligenceTier;
  canTalkTo: AgentId[];
};

export const AGENT_GRAPH: Record<AgentId, AgentNode> = {
  // ─── True Agents (3) ──────────────────────────────────────
  [AgentId.Orchestrator]: {
    id: AgentId.Orchestrator,
    name: "Finance Orchestrator",
    role: "Intent classification, routing, and result merging",
    kind: "agent",
    tier: "T1",
    canTalkTo: [
      AgentId.FinanceAgent,
      AgentId.InvoiceAgent,
      AgentId.ExpenseAgent,
      AgentId.VendorAgent,
      AgentId.SubscriptionAgent,
      AgentId.PayrollAgent,
      AgentId.CapTableAgent,
      AgentId.LitigationAgent,
      AgentId.GigWorkerAgent,
      AgentId.TaxAgent,
      AgentId.CommercialAgent,
      AgentId.RaceAgent,
      AgentId.SportsModuleAgent,
      AgentId.TreasuryAgent,
      AgentId.DocumentAgent,
      AgentId.AuditAgent,
      AgentId.CashFlowAnalyzer,
      AgentId.ReceivablesAnalyzer,
      AgentId.MarginAnalyzer,
      AgentId.BudgetAnalyzer,
      AgentId.GoalTracker,
      AgentId.CrossDashboardAgent,
      AgentId.NotificationAgent,
    ],
  },
  [AgentId.CrossDashboardAgent]: {
    id: AgentId.CrossDashboardAgent,
    name: "Cross-Dashboard Agent",
    role: "Classify inbound Legal↔Finance messages, route invoices/share grants/compliance",
    kind: "agent",
    tier: "T1",
    canTalkTo: [
      AgentId.Orchestrator,
      AgentId.InvoiceAgent,
      AgentId.CapTableAgent,
      AgentId.LitigationAgent,
      AgentId.NotificationAgent,
    ],
  },
  [AgentId.NotificationAgent]: {
    id: AgentId.NotificationAgent,
    name: "Notification Agent",
    role: "Draft email/WhatsApp/Slack messages from structured finance events",
    kind: "agent",
    tier: "T1",
    canTalkTo: [AgentId.Orchestrator],
  },

  // ─── HITL / Read-only Agents (7) ──────────────────────────
  [AgentId.DocumentAgent]: {
    id: AgentId.DocumentAgent,
    name: "Document Agent",
    role: "AI field extraction from PDFs/images — human confirms posting",
    kind: "hitl",
    tier: "T2",
    canTalkTo: [AgentId.Orchestrator, AgentId.InvoiceAgent, AgentId.ExpenseAgent],
  },
  [AgentId.AuditAgent]: {
    id: AgentId.AuditAgent,
    name: "Audit Agent",
    role: "Monthly reconciliation, discrepancy detection, cross-system verification",
    kind: "hitl",
    tier: "T3",
    canTalkTo: [
      AgentId.Orchestrator,
      AgentId.FinanceAgent,
      AgentId.InvoiceAgent,
      AgentId.SubscriptionAgent,
      AgentId.VendorAgent,
      AgentId.PayrollAgent,
      AgentId.CapTableAgent,
    ],
  },
  [AgentId.CashFlowAnalyzer]: {
    id: AgentId.CashFlowAnalyzer,
    name: "Cash Flow Analyzer",
    role: "Cash position analysis, liquidity forecasting (read-only)",
    kind: "hitl",
    tier: "T2",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.ReceivablesAnalyzer]: {
    id: AgentId.ReceivablesAnalyzer,
    name: "Receivables Analyzer",
    role: "Aging analysis, collection risk assessment (read-only)",
    kind: "hitl",
    tier: "T2",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.MarginAnalyzer]: {
    id: AgentId.MarginAnalyzer,
    name: "Margin Analyzer",
    role: "Race-level P&L, cost-revenue spread narratives (read-only)",
    kind: "hitl",
    tier: "T2",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.BudgetAnalyzer]: {
    id: AgentId.BudgetAnalyzer,
    name: "Budget Analyzer",
    role: "Budget utilization, overspend detection (read-only)",
    kind: "hitl",
    tier: "T1",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.GoalTracker]: {
    id: AgentId.GoalTracker,
    name: "Goal Tracker",
    role: "Commercial target progress, closure projections (read-only)",
    kind: "hitl",
    tier: "T1",
    canTalkTo: [AgentId.Orchestrator],
  },

  // ─── Workflows (14) — pure SQL/math, no LLM ───────────────
  [AgentId.FinanceAgent]: {
    id: AgentId.FinanceAgent,
    name: "Finance Workflow",
    role: "Company metrics, cash flow, payment tracking (SQL aggregations)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.InvoiceAgent]: {
    id: AgentId.InvoiceAgent,
    name: "Invoice Workflow",
    role: "Invoice intake, approval, posting, payable tracking (state machine)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator, AgentId.NotificationAgent],
  },
  [AgentId.ExpenseAgent]: {
    id: AgentId.ExpenseAgent,
    name: "Expense Workflow",
    role: "Expense submissions, approvals, budget rules, splits (state machine)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.VendorAgent]: {
    id: AgentId.VendorAgent,
    name: "Vendor Workflow",
    role: "Vendor registry, bank details, spend tracking (CRUD)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.SubscriptionAgent]: {
    id: AgentId.SubscriptionAgent,
    name: "Subscription Workflow",
    role: "SaaS tracking, renewal alerts, cost aggregation (rules)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator, AgentId.NotificationAgent],
  },
  [AgentId.PayrollAgent]: {
    id: AgentId.PayrollAgent,
    name: "Payroll Workflow",
    role: "Employee management, salary payroll, FX conversion, invoice generation",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator, AgentId.InvoiceAgent],
  },
  [AgentId.CapTableAgent]: {
    id: AgentId.CapTableAgent,
    name: "Cap Table Workflow",
    role: "Equity ownership, share grants, vesting, dilution math",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.LitigationAgent]: {
    id: AgentId.LitigationAgent,
    name: "Litigation Workflow",
    role: "Legal cost tracking, reserves, exposure, compliance costs",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.GigWorkerAgent]: {
    id: AgentId.GigWorkerAgent,
    name: "Gig Worker Workflow",
    role: "XTZ India gig worker tasks, payout calculation (deterministic)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator, AgentId.PayrollAgent],
  },
  [AgentId.TaxAgent]: {
    id: AgentId.TaxAgent,
    name: "Tax Workflow",
    role: "GST/VAT calculation, filing preparation, withholding (regulated formulas)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.CommercialAgent]: {
    id: AgentId.CommercialAgent,
    name: "Commercial Workflow",
    role: "Commercial goals, sponsor tracking, partner performance (aggregations)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.RaceAgent]: {
    id: AgentId.RaceAgent,
    name: "Race Workflow",
    role: "TBR race events, seasons, per-race P&L (SQL aggregation)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.SportsModuleAgent]: {
    id: AgentId.SportsModuleAgent,
    name: "Sports Module Workflow",
    role: "FSP per-sport operations (squash, bowling, basketball, world pong, foundation)",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.TreasuryAgent]: {
    id: AgentId.TreasuryAgent,
    name: "Treasury Workflow",
    role: "Cash position, bank balances, FX positions, liquidity planning",
    kind: "workflow",
    tier: "T0",
    canTalkTo: [AgentId.Orchestrator],
  },
};

// ─── Skills Registry ───────────────────────────────────────

export const AGENT_SKILLS: Record<AgentId, string[]> = {
  // Agents
  [AgentId.Orchestrator]: ["route-intent", "merge-results"],
  [AgentId.CrossDashboardAgent]: [
    "classify-inbound-message",
    "inbound-messages",
    "outbound-messages",
    "messaging-summary",
    "process-message",
    "send-message",
    "ontology-query",
  ],
  [AgentId.NotificationAgent]: [
    "draft-email",
    "draft-whatsapp",
    "draft-slack",
    "send-notification",
  ],

  // HITL / Analyzers
  [AgentId.DocumentAgent]: [
    "upload-document",
    "analyze-document",
    "document-queue",
    "document-detail",
    "extract-invoice-fields",
    "extract-receipt-fields",
    "ontology-query",
  ],
  [AgentId.AuditAgent]: [
    "audit-reports",
    "audit-summary",
    "run-monthly-audit",
    "reconcile-invoices",
    "verify-subscriptions",
    "verify-cap-table",
    "ontology-query",
  ],
  [AgentId.CashFlowAnalyzer]: [
    "analyze-cash-position",
    "forecast-liquidity",
    "financial-forecast",
    "break-even-analysis",
    "ontology-query",
  ],
  [AgentId.ReceivablesAnalyzer]: ["analyze-aging", "assess-collection-risk", "ontology-query"],
  [AgentId.MarginAnalyzer]: ["analyze-race-margin", "explain-margin-variance", "ontology-query"],
  [AgentId.BudgetAnalyzer]: ["analyze-budget-utilization", "detect-overspend", "ontology-query"],
  [AgentId.GoalTracker]: ["track-goal-progress", "project-closure-rate", "ontology-query"],

  // Workflows
  [AgentId.FinanceAgent]: [
    "company-metrics",
    "monthly-summary",
    "cash-flow",
    "upcoming-payments",
    "entity-snapshots",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.InvoiceAgent]: [
    "invoice-workflow-summary",
    "invoice-approval-queue",
    "create-invoice-intake",
    "approve-invoice-intake",
    "post-invoice",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.ExpenseAgent]: [
    "expense-workflow-summary",
    "expense-approval-queue",
    "expense-submission-detail",
    "my-expense-submissions",
    "manage-budget-rules",
    "create-expense-submission",
    "approve-expense-submission",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.VendorAgent]: [
    "vendor-list",
    "vendor-detail",
    "vendor-spend-summary",
    "add-vendor",
    "update-vendor",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.SubscriptionAgent]: [
    "subscription-list",
    "subscription-summary",
    "subscription-alerts",
    "generate-alerts",
    "dismiss-alert",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.PayrollAgent]: [
    "employee-list",
    "employee-add",
    "employee-update",
    "salary-update",
    "payroll-by-month",
    "payroll-detail",
    "generate-payroll-invoice",
    "fx-rate-lookup",
    "currency-convert",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.CapTableAgent]: [
    "cap-table-entries",
    "cap-table-summary",
    "cap-table-events",
    "investor-list",
    "share-grant-process",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.LitigationAgent]: [
    "litigation-costs",
    "litigation-reserves",
    "litigation-summary",
    "compliance-costs",
    "subsidies-list",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.GigWorkerAgent]: [
    "gig-worker-list",
    "gig-payout-summary",
    "gig-payouts",
    "generate-payouts",
    "process-payout",
    "confirm-payout",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.TaxAgent]: [
    "tax-calculations",
    "tax-filings",
    "tax-summary",
    "gst-calculate",
    "vat-calculate",
    "ontology-query",
  ],
  [AgentId.CommercialAgent]: [
    "commercial-goals",
    "partner-performance",
    "sponsor-breakdown",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.RaceAgent]: [
    "race-list",
    "race-detail",
    "race-pnl",
    "season-summary",
    "race-budget",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.SportsModuleAgent]: [
    "sport-list",
    "sport-detail",
    "sport-pnl",
    "sp-multiplier-lookup",
    "consolidated-fsp-pnl",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.TreasuryAgent]: [
    "cash-position",
    "bank-balances",
    "fx-positions",
    "liquidity-plan",
    "ontology-query",
  ],
};

// ─── Analyzer Context Scopes ───────────────────────────────

export const ANALYZER_CONTEXT_SCOPE: Record<string, string[]> = {
  [AgentId.CashFlowAnalyzer]: [
    "payments",
    "invoices",
    "monthly_financial_summary",
    "payments_due",
  ],
  [AgentId.ReceivablesAnalyzer]: [
    "invoices",
    "payments",
    "receivables_aging",
    "sponsors_or_customers",
  ],
  [AgentId.MarginAnalyzer]: [
    "expenses",
    "revenue_records",
    "race_events",
    "cost_categories",
    "consolidated_company_metrics",
    "tbr_race_cost_summary",
  ],
  [AgentId.BudgetAnalyzer]: [
    "race_budget_rules",
    "expense_submissions",
    "expense_submission_items",
    "race_events",
    "cost_categories",
  ],
  [AgentId.GoalTracker]: [
    "commercial_targets",
    "revenue_records",
    "contracts",
    "sponsors_or_customers",
    "commercial_goal_progress",
    "partner_performance",
  ],
  [AgentId.DocumentAgent]: [
    "source_documents",
    "document_analyses",
    "invoices",
    "expense_submissions",
  ],
  [AgentId.AuditAgent]: [
    "audit_reports",
    "invoices",
    "payments",
    "subscriptions",
    "cap_table_entries",
    "vendors",
    "salary_payroll",
  ],
};

// ─── Validation ────────────────────────────────────────────

export function canRoute(from: AgentId, to: AgentId): boolean {
  return AGENT_GRAPH[from].canTalkTo.includes(to);
}

export function hasSkill(agentId: AgentId, skill: string): boolean {
  return AGENT_SKILLS[agentId]?.includes(skill) ?? false;
}

export function getAnalyzerScope(agentId: AgentId): string[] {
  return ANALYZER_CONTEXT_SCOPE[agentId] ?? [];
}

export function isWorkflow(agentId: AgentId): boolean {
  return AGENT_GRAPH[agentId]?.kind === "workflow";
}

export function isHitl(agentId: AgentId): boolean {
  return AGENT_GRAPH[agentId]?.kind === "hitl";
}

export function isAutonomousAgent(agentId: AgentId): boolean {
  return AGENT_GRAPH[agentId]?.kind === "agent";
}

/**
 * Invariant: workflows must be T0 (no LLM).
 * Run on module load to catch misconfigurations early.
 */
function assertInvariants(): void {
  for (const node of Object.values(AGENT_GRAPH)) {
    if (node.kind === "workflow" && node.tier !== "T0") {
      throw new Error(
        `Agent graph invariant violation: ${node.id} is a workflow but tier is ${node.tier}. Workflows must be T0.`
      );
    }
  }
}
assertInvariants();

/**
 * Validate a routing plan before execution.
 * HITL steps are allowed but MUST be flagged — caller decides how to handle confirmation.
 */
export function validateRoutingPlan(
  steps: Array<{ agentId: AgentId; skill: string; dependsOn: number[] }>
): { valid: boolean; errors: string[]; hitlSteps: number[] } {
  const errors: string[] = [];
  const hitlSteps: number[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (!AGENT_GRAPH[step.agentId]) {
      errors.push(`Step ${i}: Unknown agent "${step.agentId}"`);
      continue;
    }

    if (!hasSkill(step.agentId, step.skill)) {
      errors.push(`Step ${i}: Agent "${step.agentId}" does not have skill "${step.skill}"`);
    }

    if (isHitl(step.agentId)) {
      hitlSteps.push(i);
    }

    for (const dep of step.dependsOn) {
      if (dep >= i) errors.push(`Step ${i}: Depends on future step ${dep}`);
      if (dep < 0 || dep >= steps.length) errors.push(`Step ${i}: Invalid dependency index ${dep}`);
    }
  }

  return { valid: errors.length === 0, errors, hitlSteps };
}
