/**
 * LSC Finance Dashboard — Orchestrator
 *
 * Single entry point for all AI-powered operations.
 * Uses Gemini to classify intent, generates a routing plan,
 * validates against the agent graph, executes, and merges results.
 */

import { AgentId, AGENT_GRAPH, hasSkill, canRoute, validateRoutingPlan } from "./agent-graph";

// ─── Types ─────────────────────────────────────────────────

export type RoutingStep = {
  agentId: AgentId;
  skill: string;
  payload: Record<string, unknown>;
  dependsOn: number[];
};

export type RoutingPlan = {
  intent: string;
  steps: RoutingStep[];
  reasoning: string;
};

export type StepResult = {
  stepIndex: number;
  agentId: AgentId;
  skill: string;
  status: "success" | "error";
  data?: unknown;
  error?: string;
};

export type OrchestratorResult = {
  intent: string;
  results: StepResult[];
  summary: string;
};

// ─── Plan Validation ───────────────────────────────────────

export function validatePlan(plan: RoutingPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate each step has a valid agent
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (!AGENT_GRAPH[step.agentId]) {
      errors.push(`Step ${i}: Unknown agent "${step.agentId}"`);
      continue;
    }

    // All steps must be routable from orchestrator
    if (!canRoute(AgentId.Orchestrator, step.agentId) && step.agentId !== AgentId.Orchestrator) {
      errors.push(`Step ${i}: Orchestrator cannot route to "${step.agentId}"`);
    }
  }

  // Use the agent graph validation (also surfaces HITL steps)
  const graphValidation = validateRoutingPlan(plan.steps);
  errors.push(...graphValidation.errors);

  return { valid: errors.length === 0, errors };
}

// ─── Plan Execution ────────────────────────────────────────

/**
 * Execute a validated routing plan.
 * Steps with no dependencies run in parallel.
 * Steps with dependencies wait for their dependencies to complete.
 */
export async function executePlan(
  plan: RoutingPlan,
  skillDispatcher: (agentId: AgentId, skill: string, payload: Record<string, unknown>) => Promise<unknown>
): Promise<OrchestratorResult> {
  const results: StepResult[] = new Array(plan.steps.length);
  const completed = new Set<number>();

  // Topological execution: process steps in dependency order
  while (completed.size < plan.steps.length) {
    // Find ready steps (all dependencies completed)
    const ready: number[] = [];
    for (let i = 0; i < plan.steps.length; i++) {
      if (completed.has(i)) continue;
      const step = plan.steps[i];
      if (step.dependsOn.every((dep) => completed.has(dep))) {
        ready.push(i);
      }
    }

    if (ready.length === 0) {
      // Deadlock — remaining steps have circular dependencies
      for (let i = 0; i < plan.steps.length; i++) {
        if (!completed.has(i)) {
          results[i] = {
            stepIndex: i,
            agentId: plan.steps[i].agentId,
            skill: plan.steps[i].skill,
            status: "error",
            error: "Circular dependency detected",
          };
          completed.add(i);
        }
      }
      break;
    }

    // Execute ready steps in parallel
    const executions = ready.map(async (i) => {
      const step = plan.steps[i];
      try {
        const data = await skillDispatcher(step.agentId, step.skill, step.payload);
        results[i] = {
          stepIndex: i,
          agentId: step.agentId,
          skill: step.skill,
          status: "success",
          data,
        };
      } catch (err) {
        results[i] = {
          stepIndex: i,
          agentId: step.agentId,
          skill: step.skill,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      completed.add(i);
    });

    await Promise.allSettled(executions);
  }

  // Generate summary
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const summary =
    errorCount === 0
      ? `Completed ${successCount} step(s) successfully.`
      : `Completed ${successCount} step(s), ${errorCount} failed.`;

  return {
    intent: plan.intent,
    results,
    summary,
  };
}

// ─── Intent Classification (stub for Gemini integration) ──

/**
 * Classify user intent and generate a routing plan.
 * This is a stub — will be wired to Gemini in Phase 6.
 */
export async function classifyAndPlan(message: string, context?: Record<string, unknown>): Promise<RoutingPlan> {
  // TODO: Wire to Gemini API for actual intent classification
  // For now, return a basic plan based on keyword matching

  const lower = message.toLowerCase();

  if (lower.includes("expense") || lower.includes("reimbursement")) {
    return {
      intent: "expense-query",
      steps: [
        { agentId: AgentId.ExpenseAgent, skill: "expense-workflow-summary", payload: {}, dependsOn: [] },
      ],
      reasoning: "User asked about expenses",
    };
  }

  if (lower.includes("invoice") || lower.includes("payable")) {
    return {
      intent: "invoice-query",
      steps: [
        { agentId: AgentId.InvoiceAgent, skill: "invoice-workflow-summary", payload: {}, dependsOn: [] },
      ],
      reasoning: "User asked about invoices",
    };
  }

  if (lower.includes("revenue") || lower.includes("sponsor") || lower.includes("commercial")) {
    return {
      intent: "commercial-query",
      steps: [
        { agentId: AgentId.CommercialAgent, skill: "commercial-goals", payload: {}, dependsOn: [] },
        { agentId: AgentId.CommercialAgent, skill: "partner-performance", payload: {}, dependsOn: [] },
      ],
      reasoning: "User asked about revenue or commercial goals",
    };
  }

  // Default: overview
  return {
    intent: "overview-query",
    steps: [
      { agentId: AgentId.FinanceAgent, skill: "company-metrics", payload: {}, dependsOn: [] },
    ],
    reasoning: "Default to financial overview",
  };
}
