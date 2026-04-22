/**
 * Cash Flow Analyzer (HITL, T2 — Claude Sonnet)
 *
 * Read-only. Given monthly cash flow + upcoming payments + treasury snapshot,
 * produces a narrative analysis + risk assessment + 3-5 action items.
 * Never mutates DB. Output surfaces in the AI Analysis UI — human reviews
 * before any recommendation becomes action.
 */

import * as queries from "@lsc/db";
import { callLlm } from "../shared/llm";

export type CashFlowAnalysis = {
  summary: string;
  healthScore: number; // 0-100
  liquidityStatus: "strong" | "stable" | "tight" | "critical";
  keyInsights: string[];
  risks: Array<{ severity: "low" | "medium" | "high"; description: string }>;
  recommendations: string[];
  tokensUsed?: { prompt: number; candidates: number; total: number };
  modelUsed: string;
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are the Cash Flow Analyzer for League Sports Co, a sports holding company.
You analyze real cash position data for LSC, TBR, FSP, and XTZ India.
You are read-only — your output goes to finance leadership for review, not direct execution.

Rules:
- Never invent numbers. Work strictly from the data provided.
- Be blunt about risks. Understating is worse than overstating.
- Keep summary under 3 sentences.
- healthScore: 90+ = strong cash runway; 60-89 = stable; 30-59 = tight; <30 = critical.
- Recommendations must be concrete and actionable, not generic advice.`;

const RESPONSE_SCHEMA = {
  type: "object",
  required: ["summary", "healthScore", "liquidityStatus", "keyInsights", "risks", "recommendations"],
  properties: {
    summary: { type: "string" },
    healthScore: { type: "number" },
    liquidityStatus: { type: "string", enum: ["strong", "stable", "tight", "critical"] },
    keyInsights: { type: "array", items: { type: "string" } },
    risks: {
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

export async function analyzeCashFlow(opts: {
  companyCode?: string;
}): Promise<CashFlowAnalysis> {
  const companyCode = opts.companyCode;

  const [metrics, monthly, upcoming, treasury] = await Promise.all([
    queries.getOverviewMetrics(),
    queries.getMonthlyCashFlow(),
    queries.getUpcomingPayments(),
    queries.getTreasurySummary(companyCode),
  ]);

  const context = {
    scope: companyCode ?? "consolidated",
    companyMetrics: metrics,
    monthlyCashFlow: monthly.slice(0, 12), // last 12 months
    upcomingPayments: upcoming.slice(0, 20), // next 20 due
    treasurySnapshot: treasury,
  };

  const result = await callLlm<Omit<CashFlowAnalysis, "tokensUsed" | "modelUsed" | "generatedAt">>({
    tier: "T2",
    purpose: "cash-flow-analyze",
    systemPrompt: SYSTEM_PROMPT,
    prompt: `Analyze cash flow for the following data and return JSON matching the schema.\n\nDATA:\n${JSON.stringify(
      context,
      null,
      2
    )}`,
    jsonSchema: RESPONSE_SCHEMA,
    maxOutputTokens: 2000,
  });

  if (!result.ok || !result.data) {
    return {
      summary: `Analyzer failed: ${result.error ?? "no data"}. Falling back to basic data view.`,
      healthScore: 0,
      liquidityStatus: "critical",
      keyInsights: [],
      risks: [
        {
          severity: "high",
          description: "Analyzer call failed — recommend manual review.",
        },
      ],
      recommendations: ["Re-run analyzer after checking API credentials and quota."],
      modelUsed: result.modelUsed,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    ...result.data,
    tokensUsed: result.tokensUsed,
    modelUsed: result.modelUsed,
    generatedAt: new Date().toISOString(),
  };
}
