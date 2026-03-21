import { NextResponse } from "next/server";

export async function GET() {
  const diagnostics: Record<string, unknown> = {};

  // Check env vars
  diagnostics.LSC_DATA_BACKEND = process.env.LSC_DATA_BACKEND ?? "NOT SET";
  diagnostics.DATABASE_URL_SET = !!process.env.DATABASE_URL;
  diagnostics.DATABASE_URL_PREFIX = (process.env.DATABASE_URL ?? "").slice(0, 30) + "...";

  // Test DB connection
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const companyRes = await pool.query("SELECT code, name FROM companies ORDER BY code");
    diagnostics.companies = companyRes.rows;

    const seasonRes = await pool.query(`
      SELECT re.season_year, count(*)::text as race_count
      FROM race_events re
      JOIN companies c ON c.id = re.company_id
      WHERE c.code = 'TBR'::company_code AND re.season_year IS NOT NULL
      GROUP BY re.season_year ORDER BY re.season_year
    `);
    diagnostics.seasons = seasonRes.rows;

    const raceRes = await pool.query(`
      SELECT name, location, season_year, event_start_date::text
      FROM race_events re JOIN companies c ON c.id = re.company_id
      WHERE c.code = 'TBR'::company_code ORDER BY season_year, event_start_date LIMIT 20
    `);
    diagnostics.races = raceRes.rows;

    await pool.end();
    diagnostics.db_status = "OK";
  } catch (err) {
    diagnostics.db_status = "ERROR";
    diagnostics.db_error = err instanceof Error ? err.message : String(err);
  }

  // Test the actual query function
  try {
    const { getTbrSeasonSummaries } = await import("@lsc/db");
    const seasons = await getTbrSeasonSummaries();
    diagnostics.getTbrSeasonSummaries_result = seasons;
    diagnostics.getTbrSeasonSummaries_count = seasons.length;
  } catch (err) {
    diagnostics.getTbrSeasonSummaries_error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(diagnostics, { status: 200 });
}
