/**
 * Integration test for the orchestrator's classifyAndPlan().
 * Hits Gemini for real. Does NOT execute the plan (skips dispatcher/DB).
 * Run with: npx tsx --tsconfig apps/web/tsconfig.json scripts/test-orchestrate.ts
 */
import fs from "node:fs/promises";

async function main() {
  const env = await fs.readFile(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
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
    console.log("Gemini tokens:", r.tokensUsed);
    console.log("Classify ms:", r.durationMs);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
