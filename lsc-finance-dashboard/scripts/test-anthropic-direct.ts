/**
 * Direct smoke test for the Anthropic client.
 * Verifies the request shape is correct — expected to return a clean
 * "credit balance too low" error until billing is enabled.
 */
import fs from "node:fs/promises";

async function main() {
  const env = await fs.readFile(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }

  const { callLlm } = await import("../skills/shared/llm");

  console.log("→ T1 routing call (should go to Anthropic Haiku)");
  const t1 = await callLlm<{ classification?: string }>({
    tier: "T1",
    purpose: "orchestrator-intent-classify",
    prompt: "Classify this as test.",
    jsonSchema: { type: "object", properties: { classification: { type: "string" } } },
  });
  console.log("  provider:", t1.providerUsed);
  console.log("  model:", t1.modelUsed);
  console.log("  ok:", t1.ok);
  console.log("  error:", t1.error);
  console.log("  duration:", t1.durationMs, "ms");

  console.log("\n→ T2 document-analyze call (should go to Gemini)");
  const t2 = await callLlm<unknown>({
    tier: "T2",
    purpose: "document-analyze",
    prompt: "Say OK",
  });
  console.log("  provider:", t2.providerUsed);
  console.log("  model:", t2.modelUsed);
  console.log("  ok:", t2.ok);
  console.log("  duration:", t2.durationMs, "ms");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
