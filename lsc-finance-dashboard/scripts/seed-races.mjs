#!/usr/bin/env node

/**
 * Seed E1 race calendar data for Season 1, 2, and 3
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import pg from "pg";

// Load env
const envPath = join(import.meta.dirname, "..", "apps", "web", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error("DATABASE_URL not set"); process.exit(1); }

const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });

const races = [
  // Season 1 — 2024
  { season: 2024, code: "E1-S1-JED", name: "Jeddah Grand Prix", location: "Jeddah", country: "Saudi Arabia", startDate: "2024-02-22", endDate: "2024-02-23" },
  { season: 2024, code: "E1-S1-VEN", name: "Venice Grand Prix", location: "Venice", country: "Italy", startDate: "2024-04-18", endDate: "2024-04-19" },
  { season: 2024, code: "E1-S1-MON", name: "Monaco E-Prix", location: "Monaco", country: "Monaco", startDate: "2024-07-06", endDate: "2024-07-07" },
  { season: 2024, code: "E1-S1-DOH", name: "Doha Grand Prix", location: "Doha", country: "Qatar", startDate: "2024-11-28", endDate: "2024-11-29" },

  // Season 2 — 2025
  { season: 2025, code: "E1-S2-JED", name: "Jeddah Grand Prix", location: "Jeddah", country: "Saudi Arabia", startDate: "2025-01-30", endDate: "2025-01-31" },
  { season: 2025, code: "E1-S2-DOH", name: "Doha Grand Prix", location: "Doha", country: "Qatar", startDate: "2025-03-20", endDate: "2025-03-21" },
  { season: 2025, code: "E1-S2-MIL", name: "Lake Como Grand Prix", location: "Lake Como", country: "Italy", startDate: "2025-05-22", endDate: "2025-05-23" },
  { season: 2025, code: "E1-S2-DUB", name: "Dubrovnik Grand Prix", location: "Dubrovnik", country: "Croatia", startDate: "2025-06-19", endDate: "2025-06-20" },
  { season: 2025, code: "E1-S2-MON", name: "Monaco E-Prix", location: "Monaco", country: "Monaco", startDate: "2025-07-10", endDate: "2025-07-11" },
  { season: 2025, code: "E1-S2-LAG", name: "Lagos Grand Prix", location: "Lagos", country: "Nigeria", startDate: "2025-10-09", endDate: "2025-10-10" },

  // Season 3 — 2026 (confirmed from e1series.com)
  { season: 2026, code: "E1-S3-JED", name: "Jeddah Grand Prix", location: "Jeddah", country: "Saudi Arabia", startDate: "2026-01-23", endDate: "2026-01-24" },
  { season: 2026, code: "E1-S3-COMO", name: "Lake Como Grand Prix", location: "Lake Como", country: "Italy", startDate: "2026-04-24", endDate: "2026-04-25" },
  { season: 2026, code: "E1-S3-DUB", name: "Dubrovnik Grand Prix", location: "Dubrovnik", country: "Croatia", startDate: "2026-06-12", endDate: "2026-06-13" },
  { season: 2026, code: "E1-S3-MON", name: "Monaco E-Prix", location: "Monaco", country: "Monaco", startDate: "2026-07-17", endDate: "2026-07-18" },
  { season: 2026, code: "E1-S3-TBC", name: "TBC Grand Prix", location: "TBC", country: "TBC", startDate: "2026-09-10", endDate: "2026-09-11" },
  { season: 2026, code: "E1-S3-LAG", name: "Lagos Grand Prix", location: "Lagos", country: "Nigeria", startDate: "2026-10-03", endDate: "2026-10-04" },
  { season: 2026, code: "E1-S3-MIA", name: "Miami Grand Prix", location: "Miami", country: "United States", startDate: "2026-11-13", endDate: "2026-11-14" },
  { season: 2026, code: "E1-S3-BAH", name: "Bahamas Grand Prix", location: "Nassau", country: "Bahamas", startDate: "2026-11-21", endDate: "2026-11-22" },
];

async function main() {
  const client = await pool.connect();
  try {
    // Get TBR company ID
    const companyRes = await client.query("SELECT id FROM companies WHERE code = 'TBR'::company_code LIMIT 1");
    const companyId = companyRes.rows[0]?.id;
    if (!companyId) { console.error("TBR company not found"); return; }

    let inserted = 0;
    let skipped = 0;

    for (const race of races) {
      const existing = await client.query(
        "SELECT id FROM race_events WHERE company_id = $1 AND code = $2",
        [companyId, race.code]
      );

      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO race_events (company_id, code, name, location, event_start_date, event_end_date, season_year)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [companyId, race.code, race.name, `${race.location}, ${race.country}`, race.startDate, race.endDate, race.season]
      );
      inserted++;
      console.log(`✓ ${race.season} — ${race.name} (${race.location})`);
    }

    console.log(`\nDone: ${inserted} inserted, ${skipped} skipped (already exist)`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
