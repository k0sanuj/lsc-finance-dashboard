import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import xlsx from "xlsx";

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

function stableHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeCell(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeHeaderValue(value, fallbackIndex) {
  const cleaned = normalizeCell(value)
    .replace(/\s+/g, " ")
    .replace(/[^\w\s/-]/g, "")
    .trim();

  if (!cleaned) {
    return `column_${fallbackIndex + 1}`;
  }

  return cleaned;
}

function uniquifyHeaders(headers) {
  const seen = new Map();

  return headers.map((header, index) => {
    const normalized = normalizeHeaderValue(header, index);
    const count = seen.get(normalized) ?? 0;
    seen.set(normalized, count + 1);

    if (count === 0) {
      return normalized;
    }

    return `${normalized}_${count + 1}`;
  });
}

function countNonEmpty(values) {
  return values.filter((value) => normalizeCell(value) !== "").length;
}

function looksGenericHeader(values) {
  const genericMatches = values.filter((value) =>
    /^(column\s*\d+|sheet\d*|untitled|unnamed)$/i.test(normalizeCell(value))
  ).length;

  return genericMatches > 0 && genericMatches >= Math.ceil(values.length / 2);
}

function findHeaderRow(matrix, options = {}) {
  if (typeof options.headerRowIndex === "number") {
    return options.headerRowIndex;
  }

  const maxScanRows = options.maxHeaderScanRows ?? 20;
  const minHeaderColumns = options.minHeaderColumns ?? 2;
  let best = null;

  for (let index = 0; index < Math.min(matrix.length, maxScanRows); index += 1) {
    const row = matrix[index].map(normalizeCell);
    const nonEmptyCount = countNonEmpty(row);

    if (nonEmptyCount < minHeaderColumns) {
      continue;
    }

    if (looksGenericHeader(row)) {
      continue;
    }

    const nextRows = matrix.slice(index + 1, index + 4);
    const nextDataSignal = Math.max(0, ...nextRows.map((candidate) => countNonEmpty(candidate)));

    if (nextDataSignal === 0) {
      continue;
    }

    const uniqueValues = new Set(row.filter(Boolean).map((value) => value.toLowerCase())).size;
    const score = nonEmptyCount * 3 + uniqueValues * 2 + nextDataSignal * 2 - index * 0.25;

    if (!best || score > best.score) {
      best = { index, score };
    }
  }

  return best?.index ?? null;
}

function extractPrimaryTable(sheet, options = {}) {
  const matrix = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true
  });

  if (matrix.length === 0) {
    return { headerRowIndex: null, rowCount: 0, headers: [], rows: [] };
  }

  const headerRowIndex = findHeaderRow(matrix, options);
  if (headerRowIndex === null) {
    return { headerRowIndex: null, rowCount: 0, headers: [], rows: [] };
  }

  const headers = uniquifyHeaders(matrix[headerRowIndex]);
  const rows = [];
  let blankStreak = 0;

  for (let index = headerRowIndex + 1; index < matrix.length; index += 1) {
    const rawRow = matrix[index].map(normalizeCell);

    if (countNonEmpty(rawRow) === 0) {
      blankStreak += 1;
      if (rows.length > 0 && blankStreak >= 2) {
        break;
      }
      continue;
    }

    blankStreak = 0;
    const payload = {};

    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      payload[headers[columnIndex]] = rawRow[columnIndex] ?? "";
    }

    if (countNonEmpty(Object.values(payload)) === 0) {
      continue;
    }

    rows.push(payload);
  }

  return {
    headerRowIndex,
    rowCount: rows.length,
    headers,
    rows
  };
}

function resolveInputPath(manifestAbsolutePath, inputPath) {
  if (!inputPath) {
    throw new Error("Workbook path is required.");
  }

  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  return path.join(path.dirname(manifestAbsolutePath), inputPath);
}

function getWorkbookConfigs(manifest) {
  const workbookEntries = manifest.workbooks ?? [];
  if (workbookEntries.length === 0) {
    throw new Error("Workbook manifest must contain a non-empty workbooks array.");
  }
  return workbookEntries;
}

function getIncludedSheetNames(workbook, workbookConfig) {
  const availableSheetNames = [...workbook.SheetNames];
  const includeSheets = workbookConfig.includeSheets ?? availableSheetNames;
  const excludeSheets = new Set(workbookConfig.excludeSheets ?? []);
  return includeSheets.filter((sheetName) => availableSheetNames.includes(sheetName) && !excludeSheets.has(sheetName));
}

function getSourceIdentifier(sourceSystem, workbookName, sheetName, fileHash) {
  return `${sourceSystem}:${workbookName}:${sheetName}:${fileHash.slice(0, 12)}`;
}

function getSourceRowKey(workbookName, sheetName, rowIndex, row, rowKeyColumn) {
  if (rowKeyColumn && row[rowKeyColumn]) {
    return `${workbookName}:${sheetName}:${String(row[rowKeyColumn])}`;
  }

  return `${workbookName}:${sheetName}:row-${rowIndex + 1}`;
}

async function upsertSourceDocument(client, params) {
  const result = await client.query(
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
      params.companyId,
      params.documentType,
      params.sourceSystem,
      params.sourceIdentifier,
      params.sourceName,
      JSON.stringify(params.metadata)
    ]
  );

  return result.rows[0].id;
}

async function createImportBatch(client, params) {
  const result = await client.query(
    `insert into import_batches (
       company_id,
       source_system,
       source_name,
       status,
       metadata
     )
     values ($1, $2, $3, 'completed', $4::jsonb)
     returning id`,
    [params.companyId, params.sourceSystem, params.sourceName, JSON.stringify(params.metadata)]
  );

  return result.rows[0].id;
}

async function insertRawRows(client, params) {
  for (const [index, row] of params.rows.entries()) {
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
        params.importBatchId,
        params.sourceDocumentId,
        getSourceRowKey(params.workbookName, params.sheetName, index, row, params.rowKeyColumn),
        JSON.stringify({
          ...row,
          _workbook_name: params.workbookName,
          _sheet_name: params.sheetName
        }),
        params.canonicalTargetTable ?? null
      ]
    );
  }
}

async function main() {
  const manifestPath = process.argv[2];

  if (!manifestPath) {
    throw new Error("Usage: npm run import:xlsx -- <manifest-path>");
  }

  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const manifestAbsolutePath = path.join(projectRoot, manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestAbsolutePath, "utf8"));
  const workbookConfigs = getWorkbookConfigs(manifest);
  const connectionString = deriveImportUrl();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const companyResult = await client.query(
      `select id, code from companies where code = $1::company_code`,
      [manifest.companyCode]
    );

    if (companyResult.rows.length === 0) {
      throw new Error(`Company ${manifest.companyCode} not found.`);
    }

    const companyId = companyResult.rows[0].id;
    const summary = [];

    for (const workbookConfig of workbookConfigs) {
      const workbookAbsolutePath = resolveInputPath(manifestAbsolutePath, workbookConfig.workbookPath);
      const workbookBuffer = await fs.readFile(workbookAbsolutePath);
      const workbookHash = stableHash(workbookBuffer);
      const workbook = xlsx.read(workbookBuffer, { type: "buffer" });
      const workbookName = path.basename(workbookAbsolutePath);
      const includedSheets = getIncludedSheetNames(workbook, workbookConfig);

      for (const sheetName of includedSheets) {
        const sheet = workbook.Sheets[sheetName];
        const extracted = extractPrimaryTable(sheet, workbookConfig.sheetOptions ?? {});

        if (extracted.rowCount === 0) {
          summary.push({
            workbook: workbookName,
            sheet: sheetName,
            status: "skipped",
            reason: "No primary table detected."
          });
          continue;
        }

        await client.query("begin");

        try {
          const sourceDocumentId = await upsertSourceDocument(client, {
            companyId,
            documentType: workbookConfig.documentType ?? manifest.documentType ?? "manual_upload",
            sourceSystem: workbookConfig.sourceSystem ?? manifest.sourceSystem,
            sourceIdentifier:
              workbookConfig.sourceIdentifier ??
              getSourceIdentifier(
                workbookConfig.sourceSystem ?? manifest.sourceSystem,
                workbookName,
                sheetName,
                workbookHash
              ),
            sourceName: `${workbookName} :: ${sheetName}`,
            metadata: {
              manifestName: manifest.name,
              workbookName,
              workbookPath: workbookAbsolutePath,
              workbookHash,
              sheetName,
              headerRowIndex: extracted.headerRowIndex,
              headerNames: extracted.headers,
              canonicalTargetTable:
                workbookConfig.canonicalTargetTable ?? manifest.canonicalTargetTable ?? null,
              tags: workbookConfig.tags ?? {}
            }
          });

          const importBatchId = await createImportBatch(client, {
            companyId,
            sourceSystem: workbookConfig.sourceSystem ?? manifest.sourceSystem,
            sourceName: `${workbookName} :: ${sheetName}`,
            metadata: {
              manifestName: manifest.name,
              workbookName,
              sheetName,
              rowCount: extracted.rowCount,
              workbookHash,
              tags: workbookConfig.tags ?? {}
            }
          });

          await insertRawRows(client, {
            importBatchId,
            sourceDocumentId,
            workbookName,
            sheetName,
            rows: extracted.rows,
            rowKeyColumn: workbookConfig.rowKeyColumn ?? manifest.rowKeyColumn,
            canonicalTargetTable:
              workbookConfig.canonicalTargetTable ?? manifest.canonicalTargetTable ?? null
          });

          await client.query("commit");

          summary.push({
            workbook: workbookName,
            sheet: sheetName,
            status: "imported",
            rowCount: extracted.rowCount,
            importBatchId
          });
        } catch (error) {
          await client.query("rollback");
          throw error;
        }
      }
    }

    console.log(JSON.stringify({ manifest: manifest.name, sheets: summary }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
