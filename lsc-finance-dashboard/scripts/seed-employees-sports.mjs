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
      const sep = line.indexOf("=");
      if (sep === -1) continue;
      const k = line.slice(0, sep).trim();
      const v = line.slice(sep + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (e) { if (e?.code === "ENOENT") return; throw e; }
}

async function main() {
  await loadEnvFile(path.join(process.cwd(), ".env.local"));
  const connStr = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!connStr) throw new Error("DATABASE_URL_ADMIN or DATABASE_URL required.");

  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    await client.query("begin");

    // --- XTZ Esports Tech Limited (XTE) ---
    const xteRes = await client.query(`select id from companies where code = 'XTE'::company_code`);
    let xteId = xteRes.rows[0]?.id;
    if (!xteId) {
      const ins = await client.query(
        `insert into companies (code, name) values ('XTE'::company_code, 'XTZ Esports Tech Limited') returning id`
      );
      xteId = ins.rows[0].id;
      console.log("Created XTZ Esports Tech Limited (XTE).");
    }

    // Get existing company IDs
    const companies = await client.query(`select id, code from companies`);
    const cmap = Object.fromEntries(companies.rows.map(r => [r.code, r.id]));
    const xtzId = cmap["XTZ"];
    const fspId = cmap["FSP"];

    // --- FSP Sports ---
    const sports = [
      { code: "basketball", name: "Basketball", league: "FSP Basketball League" },
      { code: "bowling", name: "Bowling", league: "World Bowling League" },
      { code: "squash", name: "Squash", league: "FSP Squash Series" },
      { code: "beer_pong", name: "Beer Pong", league: "FSP Beer Pong Championship" }
    ];

    for (const s of sports) {
      await client.query(
        `insert into fsp_sports (company_id, sport_code, display_name, league_name)
         values ($1, $2::fsp_sport_code, $3, $4)
         on conflict (company_id, sport_code) do update set display_name = $3, league_name = $4`,
        [fspId, s.code, s.name, s.league]
      );
    }
    console.log(`Seeded ${sports.length} FSP sports.`);

    // --- Sample employees (XTZ India — these are the ones who will be on XTZ India payroll invoiced to XTE) ---
    const sampleEmployees = [
      { name: "Anuj Kumar Singh", email: "anuj@leaguesportsco.com", designation: "CEO & Finance Lead", dept: "Executive", type: "full_time", salary: 0, cur: "INR" },
      { name: "AK", email: "ak@leaguesportsco.com", designation: "Operations Lead", dept: "Operations", type: "full_time", salary: 0, cur: "INR" },
    ];

    for (const emp of sampleEmployees) {
      const existing = await client.query(`select id from employees where email = $1 and company_id = $2`, [emp.email, xtzId]);
      if (!existing.rows[0]) {
        await client.query(
          `insert into employees (company_id, full_name, email, designation, department, employment_type, base_salary, salary_currency)
           values ($1, $2, $3, $4, $5, $6::employment_type, $7, $8)`,
          [xtzId, emp.name, emp.email, emp.designation, emp.dept, emp.type, emp.salary, emp.cur]
        );
      }
    }
    console.log(`Seeded ${sampleEmployees.length} employees.`);

    await client.query("commit");
    console.log("Seed complete.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
