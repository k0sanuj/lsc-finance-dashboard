/**
 * Budget Analyzer (HITL, T1 — Claude Haiku)
 * Threshold-based, high-frequency. Budget utilization + overspend detection.
 */

import * as queries from "@lsc/db";
import { callLlm } from "../shared/llm";

export type BudgetAnalysis = {
  summary: string;
  overspendCount: number;
  utilizationByCategory: Array<{ category: string; used: number; budget: number; pct: number }>;
  alerts: Array<{ severity: "info" | "warn" | "risk"; message: string }>;
  recommendations: string[];
  tokensUsed?: { prompt: number; candidates: number; total: number };
  modelUsed: string;
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are the Budget Analyzer for League Sports Co race operations.
Flag utilization, overspend, and structural budget mismatches.
Be concise — Haiku-tier analyzer.`;

const SCHEMA = {
  type: "object",
  required: ["summary", "overspendCount", "utilizationByCategory", "alerts", "recommendations"],
  properties: {
    summary: { type: "string" },
    overspendCount: { type: "number" },
    utilizationByCategory: {
      type: "array",
      items: {
        type: "object",
        required: ["category", "used", "budget", "pct"],
        properties: {
          category: { type: "string" },
          used: { type: "number" },
          budget: { type: "number" },
          pct: { type: "number" },
        },
      },
    },
    alerts: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "message"],
        properties: {
          severity: { type: "string", enum: ["info", "warn", "risk"] },
          message: { type: "string" },
        },
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
};

export async function analyzeBudget(): Promise<BudgetAnalysis> {
  const [costs, seasonCats] = await Promise.all([
    queries.getTbrRaceCosts(),
    queries.getTbrSeasonCostCategories(new Date().getFullYear()),
  ]);

  const context = {
    raceCosts: costs,
    categoryBreakdown: seasonCats,
  };

  const result = await callLlm<Omit<BudgetAnalysis, "tokensUsed" | "modelUsed" | "generatedAt">>({
    tier: "T1",
    purpose: "budget-analyze",
    systemPrompt: SYSTEM_PROMPT,
    prompt: `Analyze budget utilization and return JSON matching the schema.\n\nDATA:\n${JSON.stringify(context, null, 2)}`,
    jsonSchema: SCHEMA,
    maxOutputTokens: 1500,
  });

  if (!result.ok || !result.data) {
    return {
      summary: `Analyzer failed: ${result.error ?? "no data"}.`,
      overspendCount: 0,
      utilizationByCategory: [],
      alerts: [],
      recommendations: ["Re-run after checking API credentials."],
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
