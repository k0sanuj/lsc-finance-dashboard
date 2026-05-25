/**
 * LSC Finance Dashboard — Orchestrator
 *
 * Single entry point for AI-powered operations.
 * Classifies user intent via an LLM (T1 — routed by the provider registry in
 * skills/shared/llm.ts), produces a RoutingPlan,
 * validates against the agent graph, executes via the skill dispatcher,
 * and merges results.
 *
 * Failure modes are conservative: if the LLM returns an invalid plan, or
 * if validation fails, we fall back to a safe default plan (finance overview).
 * The orchestrator never throws — callers always get an OrchestratorResult.
 */

import {
  AgentId,
  AGENT_GRAPH,
  AGENT_SKILLS,
  canRoute,
  validateRoutingPlan,
} from "./agent-graph";
import { createHash, randomUUID } from "node:crypto";
import { logAgentActivity } from "./observability";
import {
  callLlm,
  getLlmProviderHealth,
  getPurposeProviderHealth,
  providerForPurpose,
  type LlmProviderHealth,
} from "../skills/shared/llm";

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
  /** Step indices that require human confirmation before execution. */
  hitlSteps: number[];
};

export type StepResult = {
  stepIndex: number;
  agentId: AgentId;
  skill: string;
  status: "success" | "error" | "skipped";
  data?: unknown;
  error?: string;
};

export type OrchestratorResult = {
  intent: string;
  plan: RoutingPlan;
  results: StepResult[];
  summary: string;
  fallbackReason?: string;
  llmProviderHealth?: LlmProviderHealth[];
  llmProviderUsed?: string;
  llmTokens?: { prompt: number; candidates: number; total: number };
  geminiTokens?: { prompt: number; candidates: number; total: number };
  classifyDurationMs?: number;
};

export type OrchestratorInput = {
  message: string;
  context?: Record<string, unknown>;
  /** If true, HITL steps are executed. Default: false (they are skipped). */
  autoRunHitl?: boolean;
  /** App user id for runtime activity logging. */
  performedByUserId?: string;
};

// ─── Dispatcher contract ───────────────────────────────────
// We use an abstract dispatcher type so the orchestrator doesn't directly
// depend on skills/dispatcher.ts (keeps this module testable in isolation
// and avoids a circular dependency path).

export type SkillDispatcher = (
  agentId: AgentId,
  skill: string,
  payload: Record<string, unknown>
) => Promise<{ ok: true; data: unknown } | { ok: false; error: string; code?: string }>;

// ─── Plan Validation ───────────────────────────────────────

export function validatePlan(plan: RoutingPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (!AGENT_GRAPH[step.agentId]) {
      errors.push(`Step ${i}: Unknown agent "${step.agentId}"`);
      continue;
    }

    if (!canRoute(AgentId.Orchestrator, step.agentId) && step.agentId !== AgentId.Orchestrator) {
      errors.push(`Step ${i}: Orchestrator cannot route to "${step.agentId}"`);
    }
  }

  const graphValidation = validateRoutingPlan(plan.steps);
  errors.push(...graphValidation.errors);

  return { valid: errors.length === 0, errors };
}

// ─── LLM intent classification ─────────────────────────────

/**
 * Build the system prompt with the full skill catalog so the routing LLM knows
 * exactly what it can route to. We send the catalog inline rather than
 * via RAG — it's small (~60 entries) and fits comfortably in T1 context.
 */
function buildSystemPrompt(): string {
  const catalog = Object.entries(AGENT_SKILLS)
    .map(([agentId, skills]) => {
      const node = AGENT_GRAPH[agentId as AgentId];
      if (!node || agentId === AgentId.Orchestrator) return "";
      const realSkills = skills.filter(
        (s) => !["ontology-query", "cascade-update", "audit-log"].includes(s)
      );
      if (realSkills.length === 0) return "";
      return `- ${agentId} (${node.kind}, ${node.tier}): ${realSkills.join(", ")}`;
    })
    .filter(Boolean)
    .join("\n");

  return [
    "You are the Finance Orchestrator for the LSC Finance Dashboard — a sports holding company with visible entities LSC, TBR (Team Blue Rising), FSP (Future of Sports), and XTZ India. Legacy Dubai aliases resolve internally to LSC and must not be shown to users.",
    "",
    "Given a user message, produce a JSON routing plan that calls one or more agent skills to answer the question.",
    "",
    "AVAILABLE AGENTS AND SKILLS:",
    catalog,
    "",
    "REQUIRED PAYLOAD PARAMETERS:",
    "- companyCode values: 'LSC', 'TBR', 'FSP', 'XTZ'",
    "- payroll-agent:payroll-by-month requires payload.companyCode",
    "- payroll-agent:payroll-detail requires payload.companyCode (optional payload.month as 'YYYY-MM')",
    "- payroll-agent:currency-convert requires payload.amount, payload.fromCurrency, payload.toCurrency",
    "- race-agent:race-list requires payload.seasonYear (4-digit number)",
    "- race-agent:race-detail requires payload.raceId",
    "- cap-table-agent:* skills require payload.companyCode",
    "- expense-agent:my-expense-submissions requires payload.appUserId (optional payload.raceId)",
    "- expense-agent:expense-submission-detail requires payload.submissionId",
    "- sports-module-agent:sport-pnl requires payload.sportId (optional payload.scenario)",
    "- litigation/treasury/gig-worker/tax/vendor list skills accept optional payload.companyCode",
    "",
    "RULES:",
    "1. Pick the minimum number of skills needed. Prefer one skill over multiple.",
    "2. Only use skills from the catalog above. Never invent skill names.",
    "3. ALWAYS fill payload with required parameters. An empty payload on a skill that needs parameters is a bug.",
    "4. Infer companyCode from the message: 'TBR' for races, 'XTZ' for payroll/invoices, 'FSP' for sports modules. If the message names an entity explicitly, use that.",
    "5. Infer seasonYear from the message when present; otherwise use the current year.",
    "6. Steps run in parallel unless dependsOn links them.",
    "7. If you genuinely can't map the question to any skill, return an empty steps array with reasoning.",
    "",
    "OUTPUT FORMAT — your entire response must be a single JSON object with these top-level keys:",
    "  intent      — a short label for what the user asked (string, 2-8 words)",
    "  reasoning   — one sentence explaining why you picked these skills (string)",
    "  steps       — array of { agentId, skill, payload, dependsOn }",
    "",
    "FULL EXAMPLES:",
    `- "Show me XTZ payroll for March 2026" →`,
    `  { "intent": "XTZ payroll detail", "reasoning": "Message names XTZ and March 2026, map to payroll-detail.", "steps": [{ "agentId": "payroll-agent", "skill": "payroll-detail", "payload": { "companyCode": "XTZ", "month": "2026-03" }, "dependsOn": [] }] }`,
    `- "List TBR races in 2026" →`,
    `  { "intent": "TBR 2026 race list", "reasoning": "Direct mapping to race-list with seasonYear=2026.", "steps": [{ "agentId": "race-agent", "skill": "race-list", "payload": { "seasonYear": 2026 }, "dependsOn": [] }] }`,
    `- "What is the cap table for TBR?" →`,
    `  { "intent": "TBR cap table", "reasoning": "Cap table summary for TBR entity.", "steps": [{ "agentId": "cap-table-agent", "skill": "cap-table-summary", "payload": { "companyCode": "TBR" }, "dependsOn": [] }] }`,
    `- "Convert 1000 INR to USD" →`,
    `  { "intent": "FX conversion INR→USD", "reasoning": "Currency conversion with explicit amount, source, target.", "steps": [{ "agentId": "payroll-agent", "skill": "currency-convert", "payload": { "amount": 1000, "fromCurrency": "INR", "toCurrency": "USD" }, "dependsOn": [] }] }`,
    "",
    "Every response MUST include intent and reasoning. Output JSON only, no surrounding text.",
  ].join("\n");
}

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string" },
    reasoning: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          skill: { type: "string" },
          payload: { type: "object" },
          dependsOn: { type: "array", items: { type: "integer" } },
        },
        required: ["agentId", "skill", "payload", "dependsOn"],
      },
    },
  },
  required: ["intent", "reasoning", "steps"],
};

type RawPlan = {
  intent?: string;
  reasoning?: string;
  steps?: Array<{
    agentId?: string;
    skill?: string;
    payload?: Record<string, unknown>;
    dependsOn?: number[];
  }>;
};

function safeFallbackPlan(reason: string): RoutingPlan {
  return {
    intent: "overview-fallback",
    steps: [
      {
        agentId: AgentId.FinanceAgent,
        skill: "company-metrics",
        payload: {},
        dependsOn: [],
      },
    ],
    reasoning: reason,
    hitlSteps: [],
  };
}

/**
 * Classify intent via the configured routing provider and produce a validated plan.
 * Never throws. On any failure, returns a safe fallback plan.
 */
export async function classifyAndPlan(
  input: OrchestratorInput
): Promise<{
  plan: RoutingPlan;
  tokensUsed?: { prompt: number; candidates: number; total: number };
  durationMs: number;
  fallbackReason?: string;
  providerUsed?: string;
}> {
  const started = Date.now();

  const contextBlock = input.context
    ? `\n\nCONTEXT: ${JSON.stringify(input.context)}`
    : "";

  let call: Awaited<ReturnType<typeof callLlm<RawPlan>>>;
  try {
    call = await callLlm<RawPlan>({
      tier: "T1",
      purpose: "orchestrator-intent-classify",
      systemPrompt: buildSystemPrompt(),
      prompt: `USER MESSAGE: ${input.message}${contextBlock}`,
      jsonSchema: PLAN_SCHEMA,
      timeoutMs: 15_000,
    });
  } catch (err) {
    const providerHealth = getPurposeProviderHealth("orchestrator-intent-classify");
    const reason = `LLM classify threw: ${
      err instanceof Error ? err.message : String(err)
    } — defaulting to finance overview`;
    return {
      plan: safeFallbackPlan(reason),
      durationMs: Date.now() - started,
      fallbackReason: reason,
      providerUsed: providerHealth.provider,
    };
  }

  if (!call.ok || !call.data) {
    const reason = `LLM classify failed: ${
      call.error ?? "no data"
    } — defaulting to finance overview`;
    return {
      plan: safeFallbackPlan(reason),
      tokensUsed: call.tokensUsed,
      durationMs: Date.now() - started,
      fallbackReason: reason,
      providerUsed: call.providerUsed,
    };
  }

  const raw = call.data;

  // Build a plan from the raw response, rejecting any step that doesn't
  // reference a real agent + skill. We prefer a partial valid plan over
  // failing the whole classification.
  const steps: RoutingStep[] = [];
  for (const s of raw.steps ?? []) {
    if (!s.agentId || !s.skill) continue;
    if (!AGENT_GRAPH[s.agentId as AgentId]) continue;
    steps.push({
      agentId: s.agentId as AgentId,
      skill: s.skill,
      payload: s.payload ?? {},
      dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.filter((d) => typeof d === "number") : [],
    });
  }

  const graphValidation = validateRoutingPlan(steps);

  if (steps.length === 0) {
    const reason =
      raw.reasoning ?? "LLM returned no actionable steps — defaulting to finance overview";
    return {
      plan: safeFallbackPlan(reason),
      tokensUsed: call.tokensUsed,
      durationMs: Date.now() - started,
      fallbackReason: reason,
      providerUsed: call.providerUsed,
    };
  }

  if (!graphValidation.valid) {
    const reason = `Plan failed validation: ${graphValidation.errors.join(
      "; "
    )} — defaulting to finance overview`;
    return {
      plan: safeFallbackPlan(reason),
      tokensUsed: call.tokensUsed,
      durationMs: Date.now() - started,
      fallbackReason: reason,
      providerUsed: call.providerUsed,
    };
  }

  return {
    plan: {
      intent: raw.intent ?? "unclassified",
      reasoning: raw.reasoning ?? "",
      steps,
      hitlSteps: graphValidation.hitlSteps,
    },
    tokensUsed: call.tokensUsed,
    durationMs: Date.now() - started,
    providerUsed: call.providerUsed,
  };
}

// ─── Plan Execution ────────────────────────────────────────

/**
 * Execute a validated routing plan via the dispatcher.
 * Steps with dependencies wait; independent steps run in parallel.
 * HITL steps are skipped unless autoRunHitl is true.
 */
export async function executePlan(
  plan: RoutingPlan,
  dispatcher: SkillDispatcher,
  opts: {
    autoRunHitl?: boolean;
    runId?: string;
    performedByUserId?: string;
    planStartedAt?: number;
  } = {}
): Promise<StepResult[]> {
  const results: StepResult[] = new Array(plan.steps.length);
  const completed = new Set<number>();
  const hitlSet = new Set(plan.hitlSteps);
  const planStartedAt = opts.planStartedAt ?? Date.now();

  while (completed.size < plan.steps.length) {
    const ready: number[] = [];
    for (let i = 0; i < plan.steps.length; i++) {
      if (completed.has(i)) continue;
      const step = plan.steps[i];
      if (step.dependsOn.every((dep) => completed.has(dep))) ready.push(i);
    }

    if (ready.length === 0) {
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

    const executions = ready.map(async (i) => {
      const step = plan.steps[i];
      const dependencyWaitMs = Date.now() - planStartedAt;
      const stepStarted = Date.now();

      if (hitlSet.has(i) && !opts.autoRunHitl) {
        results[i] = {
          stepIndex: i,
          agentId: step.agentId,
          skill: step.skill,
          status: "skipped",
          error: "HITL step — requires human confirmation (pass autoRunHitl=true to execute)",
        };
        await logAgentActivity({
          agentId: step.agentId,
          action: "dispatch_step_skipped",
          entityType: "orchestration_step",
          performedBy: opts.performedByUserId,
          details: {
            runId: opts.runId ?? null,
            stepIndex: i,
            skill: step.skill,
            status: "skipped",
            dependencyWaitMs,
            durationMs: Date.now() - stepStarted,
            reason: "hitl_requires_confirmation",
          },
        });
        completed.add(i);
        return;
      }

      const result = await dispatcher(step.agentId, step.skill, step.payload);
      if (result.ok) {
        results[i] = {
          stepIndex: i,
          agentId: step.agentId,
          skill: step.skill,
          status: "success",
          data: result.data,
        };
        await logAgentActivity({
          agentId: step.agentId,
          action: "dispatch_step_success",
          entityType: "orchestration_step",
          performedBy: opts.performedByUserId,
          details: {
            runId: opts.runId ?? null,
            stepIndex: i,
            skill: step.skill,
            status: "success",
            dependencyWaitMs,
            durationMs: Date.now() - stepStarted,
          },
        });
      } else {
        results[i] = {
          stepIndex: i,
          agentId: step.agentId,
          skill: step.skill,
          status: "error",
          error: result.error,
        };
        await logAgentActivity({
          agentId: step.agentId,
          action: "dispatch_step_error",
          entityType: "orchestration_step",
          performedBy: opts.performedByUserId,
          details: {
            runId: opts.runId ?? null,
            stepIndex: i,
            skill: step.skill,
            status: "error",
            code: result.code ?? null,
            error: result.error,
            dependencyWaitMs,
            durationMs: Date.now() - stepStarted,
          },
        });
      }
      completed.add(i);
    });

    await Promise.allSettled(executions);
  }

  return results;
}

// ─── Full orchestrate pipeline ─────────────────────────────

/**
 * One-shot: classify intent, execute the plan, return merged result.
 */
export async function orchestrate(
  input: OrchestratorInput,
  dispatcher: SkillDispatcher
): Promise<OrchestratorResult> {
  const runId = randomUUID();
  const startedAt = Date.now();
  const messageHash = createHash("sha256").update(input.message).digest("hex");
  const providerHealth = getLlmProviderHealth();
  const routingProvider = providerForPurpose("orchestrator-intent-classify");

  const classify = await classifyAndPlan(input);
  const results = await executePlan(classify.plan, dispatcher, {
    autoRunHitl: input.autoRunHitl,
    runId,
    performedByUserId: input.performedByUserId,
    planStartedAt: startedAt,
  });

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  const parts: string[] = [];
  if (successCount) parts.push(`${successCount} succeeded`);
  if (errorCount) parts.push(`${errorCount} failed`);
  if (skippedCount) parts.push(`${skippedCount} skipped (HITL)`);
  const summary = parts.length ? parts.join(", ") : "nothing executed";
  const action =
    classify.fallbackReason || errorCount > 0
      ? "orchestrate_degraded"
      : "orchestrate_completed";

  await logAgentActivity({
    agentId: AgentId.Orchestrator,
    action,
    entityType: "orchestration",
    performedBy: input.performedByUserId,
    details: {
      runId,
      messageHash,
      intent: classify.plan.intent,
      plan: classify.plan,
      stepCount: classify.plan.steps.length,
      successCount,
      errorCount,
      skippedCount,
      summary,
      providerUsed: classify.providerUsed ?? routingProvider,
      providerHealth,
      fallbackReason: classify.fallbackReason ?? null,
      durationMs: Date.now() - startedAt,
      classifyDurationMs: classify.durationMs,
      autoRunHitl: input.autoRunHitl === true,
      contextKeys: input.context ? Object.keys(input.context) : [],
    },
  });

  return {
    intent: classify.plan.intent,
    plan: classify.plan,
    results,
    summary,
    fallbackReason: classify.fallbackReason,
    llmProviderHealth: providerHealth,
    llmProviderUsed: classify.providerUsed ?? routingProvider,
    llmTokens: classify.tokensUsed,
    geminiTokens: classify.tokensUsed,
    classifyDurationMs: classify.durationMs,
  };
}
