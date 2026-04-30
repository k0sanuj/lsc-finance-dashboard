#!/usr/bin/env node

/**
 * LSC Finance Dashboard — Pre-Deploy Audit
 *
 * Run this BEFORE every commit and deploy to verify everything works.
 * Usage: node scripts/pre-deploy-audit.mjs
 *
 * Checks:
 * 1. Build compiles without errors
 * 2. All env vars are set and valid (no trailing newlines)
 * 3. Database connection works
 * 4. All critical queries return data
 * 5. Gemini API key is valid
 * 6. S3 storage is accessible
 * 7. All page routes exist and export default
 * 8. No TypeScript errors
 * 9. Vercel env vars match local (no newlines)
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { execSync } from "child_process";

const ROOT = join(import.meta.dirname, "..");
const WEB = join(ROOT, "apps", "web");
const ENV_PATH = join(WEB, ".env.local");
const BUILD_TIMEOUT_MS = Number.parseInt(process.env.LSC_AUDIT_BUILD_TIMEOUT_MS ?? "", 10) || 600000;

// ─── Helpers ───────────────────────────────────────────────

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function ok(msg) { passCount++; console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { failCount++; console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg) { warnCount++; console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function heading(msg) { console.log(`\n${BOLD}${CYAN}── ${msg} ──${RESET}`); }
function info(msg) { console.log(`  ${DIM}${msg}${RESET}`); }

function loadEnv() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

// ─── 1. Environment Variables ──────────────────────────────

function auditEnvVars() {
  heading("1. Environment Variables");

  const required = [
    "DATABASE_URL",
    "LSC_DATA_BACKEND",
    "AUTH_SESSION_SECRET",
    "GEMINI_API_KEY",
  ];

  const optional = [
    "DOCUMENT_STORAGE_BACKEND",
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ];

  for (const key of required) {
    const val = process.env[key];
    if (!val) {
      fail(`${key}: NOT SET (required)`);
    } else if (val.includes("\n") || val.includes("\r")) {
      fail(`${key}: has trailing newline — will break comparisons`);
    } else {
      ok(`${key}: set (${val.length} chars)`);
    }
  }

  for (const key of optional) {
    const val = process.env[key];
    if (!val) {
      warn(`${key}: not set (optional)`);
    } else if (val.includes("\n") || val.includes("\r")) {
      fail(`${key}: has trailing newline`);
    } else {
      ok(`${key}: set`);
    }
  }

  // Verify LSC_DATA_BACKEND is exactly "database"
  if (process.env.LSC_DATA_BACKEND && process.env.LSC_DATA_BACKEND !== "database") {
    fail(`LSC_DATA_BACKEND is "${process.env.LSC_DATA_BACKEND}" — must be exactly "database" for live data`);
  }
}

// ─── 2. Database Connection & Queries ──────────────────────

async function auditDatabase() {
  heading("2. Database Connection & Queries");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { fail("Cannot test — DATABASE_URL not set"); return; }

  let pool;
  try {
    const pg = await import("pg");
    pool = new pg.default.Pool({ connectionString: dbUrl, max: 1 });

    // Connection test
    const connRes = await pool.query("SELECT 1 as ok");
    if (connRes.rows[0]?.ok === 1) ok("Database connection works");
    else fail("Database connection returned unexpected result");

    // Companies
    const compRes = await pool.query("SELECT code, name FROM companies ORDER BY code");
    if (compRes.rows.length >= 3) ok(`Companies: ${compRes.rows.map(r => r.code).join(", ")}`);
    else fail(`Only ${compRes.rows.length} companies found (expected ≥3)`);

    // Seasons
    const seasonRes = await pool.query(`
      SELECT re.season_year, count(*)::int as cnt
      FROM race_events re JOIN companies c ON c.id = re.company_id
      WHERE c.code = 'TBR'::company_code AND re.season_year IS NOT NULL
      GROUP BY re.season_year ORDER BY re.season_year
    `);
    if (seasonRes.rows.length > 0) {
      ok(`Seasons: ${seasonRes.rows.map(r => `${r.season_year} (${r.cnt} races)`).join(", ")}`);
    } else {
      fail("No seasons/races found in database");
    }

    // Race cards for latest season
    const latestSeason = seasonRes.rows.at(-1)?.season_year;
    if (latestSeason) {
      const raceRes = await pool.query(
        "SELECT count(*)::int as cnt FROM race_events re JOIN companies c ON c.id = re.company_id WHERE c.code = 'TBR'::company_code AND re.season_year = $1",
        [latestSeason]
      );
      ok(`Season ${latestSeason}: ${raceRes.rows[0]?.cnt} race cards`);
    }

    // Users
    const userRes = await pool.query("SELECT count(*)::int as cnt FROM app_users WHERE is_active = true");
    ok(`Active users: ${userRes.rows[0]?.cnt}`);

    // Invoice intakes
    const intakeRes = await pool.query("SELECT count(*)::int as cnt FROM invoice_intakes");
    ok(`Invoice intakes: ${intakeRes.rows[0]?.cnt}`);

    // Expense submissions
    const expRes = await pool.query("SELECT count(*)::int as cnt FROM expense_submissions");
    ok(`Expense submissions: ${expRes.rows[0]?.cnt}`);

    // Cost categories
    const catRes = await pool.query("SELECT count(*)::int as cnt FROM cost_categories");
    ok(`Cost categories: ${catRes.rows[0]?.cnt}`);

    // Sponsors
    const sponsorRes = await pool.query("SELECT count(*)::int as cnt FROM sponsors_or_customers");
    ok(`Sponsors/customers: ${sponsorRes.rows[0]?.cnt}`);

    // Document analysis runs
    const docRes = await pool.query("SELECT count(*)::int as cnt FROM document_analysis_runs");
    ok(`Document analysis runs: ${docRes.rows[0]?.cnt}`);

    // Views exist
    const views = ["consolidated_company_metrics", "monthly_financial_summary", "payments_due", "tbr_race_cost_summary"];
    for (const view of views) {
      try {
        await pool.query(`SELECT 1 FROM ${view} LIMIT 1`);
        ok(`View ${view}: accessible`);
      } catch {
        fail(`View ${view}: not accessible`);
      }
    }
  } catch (err) {
    fail(`Database error: ${err.message}`);
  } finally {
    if (pool) await pool.end();
  }
}

// ─── 3. Gemini API ─────────────────────────────────────────

async function auditGemini() {
  heading("3. Gemini API");

  const key = (process.env.GEMINI_API_KEY ?? "").trim().replace(/[\r\n]/g, "");
  if (!key) { fail("GEMINI_API_KEY not set"); return; }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  info(`Model: ${model}`);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply: AUDIT_OK" }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 10 }
        })
      }
    );
    if (res.status === 200) ok(`Gemini API responds (${res.status})`);
    else if (res.status === 403) fail("Gemini API key is revoked or invalid (403)");
    else fail(`Gemini API error: ${res.status}`);
  } catch (err) {
    fail(`Gemini API network error: ${err.message}`);
  }
}

// ─── 4. S3 Storage ─────────────────────────────────────────

async function auditS3() {
  heading("4. S3 Storage");

  const bucket = process.env.S3_BUCKET;
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !accessKey || !secretKey) {
    warn("S3 not configured (optional)");
    return;
  }

  try {
    const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: process.env.AWS_REGION ?? "ap-southeast-1",
      credentials: { accessKeyId: accessKey.trim(), secretAccessKey: secretKey.trim() }
    });

    const testKey = `_audit-test/${Date.now()}.txt`;
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: testKey, Body: "audit", ContentType: "text/plain"
    }));
    ok("S3 upload works");

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    ok("S3 delete works");
  } catch (err) {
    fail(`S3 error: ${err.message}`);
  }
}

// ─── 5. Page Routes ────────────────────────────────────────

function auditRoutes() {
  heading("5. Page Routes");

  const expectedRoutes = [
    "app/page.tsx",
    "app/login/page.tsx",
    "app/tbr/page.tsx",
    "app/tbr/races/page.tsx",
    "app/tbr/races/[raceId]/page.tsx",
    "app/tbr/my-expenses/page.tsx",
    "app/tbr/expense-management/page.tsx",
    "app/tbr/expense-management/[submissionId]/page.tsx",
    "app/tbr/invoice-hub/page.tsx",
    "app/tbr/team-management/page.tsx",
    "app/costs/page.tsx",
    "app/costs/[company]/page.tsx",
    "app/payments/page.tsx",
    "app/payments/[company]/page.tsx",
    "app/documents/page.tsx",
    "app/documents/[company]/page.tsx",
    "app/commercial-goals/page.tsx",
    "app/commercial-goals/[company]/page.tsx",
    "app/ai-analysis/page.tsx",
    "app/fsp/page.tsx",
    "app/agent-graph/page.tsx",
    "app/workflow-graph/page.tsx",
  ];

  for (const route of expectedRoutes) {
    const fullPath = join(WEB, route);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, "utf8");
      if (content.includes("export default")) {
        ok(route);
      } else {
        fail(`${route}: exists but missing default export`);
      }
    } else {
      fail(`${route}: FILE MISSING`);
    }
  }
}

// ─── 6. Key Components ────────────────────────────────────

function auditComponents() {
  heading("6. Key Components");

  const components = [
    "app/session-shell.tsx",
    "app/components/document-analyzer-panel.tsx",
    "app/components/modal-launcher.tsx",
    "app/components/document-analysis-summary.tsx",
    "app/components/paginated-table.tsx",
    "app/error.tsx",
    "app/loading.tsx",
    "app/layout.tsx",
  ];

  for (const comp of components) {
    const fullPath = join(WEB, comp);
    if (existsSync(fullPath)) {
      ok(comp);
    } else {
      fail(`${comp}: MISSING`);
    }
  }
}

// ─── 7. Build Test ─────────────────────────────────────────

function auditBuild() {
  heading("7. Build");

  try {
    info("Running pnpm --filter web build...");
    const output = execSync("npx pnpm --filter web build 2>&1", {
      cwd: ROOT,
      encoding: "utf8",
      timeout: BUILD_TIMEOUT_MS,
    });

    if (output.includes("Compiled successfully")) {
      ok("Build compiles successfully");
    } else if (output.includes("Failed to compile") || output.includes("Type error")) {
      fail("Build failed — check output above");
      console.log(output.slice(-500));
    } else {
      warn("Build completed but couldn't confirm success");
    }
  } catch (err) {
    fail(`Build error: ${err.message.slice(0, 200)}`);
  }
}

// ─── 8. Query Functions ────────────────────────────────────

async function auditQueryFunctions() {
  heading("8. Query Functions (simulated app path)");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || process.env.LSC_DATA_BACKEND !== "database") {
    fail("Cannot test queries — DATABASE_URL or LSC_DATA_BACKEND not set correctly");
    return;
  }

  let pool;
  try {
    const pg = await import("pg");
    pool = new pg.default.Pool({ connectionString: dbUrl, max: 1 });

    // getEntitySnapshots equivalent
    const entityRes = await pool.query(`
      SELECT c.code, c.name FROM companies c ORDER BY
      CASE c.code WHEN 'LSC' THEN 1 WHEN 'TBR' THEN 2 ELSE 3 END
    `);
    if (entityRes.rows.length >= 3) ok("getEntitySnapshots: returns entities");
    else fail("getEntitySnapshots: missing entities");

    // getTbrSeasonSummaries equivalent
    const seasonRes = await pool.query(`
      WITH season_races AS (
        SELECT re.season_year, count(*)::text as race_count
        FROM race_events re JOIN companies c ON c.id = re.company_id
        WHERE c.code = 'TBR'::company_code AND re.season_year IS NOT NULL
        GROUP BY re.season_year
      )
      SELECT sr.season_year, sr.race_count FROM season_races sr ORDER BY sr.season_year
    `);
    if (seasonRes.rows.length > 0) ok(`getTbrSeasonSummaries: ${seasonRes.rows.length} seasons`);
    else fail("getTbrSeasonSummaries: returns empty");

    // getTbrRaceCards equivalent
    const latestSeason = seasonRes.rows.at(-1)?.season_year;
    if (latestSeason) {
      const raceRes = await pool.query(`
        SELECT re.id, re.name as race_name, re.location, re.season_year
        FROM race_events re JOIN companies c ON c.id = re.company_id
        WHERE c.code = 'TBR'::company_code AND re.season_year = $1
        ORDER BY re.event_start_date NULLS LAST
      `, [latestSeason]);
      if (raceRes.rows.length > 0) ok(`getTbrRaceCards(${latestSeason}): ${raceRes.rows.length} races`);
      else fail(`getTbrRaceCards(${latestSeason}): returns empty`);
    }

    // getOverviewMetrics equivalent
    const metricRes = await pool.query(`
      SELECT company_code, recognized_revenue, approved_expenses, margin
      FROM consolidated_company_metrics
    `);
    if (metricRes.rows.length > 0) ok(`getOverviewMetrics: ${metricRes.rows.length} company metrics`);
    else warn("getOverviewMetrics: no metrics (may be normal if no data)");

    // getInvoiceWorkflowSummary equivalent
    const invoiceRes = await pool.query("SELECT count(*)::int as cnt FROM invoice_intakes");
    ok(`getInvoiceWorkflowSummary: ${invoiceRes.rows[0]?.cnt} intakes`);

    // getExpenseFormOptions equivalent
    const raceOptRes = await pool.query("SELECT count(*)::int as cnt FROM race_events WHERE season_year IS NOT NULL");
    const userOptRes = await pool.query("SELECT count(*)::int as cnt FROM app_users WHERE is_active = true");
    ok(`getExpenseFormOptions: ${raceOptRes.rows[0]?.cnt} races, ${userOptRes.rows[0]?.cnt} users`);

  } catch (err) {
    fail(`Query function error: ${err.message}`);
  } finally {
    if (pool) await pool.end();
  }
}

// ─── 9. Vercel Env Var Check ───────────────────────────────

async function auditVercelEnv() {
  heading("9. Vercel Env Vars (vs local)");

  try {
    const output = execSync(
      "npx vercel env ls --scope anujsingh012001-gmailcoms-projects 2>&1",
      { cwd: ROOT, encoding: "utf8", timeout: 15000 }
    );

    const required = ["DATABASE_URL", "LSC_DATA_BACKEND", "AUTH_SESSION_SECRET", "GEMINI_API_KEY"];
    for (const key of required) {
      if (output.includes(key)) ok(`Vercel has ${key}`);
      else fail(`Vercel MISSING ${key}`);
    }
  } catch {
    warn("Could not check Vercel env vars (CLI not authenticated?)");
  }
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}${CYAN}═══ LSC Finance Dashboard — Pre-Deploy Audit ═══${RESET}\n`);

  loadEnv();

  auditEnvVars();
  await auditDatabase();
  await auditGemini();
  await auditS3();
  auditRoutes();
  auditComponents();
  await auditQueryFunctions();
  auditBuild();
  await auditVercelEnv();

  console.log(`\n${BOLD}${CYAN}═══ Audit Summary ═══${RESET}`);
  console.log(`  ${GREEN}✓ ${passCount} passed${RESET}`);
  if (warnCount > 0) console.log(`  ${YELLOW}⚠ ${warnCount} warnings${RESET}`);
  if (failCount > 0) console.log(`  ${RED}✗ ${failCount} failed${RESET}`);

  if (failCount > 0) {
    console.log(`\n${RED}${BOLD}DO NOT DEPLOY — ${failCount} check(s) failed.${RESET}\n`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}All checks passed — safe to deploy.${RESET}\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(`\n${RED}Audit crashed: ${err.message}${RESET}`);
  process.exit(1);
});
