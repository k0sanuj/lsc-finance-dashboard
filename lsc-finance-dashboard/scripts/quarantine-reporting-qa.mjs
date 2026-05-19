#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.join(import.meta.dirname, "..");
const APPLY = process.argv.includes("--apply");
const MARKERS = ["QA-E2E", "QA-FORM", "qa canonical", "canonical qa", "test canonical"];

function loadEnv() {
  for (const envPath of [path.join(ROOT, ".env.local"), path.join(ROOT, "apps", "web", ".env.local")]) {
    if (!fs.existsSync(envPath)) continue;
    for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) process.env[key] = value;
    }
  }
}

function markerPredicate(columns) {
  const clauses = [];
  const params = [];
  for (const column of columns) {
    for (const marker of MARKERS) {
      params.push(`%${marker}%`);
      clauses.push(`${column}::text ilike $${params.length}`);
    }
  }
  return { sql: clauses.join(" or "), params };
}

const candidateSources = [
  { table: "source_documents", id: "id", columns: ["source_identifier", "source_name", "source_url", "source_system", "metadata"] },
  { table: "document_analysis_runs", id: "id", columns: ["source_file_name", "detected_document_type", "extracted_summary"] },
  { table: "ai_intake_drafts", id: "id", columns: ["source_name", "input_text", "detected_document_type", "extracted_summary", "error_message"] },
  { table: "invoices", id: "id", columns: ["invoice_number", "notes"] },
  { table: "expenses", id: "id", columns: ["vendor_name", "description", "submitted_by"] },
  { table: "payments", id: "id", columns: ["reference_number", "description"] },
  { table: "payroll_invoices", id: "id", columns: ["invoice_number", "notes", "issuer_legal_name", "recipient_legal_name"] },
  { table: "revenue_records", id: "id", columns: ["notes"] },
];

async function tableExists(client, table) {
  const result = await client.query(
    `select exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = $1
     ) as exists`,
    [table]
  );
  return Boolean(result.rows[0]?.exists);
}

async function main() {
  loadEnv();
  const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL_ADMIN or DATABASE_URL is missing.");

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    if (!(await tableExists(client, "finance_reporting_exclusions"))) {
      throw new Error("finance_reporting_exclusions is missing. Apply sql/041_reporting_hardening.sql first.");
    }

    const candidates = [];
    for (const source of candidateSources) {
      if (!(await tableExists(client, source.table))) continue;
      const predicate = markerPredicate(source.columns);
      const rows = await client.query(
        `select ${source.id}::text as id
         from ${source.table}
         where ${predicate.sql}`,
        predicate.params
      );
      for (const row of rows.rows) {
        candidates.push({ sourceTable: source.table, sourceId: row.id });
      }
    }

    const unique = Array.from(
      new Map(candidates.map((row) => [`${row.sourceTable}:${row.sourceId}`, row])).values()
    );

    if (!APPLY) {
      console.log(JSON.stringify({ mode: "dry-run", candidateCount: unique.length, candidates: unique }, null, 2));
      console.log("Run with --apply to write quarantine exclusions.");
      return;
    }

    let inserted = 0;
    for (const row of unique) {
      const result = await client.query(
        `insert into finance_reporting_exclusions (
           source_table, source_id, reason, quarantined_by, notes, metadata
         )
         values ($1, $2, 'qa_test_artifact', 'quarantine-reporting-qa.mjs',
           'Matched QA/test marker; preserved for audit but excluded from reporting.',
           jsonb_build_object('markers', $3::text[]))
         on conflict (source_table, source_id, reason) do nothing
         returning id`,
        [row.sourceTable, row.sourceId, MARKERS]
      );
      inserted += result.rowCount ?? 0;
    }

    console.log(JSON.stringify({ mode: "apply", candidateCount: unique.length, inserted }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
