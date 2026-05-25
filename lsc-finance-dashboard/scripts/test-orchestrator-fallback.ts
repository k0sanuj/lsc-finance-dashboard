import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";

function loadEnv() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}

loadEnv();
delete process.env.ANTHROPIC_API_KEY;

async function main() {
  const { classifyAndPlan } = await import("../agents/orchestrator");

  const result = await classifyAndPlan({
    message: "Show me the latest payroll for XTZ India",
  });

  assert.equal(result.plan.intent, "overview-fallback");
  assert.equal(result.plan.steps.length, 1);
  assert.equal(result.plan.steps[0]?.agentId, "finance-agent");
  assert.equal(result.plan.steps[0]?.skill, "company-metrics");
  assert.ok(result.fallbackReason?.includes("ANTHROPIC_API_KEY"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        intent: result.plan.intent,
        fallbackReason: result.fallbackReason,
        durationMs: result.durationMs,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
