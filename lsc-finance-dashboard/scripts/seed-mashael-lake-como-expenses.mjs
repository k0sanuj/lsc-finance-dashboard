#!/usr/bin/env node

import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const SCRYPT_KEY_LENGTH = 64;
const WORKBOOK_PATH =
  "/Users/anujsingh/Downloads/Mashael expenses S2 Lake Como/TBR_Mashael_Expense_Review_LakeComo_S3.xlsx";
const MASHAEL_EMAIL = "mashael@teambluerising.com";
const REPORT_SOURCE_ID = "mashael-lake-como-s3-expense-review-v1";
const EUR_TO_USD = 1.1642;

function loadEnv() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

function generatePassword() {
  return [
    "Mashael",
    randomBytes(4).toString("hex"),
    randomBytes(3).toString("base64url"),
    "S3!"
  ].join("-");
}

function previewDataUrl(text) {
  return `data:text/plain;base64,${Buffer.from(text, "utf8").toString("base64")}`;
}

const categories = [
  { code: "MEALS_ENTERTAINMENT", name: "Meals and Entertainment" },
  { code: "OTHER", name: "Other" },
  { code: "UNCATEGORIZED", name: "Uncategorized" }
];

const tags = [
  { key: "lake_como_s3", label: "Lake Como S3", description: "Season 3 Lake Como race support" },
  { key: "transport", label: "Transport", description: "Taxi, Uber, and airport transfers" },
  { key: "meal_allowance", label: "Meal Allowance", description: "Race travel food allowance" },
  { key: "podium_bonus", label: "Podium Bonus", description: "Race performance bonus" }
];

const workspaceRules = [
  { key: "receipt_required", label: "Receipt required", severity: "blocker" },
  { key: "receipt_explanation", label: "No-receipt explanation required", severity: "warning" },
  { key: "tag_required", label: "Tag required", severity: "warning" },
  { key: "category_required", label: "Category required", severity: "blocker" },
  { key: "fx_required", label: "FX rate required for non-USD items", severity: "blocker" },
  { key: "duplicate_check", label: "Duplicate receipt check", severity: "warning" }
];

const expenseLines = [
  {
    key: "uber-arrival-hotel",
    date: "2026-05-24",
    merchant: "Uber from airport to Lake Como hotel arrival",
    categoryCode: "OTHER",
    tagKeys: ["lake_como_s3", "transport"],
    originalCurrency: "EUR",
    originalAmount: 150,
    reportingUsd: 174.63,
    reviewStatus: "review",
    receiptStatus: "attached",
    noReceiptReason: null,
    description: "Arrival transfer for E1 Series Season 3 Lake Como.",
    sourceDocumentName: "Lake Como arrival Uber receipt",
    finding: "Transport transfer requires finance review against race travel policy."
  },
  {
    key: "uber-home-airport",
    date: "2026-05-24",
    merchant: "Uber from home to airport",
    categoryCode: "OTHER",
    tagKeys: ["lake_como_s3", "transport"],
    originalCurrency: "SAR",
    originalAmount: 133.98,
    reportingUsd: 35.85,
    reviewStatus: "pending",
    receiptStatus: "attached",
    noReceiptReason: null,
    description: "Home to airport transfer.",
    sourceDocumentName: "Home to airport Uber receipt"
  },
  {
    key: "podium-bonus",
    date: "2026-05-24",
    merchant: "Podium bonus",
    categoryCode: "UNCATEGORIZED",
    tagKeys: ["lake_como_s3", "podium_bonus"],
    originalCurrency: "EUR",
    originalAmount: 2000,
    reportingUsd: 2328.39,
    reviewStatus: "pending",
    receiptStatus: "missing_with_reason",
    noReceiptReason: "Performance bonus with no vendor receipt; support note comes from Mashael workbook.",
    description: "Lake Como podium bonus.",
    sourceDocumentName: null
  },
  {
    key: "food-arrival",
    date: "2026-05-24",
    merchant: "Travel day Food allowance arrival day",
    categoryCode: "MEALS_ENTERTAINMENT",
    tagKeys: ["lake_como_s3", "meal_allowance"],
    originalCurrency: "EUR",
    originalAmount: 35,
    reportingUsd: 40.75,
    approvedUsd: 25,
    reviewStatus: "needs_info",
    receiptStatus: "missing_with_reason",
    noReceiptReason: "Travel day allowance, no receipt provided.",
    description: "Arrival travel day food allowance. Workbook cap is USD 25/day.",
    sourceDocumentName: null,
    finding: "Food allowance is USD 15.75 over the USD 25 transit food cap."
  },
  {
    key: "car-service-riyadh-home",
    date: "2026-05-24",
    merchant: "Car service from Riyadh airport to home",
    categoryCode: "OTHER",
    tagKeys: ["lake_como_s3", "transport"],
    originalCurrency: "SAR",
    originalAmount: 110,
    reportingUsd: 29.43,
    reviewStatus: "pending",
    receiptStatus: "attached",
    noReceiptReason: null,
    description: "Airport to home transfer.",
    sourceDocumentName: "Riyadh airport car service receipt"
  },
  {
    key: "food-departure",
    date: "2026-05-24",
    merchant: "Travel day 2Food allowance departure day",
    categoryCode: "UNCATEGORIZED",
    tagKeys: ["lake_como_s3", "meal_allowance"],
    originalCurrency: "EUR",
    originalAmount: 35,
    reportingUsd: 40.75,
    approvedUsd: 25,
    reviewStatus: "needs_info",
    receiptStatus: "missing_with_reason",
    noReceiptReason: "Travel day allowance, no receipt provided.",
    description: "Departure travel day food allowance. Workbook cap is USD 25/day.",
    sourceDocumentName: null,
    finding: "Food allowance is USD 15.75 over the USD 25 transit food cap."
  },
  {
    key: "uber-lake-como-airport",
    date: "2026-05-24",
    merchant: "Uber from Lake Como to airport",
    categoryCode: "OTHER",
    tagKeys: ["lake_como_s3", "transport"],
    originalCurrency: "EUR",
    originalAmount: 186,
    reportingUsd: 216.54,
    reviewStatus: "review",
    receiptStatus: "attached",
    noReceiptReason: null,
    description: "Departure transfer from Lake Como to airport.",
    sourceDocumentName: "Lake Como departure Uber receipt",
    finding: "Transport transfer requires finance review against race travel policy."
  },
  {
    key: "uber-dunk-test",
    date: "2026-05-24",
    merchant: "Uber to Dunk test",
    categoryCode: "OTHER",
    tagKeys: ["lake_como_s3", "transport"],
    originalCurrency: "EUR",
    originalAmount: 73.88,
    reportingUsd: 86.01,
    reviewStatus: "pending",
    receiptStatus: "attached",
    noReceiptReason: null,
    description: "Transport to dunk test.",
    sourceDocumentName: "Uber to dunk test receipt"
  }
];

loadEnv();

const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL_ADMIN or DATABASE_URL is required.");
}

const client = new Client({ connectionString });
const temporaryPassword = generatePassword();

try {
  await client.connect();
  await client.query("begin");

  const company = await client.query(`select id from companies where code = 'TBR'::company_code limit 1`);
  const companyId = company.rows[0]?.id;
  if (!companyId) throw new Error("TBR company is missing.");

  const admin = await client.query(
    `select id from app_users where is_active = true and role in ('super_admin', 'finance_admin') order by role = 'super_admin' desc limit 1`
  );
  const adminId = admin.rows[0]?.id ?? null;

  const race = await client.query(
    `insert into race_events (company_id, code, name, location, event_start_date, event_end_date, season_year)
     values ($1, 'E1-S3-COMO', 'Lake Como Grand Prix', 'Lake Como, Italy', '2026-04-24', '2026-04-25', 2026)
     on conflict (company_id, code) do update
       set name = excluded.name,
           location = excluded.location,
           event_start_date = excluded.event_start_date,
           event_end_date = excluded.event_end_date,
           season_year = excluded.season_year,
           updated_at = now()
     returning id`,
    [companyId]
  );
  const raceId = race.rows[0].id;

  const team = await client.query(
    `insert into app_teams (company_id, team_code, team_name, description)
     values ($1, 'TBR_EXPENSES', 'TBR Expense Submitters', 'Restricted external race expense submitters')
     on conflict (company_id, team_code) do update
       set team_name = excluded.team_name,
           description = excluded.description,
           updated_at = now()
     returning id`,
    [companyId]
  );
  const teamId = team.rows[0].id;

  const categoryIds = new Map();
  for (const category of categories) {
    const categoryResult = await client.query(
      `insert into cost_categories (company_id, code, name, category_scope)
       values ($1, $2, $3, 'expense_review')
       on conflict (company_id, code) do update
         set name = excluded.name,
             category_scope = excluded.category_scope,
             updated_at = now()
       returning id`,
      [companyId, category.code, category.name]
    );
    categoryIds.set(category.code, categoryResult.rows[0].id);
  }

  const tagIds = new Map();
  for (const tag of tags) {
    const tagResult = await client.query(
      `insert into expense_tags (company_id, tag_key, tag_label, tag_description, created_by_user_id, updated_by_user_id)
       values ($1, $2, $3, $4, $5, $5)
       on conflict (company_id, tag_key) do update
         set tag_label = excluded.tag_label,
             tag_description = excluded.tag_description,
             is_active = true,
             updated_by_user_id = excluded.updated_by_user_id,
             updated_at = now()
       returning id`,
      [companyId, tag.key, tag.label, tag.description, adminId]
    );
    tagIds.set(tag.key, tagResult.rows[0].id);
  }

  for (const rule of workspaceRules) {
    await client.query(
      `insert into expense_workspace_rules (company_id, rule_key, rule_label, severity, is_active, created_by_user_id, updated_by_user_id)
       values ($1, $2, $3, $4, true, $5, $5)
       on conflict (company_id, rule_key) do update
         set rule_label = excluded.rule_label,
             severity = excluded.severity,
             is_active = true,
             updated_by_user_id = excluded.updated_by_user_id,
             updated_at = now()`,
      [companyId, rule.key, rule.label, rule.severity, adminId]
    );
  }

  for (const [categoryCode, amount] of [
    ["MEALS_ENTERTAINMENT", 25],
    ["OTHER", 200],
    ["UNCATEGORIZED", 25]
  ]) {
    await client.query(
      `insert into race_budget_rules (
         race_event_id,
         cost_category_id,
         rule_kind,
         unit_label,
         rule_label,
         approved_amount_usd,
         close_threshold_ratio,
         notes,
         created_by_user_id,
         updated_by_user_id
       )
       values ($1, $2, 'budget_cap', 'per_race', $3, $4, 0.9, $5, $6, $6)
       on conflict (race_event_id, cost_category_id, rule_kind) do update
         set unit_label = excluded.unit_label,
             rule_label = excluded.rule_label,
             approved_amount_usd = excluded.approved_amount_usd,
             close_threshold_ratio = excluded.close_threshold_ratio,
             notes = excluded.notes,
             updated_by_user_id = excluded.updated_by_user_id,
             updated_at = now()`,
      [
        raceId,
        categoryIds.get(categoryCode),
        categoryCode === "MEALS_ENTERTAINMENT" ? "Transit food allowance cap" : `${categoryCode.replace(/_/g, " ")} review cap`,
        amount,
        categoryCode === "MEALS_ENTERTAINMENT"
          ? "Lake Como seed: USD 25 transit food cap, breakfast cap EUR 20/day, E1 catering windows should flag covered meal claims."
          : "Lake Como seed review cap from Mashael expense workbook.",
        adminId
      ]
    );
  }

  const user = await client.query(
    `insert into app_users (full_name, email, normalized_email, role, password_hash, is_active, metadata)
     values ($1, $2, $3, 'expense_submitter', $4, true, $5::jsonb)
     on conflict (normalized_email) do update
       set full_name = excluded.full_name,
           email = excluded.email,
           role = 'expense_submitter',
           password_hash = excluded.password_hash,
           is_active = true,
           updated_at = now(),
           metadata = app_users.metadata || excluded.metadata
     returning id`,
    [
      "Mashael",
      MASHAEL_EMAIL,
      normalizeEmail(MASHAEL_EMAIL),
      hashPassword(temporaryPassword),
      JSON.stringify({
        auth_source: "mashael_lake_como_seed",
        temporary_password_seeded_at: new Date().toISOString()
      })
    ]
  );
  const userId = user.rows[0].id;

  await client.query(
    `insert into auth_allowed_identities (normalized_email, email, full_name, role, is_active, metadata)
     values ($1, $2, $3, 'expense_submitter', true, $4::jsonb)
     on conflict (normalized_email) do update
       set email = excluded.email,
           full_name = excluded.full_name,
           role = 'expense_submitter',
           is_active = true,
           updated_at = now(),
           metadata = auth_allowed_identities.metadata || excluded.metadata`,
    [
      normalizeEmail(MASHAEL_EMAIL),
      MASHAEL_EMAIL,
      "Mashael",
      JSON.stringify({ source: "mashael_lake_como_seed" })
    ]
  );
  await client.query(
    `insert into app_user_company_access (app_user_id, company_id, access_role, is_primary)
     values ($1, $2, 'expense_submitter', true)
     on conflict (app_user_id, company_id) do update
       set access_role = 'expense_submitter',
           is_primary = true`,
    [userId, companyId]
  );
  await client.query(
    `insert into app_user_feature_access (app_user_id, feature_key, company_id, metadata, is_active)
     values ($1, 'tbr_expense_submitter', $2, $3::jsonb, true)
     on conflict (app_user_id, feature_key, company_id) do update
       set metadata = excluded.metadata,
           is_active = true,
           updated_at = now()`,
    [userId, companyId, JSON.stringify({ allowed_routes: ["/tbr/my-expenses"] })]
  );
  await client.query(
    `insert into team_memberships (team_id, app_user_id, membership_role)
     values ($1, $2, 'member')
     on conflict (team_id, app_user_id) do nothing`,
    [teamId, userId]
  );

  const allowlistCount = await client.query(
    `select count(*)::int as count from auth_allowed_identities where is_active = true`
  );
  if (allowlistCount.rows[0]?.count > 3) {
    throw new Error(
      `Active auth allowlist would contain ${allowlistCount.rows[0].count} users. Deactivate an unused account before adding Mashael.`
    );
  }

  const sourceDocument = await client.query(
    `insert into source_documents (
       company_id,
       document_type,
       source_system,
       source_identifier,
       source_name,
       source_url,
       metadata
     )
     values ($1, 'expense_report', 'local_xlsx', $2, $3, $4, $5::jsonb)
     on conflict (source_system, source_identifier) do update
       set source_name = excluded.source_name,
           source_url = excluded.source_url,
           metadata = excluded.metadata,
           updated_at = now()
     returning id`,
    [
      companyId,
      REPORT_SOURCE_ID,
      "TBR_Mashael_Expense_Review_LakeComo_S3.xlsx :: Expense Review",
      WORKBOOK_PATH,
      JSON.stringify({
        workbook_path: WORKBOOK_PATH,
        report_id: "R00WXk2K04pj",
        event: "E1 Series Season 3, Race #2 | Lake Como, 24-25 April 2026",
        totals: {
          eur: 2535.95,
          usd: 2952.35,
          over_cap_usd: 31.49
        },
        assumptions: {
          eur_to_usd: EUR_TO_USD,
          transit_food_cap_usd_per_day: 25,
          breakfast_cap_eur_per_day: 20
        },
        preview_data_url: previewDataUrl("Mashael Lake Como S3 expense review workbook source."),
        preview_mime_type: "text/plain"
      })
    ]
  );
  const sourceDocumentId = sourceDocument.rows[0].id;

  const importBatch = await client.query(
    `insert into import_batches (company_id, source_system, source_name, status, metadata)
     values ($1, 'local_xlsx', 'Mashael Lake Como S3 expense review', 'completed', $2::jsonb)
     returning id`,
    [
      companyId,
      JSON.stringify({
        workbook_path: WORKBOOK_PATH,
        source_document_id: sourceDocumentId,
        seeded_total_rows: expenseLines.length
      })
    ]
  );
  const importBatchId = importBatch.rows[0].id;

  const existingSubmission = await client.query(
    `select id from expense_submissions where report_metadata->>'source_identifier' = $1 limit 1`,
    [REPORT_SOURCE_ID]
  );
  const submission = existingSubmission.rows[0]
    ? await client.query(
        `update expense_submissions
         set company_id = $2,
             race_event_id = $3,
             submitted_by_user_id = $4,
             submission_status = 'submitted',
             submission_title = 'Expense Report 2026-05-24',
             operator_note = $5,
             submitted_at = '2026-05-24T12:00:00Z',
             report_metadata = $6::jsonb,
             updated_at = now()
         where id = $1
         returning id`,
        [
          existingSubmission.rows[0].id,
          companyId,
          raceId,
          userId,
          "Seeded from Mashael Lake Como S3 workbook. Admin review still required.",
          JSON.stringify({
            source_identifier: REPORT_SOURCE_ID,
            source_document_id: sourceDocumentId,
            import_batch_id: importBatchId,
            expected_totals: { eur: 2535.95, usd: 2952.35, over_cap_usd: 31.49 },
            reviewed_on: "2026-05-28"
          })
        ]
      )
    : await client.query(
        `insert into expense_submissions (
           company_id,
           race_event_id,
           submitted_by_user_id,
           submission_status,
           submission_title,
           operator_note,
           submitted_at,
           report_metadata
         )
         values ($1, $2, $3, 'submitted', 'Expense Report 2026-05-24', $4, '2026-05-24T12:00:00Z', $5::jsonb)
         returning id`,
        [
          companyId,
          raceId,
          userId,
          "Seeded from Mashael Lake Como S3 workbook. Admin review still required.",
          JSON.stringify({
            source_identifier: REPORT_SOURCE_ID,
            source_document_id: sourceDocumentId,
            import_batch_id: importBatchId,
            expected_totals: { eur: 2535.95, usd: 2952.35, over_cap_usd: 31.49 },
            reviewed_on: "2026-05-28"
          })
        ]
      );
  const submissionId = submission.rows[0].id;

  await client.query(`delete from expense_submission_items where submission_id = $1`, [submissionId]);

  for (const line of expenseLines) {
    const lineSourceDocument = line.sourceDocumentName
      ? await client.query(
          `insert into source_documents (
             company_id,
             document_type,
             source_system,
             source_identifier,
             source_name,
             source_url,
             metadata
           )
           values ($1, 'manual_upload', 'mashael_lake_como_seed', $2, $3, $4, $5::jsonb)
           on conflict (source_system, source_identifier) do update
             set source_name = excluded.source_name,
                 source_url = excluded.source_url,
                 metadata = excluded.metadata,
                 updated_at = now()
           returning id`,
          [
            companyId,
            `${REPORT_SOURCE_ID}:${line.key}`,
            line.sourceDocumentName,
            WORKBOOK_PATH,
            JSON.stringify({
              source_report_document_id: sourceDocumentId,
              preview_data_url: previewDataUrl(`${line.sourceDocumentName}\n\nSeeded source placeholder from workbook row ${line.key}.`),
              preview_mime_type: "text/plain"
            })
          ]
        )
      : null;
    const sourceId = lineSourceDocument?.rows[0]?.id ?? null;
    const fxRate = Number((line.reportingUsd / line.originalAmount).toFixed(6));
    const item = await client.query(
      `insert into expense_submission_items (
         submission_id,
         source_document_id,
         cost_category_id,
         team_id,
         merchant_name,
         expense_date,
         currency_code,
         amount,
         original_currency_code,
         original_amount,
         fx_rate_to_usd,
         fx_source,
         reporting_currency_code,
         reporting_amount_usd,
         approved_amount_usd,
         review_status,
         receipt_status,
         no_receipt_reason,
         description,
         split_method,
         split_count,
         ai_summary,
         rule_summary
       )
       values (
         $1, $2, $3, $4, $5, $6, 'USD', $7, $8, $9, $10,
         'mashael_lake_como_workbook', 'USD', $7, $11,
         $12::expense_item_review_status, $13, $14, $15, 'solo', 1,
         $16::jsonb, $17::jsonb
       )
       returning id`,
      [
        submissionId,
        sourceId,
        categoryIds.get(line.categoryCode),
        teamId,
        line.merchant,
        line.date,
        line.reportingUsd,
        line.originalCurrency,
        line.originalAmount,
        fxRate,
        line.approvedUsd ?? line.reportingUsd,
        line.reviewStatus,
        line.receiptStatus,
        line.noReceiptReason,
        line.description,
        JSON.stringify({
          source: "mashael_lake_como_workbook",
          workbookStatus: line.reviewStatus,
          sourceKey: line.key
        }),
        JSON.stringify({
          workbookFinding: line.finding ?? null,
          seededFromWorkbook: true
        })
      ]
    );
    const itemId = item.rows[0].id;

    await client.query(
      `insert into expense_item_splits (expense_submission_item_id, app_user_id, split_label, split_percentage, split_amount)
       values ($1, $2, 'Mashael', 100, $3)`,
      [itemId, userId, line.reportingUsd]
    );

    for (const tagKey of line.tagKeys) {
      await client.query(
        `insert into expense_submission_item_tags (expense_submission_item_id, expense_tag_id)
         values ($1, $2)
         on conflict do nothing`,
        [itemId, tagIds.get(tagKey)]
      );
    }

    if (line.finding) {
      await client.query(
        `insert into expense_item_rule_findings (
           expense_submission_item_id,
           race_budget_rule_id,
           rule_key,
           severity,
           suggested_review_status,
           suggested_approved_amount_usd,
           message,
           metadata
         )
         select $1, rbr.id, $2, $3, $4::expense_item_review_status, $5, $6, $7::jsonb
         from race_budget_rules rbr
         where rbr.race_event_id = $8
           and rbr.cost_category_id = $9
         limit 1`,
        [
          itemId,
          line.approvedUsd ? "race_budget_over_cap" : "race_budget_review",
          line.approvedUsd ? "warning" : "info",
          line.reviewStatus,
          line.approvedUsd ?? null,
          line.finding,
          JSON.stringify({ source: "mashael_lake_como_workbook" }),
          raceId,
          categoryIds.get(line.categoryCode)
        ]
      );
    }

    await client.query(
      `insert into raw_import_rows (
         import_batch_id,
         source_document_id,
         source_row_key,
         payload,
         canonical_target_table,
         canonical_target_id
       )
       values ($1, $2, $3, $4::jsonb, 'expense_submission_items', $5)
       on conflict (import_batch_id, source_row_key) do update
         set payload = excluded.payload,
             canonical_target_table = excluded.canonical_target_table,
             canonical_target_id = excluded.canonical_target_id`,
      [
        importBatchId,
        sourceDocumentId,
        line.key,
        JSON.stringify(line),
        itemId
      ]
    );
  }

  await client.query(
    `insert into auth_access_events (app_user_id, event_type, event_status, metadata)
     values ($1, 'expense_submitter_seed', 'active', $2::jsonb)`,
    [
      userId,
      JSON.stringify({
        source_identifier: REPORT_SOURCE_ID,
        report_submission_id: submissionId
      })
    ]
  );

  await client.query("commit");
  console.log(JSON.stringify({
    ok: true,
    email: MASHAEL_EMAIL,
    temporaryPassword,
    reportSubmissionId: submissionId,
    workbookPath: WORKBOOK_PATH,
    expectedTotals: {
      eur: 2535.95,
      usd: 2952.35,
      overCapUsd: 31.49
    }
  }, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // Ignore rollback failure and preserve the main error.
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
