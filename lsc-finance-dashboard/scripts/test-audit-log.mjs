import pg from "pg";
import fs from "node:fs/promises";

const { Client } = pg;
const content = await fs.readFile(".env.local", "utf8");
for (const line of content.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const c = new Client({ connectionString: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL });
await c.connect();

const testId = "test-" + Date.now();
await c.query(
  `insert into audit_log (entity_type, entity_id, trigger, action, before_state, after_state, cascade_result, performed_by, agent_id)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
  [
    "invoice",
    testId,
    "invoice:created",
    "create",
    null,
    JSON.stringify({ amount: 100, status: "draft" }),
    JSON.stringify({ actions: ["refresh-payments-due", "write-audit-log"], errors: [] }),
    "system-test",
    "invoice-agent",
  ]
);

const count = await c.query("select count(*)::int as c from audit_log");
console.log("audit_log rows:", count.rows[0].c);

const latest = await c.query(
  "select trigger, action, performed_by, agent_id, cascade_result from audit_log where entity_id = $1",
  [testId]
);
console.log("test entry:", JSON.stringify(latest.rows[0], null, 2));

// Clean up the test row
await c.query("delete from audit_log where entity_id = $1", [testId]);
console.log("test row cleaned up");

await c.end();
