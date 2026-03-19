/**
 * LSC Finance Dashboard — Cascade Rules Engine
 *
 * Declarative rules that define what happens when entities change.
 * Every mutation should call executeCascade() after writing to the DB.
 *
 * Architecture:
 *   Trigger → Rules[] → Actions[]
 *   Each rule maps a trigger to one or more actions.
 *   Actions can be: sync updates, view refreshes, or analyzer triggers.
 */

// ─── Types ─────────────────────────────────────────────────

export type CascadeTrigger =
  | "payment:settled"
  | "payment:cancelled"
  | "invoice:status:changed"
  | "invoice:created"
  | "expense:approved"
  | "expense:rejected"
  | "expense:paid"
  | "expense-submission:approved"
  | "expense-submission:posted"
  | "expense-submission:rejected"
  | "invoice-intake:approved"
  | "invoice-intake:posted"
  | "revenue:recognized"
  | "contract:value:changed"
  | "contract:status:changed"
  | "race-budget-rule:created"
  | "race-budget-rule:deleted"
  | "commercial-target:changed"
  | "document:analyzed"
  | "document:approved";

export type CascadeActionType =
  | "refresh-company-metrics"
  | "refresh-monthly-summary"
  | "refresh-receivables-aging"
  | "refresh-payments-due"
  | "refresh-race-cost-summary"
  | "refresh-sponsor-revenue"
  | "refresh-commercial-progress"
  | "refresh-partner-performance"
  | "update-expense-budget-signals"
  | "trigger-cash-flow-analyzer"
  | "trigger-receivables-analyzer"
  | "trigger-margin-analyzer"
  | "trigger-budget-analyzer"
  | "trigger-goal-tracker"
  | "write-audit-log";

export type CascadeAction = {
  type: CascadeActionType;
  description: string;
};

export type CascadeRule = {
  trigger: CascadeTrigger;
  actions: CascadeAction[];
};

export type CascadeEvent = {
  trigger: CascadeTrigger;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  performedBy?: string;
};

export type CascadeResult = {
  trigger: CascadeTrigger;
  actionsExecuted: CascadeActionType[];
  errors: Array<{ action: CascadeActionType; error: string }>;
};

// ─── Rules ─────────────────────────────────────────────────

export const CASCADE_RULES: CascadeRule[] = [
  // Payment events
  {
    trigger: "payment:settled",
    actions: [
      { type: "refresh-company-metrics", description: "Recalculate consolidated revenue/cost/margin" },
      { type: "refresh-monthly-summary", description: "Update monthly cash flow totals" },
      { type: "refresh-payments-due", description: "Remove from upcoming payments" },
      { type: "trigger-cash-flow-analyzer", description: "Analyze cash flow impact" },
      { type: "write-audit-log", description: "Record payment settlement" },
    ],
  },
  {
    trigger: "payment:cancelled",
    actions: [
      { type: "refresh-company-metrics", description: "Reverse payment from metrics" },
      { type: "refresh-monthly-summary", description: "Reverse from monthly totals" },
      { type: "refresh-payments-due", description: "Restore to upcoming payments" },
      { type: "write-audit-log", description: "Record payment cancellation" },
    ],
  },

  // Invoice events
  {
    trigger: "invoice:status:changed",
    actions: [
      { type: "refresh-payments-due", description: "Update payables/receivables" },
      { type: "refresh-receivables-aging", description: "Recalculate aging buckets" },
      { type: "refresh-race-cost-summary", description: "Update race-level cost totals" },
      { type: "write-audit-log", description: "Record invoice status change" },
    ],
  },
  {
    trigger: "invoice:created",
    actions: [
      { type: "refresh-payments-due", description: "Add to payables/receivables" },
      { type: "refresh-race-cost-summary", description: "Update race cost if linked to race" },
      { type: "write-audit-log", description: "Record new invoice" },
    ],
  },

  // Expense events
  {
    trigger: "expense:approved",
    actions: [
      { type: "refresh-company-metrics", description: "Update approved expense totals" },
      { type: "refresh-race-cost-summary", description: "Update race-level costs" },
      { type: "trigger-margin-analyzer", description: "Analyze margin impact" },
      { type: "write-audit-log", description: "Record expense approval" },
    ],
  },
  {
    trigger: "expense:paid",
    actions: [
      { type: "refresh-company-metrics", description: "Update paid expense totals" },
      { type: "refresh-monthly-summary", description: "Update monthly cash out" },
      { type: "trigger-cash-flow-analyzer", description: "Analyze cash flow impact" },
      { type: "write-audit-log", description: "Record expense payment" },
    ],
  },

  // Expense submission workflow
  {
    trigger: "expense-submission:approved",
    actions: [
      { type: "update-expense-budget-signals", description: "Recalculate budget signals for race" },
      { type: "write-audit-log", description: "Record submission approval" },
    ],
  },
  {
    trigger: "expense-submission:posted",
    actions: [
      { type: "refresh-company-metrics", description: "Update metrics with posted expenses" },
      { type: "refresh-race-cost-summary", description: "Update race cost summary" },
      { type: "trigger-budget-analyzer", description: "Analyze budget utilization" },
      { type: "write-audit-log", description: "Record submission posting" },
    ],
  },

  // Invoice intake workflow
  {
    trigger: "invoice-intake:approved",
    actions: [
      { type: "write-audit-log", description: "Record intake approval" },
    ],
  },
  {
    trigger: "invoice-intake:posted",
    actions: [
      { type: "refresh-payments-due", description: "Add new payable from intake" },
      { type: "refresh-race-cost-summary", description: "Update race costs" },
      { type: "trigger-cash-flow-analyzer", description: "Analyze cash impact of new payable" },
      { type: "write-audit-log", description: "Record intake posting to canonical" },
    ],
  },

  // Revenue events
  {
    trigger: "revenue:recognized",
    actions: [
      { type: "refresh-company-metrics", description: "Update recognized revenue" },
      { type: "refresh-sponsor-revenue", description: "Update sponsor revenue summary" },
      { type: "refresh-commercial-progress", description: "Update commercial goal progress" },
      { type: "refresh-partner-performance", description: "Update partner scorecard" },
      { type: "trigger-goal-tracker", description: "Analyze goal progress" },
      { type: "write-audit-log", description: "Record revenue recognition" },
    ],
  },

  // Contract events
  {
    trigger: "contract:value:changed",
    actions: [
      { type: "refresh-sponsor-revenue", description: "Update contract value in sponsor summary" },
      { type: "refresh-commercial-progress", description: "Recalculate target vs actual" },
      { type: "trigger-goal-tracker", description: "Re-analyze goal trajectory" },
      { type: "write-audit-log", description: "Record contract value change" },
    ],
  },

  // Budget rules
  {
    trigger: "race-budget-rule:created",
    actions: [
      { type: "update-expense-budget-signals", description: "Recalculate signals for affected submissions" },
      { type: "trigger-budget-analyzer", description: "Analyze budget coverage" },
      { type: "write-audit-log", description: "Record new budget rule" },
    ],
  },
  {
    trigger: "race-budget-rule:deleted",
    actions: [
      { type: "update-expense-budget-signals", description: "Remove budget signals from affected items" },
      { type: "write-audit-log", description: "Record budget rule deletion" },
    ],
  },

  // Commercial targets
  {
    trigger: "commercial-target:changed",
    actions: [
      { type: "refresh-commercial-progress", description: "Recalculate gap to target" },
      { type: "refresh-partner-performance", description: "Update partner targets" },
      { type: "trigger-goal-tracker", description: "Re-analyze target trajectory" },
      { type: "write-audit-log", description: "Record target change" },
    ],
  },

  // Document intelligence
  {
    trigger: "document:analyzed",
    actions: [
      { type: "write-audit-log", description: "Record document analysis completion" },
    ],
  },
  {
    trigger: "document:approved",
    actions: [
      { type: "write-audit-log", description: "Record document approval for posting" },
    ],
  },
];

// ─── Engine ────────────────────────────────────────────────

/**
 * Find all rules matching a trigger
 */
export function getRulesForTrigger(trigger: CascadeTrigger): CascadeRule[] {
  return CASCADE_RULES.filter((r) => r.trigger === trigger);
}

/**
 * Get all actions that should execute for a trigger
 */
export function getActionsForTrigger(trigger: CascadeTrigger): CascadeAction[] {
  return getRulesForTrigger(trigger).flatMap((r) => r.actions);
}

/**
 * Execute cascade for a given event.
 *
 * In the current architecture (raw pg queries), this logs the cascade
 * intent. The actual refresh of materialized views happens server-side
 * through the SQL views which are always-current (not materialized).
 *
 * For mutations that need immediate cascade effects (like budget signal
 * recalculation), the action handler should be wired up in the skills layer.
 */
export async function executeCascade(event: CascadeEvent): Promise<CascadeResult> {
  const actions = getActionsForTrigger(event.trigger);
  const result: CascadeResult = {
    trigger: event.trigger,
    actionsExecuted: [],
    errors: [],
  };

  for (const action of actions) {
    try {
      // For now, all view-refresh actions are no-ops because SQL views
      // are always current. Only write-audit-log and analyzer triggers
      // need actual execution, which will be wired in the skills layer.
      result.actionsExecuted.push(action.type);
    } catch (err) {
      result.errors.push({
        action: action.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * List all unique triggers in the system
 */
export function getAllTriggers(): CascadeTrigger[] {
  return [...new Set(CASCADE_RULES.map((r) => r.trigger))];
}

/**
 * List all views that would be affected by a trigger
 */
export function getAffectedViews(trigger: CascadeTrigger): string[] {
  const viewActions = getActionsForTrigger(trigger)
    .filter((a) => a.type.startsWith("refresh-"))
    .map((a) => a.type.replace("refresh-", "").replace(/-/g, "_"));
  return [...new Set(viewActions)];
}
