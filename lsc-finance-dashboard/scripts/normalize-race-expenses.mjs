import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const RACE_WORKBOOKS = {
  "Reimbursement and Bill Reports - Jeddah S1.xlsx": {
    code: "S1_JEDDAH",
    name: "Jeddah",
    location: "Saudi Arabia",
    startDate: "2024-02-02",
    endDate: "2024-02-03",
    seasonYear: 2024
  },
  "Reimbursements and Bill Reports - Milan S1.xlsx": {
    code: "S1_MILAN_TEST",
    name: "Milan / Lake Maggiore Test",
    location: "Italy",
    startDate: null,
    endDate: null,
    seasonYear: 2024
  },
  "Reimbursements and Bills Report - Venice S1.xlsx": {
    code: "S1_VENICE",
    name: "Venice",
    location: "Italy",
    startDate: "2024-05-11",
    endDate: "2024-05-12",
    seasonYear: 2024
  },
  "Reimbursements and Bill S2 Jeddah.xlsx": {
    code: "S2_JEDDAH",
    name: "Jeddah",
    location: "Saudi Arabia",
    startDate: "2025-01-24",
    endDate: "2025-01-25",
    seasonYear: 2025
  },
  "Reimbursements and Bill S2 DOha.xlsx": {
    code: "S2_DOHA",
    name: "Doha",
    location: "Qatar",
    startDate: "2025-02-21",
    endDate: "2025-02-22",
    seasonYear: 2025
  },
  "Reimbursements and Bill S2 Dubrovnik.xlsx": {
    code: "S2_DUBROVNIK",
    name: "Dubrovnik",
    location: "Croatia",
    startDate: "2025-06-13",
    endDate: "2025-06-14",
    seasonYear: 2025
  },
  "Reimbursements and Bill S2 Monaco.xlsx": {
    code: "S2_MONACO",
    name: "Monaco",
    location: "Monaco",
    startDate: "2025-07-18",
    endDate: "2025-07-19",
    seasonYear: 2025
  },
  "Reimbursements and Bill S2 Lagos.xlsx": {
    code: "S2_LAGOS",
    name: "Lagos",
    location: "Nigeria",
    startDate: "2025-10-04",
    endDate: "2025-10-05",
    seasonYear: 2025
  },
  "Reimbursements and Bill S2 Miami.xlsx": {
    code: "S2_MIAMI",
    name: "Miami",
    location: "United States",
    startDate: "2025-11-07",
    endDate: "2025-11-08",
    seasonYear: 2025
  }
};

function splitSourceName(sourceName) {
  const [workbookName, sheetName] = sourceName.split(" :: ");
  return { workbookName, sheetName: sheetName ?? "" };
}

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

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) {
    return null;
  }

  let currencyCode = "USD";
  if (raw.includes("€") || /EUR/i.test(raw)) {
    currencyCode = "EUR";
  } else if (raw.includes("£") || /GBP/i.test(raw)) {
    currencyCode = "GBP";
  } else if (/SAR|QAR|AED|INR|CAD|TRY/i.test(raw)) {
    currencyCode = "USD";
  }

  const negative = raw.includes("-") || raw.startsWith("(");
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) {
    return null;
  }

  const amount = Number.parseFloat(digits);
  if (Number.isNaN(amount) || amount === 0) {
    return null;
  }

  return {
    amount: negative ? -amount : amount,
    currencyCode
  };
}

function parseExpenseDate(value, fallbackYear) {
  const raw = normalizeWhitespace(value);
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(raw)) {
    const [day, month, yearPart] = raw.split(/[\/\s]/);
    const year = yearPart.length === 2 ? `20${yearPart}` : yearPart;
    return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^[A-Z][a-z]{2,8}\s+\d{1,2}$/i.test(raw)) {
    const parsed = new Date(`${raw} ${fallbackYear}`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function mapCostCategoryCode(text) {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return "EQUIPMENT";
  }

  if (/visa/.test(normalized)) {
    return "VISA";
  }

  if (/foil/.test(normalized)) {
    return "FOIL_DAMAGE";
  }

  if (/vip/.test(normalized)) {
    return "VIP_PASSES";
  }

  if (/license|licensing/.test(normalized)) {
    return "LICENSING_FEE";
  }

  if (/food|beverage|meal|lunch|dinner|catering|restaurant/.test(normalized)) {
    return "CATERING";
  }

  if (/flight|hotel|taxi|cab|train|travel|air|emirates|marriott|sheraton|accommodation/.test(normalized)) {
    return "TRAVEL";
  }

  return "EQUIPMENT";
}

function shouldSkipSheet(sheetName) {
  return /summary|overall|budget|prepaid|dues|calculator/i.test(sheetName);
}

function shouldSkipRow(description, merchant, amount) {
  const normalized = `${normalizeWhitespace(description)} ${normalizeWhitespace(merchant)}`.toLowerCase();

  if (!amount) {
    return true;
  }

  if (
    /(^|\s)(total|subtotal|subtotals|gap|remarks|nr|not required|payment to)(\s|$)/.test(normalized) ||
    /sar to usd|gbp to usd|cad to usd|exchange rate|date 2024|amount invoiced/.test(normalized)
  ) {
    return true;
  }

  return false;
}

function buildDescription(payload) {
  return normalizeWhitespace(
    payload.Description ||
      payload["Expense Category"] ||
      payload["Amount Spent On"] ||
      payload.Particulars ||
      payload.Item ||
      payload.Category ||
      payload["Category_2"] ||
      payload.Travel ||
      payload.Food
  );
}

function buildMerchant(payload) {
  return normalizeWhitespace(payload.Merchant || payload.Place || payload["Payment to"]);
}

function buildAmount(payload) {
  return (
    parseMoney(
      payload["Amount USD"] ||
        payload["AMount USD"] ||
        payload.USD ||
        payload["Approved Amounts USD"] ||
        payload["Total Amount"] ||
        payload["Amount Invoiced Revised USD"] ||
        payload.Amount
    ) ?? null
  );
}

function buildExpenseDate(payload, seasonYear, fallbackDate) {
  return (
    parseExpenseDate(payload.Timestamp || payload.Date || payload.Dates || payload["Invoice Date"], seasonYear) ??
    fallbackDate ??
    null
  );
}

function isReimbursable(payload) {
  const value = normalizeWhitespace(payload.Reimbursable).toLowerCase();
  if (!value) {
    return true;
  }

  if (["no", "false", "n"].includes(value)) {
    return false;
  }

  return true;
}

async function ensureRaceEvents(client, companyId) {
  const eventsByWorkbook = new Map();

  for (const [workbookName, config] of Object.entries(RACE_WORKBOOKS)) {
    const result = await client.query(
      `insert into race_events (
         company_id,
         code,
         name,
         location,
         event_start_date,
         event_end_date,
         season_year
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (company_id, code) do update
       set name = excluded.name,
           location = excluded.location,
           event_start_date = excluded.event_start_date,
           event_end_date = excluded.event_end_date,
           season_year = excluded.season_year,
           updated_at = now()
       returning id`,
      [
        companyId,
        config.code,
        config.name,
        config.location,
        config.startDate,
        config.endDate,
        config.seasonYear
      ]
    );

    eventsByWorkbook.set(workbookName, {
      ...config,
      id: result.rows[0].id
    });
  }

  return eventsByWorkbook;
}

async function getCategoryIds(client, companyId) {
  const { rows } = await client.query(
    `select code, id from cost_categories where company_id = $1`,
    [companyId]
  );

  return new Map(rows.map((row) => [row.code, row.id]));
}

async function fetchReimbursementRows(client) {
  const { rows } = await client.query(
    `select
       sd.id as source_document_id,
       sd.source_name,
       rir.source_row_key,
       rir.payload
     from source_documents sd
     join raw_import_rows rir on rir.source_document_id = sd.id
     where sd.source_name similar to '(Reimbursement|Reimbursements)%'
     order by sd.source_name, rir.source_row_key`
  );

  return rows;
}

async function clearExistingExpenses(client) {
  await client.query(
    `delete from expenses
     where source_document_id in (
       select id from source_documents where source_name similar to '(Reimbursement|Reimbursements)%'
     )`
  );
}

async function insertExpense(client, params) {
  await client.query(
    `insert into expenses (
       company_id,
       race_event_id,
       cost_category_id,
       source_document_id,
       vendor_name,
       expense_status,
       expense_date,
       currency_code,
       amount,
       description,
       is_reimbursable,
       submitted_by
     )
     values ($1, $2, $3, $4, $5, 'approved', $6, $7, $8, $9, $10, $11)`,
    [
      params.companyId,
      params.raceEventId,
      params.costCategoryId,
      params.sourceDocumentId,
      params.vendorName || null,
      params.expenseDate,
      params.currencyCode,
      params.amount,
      params.description,
      params.isReimbursable,
      params.submittedBy
    ]
  );
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const client = new Client({ connectionString: deriveImportUrl() });
  await client.connect();

  try {
    await client.query("begin");

    const companyResult = await client.query(`select id from companies where code = 'TBR'::company_code`);
    const companyId = companyResult.rows[0]?.id;

    if (!companyId) {
      throw new Error("TBR company not found.");
    }

    const raceEvents = await ensureRaceEvents(client, companyId);
    const categoryIds = await getCategoryIds(client, companyId);
    const rawRows = await fetchReimbursementRows(client);

    await clearExistingExpenses(client);

    let insertedCount = 0;
    const skippedSheets = new Set();
    const skippedWorkbooks = new Set();

    for (const row of rawRows) {
      const { workbookName, sheetName } = splitSourceName(row.source_name);
      const race = raceEvents.get(workbookName);

      if (!race) {
        skippedWorkbooks.add(workbookName);
        continue;
      }

      if (shouldSkipSheet(sheetName)) {
        skippedSheets.add(row.source_name);
        continue;
      }

      const amount = buildAmount(row.payload);
      const description = buildDescription(row.payload);
      const merchant = buildMerchant(row.payload);

      if (shouldSkipRow(description, merchant, amount)) {
        continue;
      }

      const categoryCode = mapCostCategoryCode(`${description} ${merchant}`);
      const costCategoryId = categoryIds.get(categoryCode) ?? null;
      const expenseDate = buildExpenseDate(row.payload, race.seasonYear, race.startDate);

      await insertExpense(client, {
        companyId,
        raceEventId: race.id,
        costCategoryId,
        sourceDocumentId: row.source_document_id,
        vendorName: merchant,
        expenseDate,
        currencyCode: amount.currencyCode,
        amount: amount.amount,
        description: description || merchant || sheetName,
        isReimbursable: isReimbursable(row.payload),
        submittedBy: sheetName
      });

      insertedCount += 1;
    }

    await client.query("commit");

    console.log(
      JSON.stringify(
        {
          workflow: "race_reimbursement_management",
          expensesInserted: insertedCount,
          skippedSheets: [...skippedSheets].sort(),
          skippedWorkbooks: [...skippedWorkbooks].sort()
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
