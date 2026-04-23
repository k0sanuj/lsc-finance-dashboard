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
  if (!connStr) throw new Error("DATABASE_URL required.");
  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    await client.query("begin");

    const fspRes = await client.query(`select id from companies where code = 'FSP'::company_code`);
    const fspId = fspRes.rows[0]?.id;
    if (!fspId) throw new Error("FSP company not found.");

    // Add Foundation sport (padel was removed from the product)
    const newSports = [
      { code: "foundation", name: "Foundation Events", league: "LSC Foundation" }
    ];
    for (const s of newSports) {
      await client.query(
        `insert into fsp_sports (company_id, sport_code, display_name, league_name)
         values ($1, $2::fsp_sport_code, $3, $4)
         on conflict (company_id, sport_code) do update set display_name = $3, league_name = $4`,
        [fspId, s.code, s.name, s.league]
      );
    }
    console.log("Added Foundation Events.");

    // Get Squash sport ID
    const squashRes = await client.query(
      `select id from fsp_sports where company_id = $1 and sport_code = 'squash'`, [fspId]
    );
    const squashId = squashRes.rows[0]?.id;
    if (!squashId) throw new Error("Squash sport not found.");

    // Seed WPS P&L reference data for Squash (base scenario)
    const revenueItems = [
      { cat: "Team Franchise Fees", y1: 6000000, y2: 6000000, y3: 10000000, order: 1 },
      { cat: "Sponsorship Rights Revenue", y1: 2150000, y2: 2450000, y3: 3700000, order: 2 },
      { cat: "Media and Betting Revenue", y1: 1610000, y2: 2110000, y3: 3090000, order: 3 },
      { cat: "Merchandise Sales Revenue", y1: 500000, y2: 750000, y3: 1250000, order: 4 },
      { cat: "Blockchain / IP Rights Revenue", y1: 750000, y2: 750000, y3: 1000000, order: 5 },
      { cat: "Data Rights Revenue", y1: 500000, y2: 650000, y3: 800000, order: 6 },
      { cat: "Venue Hosting Revenue", y1: 125000, y2: 250000, y3: 500000, order: 7 }
    ];

    const cogsItems = [
      { cat: "Revenue Share — Teams (40%)", y1: 2200000, y2: 2680000, y3: 3940000, order: 1 },
      { cat: "Venue and Production Costs", y1: 800000, y2: 900000, y3: 1200000, order: 2 },
      { cat: "Officials / Referee Fees", y1: 150000, y2: 165000, y3: 182000, order: 3 },
      { cat: "Athletes / Player Fees", y1: 400000, y2: 440000, y3: 484000, order: 4 },
      { cat: "Revenue Share — PSA (5%)", y1: 581775, y2: 648000, y3: 1017000, order: 5 },
      { cat: "Equipment Costs", y1: 100000, y2: 110000, y3: 121000, order: 6 },
      { cat: "F&B / Catering", y1: 120000, y2: 132000, y3: 145000, order: 7 },
      { cat: "Security Costs", y1: 80000, y2: 88000, y3: 97000, order: 8 },
      { cat: "Medical Support", y1: 50000, y2: 55000, y3: 60500, order: 9 },
      { cat: "Staff Travel / Accommodation", y1: 97775, y2: 90560, y3: 121068, order: 10 },
      { cat: "Miscellaneous COGS", y1: 50000, y2: 50000, y3: 50000, order: 11 }
    ];

    const opexItems = [
      { cat: "Production and Broadcasting", y1: 3120000, y2: 3500000, y3: 4800000, order: 1 },
      { cat: "Media & Entertainment", y1: 1700000, y2: 2040000, y3: 2450000, order: 2 },
      { cat: "Marketing & PR", y1: 1000000, y2: 1250000, y3: 1562500, order: 3 },
      { cat: "Tournament Prize Money", y1: 1000000, y2: 1500000, y3: 2000000, order: 4 },
      { cat: "League Payroll", y1: 620000, y2: 679000, y3: 763000, order: 5, src: "module_7" },
      { cat: "Digital / Tech Services", y1: 465000, y2: 511500, y3: 562650, order: 6, src: "module_8" },
      { cat: "Legal and Compliance", y1: 150000, y2: 165000, y3: 181500, order: 7 },
      { cat: "Insurance", y1: 100000, y2: 110000, y3: 121000, order: 8 },
      { cat: "Merchandising Costs", y1: 200000, y2: 300000, y3: 400000, order: 9 },
      { cat: "Influencer Marketing", y1: 84000, y2: 90000, y3: 102600, order: 10, src: "module_4" }
    ];

    // Clear existing squash PnL data
    await client.query(`delete from fsp_pnl_line_items where sport_id = $1`, [squashId]);

    for (const item of revenueItems) {
      await client.query(
        `insert into fsp_pnl_line_items (sport_id, section, category, display_order, year_1_budget, year_2_budget, year_3_budget, scenario, source_module)
         values ($1, 'revenue', $2, $3, $4, $5, $6, 'base', null)`,
        [squashId, item.cat, item.order, item.y1, item.y2, item.y3]
      );
    }
    for (const item of cogsItems) {
      await client.query(
        `insert into fsp_pnl_line_items (sport_id, section, category, display_order, year_1_budget, year_2_budget, year_3_budget, scenario, source_module)
         values ($1, 'cogs', $2, $3, $4, $5, $6, 'base', null)`,
        [squashId, item.cat, item.order, item.y1, item.y2, item.y3]
      );
    }
    for (const item of opexItems) {
      await client.query(
        `insert into fsp_pnl_line_items (sport_id, section, category, display_order, year_1_budget, year_2_budget, year_3_budget, scenario, source_module)
         values ($1, 'opex', $2, $3, $4, $5, $6, 'base', $7)`,
        [squashId, item.cat, item.order, item.y1, item.y2, item.y3, item.src ?? null]
      );
    }
    console.log(`Seeded ${revenueItems.length + cogsItems.length + opexItems.length} WPS P&L line items.`);

    // Seed WPS Revenue Share config
    await client.query(`delete from fsp_revenue_share where sport_id = $1`, [squashId]);
    const revShareYears = [
      { year: 1, teams: 6, fee: 1000000, teamsPct: 40, gbName: "PSA", gbPct: 5 },
      { year: 2, teams: 6, fee: 1000000, teamsPct: 40, gbName: "PSA", gbPct: 5 },
      { year: 3, teams: 8, fee: 1250000, teamsPct: 40, gbName: "PSA", gbPct: 5 }
    ];
    for (const rs of revShareYears) {
      await client.query(
        `insert into fsp_revenue_share (sport_id, year_number, team_count, team_licensing_fee, teams_share_pct, governing_body_name, governing_body_share_pct)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [squashId, rs.year, rs.teams, rs.fee, rs.teamsPct, rs.gbName, rs.gbPct]
      );
    }
    console.log("Seeded WPS revenue share config.");

    // Seed WPS League Payroll (Module 7)
    await client.query(`delete from fsp_league_payroll where sport_id = $1`, [squashId]);
    const leagueRoles = [
      { role: "CEO / Sport Director", y1: 200000, y2: 220000, y3: 242000, raise: 10 },
      { role: "CCO", y1: 150000, y2: 165000, y3: 181500, raise: 10 },
      { role: "Finance & Operations Manager", y1: 100000, y2: 110000, y3: 121000, raise: 10 },
      { role: "Admin / Support", y1: 50000, y2: 55000, y3: 60500, raise: 10 },
      { role: "Teams Director", y1: 60000, y2: 64500, y3: 79000, raise: 7.5 },
      { role: "Tournament Director", y1: 60000, y2: 64500, y3: 79000, raise: 7.5 }
    ];
    for (const r of leagueRoles) {
      await client.query(
        `insert into fsp_league_payroll (sport_id, role_title, year_1_salary, year_2_salary, year_3_salary, annual_raise_pct)
         values ($1, $2, $3, $4, $5, $6)`,
        [squashId, r.role, r.y1, r.y2, r.y3, r.raise]
      );
    }
    console.log("Seeded WPS league payroll.");

    // Seed WPS Tech Services (Module 8)
    await client.query(`delete from fsp_tech_payroll where sport_id = $1`, [squashId]);
    const techRoles = [
      { role: "Chief of Engineering", y1: 80000, y2: 88000, y3: 96800, alloc: 33 },
      { role: "Product Manager", y1: 60000, y2: 66000, y3: 72600, alloc: 50 },
      { role: "Backend Developer Manager", y1: 55000, y2: 60500, y3: 66550, alloc: 50 },
      { role: "Senior Frontend Developer", y1: 50000, y2: 55000, y3: 60500, alloc: 50 },
      { role: "Junior Frontend Developer", y1: 30000, y2: 33000, y3: 36300, alloc: 100 },
      { role: "Backend Developer", y1: 40000, y2: 44000, y3: 48400, alloc: 50 },
      { role: "Product UI/UX Designer", y1: 45000, y2: 49500, y3: 54450, alloc: 50 },
      { role: "DevOps Engineer", y1: 50000, y2: 55000, y3: 60500, alloc: 33 },
      { role: "Graphic Designer", y1: 25000, y2: 27500, y3: 30250, alloc: 50 },
      { role: "VFX Artist", y1: 30000, y2: 33000, y3: 36300, alloc: 33 }
    ];
    for (const r of techRoles) {
      await client.query(
        `insert into fsp_tech_payroll (sport_id, role_title, year_1_salary, year_2_salary, year_3_salary, allocation_pct, annual_raise_pct)
         values ($1, $2, $3, $4, $5, $6, 10)`,
        [squashId, r.role, r.y1, r.y2, r.y3, r.alloc]
      );
    }
    console.log("Seeded WPS tech services payroll.");

    // Seed Event Config for Squash
    await client.query(
      `insert into fsp_event_config (sport_id, segments_per_event, events_per_year_1, events_per_year_2, events_per_year_3, venue_cost_per_event)
       values ($1, 4, 6, 8, 10, 25000)
       on conflict (sport_id) do update set events_per_year_1 = 6, events_per_year_2 = 8, events_per_year_3 = 10`,
      [squashId]
    );
    console.log("Seeded WPS event config.");

    await client.query("commit");
    console.log("FSP module seeding complete.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
