/**
 * Goal Tracker (HITL, T1 — Claude Haiku)
 * Commercial target progress, closure rate projections.
 */

import * as queries from "@lsc/db";
import { callLlm } from "../shared/llm";

export type GoalTrackerAnalysis = {
  summary: string;
  onTrackPct: number;
  atRiskTargets: Array<{ name: string; gapToTarget: string; closeProbability: number }>;
  projectedClosures: Array<{ name: string; expectedBy: string; confidence: "high" | "medium" | "low" }>;
  recommendations: string[];
  tokensUsed?: { prompt: number; candidates: number; total: number };
  modelUsed: string;
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are the Goal Tracker for League Sports Co commercial targets.
Focus: commercial goal progress, sponsor deal velocity, closure probability.
Be direct about targets unlikely to hit.`;

const SCHEMA = {
  type: "object",
  required: ["summary", "onTrackPct", "atRiskTargets", "projectedClosures", "recommendations"],
  properties: {
    summary: { type: "string" },
    onTrackPct: { type: "number" },
    atRiskTargets: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "gapToTarget", "closeProbability"],
        properties: {
          name: { type: "string" },
          gapToTarget: { type: "string" },
          closeProbability: { type: "number" },
        },
      },
    },
    projectedClosures: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "expectedBy", "confidence"],
        properties: {
          name: { type: "string" },
          expectedBy: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
};

export async function analyzeGoals(): Promise<GoalTrackerAnalysis> {
  const [goals, partners, sponsors] = await Promise.all([
    queries.getCommercialGoals(),
    queries.getPartnerPerformance(),
    queries.getSponsorBreakdown(),
  ]);

  const context = {
    commercialGoals: goals,
    partnerPerformance: partners,
    sponsorBreakdown: sponsors,
  };

  const result = await callLlm<Omit<GoalTrackerAnalysis, "tokensUsed" | "modelUsed" | "generatedAt">>({
    tier: "T1",
    purpose: "goal-track",
    systemPrompt: SYSTEM_PROMPT,
    prompt: `Track commercial goal progress and return JSON matching the schema.\n\nDATA:\n${JSON.stringify(context, null, 2)}`,
    jsonSchema: SCHEMA,
    maxOutputTokens: 1500,
  });

  if (!result.ok || !result.data) {
    return {
      summary: `Analyzer failed: ${result.error ?? "no data"}.`,
      onTrackPct: 0,
      atRiskTargets: [],
      projectedClosures: [],
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
