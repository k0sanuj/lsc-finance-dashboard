import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const BOOTSTRAP_ANALYZER = "bootstrap_document_analyzer";

const DOCUMENT_BLUEPRINTS = [
  {
    sourceIdentifier: "business_rule:tbr:season1_classic_car_club_manhattan",
    sourceFileName: "Classic Car Club Manhattan Contract.pdf",
    sourceFileType: "application/pdf",
    detectedDocumentType: "Sponsorship Contract",
    overallConfidence: 0.96,
    proposedTarget: "contracts -> revenue_records",
    fields: [
      {
        key: "counterparty_name",
        label: "Counterparty",
        extractedValue: "Classic Car Club Manhattan",
        normalizedValue: "Classic Car Club Manhattan",
        confidence: 0.99,
        approvalStatus: "approved",
        targetTable: "sponsors_or_customers",
        targetColumn: "name"
      },
      {
        key: "contract_value_usd",
        label: "Contract Value",
        extractedValue: "$100,000",
        normalizedValue: "100000",
        confidence: 0.97,
        approvalStatus: "approved",
        targetTable: "contracts",
        targetColumn: "contract_value"
      },
      {
        key: "recognition_rule",
        label: "Recognition Trigger",
        extractedValue: "Season 1 Sponsorship",
        normalizedValue: "Season 1 Sponsorship",
        confidence: 0.84,
        approvalStatus: "approved",
        targetTable: "revenue_records",
        targetColumn: "notes"
      }
    ],
    postingEvents: [
      {
        status: "posted",
        targetTable: "contracts",
        summary: "Approved contract fields were posted to the Season 1 sponsorship contract."
      },
      {
        status: "posted",
        targetTable: "revenue_records",
        summary: "Approved sponsorship revenue facts were posted into canonical revenue records."
      }
    ]
  },
  {
    sourceIdentifier: "business_rule:tbr:season2_prize_pool_after_miami",
    sourceFileName: "E1 Prize Confirmation S2.pdf",
    sourceFileType: "application/pdf",
    detectedDocumentType: "Prize Statement",
    overallConfidence: 0.91,
    proposedTarget: "revenue_records",
    fields: [
      {
        key: "counterparty_name",
        label: "Counterparty",
        extractedValue: "E1 Prize Pool",
        normalizedValue: "E1 Prize Pool",
        confidence: 0.95,
        approvalStatus: "approved",
        targetTable: "sponsors_or_customers",
        targetColumn: "name"
      },
      {
        key: "amount_eur",
        label: "Original Amount",
        extractedValue: "EUR 100,000",
        normalizedValue: "100000",
        confidence: 0.96,
        approvalStatus: "approved",
        targetTable: "revenue_records",
        targetColumn: "amount"
      },
      {
        key: "normalized_usd",
        label: "Normalized USD Value",
        extractedValue: "USD 115,710",
        normalizedValue: "115710",
        confidence: 0.89,
        approvalStatus: "approved",
        targetTable: "revenue_records",
        targetColumn: "amount"
      }
    ],
    postingEvents: [
      {
        status: "posted",
        targetTable: "revenue_records",
        summary: "Approved prize-money facts were posted into canonical revenue records after USD normalization."
      }
    ]
  }
];

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

function deriveImportUrl() {
  if (process.env.DATABASE_URL_IMPORT) {
    return process.env.DATABASE_URL_IMPORT;
  }

  const base = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  const password = process.env.LSC_IMPORT_RW_PASSWORD;

  if (!base || !password) {
    throw new Error(
      "DATABASE_URL_IMPORT or (DATABASE_URL_ADMIN/DATABASE_URL + LSC_IMPORT_RW_PASSWORD) must be set in .env.local."
    );
  }

  const roleName = process.env.LSC_IMPORT_RW_ROLE ?? "lsc_import_rw";
  const url = new URL(base);
  url.username = roleName;
  url.password = password;
  return url.toString();
}

async function getCompanyId(client, code) {
  const { rows } = await client.query(`select id from companies where code = $1::company_code`, [code]);
  return rows[0]?.id ?? null;
}

async function getSourceDocumentId(client, sourceIdentifier) {
  const { rows } = await client.query(
    `select id from source_documents
     where source_system = 'business_rule'
       and source_identifier = $1`,
    [sourceIdentifier]
  );

  return rows[0]?.id ?? null;
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const client = new Client({ connectionString: deriveImportUrl() });
  await client.connect();

  try {
    await client.query("begin");

    const companyId = await getCompanyId(client, "TBR");
    if (!companyId) {
      throw new Error("TBR company not found.");
    }

    await client.query(
      `delete from document_analysis_runs
       where analyzer_type = $1`,
      [BOOTSTRAP_ANALYZER]
    );

    for (const blueprint of DOCUMENT_BLUEPRINTS) {
      const sourceDocumentId = await getSourceDocumentId(client, blueprint.sourceIdentifier);

      if (!sourceDocumentId) {
        throw new Error(`Source document not found for ${blueprint.sourceIdentifier}`);
      }

      const insertedRun = await client.query(
        `insert into document_analysis_runs (
           source_document_id,
           company_id,
           analyzer_type,
           analysis_status,
           source_file_name,
           source_file_type,
           detected_document_type,
           extracted_summary,
           overall_confidence,
           approved_at,
           approved_by
         )
         values (
           $1,
           $2,
           $3,
           'approved',
           $4,
           $5,
           $6,
           $7::jsonb,
           $8,
           now(),
           'Finance Overlord'
         )
         returning id`,
        [
          sourceDocumentId,
          companyId,
          BOOTSTRAP_ANALYZER,
          blueprint.sourceFileName,
          blueprint.sourceFileType,
          blueprint.detectedDocumentType,
          JSON.stringify({ proposedTarget: blueprint.proposedTarget }),
          blueprint.overallConfidence
        ]
      );

      const analysisRunId = insertedRun.rows[0].id;

      for (const field of blueprint.fields) {
        await client.query(
          `insert into document_extracted_fields (
             analysis_run_id,
             field_key,
             field_label,
             extracted_value,
             normalized_value,
             confidence,
             approval_status,
             canonical_target_table,
             canonical_target_column
           )
           values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
          [
            analysisRunId,
            field.key,
            field.label,
            JSON.stringify(field.extractedValue),
            field.normalizedValue,
            field.confidence,
            field.approvalStatus,
            field.targetTable,
            field.targetColumn
          ]
        );
      }

      for (const postingEvent of blueprint.postingEvents) {
        await client.query(
          `insert into document_posting_events (
             analysis_run_id,
             posting_status,
             canonical_target_table,
             posting_summary,
             completed_at
           )
           values ($1, $2, $3, $4, now())`,
          [
            analysisRunId,
            postingEvent.status,
            postingEvent.targetTable,
            postingEvent.summary
          ]
        );
      }
    }

    await client.query("commit");
    console.log(
      JSON.stringify({
        analyzerType: BOOTSTRAP_ANALYZER,
        seededRuns: DOCUMENT_BLUEPRINTS.length
      })
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
