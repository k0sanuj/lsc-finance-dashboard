/**
 * Receivables Analyzer (HITL, T2 — Claude Sonnet)
 * Read-only. Aging analysis + collection risk assessment.
 */

import * as queries from "@lsc/db";
import { callLlm } from "../shared/llm";

export type ReceivablesAnalysis = {
  summary: string;
  totalOutstanding: string;
  collectionRiskScore: number; // 0-100 (higher = more at-risk)
  agingSignals: Array<{ bucket: string; signal: "healthy" | "warning" | "critical" }>;
  topRisks: Array<{ customer: string; amount: string; daysOverdue: number; action: string }>;
  recommendations: string[];
  tokensUsed?: { prompt: number; candidates: number; total: number };
  modelUsed: string;
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are the Receivables Analyzer for League Sports Co.
Read-only — output is for finance leadership to review.
Focus: aging, customer concentration, collection likelihood, escalation calls.
Never invent customer names or amounts.`;

const SCHEMA = {
  type: "object",
  required: ["summary", "totalOutstanding", "collectionRiskScore", "agingSignals", "topRisks", "recommendations"],
  properties: {
    summary: { type: "string" },
    totalOutstanding: { type: "string" },
    collectionRiskScore: { type: "number" },
    agingSignals: {
      type: "array",
      items: {
        type: "object",
        required: ["bucket", "signal"],
        properties: {
          bucket: { type: "string" },
          signal: { type: "string", enum: ["healthy", "warning", "critical"] },
        },
      },
    },
    topRisks: {
      type: "array",
      items: {
        type: "object",
        required: ["customer", "amount", "daysOverdue", "action"],
        properties: {
          customer: { type: "string" },
          amount: { type: "string" },
          daysOverdue: { type: "number" },
          action: { type: "string" },
        },
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
};

export async function analyzeReceivables(opts: { companyCode?: string } = {}): Promise<ReceivablesAnalysis> {
  const [aging, enhanced] = await Promise.all([
    queries.getReceivablesAgingSummary(opts.companyCode),
    queries.getEnhancedPayables(opts.companyCode),
  ]);

  const context = {
    scope: opts.companyCode ?? "consolidated",
    receivablesAging: aging,
    payablesContext: enhanced.slice(0, 20),
  };

  const result = await callLlm<Omit<ReceivablesAnalysis, "tokensUsed" | "modelUsed" | "generatedAt">>({
    tier: "T2",
    purpose: "receivables-analyze",
    systemPrompt: SYSTEM_PROMPT,
    prompt: `Analyze receivables and return JSON matching the schema.\n\nDATA:\n${JSON.stringify(context, null, 2)}`,
    jsonSchema: SCHEMA,
    maxOutputTokens: 2000,
  });

  if (!result.ok || !result.data) {
    return {
      summary: `Analyzer failed: ${result.error ?? "no data"}.`,
      totalOutstanding: "0",
      collectionRiskScore: 0,
      agingSignals: [],
      topRisks: [],
      recommendations: ["Re-run analyzer after checking API credentials."],
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
