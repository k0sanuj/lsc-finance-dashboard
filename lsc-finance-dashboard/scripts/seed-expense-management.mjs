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
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separator = line.indexOf("=");
      if (separator === -1) {
        continue;
      }

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL_ADMIN or DATABASE_URL must be set before seeding expense workflow data.");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("begin");

    const company = await client.query(`select id from companies where code = 'TBR'::company_code`);
    const companyId = company.rows[0]?.id;
    const admin = await client.query(`select id from app_users order by created_at asc limit 1`);
    const userId = admin.rows[0]?.id;

    if (!companyId || !userId) {
      throw new Error("TBR company or bootstrap user missing.");
    }

    const race = await client.query(`select id from race_events where company_id = $1 order by event_start_date asc nulls last limit 1`, [companyId]);
    const category = await client.query(`select id from cost_categories where company_id = $1 order by name asc limit 1`, [companyId]);

    const teamRows = await client.query(
      `insert into app_teams (company_id, team_code, team_name, description)
       values
         ($1, 'OPS', 'Operations Crew', 'Travel, logistics, and on-site delivery'),
         ($1, 'CREW', 'Racing Crew', 'Team members with shared race expense load')
       on conflict (company_id, team_code) do update
         set team_name = excluded.team_name,
             description = excluded.description
       returning id, team_code`,
      [companyId]
    );

    for (const team of teamRows.rows) {
      await client.query(
        `insert into team_memberships (team_id, app_user_id, membership_role)
         values ($1, $2, 'lead')
         on conflict (team_id, app_user_id) do nothing`,
        [team.id, userId]
      );
    }

    const submission = await client.query(
      `insert into expense_submissions (
         company_id,
         race_event_id,
         submitted_by_user_id,
         submission_status,
         submission_title,
         operator_note,
         submitted_at
       )
       values ($1, $2, $3, 'submitted', 'Sample race logistics package', 'Seeded sample for workflow review.', now())
       returning id`,
      [companyId, race.rows[0]?.id ?? null, userId]
    );

    await client.query(
      `insert into expense_submission_items (
         submission_id,
         cost_category_id,
         team_id,
         merchant_name,
         expense_date,
         amount,
         description,
         split_method,
         split_count
       )
       values ($1, $2, $3, 'Local transport vendor', current_date, 420, 'Airport transfer and local logistics', 'equal', 2)`,
      [submission.rows[0].id, category.rows[0]?.id ?? null, teamRows.rows[0]?.id ?? null]
    );

    await client.query("commit");
    console.log("Seeded expense management sample data.");
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
