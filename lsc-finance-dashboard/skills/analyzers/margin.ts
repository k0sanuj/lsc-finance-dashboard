/**
 * Margin Analyzer (HITL, T2 — Claude Sonnet)
 * Race-level P&L narrative. Why margins moved, which races over-ran,
 * which categories are structurally expensive.
 */

import * as queries from "@lsc/db";
import { callLlm } from "../shared/llm";

export type MarginAnalysis = {
  summary: string;
  marginHealth: "expanding" | "stable" | "compressing" | "reversing";
  bestRace: { name: string; margin: string } | null;
  worstRace: { name: string; margin: string } | null;
  costDrivers: Array<{ category: string; trend: "rising" | "flat" | "falling"; note: string }>;
  recommendations: string[];
  tokensUsed?: { prompt: number; candidates: number; total: number };
  modelUsed: string;
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are the Margin Analyzer for League Sports Co race operations.
Read-only. Focus on TBR race P&L — what's expanding, what's compressing, why.
Never invent race names.`;

const SCHEMA = {
  type: "object",
  required: ["summary", "marginHealth", "bestRace", "worstRace", "costDrivers", "recommendations"],
  properties: {
    summary: { type: "string" },
    marginHealth: { type: "string", enum: ["expanding", "stable", "compressing", "reversing"] },
    bestRace: { type: "object", properties: { name: { type: "string" }, margin: { type: "string" } } },
    worstRace: { type: "object", properties: { name: { type: "string" }, margin: { type: "string" } } },
    costDrivers: {
      type: "array",
      items: {
        type: "object",
        required: ["category", "trend", "note"],
        properties: {
          category: { type: "string" },
          trend: { type: "string", enum: ["rising", "flat", "falling"] },
          note: { type: "string" },
        },
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
};

export async function analyzeMargins(opts: { seasonYear?: number } = {}): Promise<MarginAnalysis> {
  const seasonYear = opts.seasonYear ?? new Date().getFullYear();
  const [seasons, races, insights] = await Promise.all([
    queries.getTbrSeasonSummaries(),
    queries.getTbrRaceCards(seasonYear),
    queries.getCostInsights("TBR"),
  ]);

  const context = {
    scope: `TBR ${seasonYear}`,
    seasonSummaries: seasons,
    races,
    costInsights: insights.slice(0, 20),
  };

  const result = await callLlm<Omit<MarginAnalysis, "tokensUsed" | "modelUsed" | "generatedAt">>({
    tier: "T2",
    purpose: "margin-analyze",
    systemPrompt: SYSTEM_PROMPT,
    prompt: `Analyze race-level margins and return JSON matching the schema.\n\nDATA:\n${JSON.stringify(context, null, 2)}`,
    jsonSchema: SCHEMA,
    maxOutputTokens: 2000,
  });

  if (!result.ok || !result.data) {
    return {
      summary: `Analyzer failed: ${result.error ?? "no data"}.`,
      marginHealth: "stable",
      bestRace: null,
      worstRace: null,
      costDrivers: [],
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
