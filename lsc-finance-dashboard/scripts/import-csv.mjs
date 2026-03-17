import crypto from "node:crypto";
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

function parseCsv(text) {
  const rows = [];
  let currentField = "";
  let currentRow = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      currentRow.push(currentField);
      currentField = "";

      if (currentRow.some((value) => value !== "")) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const [header, ...dataRows] = rows;
  return dataRows.map((values) =>
    Object.fromEntries(header.map((key, index) => [key.trim(), (values[index] ?? "").trim()]))
  );
}

function stableHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getRowKey(row, rowIndex, rowKeyColumn) {
  if (rowKeyColumn && row[rowKeyColumn]) {
    return String(row[rowKeyColumn]);
  }

  return `row-${rowIndex + 1}`;
}

async function main() {
  const manifestPath = process.argv[2];

  if (!manifestPath) {
    throw new Error("Usage: npm run import:csv -- <manifest-path>");
  }

  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const manifestAbsolutePath = path.join(projectRoot, manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestAbsolutePath, "utf8"));

  const csvAbsolutePath = path.join(path.dirname(manifestAbsolutePath), manifest.csvPath);
  const csvContent = await fs.readFile(csvAbsolutePath, "utf8");
  const parsedRows = parseCsv(csvContent);

  if (parsedRows.length === 0) {
    throw new Error(`No rows found in ${csvAbsolutePath}`);
  }

  const connectionString = deriveImportUrl();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("begin");

    const companyResult = await client.query(
      `select id, code from companies where code = $1::company_code`,
      [manifest.companyCode]
    );

    if (companyResult.rows.length === 0) {
      throw new Error(`Company ${manifest.companyCode} not found.`);
    }

    const companyId = companyResult.rows[0].id;
    const sourceIdentifier =
      manifest.sourceIdentifier ??
      `${manifest.sourceSystem}:${path.basename(csvAbsolutePath)}:${stableHash(csvContent).slice(0, 12)}`;

    const sourceDocumentResult = await client.query(
      `insert into source_documents (
         company_id,
         document_type,
         source_system,
         source_identifier,
         source_name,
         metadata
       )
       values ($1, $2::source_document_type, $3, $4, $5, $6::jsonb)
       on conflict (source_system, source_identifier)
       do update set
         source_name = excluded.source_name,
         metadata = excluded.metadata,
         updated_at = now()
       returning id`,
      [
        companyId,
        manifest.documentType,
        manifest.sourceSystem,
        sourceIdentifier,
        manifest.sourceName,
        JSON.stringify({
          manifestName: manifest.name,
          canonicalTargetTable: manifest.canonicalTargetTable ?? null,
          fileHash: stableHash(csvContent),
          filePath: path.relative(projectRoot, csvAbsolutePath)
        })
      ]
    );

    const sourceDocumentId = sourceDocumentResult.rows[0].id;

    const importBatchResult = await client.query(
      `insert into import_batches (
         company_id,
         source_system,
         source_name,
         status,
         metadata
       )
       values ($1, $2, $3, 'completed', $4::jsonb)
       returning id`,
      [
        companyId,
        manifest.sourceSystem,
        manifest.sourceName,
        JSON.stringify({
          manifestName: manifest.name,
          rowCount: parsedRows.length,
          fileHash: stableHash(csvContent)
        })
      ]
    );

    const importBatchId = importBatchResult.rows[0].id;

    for (const [index, row] of parsedRows.entries()) {
      await client.query(
        `insert into raw_import_rows (
           import_batch_id,
           source_document_id,
           source_row_key,
           payload,
           canonical_target_table
         )
         values ($1, $2, $3, $4::jsonb, $5)`,
        [
          importBatchId,
          sourceDocumentId,
          getRowKey(row, index, manifest.rowKeyColumn),
          JSON.stringify(row),
          manifest.canonicalTargetTable ?? null
        ]
      );
    }

    await client.query("commit");

    console.log(
      JSON.stringify(
        {
          manifest: manifest.name,
          importBatchId,
          sourceDocumentId,
          rowCount: parsedRows.length,
          companyCode: manifest.companyCode,
          canonicalTargetTable: manifest.canonicalTargetTable ?? null
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
