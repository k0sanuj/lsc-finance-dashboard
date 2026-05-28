#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

const { Pool } = pg;
const MASHAEL_EMAIL = "mashael@teambluerising.com";
const REPORT_SOURCE_ID = "mashael-lake-como-s3-expense-review-v1";
const EXPECTED_USD_TOTAL = 2623.96;

function loadEnv() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function nearlyEqual(a, b, tolerance = 0.01) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

loadEnv();

const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL_ADMIN or DATABASE_URL is required.");
}

const pool = new Pool({ connectionString, max: 1 });

try {
  const client = await pool.connect();
  try {
    const role = await client.query(
      `select enumlabel from pg_enum where enumlabel = 'expense_submitter' and enumtypid = 'app_user_role'::regtype`
    );
    assert(role.rowCount === 1, "expense_submitter role is missing.");

    const user = await client.query(
      `select u.id, u.role::text, u.is_active, ai.is_active as allowlisted
       from app_users u
       join auth_allowed_identities ai on ai.normalized_email = u.normalized_email
       where u.normalized_email = $1`,
      [MASHAEL_EMAIL]
    );
    assert(user.rowCount === 1, "Mashael user is missing.");
    assert(user.rows[0].role === "expense_submitter", "Mashael role must be expense_submitter.");
    assert(user.rows[0].is_active === true, "Mashael app user is not active.");
    assert(user.rows[0].allowlisted === true, "Mashael allowlist identity is not active.");

    const access = await client.query(
      `select id from app_user_feature_access where app_user_id = $1 and feature_key = 'tbr_expense_submitter' and is_active = true`,
      [user.rows[0].id]
    );
    assert(access.rowCount === 1, "Mashael feature access is missing.");

    const submission = await client.query(
      `select id from expense_submissions where report_metadata->>'source_identifier' = $1 limit 1`,
      [REPORT_SOURCE_ID]
    );
    assert(submission.rowCount === 1, "Lake Como expense report submission is missing.");
    const submissionId = submission.rows[0].id;

    const totals = await client.query(
      `select
         count(*)::int as item_count,
         coalesce(sum(original_amount) filter (where original_currency_code = 'EUR'), 0)::numeric(14,2)::text as eur_original_total,
         coalesce(sum(reporting_amount_usd), 0)::numeric(14,2)::text as usd_total,
         coalesce(sum(reporting_amount_usd - approved_amount_usd) filter (where review_status = 'needs_info'), 0)::numeric(14,2)::text as over_cap_usd
       from expense_submission_items
       where submission_id = $1`,
      [submissionId]
    );
    assert(totals.rows[0].item_count === 8, `Expected 8 imported items, got ${totals.rows[0].item_count}.`);
    assert(nearlyEqual(totals.rows[0].usd_total, EXPECTED_USD_TOTAL), `Expected USD ${EXPECTED_USD_TOTAL}, got ${totals.rows[0].usd_total}.`);
    assert(nearlyEqual(totals.rows[0].over_cap_usd, 31.5, 0.02), `Expected over cap near USD 31.49, got ${totals.rows[0].over_cap_usd}.`);

    const currencyRows = await client.query(
      `select array_agg(distinct original_currency_code order by original_currency_code) as currencies
       from expense_submission_items
       where submission_id = $1`,
      [submissionId]
    );
    assert(
      JSON.stringify(currencyRows.rows[0].currencies) === JSON.stringify(["EUR", "SAR", "USD"]),
      `Expected EUR, SAR, and USD original currencies, got ${JSON.stringify(currencyRows.rows[0].currencies)}.`
    );

    const podium = await client.query(
      `select original_currency_code, original_amount::numeric(14,2)::text, reporting_amount_usd::numeric(14,2)::text
       from expense_submission_items
       where submission_id = $1
         and merchant_name = 'Podium bonus'
       limit 1`,
      [submissionId]
    );
    assert(podium.rowCount === 1, "Podium bonus item is missing.");
    assert(podium.rows[0].original_currency_code === "USD", "Podium bonus must be USD, not EUR.");
    assert(nearlyEqual(podium.rows[0].reporting_amount_usd, 2000), `Expected podium bonus USD 2000, got ${podium.rows[0].reporting_amount_usd}.`);

    const review = await client.query(
      `select
         count(*) filter (where review_status = 'pending')::int as pending_count,
         count(*) filter (where review_status = 'approved')::int as approved_count,
         count(*) filter (where review_status = 'review')::int as review_count,
         count(*) filter (where review_status = 'needs_info')::int as needs_info_count
       from expense_submission_items
       where submission_id = $1`,
      [submissionId]
    );
    assert(
      review.rows[0].pending_count + review.rows[0].approved_count === 4,
      "Expected 4 clean pending-or-approved items."
    );
    assert(review.rows[0].review_count === 2, "Expected 2 review items.");
    assert(review.rows[0].needs_info_count === 2, "Expected 2 needs-info items.");

    const findings = await client.query(
      `select count(*)::int as finding_count
       from expense_item_rule_findings erf
       join expense_submission_items esi on esi.id = erf.expense_submission_item_id
       where esi.submission_id = $1
         and erf.finding_status = 'open'`,
      [submissionId]
    );
    assert(findings.rows[0].finding_count >= 4, "Expected open rule findings for flagged/review items.");

    const canonical = await client.query(
      `select count(*)::int as count
       from expenses
       where source_expense_submission_id = $1`,
      [submissionId]
    );
    assert(canonical.rows[0].count === 0, "Seeded report should not post canonical expenses before admin approval.");

    console.log(JSON.stringify({
      ok: true,
      submissionId,
      itemCount: totals.rows[0].item_count,
      eurOriginalTotal: totals.rows[0].eur_original_total,
      podiumBonusCurrency: podium.rows[0].original_currency_code,
      usdTotal: totals.rows[0].usd_total,
      findingCount: findings.rows[0].finding_count
    }, null, 2));
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
