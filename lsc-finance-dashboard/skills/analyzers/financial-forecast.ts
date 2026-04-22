/**
 * Financial Forecast + Break-Even Analyzer (HITL, T2 — Claude Sonnet)
 *
 * Forward-looking counterpart to cash-flow.ts. Pulls:
 *   - Last 12 months of cash flow (in/out trend)
 *   - Upcoming tranches (receivables waterfall)
 *   - Subscription monthly burn
 *   - Employee salary burn
 *   - Treasury projections
 *   - Commercial goals (target pipeline)
 *
 * Asks Claude Sonnet to project 3/6/12 month cash positions and compute
 * per-entity break-even timing given current burn vs pipeline.
 */

import * as queries from "@lsc/db";
import { callLlm } from "../shared/llm";

export type FinancialForecast = {
  scope: string;
  currentCashUsd: number;
  monthlyBurnUsd: number;
  projectedIn3Months: { bestCase: number; baseCase: number; worstCase: number };
  projectedIn6Months: { bestCase: number; baseCase: number; worstCase: number };
  projectedIn12Months: { bestCase: number; baseCase: number; worstCase: number };
  runwayMonths: number | null;
  breakEvenAnalysis: {
    monthsToBreakEven: number | null;
    revenueNeededMonthly: number;
    pathDescription: string;
  };
  keyAssumptions: string[];
  riskFactors: Array<{ severity: "low" | "medium" | "high"; description: string }>;
  recommendations: string[];
  tokensUsed?: { prompt: number; candidates: number; total: number };
  modelUsed: string;
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are the Financial Forecast Analyzer for League Sports Co, a sports holding company.
You project forward 3/6/12 months and analyze path-to-break-even.

Entities: LSC (holding), TBR (race operations, live), FSP (future sports modules), XTZ India (service entity).

Rules:
- Ground every number in the data provided. Never invent.
- bestCase/baseCase/worstCase reflect collection assumptions: 100%/70%/40% of pipeline.
- monthlyBurnUsd = total recurring monthly outflow (subscriptions + salaries + fixed costs).
- runwayMonths = current cash / monthly burn, floor. null if burn is 0.
- monthsToBreakEven: if currently profitable (revenue > burn), null. Otherwise estimate months until pipeline conversion covers burn.
- Be blunt — understating a risk is worse than overstating.
- Keep pathDescription under 2 sentences.`;

const SCHEMA = {
  type: "object",
  required: [
    "currentCashUsd",
    "monthlyBurnUsd",
    "projectedIn3Months",
    "projectedIn6Months",
    "projectedIn12Months",
    "breakEvenAnalysis",
    "keyAssumptions",
    "riskFactors",
    "recommendations",
  ],
  properties: {
    currentCashUsd: { type: "number" },
    monthlyBurnUsd: { type: "number" },
    projectedIn3Months: {
      type: "object",
      properties: {
        bestCase: { type: "number" },
        baseCase: { type: "number" },
        worstCase: { type: "number" },
      },
    },
    projectedIn6Months: {
      type: "object",
      properties: {
        bestCase: { type: "number" },
        baseCase: { type: "number" },
        worstCase: { type: "number" },
      },
    },
    projectedIn12Months: {
      type: "object",
      properties: {
        bestCase: { type: "number" },
        baseCase: { type: "number" },
        worstCase: { type: "number" },
      },
    },
    runwayMonths: { type: ["number", "null"] },
    breakEvenAnalysis: {
      type: "object",
      properties: {
        monthsToBreakEven: { type: ["number", "null"] },
        revenueNeededMonthly: { type: "number" },
        pathDescription: { type: "string" },
      },
    },
    keyAssumptions: { type: "array", items: { type: "string" } },
    riskFactors: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "description"],
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high"] },
          description: { type: "string" },
        },
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
};

export async function runFinancialForecast(opts: {
  companyCode?: string;
} = {}): Promise<FinancialForecast> {
  const companyCode = opts.companyCode;
  const scope = companyCode ?? "consolidated";

  const [
    overviewMetrics,
    monthlyCashFlow,
    upcomingPayments,
    treasurySummary,
    treasuryProjections,
    subscriptionSummary,
    commercialGoals,
    trancheAging,
  ] = await Promise.all([
    queries.getOverviewMetrics().catch(() => []),
    queries.getMonthlyCashFlow().catch(() => []),
    queries.getUpcomingPayments().catch(() => []),
    queries.getTreasurySummary(companyCode).catch(() => null),
    queries.getTreasuryProjections(companyCode).catch(() => []),
    queries.getSubscriptionSummary().catch(() => null),
    queries.getCommercialGoals().catch(() => []),
    queries.getTrancheAgingSummary(companyCode ?? "TBR").catch(() => null),
  ]);

  const context = {
    scope,
    overviewMetrics,
    last12MonthsCashFlow: Array.isArray(monthlyCashFlow) ? monthlyCashFlow.slice(0, 12) : [],
    upcomingOutflows: Array.isArray(upcomingPayments) ? upcomingPayments.slice(0, 30) : [],
    treasurySummary,
    treasuryProjections: Array.isArray(treasuryProjections) ? treasuryProjections.slice(0, 12) : [],
    subscriptionMonthlyRunRate: subscriptionSummary,
    commercialGoalsPipeline: commercialGoals,
    trancheAging,
  };

  const result = await callLlm<
    Omit<FinancialForecast, "scope" | "tokensUsed" | "modelUsed" | "generatedAt">
  >({
    tier: "T2",
    purpose: "financial-forecast",
    systemPrompt: SYSTEM_PROMPT,
    prompt: `Forecast cash + break-even for ${scope} based on the data below and return JSON matching the schema.\n\nDATA:\n${JSON.stringify(
      context,
      null,
      2
    )}`,
    jsonSchema: SCHEMA,
    maxOutputTokens: 3000,
    timeoutMs: 45_000,
  });

  if (!result.ok || !result.data) {
    return {
      scope,
      currentCashUsd: 0,
      monthlyBurnUsd: 0,
      projectedIn3Months: { bestCase: 0, baseCase: 0, worstCase: 0 },
      projectedIn6Months: { bestCase: 0, baseCase: 0, worstCase: 0 },
      projectedIn12Months: { bestCase: 0, baseCase: 0, worstCase: 0 },
      runwayMonths: null,
      breakEvenAnalysis: {
        monthsToBreakEven: null,
        revenueNeededMonthly: 0,
        pathDescription: `Analyzer failed: ${result.error ?? "no data"}`,
      },
      keyAssumptions: [],
      riskFactors: [
        { severity: "high", description: "Forecast LLM call failed — recommend manual review." },
      ],
      recommendations: ["Re-run after checking API credentials and quota."],
      modelUsed: result.modelUsed,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    scope,
    ...result.data,
    tokensUsed: result.tokensUsed,
    modelUsed: result.modelUsed,
    generatedAt: new Date().toISOString(),
  };
}
