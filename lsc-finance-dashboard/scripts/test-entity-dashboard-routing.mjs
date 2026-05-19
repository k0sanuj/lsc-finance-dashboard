import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

async function loadEnvFile(envPath) {
  try {
    const content = await fs.readFile(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function ok(message) {
  process.stdout.write(`✓ ${message}\n`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  ok(message);
}

function numeric(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  await loadEnvFile(path.join(projectRoot, "apps", "web", ".env.local"));

  const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL_ADMIN or DATABASE_URL is missing.");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const tbrPnl = await client.query(
      `select coalesce(sum(total_cost_usd), 0)::text as total_cost
       from tbr_overall_pnl_by_season`
    );
    assert(numeric(tbrPnl.rows[0]?.total_cost) > 0, "TBR overview has backend season cost available");

    const fspScenario = await client.query(
      `select coalesce(sum(revenue_y1), 0)::text as revenue_y1,
              coalesce(sum(cogs_y1 + opex_y1), 0)::text as cost_y1
       from fsp_pnl_summary
       where scenario = 'base'`
    );
    assert(numeric(fspScenario.rows[0]?.revenue_y1) > 0, "FSP scenario revenue is available for FSP dashboards");
    assert(numeric(fspScenario.rows[0]?.cost_y1) > 0, "FSP scenario cost is available for FSP dashboards");

    const fspConsolidated = await client.query(
      `select recognized_revenue::text, approved_expenses::text
       from consolidated_company_metrics
       where company_code::text = 'FSP'`
    );
    assert(fspConsolidated.rows.length === 1, "FSP remains a visible entity row");

    const xtzInvoices = await client.query(
      `select
         coalesce(sum(case when pi.status::text in ('generated', 'sent') and pi.currency_code = 'USD' then pi.total_amount else 0 end), 0)::text as committed,
         coalesce(sum(case when pi.status::text = 'paid' and pi.currency_code = 'USD' then pi.total_amount else 0 end), 0)::text as paid
       from payroll_invoices pi
       join companies fc on fc.id = pi.from_company_id
       where fc.code::text = 'XTZ'`
    );
    assert(numeric(xtzInvoices.rows[0]?.committed) > 0, "XTZ generated/sent invoices are available as committed exposure");
    assert(numeric(xtzInvoices.rows[0]?.paid) > 0, "XTZ paid invoices are available as recognized invoice flow");

    const lscTotals = await client.query(
      `select recognized_revenue::text, approved_expenses::text
       from consolidated_company_metrics
       where company_code::text = 'LSC'`
    );
    assert(lscTotals.rows.length === 1, "LSC consolidated row is available after FSP exclusion policy");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
