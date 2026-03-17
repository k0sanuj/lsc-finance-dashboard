import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
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
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL_ADMIN or DATABASE_URL must be set before seeding invoice workflow.");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("begin");
    const company = await client.query(`select id from companies where code='TBR'::company_code`);
    const user = await client.query(`select id from app_users order by created_at asc limit 1`);
    const race = await client.query(`select id from race_events where company_id = $1 order by event_start_date desc nulls last limit 1`, [company.rows[0]?.id]);

    if (!company.rows[0]?.id || !user.rows[0]?.id) {
      throw new Error("Missing TBR company or bootstrap user.");
    }

    await client.query(
      `insert into invoice_intakes (
         company_id,
         race_event_id,
         submitted_by_user_id,
         intake_status,
         vendor_name,
         invoice_number,
         due_date,
         total_amount,
         category_hint,
         operator_note,
         submitted_at
       )
       values ($1, $2, $3, 'submitted', 'E1 Operations', 'SAMPLE-E1-001', current_date + 14, 18500, 'Licensing fee', 'Seeded invoice workflow sample.', now())`,
      [company.rows[0].id, race.rows[0]?.id ?? null, user.rows[0].id]
    );

    await client.query("commit");
    console.log("Seeded invoice workflow sample data.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
