/**
 * Integration test for the orchestrator's classifyAndPlan().
 * Hits the configured routing provider for real. Does NOT execute the plan.
 * Run with: npx tsx --tsconfig apps/web/tsconfig.json scripts/test-orchestrate.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

async function main() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY is not set; skipping live orchestrator smoke.");
    return;
  }

  const { classifyAndPlan } = await import("../agents/orchestrator");

  // Keep at or below 4 to stay under Gemini free-tier 5 req/min quota.
  const questions = [
    "Show me the latest payroll for XTZ India",
    "Get me the TBR race list for 2026",
    "Convert 500 INR to USD",
  ];

  for (const q of questions) {
    console.log("\n=================================");
    console.log("Q:", q);
    console.log("=================================");
    const r = await classifyAndPlan({ message: q });
    console.log("Intent:", r.plan.intent);
    console.log("Reasoning:", r.plan.reasoning);
    console.log("Steps:");
    for (const s of r.plan.steps) {
      console.log(`  - ${s.agentId}:${s.skill}`, s.payload);
    }
    console.log("HITL steps:", r.plan.hitlSteps);
    console.log("Provider:", r.providerUsed);
    console.log("LLM tokens:", r.tokensUsed);
    console.log("Classify ms:", r.durationMs);
    assert.notEqual(r.plan.intent, "overview-fallback", "live provider should not fallback");
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
