import pg from "pg";
import fs from "node:fs/promises";

const { Client } = pg;
const env = await fs.readFile(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const c = new Client({ connectionString: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL });
await c.connect();

const tables = ["vendors", "employees", "race_events", "invoice_intakes", "payroll_invoices", "deals", "subscriptions", "sponsors_or_customers"];
for (const t of tables) {
  const r = await c.query(
    `select column_name from information_schema.columns where table_name = $1 order by ordinal_position`,
    [t]
  );
  const cols = r.rows.map((row) => row.column_name);
  console.log(`${t}: ${cols.length ? cols.join(", ") : "(not found)"}`);
}
await c.end();
