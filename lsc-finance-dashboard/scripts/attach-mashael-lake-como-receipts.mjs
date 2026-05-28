#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const REPORT_SOURCE_ID = "mashael-lake-como-s3-expense-review-v1";
const RECEIPT_DIR = "/Users/anujsingh/Downloads/TBR improvments ";
const PODIUM_BONUS_USD = 2000;

const RECEIPTS = [
  {
    lineKey: "uber-arrival-hotel",
    fileName: "w_ac7daae3855558c65bde4544a859c76617bb2a6b.jpg",
    sourceName: "Lake Como arrival Uber receipt"
  },
  {
    lineKey: "uber-home-airport",
    fileName: "w_02bf34cd54e1677662c45a452b4dd5fcd0a58e98.jpg",
    sourceName: "Home to airport Uber receipt"
  },
  {
    lineKey: "car-service-riyadh-home",
    fileName: "w_98c03503ec0adab79492a7414e5f64ba60ae976c.jpg",
    sourceName: "Riyadh airport car service receipt"
  },
  {
    lineKey: "uber-lake-como-airport",
    fileName: "w_88b593463bbe2e1e4200874cfd3a37cde61d7fe0.jpg",
    sourceName: "Lake Como departure Uber receipt"
  },
  {
    lineKey: "uber-dunk-test",
    fileName: "w_a86df0e14f73bb2ab823b5834ada4058d6720d3b.jpg",
    sourceName: "Uber to dunk test receipt"
  }
];

function loadEnv() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}

function imageMetadata(filePath) {
  const bytes = readFileSync(filePath);
  return {
    preview_data_url: `data:image/jpeg;base64,${bytes.toString("base64")}`,
    preview_mime_type: "image/jpeg",
    receipt_file_name: path.basename(filePath),
    receipt_file_path: filePath,
    receipt_file_sha256: createHash("sha256").update(bytes).digest("hex"),
    receipt_file_size: bytes.byteLength,
    attached_from_user_upload: true,
    attached_at: new Date().toISOString()
  };
}

async function audit(client, { entityType, entityId, action, beforeState, afterState }) {
  await client.query(
    `insert into audit_log (
       entity_type,
       entity_id,
       trigger,
       action,
       before_state,
       after_state,
       cascade_result,
       agent_id
     )
     values ($1, $2, 'user_requested_receipt_attachment', $3, $4::jsonb, $5::jsonb, $6::jsonb, 'codex')`,
    [
      entityType,
      entityId,
      action,
      JSON.stringify(beforeState ?? null),
      JSON.stringify(afterState ?? null),
      JSON.stringify({ status: "completed", live_view_refresh: "skipped_live_view" })
    ]
  );
}

loadEnv();

const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL_ADMIN or DATABASE_URL is required.");
}

const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query("begin");

  const submissionResult = await client.query(
    `select id, report_metadata
     from expense_submissions
     where report_metadata->>'source_identifier' = $1
     limit 1
     for update`,
    [REPORT_SOURCE_ID]
  );
  const submission = submissionResult.rows[0];
  if (!submission) {
    throw new Error(`Expense submission for ${REPORT_SOURCE_ID} was not found.`);
  }

  for (const receipt of RECEIPTS) {
    const filePath = path.join(RECEIPT_DIR, receipt.fileName);
    if (!existsSync(filePath)) {
      throw new Error(`Receipt file not found: ${filePath}`);
    }

    const sourceIdentifier = `${REPORT_SOURCE_ID}:${receipt.lineKey}`;
    const current = await client.query(
      `select id, source_name, source_url, metadata
       from source_documents
       where source_system = 'mashael_lake_como_seed'
         and source_identifier = $1
       limit 1
       for update`,
      [sourceIdentifier]
    );
    const row = current.rows[0];
    if (!row) {
      throw new Error(`Source document not found for ${sourceIdentifier}`);
    }

    const nextMetadata = {
      ...(row.metadata ?? {}),
      ...imageMetadata(filePath),
      source_report_document_id: row.metadata?.source_report_document_id ?? submission.report_metadata?.source_document_id ?? null
    };

    await client.query(
      `update source_documents
       set source_name = $2,
           source_url = $3,
           metadata = $4::jsonb,
           updated_at = now()
       where id = $1`,
      [row.id, receipt.sourceName, filePath, JSON.stringify(nextMetadata)]
    );

    await audit(client, {
      entityType: "source_document",
      entityId: row.id,
      action: "attach_receipt_image",
      beforeState: { source_name: row.source_name, source_url: row.source_url, metadata: row.metadata },
      afterState: { source_name: receipt.sourceName, source_url: filePath, metadata: nextMetadata }
    });
  }

  const podiumResult = await client.query(
    `select esi.*
     from expense_submission_items esi
     where esi.submission_id = $1
       and esi.merchant_name = 'Podium bonus'
     limit 1
     for update`,
    [submission.id]
  );
  const podium = podiumResult.rows[0];
  if (!podium) {
    throw new Error("Podium bonus expense item was not found.");
  }

  const nextAiSummary = {
    ...(podium.ai_summary ?? {}),
    currencyCorrection: "User confirmed podium bonus is USD 2,000, not EUR 2,000."
  };
  const nextRuleSummary = {
    ...(podium.rule_summary ?? {}),
    correctedOriginalCurrency: "USD",
    correctedReportingAmountUsd: PODIUM_BONUS_USD
  };

  await client.query(
    `update expense_submission_items
     set currency_code = 'USD',
         amount = $2,
         original_currency_code = 'USD',
         original_amount = $2,
         fx_rate_to_usd = 1,
         fx_source = 'user_confirmed_usd_podium_bonus',
         reporting_currency_code = 'USD',
         reporting_amount_usd = $2,
         approved_amount_usd = $2,
         ai_summary = $3::jsonb,
         rule_summary = $4::jsonb,
         updated_at = now()
     where id = $1`,
    [podium.id, PODIUM_BONUS_USD, JSON.stringify(nextAiSummary), JSON.stringify(nextRuleSummary)]
  );

  await client.query(
    `update expense_item_splits
     set split_amount = $2
     where expense_submission_item_id = $1`,
    [podium.id, PODIUM_BONUS_USD]
  );

  await client.query(
    `update raw_import_rows
     set payload = payload || $3::jsonb
     where canonical_target_table = 'expense_submission_items'
       and canonical_target_id = $1
       and source_row_key = $2`,
    [
      podium.id,
      "podium-bonus",
      JSON.stringify({
        originalCurrency: "USD",
        originalAmount: PODIUM_BONUS_USD,
        reportingUsd: PODIUM_BONUS_USD,
        userCorrection: "Podium bonus confirmed as USD, not EUR."
      })
    ]
  );

  await audit(client, {
    entityType: "expense_submission_item",
    entityId: podium.id,
    action: "correct_podium_bonus_currency",
    beforeState: {
      currency_code: podium.currency_code,
      amount: podium.amount,
      original_currency_code: podium.original_currency_code,
      original_amount: podium.original_amount,
      fx_rate_to_usd: podium.fx_rate_to_usd,
      reporting_amount_usd: podium.reporting_amount_usd,
      approved_amount_usd: podium.approved_amount_usd
    },
    afterState: {
      currency_code: "USD",
      amount: PODIUM_BONUS_USD,
      original_currency_code: "USD",
      original_amount: PODIUM_BONUS_USD,
      fx_rate_to_usd: 1,
      reporting_amount_usd: PODIUM_BONUS_USD,
      approved_amount_usd: PODIUM_BONUS_USD
    }
  });

  const totals = await client.query(
    `select
       coalesce(sum(reporting_amount_usd), 0)::numeric(14,2)::text as usd_total,
       coalesce(sum(reporting_amount_usd - approved_amount_usd) filter (where review_status = 'needs_info'), 0)::numeric(14,2)::text as over_cap_usd
     from expense_submission_items
     where submission_id = $1`,
    [submission.id]
  );

  const nextReportMetadata = {
    ...(submission.report_metadata ?? {}),
    expected_totals: {
      ...((submission.report_metadata ?? {}).expected_totals ?? {}),
      usd: Number(totals.rows[0].usd_total),
      over_cap_usd: Number(totals.rows[0].over_cap_usd),
      podium_bonus_usd: PODIUM_BONUS_USD
    },
    corrected_on: new Date().toISOString(),
    correction_note: "Podium bonus corrected to USD 2,000 and five transport receipts attached as image previews."
  };

  await client.query(
    `update expense_submissions
     set report_metadata = $2::jsonb,
         updated_at = now()
     where id = $1`,
    [submission.id, JSON.stringify(nextReportMetadata)]
  );

  await audit(client, {
    entityType: "expense_submission",
    entityId: submission.id,
    action: "refresh_receipts_and_totals",
    beforeState: { report_metadata: submission.report_metadata },
    afterState: { report_metadata: nextReportMetadata }
  });

  await client.query("commit");
  console.log(JSON.stringify({
    ok: true,
    submissionId: submission.id,
    attachedReceiptCount: RECEIPTS.length,
    podiumBonusUsd: PODIUM_BONUS_USD,
    totals: totals.rows[0]
  }, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the original error.
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
