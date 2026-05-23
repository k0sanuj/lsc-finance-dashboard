import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import pg from "pg";
import xlsx from "xlsx";

const { Client } = pg;

const DEFAULT_WORKBOOK = "/Users/anujsingh/Downloads/TBR_P_L_Statement.xlsx";
const WORKBOOK_NAME = "TBR_P_L_Statement.xlsx";
const SCENARIO_CODE = "tbr-management-reference";
const SOURCE_MODULE = "tbr_pnl_workbook";

const EXPECTED_TOTALS = {
  S1: { revenue: 250000, expense: 1205318.95, net: -955318.95 },
  S2: { revenue: 116459, expense: 406116.83, net: -289657.83 },
  S3: { revenue: 292500, expense: 578717.46, net: -286217.46 }
};

const SEASONS = [
  { code: "S1", label: "Season 1", fiscalYear: 2024, order: 1, status: "actual" },
  { code: "S2", label: "Season 2", fiscalYear: 2025, order: 2, status: "actual" },
  { code: "S3", label: "Season 3", fiscalYear: 2026, order: 3, status: "management" }
];

const SECTION_ORDER = {
  revenue: 10,
  race_operations: 20,
  spare_parts: 30,
  e1_league_setup: 40,
  race_specific_actuals: 50,
  personnel_payroll: 60
};

const SECTION_LABELS = {
  revenue: "Revenue",
  race_operations: "Race Operations & Logistics",
  spare_parts: "Spare Parts",
  e1_league_setup: "E1 League Fees & Pre-Operational Setup",
  race_specific_actuals: "Race-Specific Actuals",
  personnel_payroll: "Personnel / Payroll"
};

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slug(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "line";
}

function stableHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function fileHash(filePath) {
  return stableHash(await fs.readFile(filePath));
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
    apply: args.has("--apply"),
    json: args.has("--json"),
    workbookPath: valueAfter("--workbook", process.env.TBR_PNL_STATEMENT_XLSX ?? DEFAULT_WORKBOOK)
  };
}

function parseNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  const raw = normalizeWhitespace(value);
  if (!raw || raw === "-" || raw.includes("#REF!")) return 0;
  const negative = /^\(.+\)$/.test(raw) || /^-/.test(raw);
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return 0;
  const parsed = Number.parseFloat(digits);
  if (!Number.isFinite(parsed)) return 0;
  return Number((negative ? -parsed : parsed).toFixed(2));
}

function readWorkbook(workbookPath) {
  const workbook = xlsx.readFile(workbookPath, { cellDates: true });
  const sheet = (name) => {
    const ws = workbook.Sheets[name];
    if (!ws) throw new Error(`Workbook is missing required sheet "${name}".`);
    return xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  };
  return { workbook, sheet };
}

function cell(rows, rowNumber, columnIndex) {
  return rows[rowNumber - 1]?.[columnIndex] ?? null;
}

function inferStatus({ seasonCode, sectionCode, label, notes }) {
  const text = `${label} ${notes ?? ""}`.toLowerCase();
  if (text.includes("non-cash") || text.includes("ifrs 2") || text.includes("asc 718")) return "non_cash";
  if (text.includes("reserve fund") || text.includes("contingency")) return "contingency";
  if (seasonCode === "S3") {
    if (text.includes("partial")) return "partial_actual";
    if (text.includes("pending") || text.includes("tbd") || text.includes("awaiting")) return "pending";
    if (text.includes("actual") && !text.includes("forecast")) return "actual";
    if (sectionCode === "revenue" || text.includes("scenario-driven")) return "forecast";
    return "mixed_actual_forecast";
  }
  return "actual";
}

function makeLine({
  seasonCode,
  sheetName,
  rowNumber,
  lineCode,
  label,
  amount,
  sectionCode,
  statementRole,
  lineOrder,
  notes,
  dataStatus,
  includeInPnl = true,
  metadata = {}
}) {
  const normalizedLabel = normalizeWhitespace(label);
  const finalLineCode = lineCode ?? slug(normalizedLabel);
  return {
    sourceImportKey: [
      "pnl",
      WORKBOOK_NAME,
      sheetName,
      seasonCode,
      `r${rowNumber}`,
      finalLineCode
    ].join(":"),
    sourceRowKey: `${WORKBOOK_NAME}:${sheetName}:row-${rowNumber}:${seasonCode}:${finalLineCode}`,
    sourceWorkbookName: WORKBOOK_NAME,
    sourceSheetName: sheetName,
    sourceRowNumber: rowNumber,
    periodCode: seasonCode,
    lineCode: finalLineCode,
    parentLineCode: null,
    lineLabel: normalizedLabel,
    lineOrder,
    sectionCode,
    sectionLabel: SECTION_LABELS[sectionCode],
    sectionOrder: SECTION_ORDER[sectionCode],
    statementRole,
    lineKind: "detail",
    dataStatus: dataStatus ?? inferStatus({ seasonCode, sectionCode, label, notes }),
    includeInPnl,
    sourceAmount: Number(Math.abs(amount).toFixed(2)),
    sourceCurrency: "USD",
    fxRate: 1,
    fxSource: "workbook_usd",
    reportingAmountUsd: Number(Math.abs(amount).toFixed(2)),
    notes: normalizeWhitespace(notes) || null,
    metadata
  };
}

function sourceCheck({ seasonCode, sheetName, rowNumber, label, amount, lineOrder, metadata = {} }) {
  return {
    ...makeLine({
      seasonCode,
      sheetName,
      rowNumber,
      lineCode: `source_check_${slug(label)}`,
      label,
      amount,
      sectionCode: "revenue",
      statementRole: "memo",
      lineOrder,
      notes: "Workbook source check row. Stored for validation, excluded from P&L totals.",
      dataStatus: "source_check",
      includeInPnl: false,
      metadata
    }),
    lineKind: "source_check"
  };
}

function raceMetadata(rows, rowNumber) {
  const raceNames = ["Jeddah", "Lake Como", "Dubrovnik", "Monaco", "Luanda", "Lagos", "Miami", "Bahamas"];
  const raceColumns = raceNames.map((raceName, index) => ({
    raceName,
    amountUsd: parseNumber(cell(rows, rowNumber, 2 + index))
  }));
  return { raceColumns };
}

function parseSeasonOne(sheet) {
  const rows = sheet("Season 1 P&L");
  const lines = [];
  const pushRevenue = (rowNumber, lineCode, lineOrder) => {
    lines.push(makeLine({
      seasonCode: "S1",
      sheetName: "Season 1 P&L",
      rowNumber,
      lineCode,
      label: cell(rows, rowNumber, 1),
      amount: parseNumber(cell(rows, rowNumber, 3)),
      sectionCode: "revenue",
      statementRole: "revenue",
      lineOrder,
      notes: cell(rows, rowNumber, 5)
    }));
  };
  pushRevenue(6, "sponsorship", 10);
  pushRevenue(7, "prize_pool", 20);
  pushRevenue(8, "central_revenue_pool_share", 30);

  for (let rowNumber = 13; rowNumber <= 27; rowNumber += 1) {
    const label = cell(rows, rowNumber, 1);
    if (!normalizeWhitespace(label)) continue;
    const sectionCode = /spare parts/i.test(label) ? "spare_parts" : "race_operations";
    lines.push(makeLine({
      seasonCode: "S1",
      sheetName: "Season 1 P&L",
      rowNumber,
      label,
      amount: parseNumber(cell(rows, rowNumber, 3)),
      sectionCode,
      statementRole: "expense",
      lineOrder: rowNumber * 10,
      notes: cell(rows, rowNumber, 5)
    }));
  }

  lines.push(makeLine({
    seasonCode: "S1",
    sheetName: "Season 1 P&L",
    rowNumber: 31,
    lineCode: "pre_operational_setup_costs",
    label: cell(rows, 31, 1),
    amount: parseNumber(cell(rows, 31, 3)),
    sectionCode: "e1_league_setup",
    statementRole: "expense",
    lineOrder: 310,
    notes: cell(rows, 31, 5)
  }));

  for (const rowNumber of [34, 35, 36]) {
    lines.push(makeLine({
      seasonCode: "S1",
      sheetName: "Season 1 P&L",
      rowNumber,
      label: cell(rows, rowNumber, 1),
      amount: parseNumber(cell(rows, rowNumber, 3)),
      sectionCode: "personnel_payroll",
      statementRole: "expense",
      lineOrder: rowNumber * 10,
      notes: cell(rows, rowNumber, 5)
    }));
  }

  lines.push(sourceCheck({ seasonCode: "S1", sheetName: "Season 1 P&L", rowNumber: 9, label: "Total Revenue", amount: parseNumber(cell(rows, 9, 3)), lineOrder: 900 }));
  lines.push(sourceCheck({ seasonCode: "S1", sheetName: "Season 1 P&L", rowNumber: 39, label: "TOTAL EXPENSES", amount: parseNumber(cell(rows, 39, 3)), lineOrder: 910 }));
  lines.push(sourceCheck({ seasonCode: "S1", sheetName: "Season 1 P&L", rowNumber: 41, label: "NET INCOME / (LOSS)", amount: parseNumber(cell(rows, 41, 3)), lineOrder: 920 }));
  return lines;
}

function parseSeasonTwo(sheet) {
  const rows = sheet("Season 2 P&L");
  const lines = [];
  const pushRevenue = (rowNumber, lineCode, lineOrder) => {
    lines.push(makeLine({
      seasonCode: "S2",
      sheetName: "Season 2 P&L",
      rowNumber,
      lineCode,
      label: cell(rows, rowNumber, 1),
      amount: parseNumber(cell(rows, rowNumber, 3)),
      sectionCode: "revenue",
      statementRole: "revenue",
      lineOrder,
      notes: cell(rows, rowNumber, 5)
    }));
  };
  pushRevenue(6, "sponsorship", 10);
  pushRevenue(7, "prize_pool", 20);
  pushRevenue(8, "central_revenue_pool_share", 30);

  for (let rowNumber = 13; rowNumber <= 31; rowNumber += 1) {
    const label = cell(rows, rowNumber, 1);
    if (!normalizeWhitespace(label)) continue;
    const sectionCode = /stock-based/i.test(label) ? "personnel_payroll" : "race_operations";
    lines.push(makeLine({
      seasonCode: "S2",
      sheetName: "Season 2 P&L",
      rowNumber,
      label,
      amount: parseNumber(cell(rows, rowNumber, 3)),
      sectionCode,
      statementRole: "expense",
      lineOrder: rowNumber * 10,
      notes: cell(rows, rowNumber, 5)
    }));
  }

  lines.push(makeLine({
    seasonCode: "S2",
    sheetName: "Season 2 P&L",
    rowNumber: 35,
    lineCode: "operating_fee_s2",
    label: cell(rows, 35, 1),
    amount: parseNumber(cell(rows, 35, 3)),
    sectionCode: "e1_league_setup",
    statementRole: "expense",
    lineOrder: 350,
    notes: cell(rows, 35, 5),
    dataStatus: "pending"
  }));

  for (const rowNumber of [39, 40, 41]) {
    lines.push(makeLine({
      seasonCode: "S2",
      sheetName: "Season 2 P&L",
      rowNumber,
      label: cell(rows, rowNumber, 1),
      amount: parseNumber(cell(rows, rowNumber, 3)),
      sectionCode: "spare_parts",
      statementRole: "memo",
      lineOrder: rowNumber * 10,
      notes: `${cell(rows, rowNumber, 5) ?? ""} Stored as source detail; subtotal is zero in source workbook.`,
      dataStatus: "source_check",
      includeInPnl: false
    }));
  }

  for (const rowNumber of [44, 45, 46]) {
    lines.push(makeLine({
      seasonCode: "S2",
      sheetName: "Season 2 P&L",
      rowNumber,
      label: cell(rows, rowNumber, 1),
      amount: parseNumber(cell(rows, rowNumber, 3)),
      sectionCode: "personnel_payroll",
      statementRole: "expense",
      lineOrder: rowNumber * 10,
      notes: cell(rows, rowNumber, 5)
    }));
  }

  lines.push(sourceCheck({ seasonCode: "S2", sheetName: "Season 2 P&L", rowNumber: 9, label: "Total Revenue", amount: parseNumber(cell(rows, 9, 3)), lineOrder: 900 }));
  lines.push(sourceCheck({ seasonCode: "S2", sheetName: "Season 2 P&L", rowNumber: 49, label: "TOTAL EXPENSES", amount: parseNumber(cell(rows, 49, 3)), lineOrder: 910 }));
  lines.push(sourceCheck({ seasonCode: "S2", sheetName: "Season 2 P&L", rowNumber: 51, label: "NET INCOME / (LOSS)", amount: parseNumber(cell(rows, 51, 3)), lineOrder: 920 }));
  return lines;
}

function parseSeasonThree(sheet) {
  const rows = sheet("Season 3 Forecast P&L");
  const lines = [];
  const pushRevenue = (rowNumber, lineCode, lineOrder) => {
    lines.push(makeLine({
      seasonCode: "S3",
      sheetName: "Season 3 Forecast P&L",
      rowNumber,
      lineCode,
      label: cell(rows, rowNumber, 1),
      amount: parseNumber(cell(rows, rowNumber, 10)),
      sectionCode: "revenue",
      statementRole: "revenue",
      lineOrder,
      notes: cell(rows, rowNumber, 11),
      dataStatus: "forecast"
    }));
  };
  pushRevenue(9, "sponsorship", 10);
  pushRevenue(10, "prize_pool", 20);
  pushRevenue(11, "central_revenue_pool_share", 30);

  for (let rowNumber = 16; rowNumber <= 26; rowNumber += 1) {
    const label = cell(rows, rowNumber, 1);
    if (!normalizeWhitespace(label)) continue;
    lines.push(makeLine({
      seasonCode: "S3",
      sheetName: "Season 3 Forecast P&L",
      rowNumber,
      label,
      amount: parseNumber(cell(rows, rowNumber, 10)),
      sectionCode: "race_operations",
      statementRole: "expense",
      lineOrder: rowNumber * 10,
      notes: cell(rows, rowNumber, 11),
      metadata: raceMetadata(rows, rowNumber)
    }));
  }

  for (let rowNumber = 30; rowNumber <= 37; rowNumber += 1) {
    const label = cell(rows, rowNumber, 1);
    if (!normalizeWhitespace(label)) continue;
    lines.push(makeLine({
      seasonCode: "S3",
      sheetName: "Season 3 Forecast P&L",
      rowNumber,
      label,
      amount: parseNumber(cell(rows, rowNumber, 10)),
      sectionCode: "race_operations",
      statementRole: "expense",
      lineOrder: rowNumber * 10,
      notes: cell(rows, rowNumber, 11),
      metadata: raceMetadata(rows, rowNumber)
    }));
  }

  for (const rowNumber of [41, 42]) {
    lines.push(makeLine({
      seasonCode: "S3",
      sheetName: "Season 3 Forecast P&L",
      rowNumber,
      label: cell(rows, rowNumber, 1),
      amount: parseNumber(cell(rows, rowNumber, 10)),
      sectionCode: "spare_parts",
      statementRole: "expense",
      lineOrder: rowNumber * 10,
      notes: cell(rows, rowNumber, 11),
      metadata: raceMetadata(rows, rowNumber)
    }));
  }

  lines.push(makeLine({
    seasonCode: "S3",
    sheetName: "Season 3 Forecast P&L",
    rowNumber: 46,
    label: cell(rows, 46, 1),
    amount: parseNumber(cell(rows, 46, 10)),
    sectionCode: "race_specific_actuals",
    statementRole: "expense",
    lineOrder: 460,
    notes: cell(rows, 46, 11),
    dataStatus: "actual",
    metadata: raceMetadata(rows, 46)
  }));

  lines.push(makeLine({
    seasonCode: "S3",
    sheetName: "Season 3 Forecast P&L",
    rowNumber: 50,
    lineCode: "operating_fee_s3",
    label: cell(rows, 50, 1),
    amount: parseNumber(cell(rows, 50, 10)),
    sectionCode: "e1_league_setup",
    statementRole: "expense",
    lineOrder: 500,
    notes: cell(rows, 50, 11),
    dataStatus: "pending"
  }));

  for (const rowNumber of [53, 54, 55]) {
    lines.push(makeLine({
      seasonCode: "S3",
      sheetName: "Season 3 Forecast P&L",
      rowNumber,
      label: cell(rows, rowNumber, 1),
      amount: parseNumber(cell(rows, rowNumber, 10)),
      sectionCode: "personnel_payroll",
      statementRole: "expense",
      lineOrder: rowNumber * 10,
      notes: cell(rows, rowNumber, 11),
      dataStatus: "mixed_actual_forecast"
    }));
  }

  lines.push(sourceCheck({ seasonCode: "S3", sheetName: "Season 3 Forecast P&L", rowNumber: 12, label: "Total Revenue", amount: parseNumber(cell(rows, 12, 10)), lineOrder: 900 }));
  lines.push(sourceCheck({ seasonCode: "S3", sheetName: "Season 3 Forecast P&L", rowNumber: 58, label: "TOTAL EXPENSES", amount: parseNumber(cell(rows, 58, 10)), lineOrder: 910 }));
  lines.push(sourceCheck({ seasonCode: "S3", sheetName: "Season 3 Forecast P&L", rowNumber: 60, label: "NET INCOME / (LOSS)", amount: parseNumber(cell(rows, 60, 10)), lineOrder: 920 }));
  return lines;
}

function parseAssumptions(sheet) {
  const rows = sheet("Assumptions");
  const assumptions = [];
  for (const rowNumber of [11, 12, 13, 14]) {
    const label = normalizeWhitespace(cell(rows, rowNumber, 0));
    if (!label) continue;
    assumptions.push({
      key: `s3_prize_${slug(label)}`,
      label: `S3 prize scenario: ${label}`,
      type: "scenario_option",
      optionOrder: rowNumber - 10,
      sourceAmount: parseNumber(cell(rows, rowNumber, 1)),
      sourceCurrency: "EUR",
      fxRate: 1.17,
      reportingAmountUsd: parseNumber(cell(rows, rowNumber, 2)),
      valueText: label,
      isSelected: label === normalizeWhitespace(cell(rows, 16, 1)),
      metadata: { sourceSheetName: "Assumptions", sourceRowNumber: rowNumber }
    });
  }

  for (const rowNumber of [23, 24, 25, 26]) {
    const label = normalizeWhitespace(cell(rows, rowNumber, 0));
    if (!label) continue;
    assumptions.push({
      key: `s3_pilot_bonus_${slug(label)}`,
      label: `S3 pilot bonus scenario: ${label}`,
      type: "scenario_option",
      optionOrder: rowNumber - 20,
      sourceAmount: parseNumber(cell(rows, rowNumber, 1)),
      sourceCurrency: "USD",
      fxRate: 1,
      reportingAmountUsd: parseNumber(cell(rows, rowNumber, 1)),
      valueText: label,
      isSelected: parseNumber(cell(rows, rowNumber, 1)) === parseNumber(cell(rows, 29, 1)),
      metadata: { sourceSheetName: "Assumptions", sourceRowNumber: rowNumber }
    });
  }

  for (const rowNumber of [6, 7, 8, 9]) {
    const label = normalizeWhitespace(cell(rows, rowNumber, 0));
    if (!label) continue;
    assumptions.push({
      key: `fx_${slug(label)}`,
      label: `FX rate: ${label}`,
      type: "rate",
      optionOrder: rowNumber,
      sourceAmount: null,
      sourceCurrency: null,
      fxRate: null,
      reportingAmountUsd: null,
      valueText: JSON.stringify({
        S1: parseNumber(cell(rows, rowNumber, 1)),
        S2: parseNumber(cell(rows, rowNumber, 2)),
        S3: parseNumber(cell(rows, rowNumber, 3))
      }),
      isSelected: true,
      metadata: { notes: cell(rows, rowNumber, 4), sourceSheetName: "Assumptions", sourceRowNumber: rowNumber }
    });
  }
  return assumptions;
}

function parseWorkbook(workbookPath) {
  const { sheet } = readWorkbook(workbookPath);
  const lines = [
    ...parseSeasonOne(sheet),
    ...parseSeasonTwo(sheet),
    ...parseSeasonThree(sheet)
  ];
  const assumptions = parseAssumptions(sheet);
  const summary = summarize(lines);
  validateTotals(summary);
  return { lines, assumptions, summary };
}

function summarize(lines) {
  const bySeason = {};
  for (const season of SEASONS) {
    const seasonLines = lines.filter((line) => line.periodCode === season.code && line.lineKind === "detail" && line.includeInPnl);
    const revenue = seasonLines
      .filter((line) => line.statementRole === "revenue")
      .reduce((sum, line) => sum + line.reportingAmountUsd, 0);
    const expense = seasonLines
      .filter((line) => line.statementRole === "expense")
      .reduce((sum, line) => sum + line.reportingAmountUsd, 0);
    bySeason[season.code] = {
      revenue: Number(revenue.toFixed(2)),
      expense: Number(expense.toFixed(2)),
      net: Number((revenue - expense).toFixed(2)),
      detailLines: seasonLines.length
    };
  }
  return {
    lineCount: lines.length,
    includedLineCount: lines.filter((line) => line.lineKind === "detail" && line.includeInPnl).length,
    assumptions: 0,
    bySeason
  };
}

function validateTotals(summary) {
  const errors = [];
  for (const [season, expected] of Object.entries(EXPECTED_TOTALS)) {
    const actual = summary.bySeason[season];
    for (const key of ["revenue", "expense", "net"]) {
      if (Math.abs(actual[key] - expected[key]) > 0.01) {
        errors.push(`${season} ${key} expected ${expected[key]} but parsed ${actual[key]}`);
      }
    }
  }
  if (errors.length) throw new Error(`TBR P&L workbook validation failed:\n${errors.join("\n")}`);
}

async function ensureSourceDocument(client, companyId, workbookPath, hash) {
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
      companyId,
      `tbr-pnl-statement:${hash}`,
      WORKBOOK_NAME,
      JSON.stringify({ workflow: "universal_pnl_statement", workbookPath, fileHash: hash })
    ]
  );
  return result.rows[0].id;
}

async function createImportBatch(client, companyId, hash) {
  const result = await client.query(
    `insert into import_batches (company_id, source_system, source_name, status, metadata)
     values ($1, 'xlsx_upload', $2, 'completed', $3::jsonb)
     returning id`,
    [
      companyId,
      WORKBOOK_NAME,
      JSON.stringify({ workflow: "universal_pnl_statement", fileHash: hash, scenarioCode: SCENARIO_CODE })
    ]
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

async function writeToDatabase(workbookPath, parsed) {
  const hash = await fileHash(workbookPath);
  const client = new Client({ connectionString: deriveImportUrl() });
  await client.connect();

  try {
    await client.query("begin");
    const companyResult = await client.query(`select id from companies where code = 'TBR'::company_code limit 1`);
    const companyId = companyResult.rows[0]?.id;
    if (!companyId) throw new Error("TBR company not found.");

    const sourceDocumentId = await ensureSourceDocument(client, companyId, workbookPath, hash);
    const importBatchId = await createImportBatch(client, companyId, hash);

    await client.query(
      `delete from finance_pnl_scenarios
       where owner_type = 'entity'
         and owner_code = 'TBR'
         and scenario_code = $1`,
      [SCENARIO_CODE]
    );

    const scenarioResult = await client.query(
      `insert into finance_pnl_scenarios (
         owner_type,
         owner_code,
         company_id,
         scenario_code,
         scenario_name,
         scenario_type,
         is_default,
         reporting_currency,
         source_document_id,
         assumptions,
         notes
       )
       values ('entity', 'TBR', $1, $2, 'TBR Management P&L Reference', 'management', true, 'USD', $3, $4::jsonb, $5)
       returning id`,
      [
        companyId,
        SCENARIO_CODE,
        sourceDocumentId,
        JSON.stringify({
          selectedS3PrizeScenario: "1st Place",
          s3Treatment: "first_two_races_actual_or_partial_actual_rest_forecast"
        }),
        "Imported from latest TBR P&L statement workbook. S3 is management P&L with scenario-driven prize and bonus assumptions."
      ]
    );
    const scenarioId = scenarioResult.rows[0].id;

    const periods = new Map();
    for (const season of SEASONS) {
      const periodResult = await client.query(
        `insert into finance_pnl_periods (
           scenario_id,
           period_code,
           period_label,
           period_order,
           fiscal_year,
           period_type,
           status,
           metadata
         )
         values ($1, $2, $3, $4, $5, 'season', $6, $7::jsonb)
         returning id`,
        [
          scenarioId,
          season.code,
          season.label,
          season.order,
          season.fiscalYear,
          season.status,
          JSON.stringify({ sourceWorkbook: WORKBOOK_NAME })
        ]
      );
      periods.set(season.code, periodResult.rows[0].id);
    }

    for (const assumption of parsed.assumptions) {
      await client.query(
        `insert into finance_pnl_assumptions (
           scenario_id,
           assumption_key,
           assumption_label,
           assumption_type,
           option_order,
           source_amount,
           source_currency,
           fx_rate,
           reporting_amount_usd,
           value_text,
           is_selected,
           source_document_id,
           metadata
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
        [
          scenarioId,
          assumption.key,
          assumption.label,
          assumption.type,
          assumption.optionOrder,
          assumption.sourceAmount,
          assumption.sourceCurrency,
          assumption.fxRate,
          assumption.reportingAmountUsd,
          assumption.valueText,
          assumption.isSelected,
          sourceDocumentId,
          JSON.stringify(assumption.metadata)
        ]
      );
    }

    for (const line of parsed.lines) {
      const periodId = periods.get(line.periodCode);
      const insertResult = await client.query(
        `insert into finance_pnl_line_items (
           scenario_id,
           period_id,
           company_id,
           source_document_id,
           import_batch_id,
           source_import_key,
           source_module,
           source_workbook_name,
           source_sheet_name,
           source_row_number,
           line_code,
           parent_line_code,
           line_label,
           line_order,
           section_code,
           section_label,
           section_order,
           statement_role,
           line_kind,
           data_status,
           include_in_pnl,
           source_amount,
           source_currency,
           fx_rate,
           fx_source,
           reporting_amount_usd,
           notes,
           metadata
         )
         values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19,
           $20, $21, $22, $23, $24, $25, $26, $27, $28::jsonb
         )
         returning id`,
        [
          scenarioId,
          periodId,
          companyId,
          sourceDocumentId,
          importBatchId,
          line.sourceImportKey,
          SOURCE_MODULE,
          line.sourceWorkbookName,
          line.sourceSheetName,
          line.sourceRowNumber,
          line.lineCode,
          line.parentLineCode,
          line.lineLabel,
          line.lineOrder,
          line.sectionCode,
          line.sectionLabel,
          line.sectionOrder,
          line.statementRole,
          line.lineKind,
          line.dataStatus,
          line.includeInPnl,
          line.sourceAmount,
          line.sourceCurrency,
          line.fxRate,
          line.fxSource,
          line.reportingAmountUsd,
          line.notes,
          JSON.stringify(line.metadata)
        ]
      );
      const lineId = insertResult.rows[0].id;
      const rawImportRowId = await insertRawRow(client, {
        importBatchId,
        sourceDocumentId,
        sourceRowKey: line.sourceRowKey,
        payload: line,
        canonicalTargetTable: "finance_pnl_line_items",
        canonicalTargetId: lineId
      });
      await client.query(`update finance_pnl_line_items set raw_import_row_id = $1 where id = $2`, [
        rawImportRowId,
        lineId
      ]);
    }

    const quarantine = await client.query(
      `insert into finance_reporting_exclusions (
         source_table,
         source_id,
         reason,
         excluded_from_reporting,
         quarantined_by,
         notes,
         metadata
       )
       select
         'revenue_records',
         rr.id::text,
         'tbr_pnl_workbook_conflict',
         true,
         'import-tbr-pnl-statement',
         'Excluded because latest TBR P&L workbook states Season 3 sponsorship is $0; record remains preserved for audit.',
         jsonb_build_object('workbook', $1::text, 'scenarioCode', $2::text)
       from revenue_records rr
       join companies c on c.id = rr.company_id
       where c.code = 'TBR'::company_code
         and rr.revenue_type = 'sponsorship'
         and extract(year from rr.recognition_date)::integer = 2026
         and abs(rr.amount - 2222.22) < 0.01
       on conflict (source_table, source_id, reason) do update
         set excluded_from_reporting = true,
             notes = excluded.notes,
             metadata = excluded.metadata
       returning source_id`,
      [WORKBOOK_NAME, SCENARIO_CODE]
    );

    await client.query(
      `insert into audit_log (
         entity_type,
         entity_id,
         trigger,
         action,
         after_state,
         performed_by,
         agent_id
       )
       values ('finance_pnl_scenario', $1, 'tbr_pnl_statement_import', 'import', $2::jsonb, 'import-tbr-pnl-statement', 'codex')`,
      [
        scenarioId,
        JSON.stringify({
          sourceDocumentId,
          importBatchId,
          summary: parsed.summary,
          quarantinedConflictingRevenueRows: quarantine.rows.length
        })
      ]
    );

    await client.query("commit");
    return {
      scenarioId,
      sourceDocumentId,
      importBatchId,
      quarantinedConflictingRevenueRows: quarantine.rows.length
    };
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
  const parsed = parseWorkbook(args.workbookPath);
  parsed.summary.assumptions = parsed.assumptions.length;

  const dbResult = args.apply ? await writeToDatabase(args.workbookPath, parsed) : null;
  const output = {
    workflow: "tbr_pnl_statement",
    mode: args.apply ? "database-write" : "dry-run",
    workbookPath: args.workbookPath,
    expectedTotals: EXPECTED_TOTALS,
    ...parsed.summary,
    ...(dbResult ?? {})
  };

  process.stdout.write(args.json ? `${JSON.stringify(output)}\n` : `${JSON.stringify(output, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export {
  EXPECTED_TOTALS,
  parseWorkbook,
  summarize,
  validateTotals
};
