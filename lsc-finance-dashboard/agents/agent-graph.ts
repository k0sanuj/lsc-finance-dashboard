/**
 * LSC Finance Dashboard — Agent Graph
 *
 * Defines the agent topology, skill registry, and context scopes.
 * This is the operational graph — the source of truth for what
 * agents exist, what skills they own, and who they can talk to.
 */

// ─── Agent IDs ─────────────────────────────────────────────

export enum AgentId {
  Orchestrator = "orchestrator",
  FinanceAgent = "finance-agent",
  ExpenseAgent = "expense-agent",
  InvoiceAgent = "invoice-agent",
  ImportAgent = "import-agent",
  CommercialAgent = "commercial-agent",
  DocumentAgent = "document-agent",
  // V2 specialist agents
  VendorAgent = "vendor-agent",
  SubscriptionAgent = "subscription-agent",
  PayrollAgent = "payroll-agent",
  CapTableAgent = "cap-table-agent",
  LitigationAgent = "litigation-agent",
  GigWorkerAgent = "gig-worker-agent",
  TaxAgent = "tax-agent",
  AuditAgent = "audit-agent",
  CrossDashboardAgent = "cross-dashboard-agent",
  // Read-only analyzers
  CashFlowAnalyzer = "cash-flow-analyzer",
  ReceivablesAnalyzer = "receivables-analyzer",
  MarginAnalyzer = "margin-analyzer",
  BudgetAnalyzer = "budget-analyzer",
  GoalTracker = "goal-tracker",
}

// ─── Agent Topology ────────────────────────────────────────

export type AgentNode = {
  id: AgentId;
  name: string;
  role: string;
  tier: "core" | "specialist" | "analyzer";
  canTalkTo: AgentId[];
};

export const AGENT_GRAPH: Record<AgentId, AgentNode> = {
  [AgentId.Orchestrator]: {
    id: AgentId.Orchestrator,
    name: "Finance Orchestrator",
    role: "Intent classification, routing, and result merging",
    tier: "core",
    canTalkTo: [
      AgentId.FinanceAgent,
      AgentId.ExpenseAgent,
      AgentId.InvoiceAgent,
      AgentId.ImportAgent,
      AgentId.CommercialAgent,
      AgentId.DocumentAgent,
      AgentId.VendorAgent,
      AgentId.SubscriptionAgent,
      AgentId.PayrollAgent,
      AgentId.CapTableAgent,
      AgentId.LitigationAgent,
      AgentId.GigWorkerAgent,
      AgentId.TaxAgent,
      AgentId.AuditAgent,
      AgentId.CrossDashboardAgent,
      AgentId.CashFlowAnalyzer,
      AgentId.ReceivablesAnalyzer,
      AgentId.MarginAnalyzer,
      AgentId.BudgetAnalyzer,
      AgentId.GoalTracker,
    ],
  },
  [AgentId.FinanceAgent]: {
    id: AgentId.FinanceAgent,
    name: "Finance Agent",
    role: "Company metrics, cash flow, payment tracking",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.InvoiceAgent],
  },
  [AgentId.ExpenseAgent]: {
    id: AgentId.ExpenseAgent,
    name: "Expense Agent",
    role: "Expense submissions, approvals, budget rules, splits",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.FinanceAgent, AgentId.DocumentAgent],
  },
  [AgentId.InvoiceAgent]: {
    id: AgentId.InvoiceAgent,
    name: "Invoice Agent",
    role: "Invoice intake, approval, posting, payable tracking",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.FinanceAgent],
  },
  [AgentId.ImportAgent]: {
    id: AgentId.ImportAgent,
    name: "Import Agent",
    role: "Data imports, normalization, lineage tracking",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.CommercialAgent]: {
    id: AgentId.CommercialAgent,
    name: "Commercial Agent",
    role: "Commercial goals, sponsor tracking, partner performance",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.DocumentAgent]: {
    id: AgentId.DocumentAgent,
    name: "Document Agent",
    role: "Document upload, AI analysis, field extraction, posting",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.ExpenseAgent, AgentId.InvoiceAgent],
  },
  [AgentId.CashFlowAnalyzer]: {
    id: AgentId.CashFlowAnalyzer,
    name: "Cash Flow Analyzer",
    role: "Cash position analysis, liquidity forecasting",
    tier: "analyzer",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.ReceivablesAnalyzer]: {
    id: AgentId.ReceivablesAnalyzer,
    name: "Receivables Analyzer",
    role: "Aging analysis, collection risk assessment",
    tier: "analyzer",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.MarginAnalyzer]: {
    id: AgentId.MarginAnalyzer,
    name: "Margin Analyzer",
    role: "Race-level P&L, cost-revenue spread analysis",
    tier: "analyzer",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.BudgetAnalyzer]: {
    id: AgentId.BudgetAnalyzer,
    name: "Budget Analyzer",
    role: "Budget utilization, overspend detection, rule effectiveness",
    tier: "analyzer",
    canTalkTo: [AgentId.Orchestrator],
  },
  [AgentId.GoalTracker]: {
    id: AgentId.GoalTracker,
    name: "Goal Tracker",
    role: "Commercial target progress, closure rate projections",
    tier: "analyzer",
    canTalkTo: [AgentId.Orchestrator],
  },
  // ─── V2 Agents ────────────────────────────────────────────
  [AgentId.VendorAgent]: {
    id: AgentId.VendorAgent,
    name: "Vendor Agent",
    role: "Vendor registry, spend tracking, production partners, venue agreements",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.InvoiceAgent, AgentId.FinanceAgent],
  },
  [AgentId.SubscriptionAgent]: {
    id: AgentId.SubscriptionAgent,
    name: "Subscription Agent",
    role: "SaaS tracking, renewal alerts, cost aggregation, unused detection",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.FinanceAgent],
  },
  [AgentId.PayrollAgent]: {
    id: AgentId.PayrollAgent,
    name: "Payroll Agent",
    role: "Employee management, salary payroll, payroll invoice generation, FX conversion",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.FinanceAgent, AgentId.TaxAgent, AgentId.InvoiceAgent],
  },
  [AgentId.CapTableAgent]: {
    id: AgentId.CapTableAgent,
    name: "Cap Table Agent",
    role: "Equity ownership, share grants, vesting, investor relations, dilution modeling",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.CrossDashboardAgent],
  },
  [AgentId.LitigationAgent]: {
    id: AgentId.LitigationAgent,
    name: "Litigation Agent",
    role: "Legal cost tracking, reserves, exposure, compliance costs, subsidies",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.CrossDashboardAgent, AgentId.FinanceAgent],
  },
  [AgentId.GigWorkerAgent]: {
    id: AgentId.GigWorkerAgent,
    name: "Gig Worker Agent",
    role: "XTZ India gig worker management, payout processing, cash flow forecasting",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.PayrollAgent, AgentId.FinanceAgent],
  },
  [AgentId.TaxAgent]: {
    id: AgentId.TaxAgent,
    name: "Tax Agent",
    role: "GST/VAT calculation, tax filing preparation, withholding, Excel export",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.InvoiceAgent, AgentId.FinanceAgent],
  },
  [AgentId.AuditAgent]: {
    id: AgentId.AuditAgent,
    name: "Audit Agent",
    role: "Monthly reconciliation, discrepancy detection, cross-system verification",
    tier: "specialist",
    canTalkTo: [
      AgentId.Orchestrator, AgentId.FinanceAgent, AgentId.InvoiceAgent,
      AgentId.SubscriptionAgent, AgentId.VendorAgent, AgentId.PayrollAgent,
      AgentId.CapTableAgent, AgentId.CrossDashboardAgent,
    ],
  },
  [AgentId.CrossDashboardAgent]: {
    id: AgentId.CrossDashboardAgent,
    name: "Cross-Dashboard Agent",
    role: "Legal↔Finance messaging, invoice detection, share grant processing, compliance sync",
    tier: "specialist",
    canTalkTo: [AgentId.Orchestrator, AgentId.CapTableAgent, AgentId.LitigationAgent, AgentId.InvoiceAgent],
  },
};

// ─── Skills Registry ───────────────────────────────────────

export const AGENT_SKILLS: Record<AgentId, string[]> = {
  [AgentId.Orchestrator]: ["route-intent", "merge-results"],
  [AgentId.FinanceAgent]: [
    "company-metrics",
    "monthly-summary",
    "cash-flow",
    "upcoming-payments",
    "entity-snapshots",
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
  [AgentId.InvoiceAgent]: [
    "invoice-workflow-summary",
    "invoice-approval-queue",
    "create-invoice-intake",
    "approve-invoice-intake",
    "ontology-query",
    "cascade-update",
  ],
  [AgentId.ImportAgent]: [
    "import-xlsx",
    "normalize-payables",
    "normalize-revenue",
    "normalize-expenses",
    "validate-import",
    "ontology-query",
  ],
  [AgentId.CommercialAgent]: [
    "commercial-goals",
    "partner-performance",
    "sponsor-breakdown",
    "ontology-query",
  ],
  [AgentId.DocumentAgent]: [
    "upload-document",
    "analyze-document",
    "document-queue",
    "document-detail",
    "ontology-query",
  ],
  [AgentId.VendorAgent]: [
    "vendor-list", "vendor-detail", "vendor-spend-summary",
    "production-partner-list", "venue-agreements",
    "ontology-query", "cascade-update",
  ],
  [AgentId.SubscriptionAgent]: [
    "subscription-list", "subscription-summary", "subscription-alerts",
    "generate-alerts", "dismiss-alert",
    "ontology-query", "cascade-update",
  ],
  [AgentId.PayrollAgent]: [
    "employee-list", "employee-add", "employee-update", "salary-update",
    "payroll-by-month", "payroll-detail", "generate-payroll-invoice",
    "fx-rate-lookup", "currency-convert",
    "ontology-query", "cascade-update",
  ],
  [AgentId.CapTableAgent]: [
    "cap-table-entries", "cap-table-summary", "cap-table-events",
    "investor-list", "share-grant-process",
    "ontology-query", "cascade-update",
  ],
  [AgentId.LitigationAgent]: [
    "litigation-costs", "litigation-reserves", "litigation-summary",
    "compliance-costs", "subsidies-list",
    "ontology-query",
  ],
  [AgentId.GigWorkerAgent]: [
    "gig-worker-list", "gig-payout-summary", "gig-payouts",
    "generate-payouts", "process-payout", "confirm-payout",
    "ontology-query", "cascade-update",
  ],
  [AgentId.TaxAgent]: [
    "tax-calculations", "tax-filings", "tax-summary",
    "gst-calculate", "vat-calculate",
    "ontology-query",
  ],
  [AgentId.AuditAgent]: [
    "audit-reports", "audit-summary", "run-monthly-audit",
    "reconcile-invoices", "verify-subscriptions", "verify-cap-table",
    "ontology-query",
  ],
  [AgentId.CrossDashboardAgent]: [
    "inbound-messages", "outbound-messages", "messaging-summary",
    "process-message", "send-message",
    "ontology-query",
  ],
  [AgentId.CashFlowAnalyzer]: ["ontology-query", "audit-log"],
  [AgentId.ReceivablesAnalyzer]: ["ontology-query", "audit-log"],
  [AgentId.MarginAnalyzer]: ["ontology-query", "audit-log"],
  [AgentId.BudgetAnalyzer]: ["ontology-query", "audit-log"],
  [AgentId.GoalTracker]: ["ontology-query", "audit-log"],
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
  [AgentId.VendorAgent]: [
    "vendors", "vendor_entity_links", "vendor_contacts",
    "production_partners", "venue_agreements", "invoices",
  ],
  [AgentId.SubscriptionAgent]: [
    "subscriptions", "subscription_alerts",
  ],
  [AgentId.PayrollAgent]: [
    "employees", "salary_payroll", "payroll_invoices",
    "payroll_invoice_items", "fx_rates",
  ],
  [AgentId.CapTableAgent]: [
    "cap_table_entries", "cap_table_events", "investors",
  ],
  [AgentId.LitigationAgent]: [
    "litigation_costs", "litigation_reserves",
    "compliance_costs", "subsidies_finance", "subsidies_invoices",
  ],
  [AgentId.GigWorkerAgent]: [
    "gig_workers", "gig_worker_tasks", "gig_worker_payouts",
  ],
  [AgentId.TaxAgent]: [
    "tax_calculations", "tax_filings", "invoices",
  ],
  [AgentId.AuditAgent]: [
    "audit_reports", "invoices", "payments", "subscriptions",
    "cap_table_entries", "vendors", "salary_payroll",
  ],
  [AgentId.CrossDashboardAgent]: [
    "cross_dashboard_messages",
  ],
};

// ─── Validation ────────────────────────────────────────────

/**
 * Check if an agent can route to another agent
 */
export function canRoute(from: AgentId, to: AgentId): boolean {
  return AGENT_GRAPH[from].canTalkTo.includes(to);
}

/**
 * Check if an agent has a specific skill
 */
export function hasSkill(agentId: AgentId, skill: string): boolean {
  return AGENT_SKILLS[agentId]?.includes(skill) ?? false;
}

/**
 * Get the context scope for an analyzer
 */
export function getAnalyzerScope(agentId: AgentId): string[] {
  return ANALYZER_CONTEXT_SCOPE[agentId] ?? [];
}

/**
 * Validate a routing plan before execution
 */
export function validateRoutingPlan(
  steps: Array<{ agentId: AgentId; skill: string; dependsOn: number[] }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Check skill availability
    if (!hasSkill(step.agentId, step.skill)) {
      errors.push(`Step ${i}: Agent "${step.agentId}" does not have skill "${step.skill}"`);
    }

    // Check dependency ordering
    for (const dep of step.dependsOn) {
      if (dep >= i) {
        errors.push(`Step ${i}: Depends on future step ${dep}`);
      }
      if (dep < 0 || dep >= steps.length) {
        errors.push(`Step ${i}: Invalid dependency index ${dep}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
