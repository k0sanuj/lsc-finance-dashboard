import fs from "node:fs/promises";

async function main() {
  const env = await fs.readFile(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }

  const { searchEntities } = await import("../packages/db/src/queries/search");

  const queries = ["sayan", "xtz", "al ain", "stripe", "anuj", "dxb"];

  for (const q of queries) {
    console.log(`\n=== Q: "${q}" ===`);
    const hits = await searchEntities(q);
    if (hits.length === 0) {
      console.log("  (no hits)");
    } else {
      for (const h of hits) {
        console.log(`  [${h.kind}] ${h.label}${h.subtitle ? ` — ${h.subtitle}` : ""} → ${h.href}`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
