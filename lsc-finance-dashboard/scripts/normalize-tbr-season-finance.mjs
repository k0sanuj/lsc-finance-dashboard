import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import xlsx from "xlsx";

const { Client } = pg;

const DEFAULT_TBR_FINANCIAL_PLAN =
  "/Users/anujsingh/Downloads/TBR Financial Plan_ 2024-25.xlsx";
const DEFAULT_E1_SUMMARY =
  "/Users/anujsingh/Downloads/LSC - E1 Payments Summaries.xlsx";

const TBR_WORKBOOK_NAME = "TBR Financial Plan_ 2024-25.xlsx";
const E1_WORKBOOK_NAME = "LSC - E1 Payments Summaries.xlsx";
const SEASON_1_EUR_USD_RATE = 1.081965;

const CATEGORY_MAP = [
  {
    key: "stay_accommodation",
    label: "Stay & Accommodation",
    order: 10,
    match: /stay|accomo|hotel|lodging/i
  },
  { key: "travel", label: "Travel", order: 20, match: /travel|flight|ticket|visa/i },
  { key: "merchandise_cost", label: "Merchandise Cost", order: 30, match: /merch/i },
  { key: "content_capture", label: "Content Capture", order: 40, match: /content|livery|logo|visual|3d racebird/i },
  { key: "miscellaneous_expenses", label: "Miscellaneous / Other Expenses", order: 50, match: /misc|other/i },
  { key: "food_beverages", label: "Food & Beverages", order: 60, match: /food|beverage|catering|lunch|dinner|ocean club|gala/i },
  { key: "vip_passes", label: "VIP Passes", order: 70, match: /vip|passes|ocean club|gala/i },
  { key: "racesuits_helmets", label: "Racesuits & Helmets", order: 80, match: /race ?suit|helmet|sparco/i },
  { key: "team_insurance", label: "Team Insurance", order: 90, match: /insurance|liability/i },
  { key: "pre_season_testing_fee", label: "Pre-Season Testing Fee", order: 95, match: /pre-season|pre season|testing fee/i },
  { key: "spare_parts", label: "Spare Parts Cost", order: 100, match: /spare|foil|repair|damage|fastener|pump|gearbox|extinguisher/i },
  { key: "pilot_training", label: "Pilot Training", order: 110, match: /pilot|academy|competency|immersion|federation|superlicense|training/i },
  { key: "pilot_stipend", label: "Pilot Stipend", order: 120, match: /pilot stipend|athlete/i },
  { key: "mechanic_stipend", label: "Mechanic Stipend", order: 130, match: /mechanic/i }
];

const SEASONS = [
  { code: "S1", number: 1, year: 2024, label: "Season 1", status: "completed" },
  { code: "S2", number: 2, year: 2025, label: "Season 2", status: "completed" },
  { code: "S3", number: 3, year: 2026, label: "Season 3", status: "planning" }
];

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function stableHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function fileHash(filePath) {
  const bytes = await fs.readFile(filePath);
  return stableHash(bytes);
}

async function loadEnvFile(envPath) {
  try {
    const content = await fs.readFile(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

function deriveImportUrl() {
  if (process.env.DATABASE_URL_IMPORT) return process.env.DATABASE_URL_IMPORT;
  const base = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  const password = process.env.LSC_IMPORT_RW_PASSWORD;
  if (!base) throw new Error("DATABASE_URL_IMPORT, DATABASE_URL_ADMIN, or DATABASE_URL must be set.");
  if (!password) return base;
  const url = new URL(base);
  url.username = process.env.LSC_IMPORT_RW_ROLE ?? "lsc_import_rw";
  url.password = password;
  return url.toString();
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const valueAfter = (flag, fallback) => {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
  };

  return {
    dryRun: args.has("--dry-run"),
    json: args.has("--json"),
    tbrFinancialPlanPath: valueAfter("--tbr-plan", process.env.TBR_FINANCIAL_PLAN_XLSX ?? DEFAULT_TBR_FINANCIAL_PLAN),
    e1SummaryPath: valueAfter("--e1-summary", process.env.TBR_E1_SUMMARY_XLSX ?? DEFAULT_E1_SUMMARY)
  };
}

function readSheetMatrix(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);
  return xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true
  });
}

function parseNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  const raw = normalizeWhitespace(value);
  if (!raw || /^(na|n\/a|nr|not required|not in excel)$/i.test(raw) || raw.includes("#REF!")) {
    return null;
  }

  const negative = raw.startsWith("(") || raw.includes("-");
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;

  const parsed = Number.parseFloat(digits);
  if (!Number.isFinite(parsed)) return null;
  return Number((negative ? -parsed : parsed).toFixed(2));
}

function inferCurrency(value, fallbackCurrency) {
  const raw = normalizeWhitespace(value).toUpperCase();
  if (raw.includes("EUR") || raw.includes("€")) return "EUR";
  if (raw.includes("GBP") || raw.includes("£")) return "GBP";
  return fallbackCurrency;
}

function toUsd(amount, currency, fxRate) {
  if (amount === null || amount === undefined) return 0;
  return Number((amount * (currency === "USD" ? 1 : fxRate)).toFixed(2));
}

function classifyCategory(label) {
  const normalized = normalizeWhitespace(label);
  const match = CATEGORY_MAP.find((item) => item.match.test(normalized));
  if (match) return match;

  return {
    key: normalized.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "uncategorized",
    label: normalized || "Uncategorized",
    order: 999
  };
}

function isSpareCategory(categoryKey) {
  return categoryKey === "spare_parts";
}

function buildSourceKey(parts) {
  return parts.map((part) => normalizeWhitespace(part).replace(/\s+/g, "-")).join(":");
}

function createTbrLine(params) {
  const amount = parseNumber(params.rawAmount) ?? 0;
  const category = classifyCategory(params.categoryName);
  const currency = "USD";

  return {
    sourceImportKey: buildSourceKey([
      "tbr-finance",
      params.workbookName,
      params.sheetName,
      `r${params.rowNumber}`,
      params.lineKind,
      params.seasonCode,
      params.raceCode ?? "season",
      category.key
    ]),
    sourceRowKey: `${params.workbookName}:${params.sheetName}:row-${params.rowNumber}`,
    sourceWorkbookName: params.workbookName,
    sourceSheetName: params.sheetName,
    sourceRowNumber: params.rowNumber,
    lineKind: params.lineKind,
    seasonCode: params.seasonCode,
    raceCode: params.raceCode ?? null,
    raceName: params.raceName ?? null,
    categoryKey: category.key,
    categoryName: category.label,
    displayOrder: category.order,
    sourceAmount: amount,
    sourceCurrency: currency,
    fxRate: 1,
    fxSource: "source_workbook_usd",
    reportingAmountUsd: amount,
    isSpareParts: isSpareCategory(category.key),
    isCheckTotal: false,
    includeInOperatingBaseline: params.lineKind !== "workbook_summary_category",
    notes: params.notes ?? null,
    metadata: params.metadata ?? {}
  };
}

function parseTbrFinancialPlan(workbookPath) {
  const workbook = xlsx.readFile(workbookPath, { cellDates: true });
  const workbookName = TBR_WORKBOOK_NAME;
  const lines = [];

  const summary = readSheetMatrix(workbook, "Summary Sheets");
  for (let rowIndex = 3; rowIndex <= 15; rowIndex += 1) {
    const row = summary[rowIndex] ?? [];
    const categoryName = row[0];
    if (!normalizeWhitespace(categoryName)) continue;
    for (const season of [
      { code: "S1", amountIndex: 1 },
      { code: "S2", amountIndex: 2 }
    ]) {
      lines.push(
        createTbrLine({
          workbookName,
          sheetName: "Summary Sheets",
          rowNumber: rowIndex + 1,
          lineKind: "workbook_summary_category",
          seasonCode: season.code,
          categoryName,
          rawAmount: row[season.amountIndex],
          notes: "Cross-season workbook summary. Stored as a source check and excluded from baseline to avoid duplicate counting."
        })
      );
    }
  }

  const seasonConfigs = [
    {
      sheetName: "Season 1",
      seasonCode: "S1",
      startRowIndex: 4,
      endRowIndex: 16,
      summaryAmountIndex: 9,
      raceHeaderRowIndex: 2,
      raceColumnIndexes: [1, 2, 3, 4, 5, 6, 7]
    },
    {
      sheetName: "Season 2",
      seasonCode: "S2",
      startRowIndex: 2,
      endRowIndex: 16,
      summaryAmountIndex: 1,
      raceHeaderRowIndex: 1,
      raceColumnIndexes: [2, 3, 4, 5, 6, 7, 8]
    }
  ];

  for (const config of seasonConfigs) {
    const matrix = readSheetMatrix(workbook, config.sheetName);
    const raceHeaders = matrix[config.raceHeaderRowIndex] ?? [];

    for (let rowIndex = config.startRowIndex; rowIndex <= config.endRowIndex; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      const categoryName = row[0];
      if (!normalizeWhitespace(categoryName)) continue;

      lines.push(
        createTbrLine({
          workbookName,
          sheetName: config.sheetName,
          rowNumber: rowIndex + 1,
          lineKind: "season_category_summary",
          seasonCode: config.seasonCode,
          categoryName,
          rawAmount: row[config.summaryAmountIndex],
          notes: "Primary top-table season category row."
        })
      );

      for (const columnIndex of config.raceColumnIndexes) {
        const rawAmount = row[columnIndex];
        const amount = parseNumber(rawAmount);
        if (amount === null || Math.abs(amount) < 0.005) continue;

        const rawRaceName = normalizeWhitespace(raceHeaders[columnIndex]);
        const raceName = rawRaceName || `Unassigned allocation ${columnIndex}`;
        const raceCode = `${config.seasonCode}_${raceName}`
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "_")
          .replace(/^_|_$/g, "");

        lines.push(
          createTbrLine({
            workbookName,
            sheetName: config.sheetName,
            rowNumber: rowIndex + 1,
            lineKind: "race_category_matrix",
            seasonCode: config.seasonCode,
            raceCode,
            raceName,
            categoryName,
            rawAmount,
            notes: rawRaceName ? "Primary top-table race/category row." : "Allocated in workbook without a race header."
          })
        );
      }
    }
  }

  return lines;
}

function normalizeInvoiceNumber(value) {
  const raw = normalizeWhitespace(value);
  if (!raw || /^tbd$/i.test(raw)) return raw || null;
  return raw.toUpperCase().replace(/\s*-\s*/g, "-");
}

function mapStatus(rawStatus, invoiceNumber, amount) {
  const status = normalizeWhitespace(rawStatus).toLowerCase();
  const invoice = normalizeWhitespace(invoiceNumber).toUpperCase();

  if (/^cn[-\s]/i.test(invoice)) return "credit_note";
  if (status.includes("not applicable") || status === "na") return "not_applicable";
  if (status.includes("partially")) return "partially_paid";
  if (status.includes("paid") && !status.includes("unpaid")) return "paid";
  if (status.includes("due")) return "due";
  if (status.includes("unpaid") || status.includes("awaiting")) return "unpaid";
  if (amount !== null && amount < 0) return "credit_note";
  if (!invoice && !status) return "pending_review";
  return "issued";
}

function classifyE1Treatment(item, invoiceNumber, status, amount, dueAmount, comments) {
  const haystack = `${item} ${invoiceNumber ?? ""} ${status ?? ""} ${comments ?? ""}`.toLowerCase();
  const normalizedInvoice = normalizeWhitespace(invoiceNumber).toUpperCase();

  if (/^cn[-\s]/i.test(normalizedInvoice) || amount < 0) {
    return { lineType: "credit_note", pnlTreatment: "excluded_duplicate", overlapCategoryKey: null };
  }

  if (haystack.includes("not applicable") || haystack.includes("please delete")) {
    return { lineType: "invoice", pnlTreatment: "excluded_inapplicable", overlapCategoryKey: null };
  }

  if (
    haystack.includes("subject to sponsorship") ||
    haystack.includes("not included in final calculations") ||
    haystack.includes("duplicated value") ||
    haystack.includes("still incorrect")
  ) {
    return { lineType: "invoice", pnlTreatment: "excluded_contingent", overlapCategoryKey: null };
  }

  const category = classifyCategory(item);
  if (
    category.key === "food_beverages" ||
    category.key === "team_insurance" ||
    category.key === "pilot_training" ||
    category.key === "spare_parts" ||
    category.key === "pre_season_testing_fee" ||
    category.key === "vip_passes"
  ) {
    return { lineType: "invoice", pnlTreatment: "overlap_variance", overlapCategoryKey: category.key };
  }

  if (amount === null || Math.abs(amount) < 0.005) {
    return { lineType: "support", pnlTreatment: "pending_review", overlapCategoryKey: null };
  }

  if (dueAmount === 0 && /unpaid|subject|tbc/i.test(haystack)) {
    return { lineType: "invoice", pnlTreatment: "excluded_contingent", overlapCategoryKey: null };
  }

  return { lineType: "invoice", pnlTreatment: "incremental", overlapCategoryKey: null };
}

function createE1Line(params) {
  const defaultCurrency = params.defaultCurrency;
  const sourceAmount = parseNumber(params.rawAmount);
  const sourceCurrency = inferCurrency(params.rawAmount, defaultCurrency);
  const fxRate = sourceCurrency === "EUR" ? SEASON_1_EUR_USD_RATE : 1;
  const dueAmount = parseNumber(params.rawDueAmount);
  const status = mapStatus(params.rawStatus, params.invoiceNumber, sourceAmount);
  const treatment = params.isSourceCheck
    ? { lineType: "source_check", pnlTreatment: "source_check", overlapCategoryKey: null }
    : classifyE1Treatment(
        params.item,
        params.invoiceNumber,
        status,
        sourceAmount,
        dueAmount,
        params.comments
      );

  return {
    sourceImportKey: buildSourceKey([
      "tbr-e1",
      params.workbookName,
      params.sheetName,
      `r${params.rowNumber}`,
      params.seasonCode,
      params.invoiceNumber ?? "no-invoice",
      params.item
    ]),
    sourceRowKey: `${params.workbookName}:${params.sheetName}:row-${params.rowNumber}`,
    sourceWorkbookName: params.workbookName,
    sourceSheetName: params.sheetName,
    sourceRowNumber: params.rowNumber,
    seasonCode: params.seasonCode,
    invoiceNumber: normalizeInvoiceNumber(params.invoiceNumber),
    item: normalizeWhitespace(params.item) || "Source check",
    statusText: normalizeWhitespace(params.rawStatus),
    normalizedStatus: params.isSourceCheck ? "source_check" : status,
    lineType: treatment.lineType,
    pnlTreatment: treatment.pnlTreatment,
    overlapCategoryKey: treatment.overlapCategoryKey,
    sourceAmount,
    sourceCurrency,
    fxRate,
    fxSource: sourceCurrency === "EUR" ? "workbook_eurusd_1.081965" : "source_workbook_usd",
    reportingAmountUsd: toUsd(sourceAmount, sourceCurrency, fxRate),
    dueAmountSource: dueAmount,
    dueAmountReportingUsd: toUsd(dueAmount, sourceCurrency, fxRate),
    comments: normalizeWhitespace(params.comments) || null,
    metadata: params.metadata ?? {}
  };
}

function parseE1Summary(workbookPath) {
  const workbook = xlsx.readFile(workbookPath, { cellDates: true });
  const workbookName = E1_WORKBOOK_NAME;
  const lines = [];

  const configs = [
    {
      sheetName: "Season 1",
      seasonCode: "S1",
      defaultCurrency: "EUR",
      rows: Array.from({ length: 25 }, (_, index) => index + 3),
      sourceCheckRows: [8, 29, 32],
      amountIndex: 2,
      statusIndex: 3,
      dueIndex: 4,
      commentsIndex: 5
    },
    {
      sheetName: "Season 2",
      seasonCode: "S2",
      defaultCurrency: "USD",
      rows: Array.from({ length: 21 }, (_, index) => index + 3),
      sourceCheckRows: [25, 37],
      amountIndex: 2,
      statusIndex: 3,
      dueIndex: 4,
      commentsIndex: 5
    },
    {
      sheetName: "Season 3",
      seasonCode: "S3",
      defaultCurrency: "USD",
      rows: Array.from({ length: 6 }, (_, index) => index + 3),
      sourceCheckRows: [23, 27, 28, 29, 32],
      amountIndex: 3,
      expectedAmountIndex: 2,
      statusIndex: 4,
      dueIndex: 5,
      commentsIndex: 6
    }
  ];

  for (const config of configs) {
    const matrix = readSheetMatrix(workbook, config.sheetName);
    for (const rowNumber of Array.from(new Set([...config.rows, ...config.sourceCheckRows]))) {
      const row = matrix[rowNumber - 1] ?? [];
      const invoiceNumber = row[0];
      const item = row[1];
      const isSourceCheck =
        config.sourceCheckRows.includes(rowNumber) ||
        /^total/i.test(normalizeWhitespace(invoiceNumber)) ||
        /^total/i.test(normalizeWhitespace(item));

      if (!normalizeWhitespace(invoiceNumber) && !normalizeWhitespace(item)) continue;

      const rawAmount = row[config.amountIndex] ?? row[config.expectedAmountIndex ?? config.amountIndex];

      lines.push(
        createE1Line({
          workbookName,
          sheetName: config.sheetName,
          seasonCode: config.seasonCode,
          rowNumber,
          invoiceNumber,
          item,
          rawAmount,
          rawStatus: row[config.statusIndex],
          rawDueAmount: row[config.dueIndex],
          comments: row[config.commentsIndex],
          defaultCurrency: config.defaultCurrency,
          isSourceCheck,
          metadata: {
            expectedAmount: config.expectedAmountIndex ? row[config.expectedAmountIndex] : null
          }
        })
      );
    }
  }

  return lines;
}

async function ensureSourceDocument(client, params) {
  const result = await client.query(
    `insert into source_documents (
       company_id,
       document_type,
       source_system,
       source_identifier,
       source_name,
       metadata
     )
     values ($1, 'manual_upload'::source_document_type, 'xlsx_upload', $2, $3, $4::jsonb)
     on conflict (source_system, source_identifier)
     do update set source_name = excluded.source_name,
                   metadata = excluded.metadata,
                   updated_at = now()
     returning id`,
    [
      params.companyId,
      params.sourceIdentifier,
      params.sourceName,
      JSON.stringify(params.metadata)
    ]
  );

  return result.rows[0].id;
}

async function createImportBatch(client, params) {
  const result = await client.query(
    `insert into import_batches (company_id, source_system, source_name, status, metadata)
     values ($1, 'xlsx_upload', $2, 'completed', $3::jsonb)
     returning id`,
    [params.companyId, params.sourceName, JSON.stringify(params.metadata)]
  );

  return result.rows[0].id;
}

async function insertRawRow(client, params) {
  const result = await client.query(
    `insert into raw_import_rows (
       import_batch_id,
       source_document_id,
       source_row_key,
       payload,
       canonical_target_table,
       canonical_target_id
     )
     values ($1, $2, $3, $4::jsonb, $5, $6)
     on conflict (import_batch_id, source_row_key) do update
       set payload = excluded.payload,
           canonical_target_table = excluded.canonical_target_table,
           canonical_target_id = excluded.canonical_target_id
     returning id`,
    [
      params.importBatchId,
      params.sourceDocumentId,
      params.sourceRowKey,
      JSON.stringify(params.payload),
      params.canonicalTargetTable,
      params.canonicalTargetId
    ]
  );

  return result.rows[0].id;
}

async function ensureSeasons(client, companyId) {
  const seasons = new Map();
  for (const season of SEASONS) {
    const result = await client.query(
      `insert into tbr_seasons (
         company_id,
         season_code,
         season_number,
         season_year,
         season_label,
         status,
         reporting_currency,
         notes
       )
       values ($1, $2, $3, $4, $5, $6, 'USD', $7)
       on conflict (company_id, season_code) do update
         set season_number = excluded.season_number,
             season_year = excluded.season_year,
             season_label = excluded.season_label,
             status = excluded.status,
             reporting_currency = excluded.reporting_currency,
             updated_at = now()
       returning id, season_code`,
      [
        companyId,
        season.code,
        season.number,
        season.year,
        season.label,
        season.status,
        "Seeded by TBR season finance normalizer."
      ]
    );
    seasons.set(result.rows[0].season_code, result.rows[0].id);
  }
  return seasons;
}

async function clearExistingRows(client) {
  await client.query(
    `delete from tbr_e1_operating_reconciliation_links
     where e1_line_id in (
       select id from tbr_e1_accounting_lines
       where source_workbook_name = $1
     )
     or operating_line_id in (
       select id from tbr_operating_expense_lines
       where source_workbook_name = $2
     )`,
    [E1_WORKBOOK_NAME, TBR_WORKBOOK_NAME]
  );

  await client.query(`delete from tbr_e1_accounting_lines where source_workbook_name = $1`, [
    E1_WORKBOOK_NAME
  ]);
  await client.query(`delete from tbr_operating_expense_lines where source_workbook_name = $1`, [
    TBR_WORKBOOK_NAME
  ]);
}

async function insertOperatingLine(client, companyId, seasonId, sourceDocumentId, importBatchId, line) {
  const result = await client.query(
    `insert into tbr_operating_expense_lines (
       company_id,
       season_id,
       source_document_id,
       import_batch_id,
       source_import_key,
       source_row_key,
       source_workbook_name,
       source_sheet_name,
       source_row_number,
       line_kind,
       season_code,
       race_code,
       race_name,
       category_key,
       category_name,
       display_order,
       source_amount,
       source_currency,
       fx_rate,
       fx_source,
       reporting_amount_usd,
       is_spare_parts,
       is_check_total,
       include_in_operating_baseline,
       notes,
       metadata
     )
     values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb
     )
     returning id`,
    [
      companyId,
      seasonId,
      sourceDocumentId,
      importBatchId,
      line.sourceImportKey,
      line.sourceRowKey,
      line.sourceWorkbookName,
      line.sourceSheetName,
      line.sourceRowNumber,
      line.lineKind,
      line.seasonCode,
      line.raceCode,
      line.raceName,
      line.categoryKey,
      line.categoryName,
      line.displayOrder,
      line.sourceAmount,
      line.sourceCurrency,
      line.fxRate,
      line.fxSource,
      line.reportingAmountUsd,
      line.isSpareParts,
      line.isCheckTotal,
      line.includeInOperatingBaseline,
      line.notes,
      JSON.stringify(line.metadata)
    ]
  );

  return result.rows[0].id;
}

async function insertE1Line(client, companyId, seasonId, sourceDocumentId, importBatchId, line) {
  const result = await client.query(
    `insert into tbr_e1_accounting_lines (
       company_id,
       season_id,
       source_document_id,
       import_batch_id,
       source_import_key,
       source_row_key,
       source_workbook_name,
       source_sheet_name,
       source_row_number,
       season_code,
       invoice_number,
       item,
       status_text,
       normalized_status,
       line_type,
       pnl_treatment,
       overlap_category_key,
       source_amount,
       source_currency,
       fx_rate,
       fx_source,
       reporting_amount_usd,
       due_amount_source,
       due_amount_reporting_usd,
       comments,
       metadata
     )
     values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb
     )
     returning id`,
    [
      companyId,
      seasonId,
      sourceDocumentId,
      importBatchId,
      line.sourceImportKey,
      line.sourceRowKey,
      line.sourceWorkbookName,
      line.sourceSheetName,
      line.sourceRowNumber,
      line.seasonCode,
      line.invoiceNumber,
      line.item,
      line.statusText,
      line.normalizedStatus,
      line.lineType,
      line.pnlTreatment,
      line.overlapCategoryKey,
      line.sourceAmount,
      line.sourceCurrency,
      line.fxRate,
      line.fxSource,
      line.reportingAmountUsd,
      line.dueAmountSource,
      line.dueAmountReportingUsd,
      line.comments,
      JSON.stringify(line.metadata)
    ]
  );

  return result.rows[0].id;
}

async function insertReconciliationLink(client, params) {
  await client.query(
    `insert into tbr_e1_operating_reconciliation_links (
       season_id,
       e1_line_id,
       operating_line_id,
       overlap_policy,
       overlap_category_key,
       notes
     )
     values ($1, $2, $3, 'variance_only', $4, $5)
     on conflict (e1_line_id, overlap_category_key) do update
       set operating_line_id = excluded.operating_line_id,
           notes = excluded.notes`,
    [
      params.seasonId,
      params.e1LineId,
      params.operatingLineId,
      params.overlapCategoryKey,
      "Linked by TBR season finance normalizer using variance-only policy."
    ]
  );
}

function summarizeParsed(operatingLines, e1Lines) {
  const sumBy = (rows, key) =>
    rows.reduce((acc, row) => {
      const value = row[key] ?? "unknown";
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});

  const operatingBaseline = operatingLines
    .filter((line) => line.lineKind === "season_category_summary" && line.includeInOperatingBaseline)
    .reduce((sum, line) => sum + line.reportingAmountUsd, 0);
  const overlapRows = e1Lines.filter((line) => line.pnlTreatment === "overlap_variance").length;
  const sourceChecks = e1Lines.filter((line) => line.lineType === "source_check").length;

  return {
    operatingLines: operatingLines.length,
    e1Lines: e1Lines.length,
    operatingBaseline: Number(operatingBaseline.toFixed(2)),
    operatingByKind: sumBy(operatingLines, "lineKind"),
    e1ByTreatment: sumBy(e1Lines, "pnlTreatment"),
    overlapRows,
    sourceChecks
  };
}

async function writeToDatabase({ tbrPlanPath, e1SummaryPath, operatingLines, e1Lines }) {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  await loadEnvFile(path.join(projectRoot, "apps", "web", ".env.local"));

  const client = new Client({ connectionString: deriveImportUrl() });
  await client.connect();

  try {
    await client.query("begin");

    const companyRows = await client.query(`select id from companies where code = 'TBR'::company_code limit 1`);
    const companyId = companyRows.rows[0]?.id;
    if (!companyId) throw new Error("TBR company not found.");

    const seasonIds = await ensureSeasons(client, companyId);
    await clearExistingRows(client);

    const sourceDocuments = new Map();
    const importBatches = new Map();
    const fileHashes = {
      [TBR_WORKBOOK_NAME]: await fileHash(tbrPlanPath),
      [E1_WORKBOOK_NAME]: await fileHash(e1SummaryPath)
    };

    for (const row of [...operatingLines, ...e1Lines]) {
      const key = `${row.sourceWorkbookName}::${row.sourceSheetName}`;
      if (sourceDocuments.has(key)) continue;

      const sourceDocumentId = await ensureSourceDocument(client, {
        companyId,
        sourceIdentifier: `tbr-season-finance:${row.sourceWorkbookName}:${row.sourceSheetName}`,
        sourceName: `${row.sourceWorkbookName} :: ${row.sourceSheetName}`,
        metadata: {
          workflow: row.sourceWorkbookName === TBR_WORKBOOK_NAME ? "season_planning_control" : "e1_vendor_payables",
          workbookName: row.sourceWorkbookName,
          sheetName: row.sourceSheetName,
          fileHash: fileHashes[row.sourceWorkbookName]
        }
      });

      const importBatchId = await createImportBatch(client, {
        companyId,
        sourceName: `${row.sourceWorkbookName} :: ${row.sourceSheetName}`,
        metadata: {
          workflow: row.sourceWorkbookName === TBR_WORKBOOK_NAME ? "season_planning_control" : "e1_vendor_payables",
          workbookName: row.sourceWorkbookName,
          sheetName: row.sourceSheetName,
          fileHash: fileHashes[row.sourceWorkbookName]
        }
      });

      sourceDocuments.set(key, sourceDocumentId);
      importBatches.set(key, importBatchId);
    }

    const operatingLineIds = new Map();
    for (const line of operatingLines) {
      const seasonId = seasonIds.get(line.seasonCode);
      const sourceKey = `${line.sourceWorkbookName}::${line.sourceSheetName}`;
      const id = await insertOperatingLine(
        client,
        companyId,
        seasonId,
        sourceDocuments.get(sourceKey),
        importBatches.get(sourceKey),
        line
      );
      operatingLineIds.set(line.sourceImportKey, id);
      await insertRawRow(client, {
        importBatchId: importBatches.get(sourceKey),
        sourceDocumentId: sourceDocuments.get(sourceKey),
        sourceRowKey: line.sourceImportKey,
        payload: line,
        canonicalTargetTable: "tbr_operating_expense_lines",
        canonicalTargetId: id
      });
    }

    const operatingBaselineBySeasonCategory = new Map();
    for (const line of operatingLines) {
      if (line.lineKind !== "season_category_summary") continue;
      operatingBaselineBySeasonCategory.set(
        `${line.seasonCode}:${line.categoryKey}`,
        operatingLineIds.get(line.sourceImportKey)
      );
    }

    let reconciliationLinks = 0;
    for (const line of e1Lines) {
      const seasonId = seasonIds.get(line.seasonCode);
      const sourceKey = `${line.sourceWorkbookName}::${line.sourceSheetName}`;
      const id = await insertE1Line(
        client,
        companyId,
        seasonId,
        sourceDocuments.get(sourceKey),
        importBatches.get(sourceKey),
        line
      );
      await insertRawRow(client, {
        importBatchId: importBatches.get(sourceKey),
        sourceDocumentId: sourceDocuments.get(sourceKey),
        sourceRowKey: line.sourceImportKey,
        payload: line,
        canonicalTargetTable: "tbr_e1_accounting_lines",
        canonicalTargetId: id
      });

      if (line.pnlTreatment === "overlap_variance" && line.overlapCategoryKey) {
        await insertReconciliationLink(client, {
          seasonId,
          e1LineId: id,
          operatingLineId: operatingBaselineBySeasonCategory.get(`${line.seasonCode}:${line.overlapCategoryKey}`) ?? null,
          overlapCategoryKey: line.overlapCategoryKey
        });
        reconciliationLinks += 1;
      }
    }

    await client.query("commit");
    return { ...summarizeParsed(operatingLines, e1Lines), reconciliationLinks };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  await loadEnvFile(path.join(projectRoot, "apps", "web", ".env.local"));

  const args = parseArgs();
  const operatingLines = parseTbrFinancialPlan(args.tbrFinancialPlanPath);
  const e1Lines = parseE1Summary(args.e1SummaryPath);

  const result = args.dryRun
    ? summarizeParsed(operatingLines, e1Lines)
    : await writeToDatabase({
        tbrPlanPath: args.tbrFinancialPlanPath,
        e1SummaryPath: args.e1SummaryPath,
        operatingLines,
        e1Lines
      });

  const output = {
    workflow: "tbr_season_finance",
    mode: args.dryRun ? "dry-run" : "database-write",
    ...result
  };

  process.stdout.write(args.json ? `${JSON.stringify(output)}\n` : `${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
