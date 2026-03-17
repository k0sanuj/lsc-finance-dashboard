import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const WORKBOOK_PREFIX = "LSC - E1 Payments Summaries.xlsx :: ";

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

function normalizeInvoiceNumber(value) {
  const normalized = normalizeWhitespace(value).toUpperCase();
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\s*-\s*/g, "-");
}

function parseMoney(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) {
    return null;
  }

  if (/^(E1|N\/A|NA)$/i.test(raw)) {
    return null;
  }

  let currencyCode = "USD";
  if (raw.includes("€") || /EUR/i.test(raw)) {
    currencyCode = "EUR";
  } else if (raw.includes("£") || /GBP/i.test(raw)) {
    currencyCode = "GBP";
  }

  const negative = raw.includes("-") || raw.startsWith("(");
  const digits = raw.replace(/[^0-9.]/g, "");

  if (!digits) {
    return null;
  }

  const amount = Number.parseFloat(digits);
  if (Number.isNaN(amount)) {
    return null;
  }

  return {
    amount: negative ? -amount : amount,
    currencyCode,
    raw
  };
}

function mapInvoiceStatus(statusText, dueAmount, totalAmount, hasInvoiceNumber) {
  const normalized = normalizeWhitespace(statusText).toLowerCase();

  if (!hasInvoiceNumber) {
    return "draft";
  }

  if (normalized.includes("delete") || normalized.includes("not applicable") || normalized === "na") {
    return "void";
  }

  if (normalized.includes("partially")) {
    return "partially_paid";
  }

  if (normalized.includes("unpaid") || normalized.includes("awaiting")) {
    return "issued";
  }

  if (normalized === "paid" || (normalized.includes("paid") && !normalized.includes("unpaid"))) {
    return "paid";
  }

  if (normalized.includes("overdue")) {
    return "overdue";
  }

  if (dueAmount !== null && totalAmount !== null && Math.abs(dueAmount) < 0.005 && totalAmount > 0) {
    return "paid";
  }

  return "issued";
}

function shouldSkipRecord({ invoiceNumber, item, statusText, comments, amount }) {
  const normalizedInvoice = normalizeInvoiceNumber(invoiceNumber);
  const normalizedItem = normalizeWhitespace(item).toLowerCase();
  const normalizedStatus = normalizeWhitespace(statusText).toLowerCase();
  const normalizedComments = normalizeWhitespace(comments).toLowerCase();

  if (!normalizedInvoice && !normalizedItem) {
    return true;
  }

  if (["TOTAL", "TOTAL DUE S1"].includes(normalizedInvoice ?? "")) {
    return true;
  }

  if (["GBPUSD", "EURUSD"].includes(normalizedItem.toUpperCase())) {
    return true;
  }

  if ((normalizedInvoice ?? "") === "TBD") {
    return true;
  }

  if (normalizedComments.includes("please delete")) {
    return true;
  }

  if (normalizedStatus.includes("not applicable")) {
    return true;
  }

  if (amount === null && !normalizedInvoice) {
    return true;
  }

  return false;
}

function getHeaderValue(row, headers, index) {
  const header = headers[index];
  if (!header) {
    return "";
  }

  return row[header] ?? "";
}

function buildEmailSupplement(rows) {
  const supplements = new Map();

  for (const row of rows) {
    const invoiceNumber = normalizeInvoiceNumber(row.payload.Invoice);
    if (!invoiceNumber) {
      continue;
    }

    supplements.set(invoiceNumber, {
      item: normalizeWhitespace(row.payload.Item),
      amount: parseMoney(row.payload["Amount USD"]),
      comments: normalizeWhitespace(row.payload["TBR Comments"]),
      sourceRowKey: row.source_row_key,
      sourceDocumentId: row.source_document_id
    });
  }

  return supplements;
}

function mapSeasonRecord(sheetName, row, headers, supplement) {
  let invoiceNumber = "";
  let item = "";
  let amountValue = "";
  let statusText = "";
  let dueValue = "";
  let comments = "";
  let explicitStatus = "";

  if (sheetName === "Season 1") {
    invoiceNumber = getHeaderValue(row.payload, headers, 0);
    item = getHeaderValue(row.payload, headers, 1);
    amountValue = getHeaderValue(row.payload, headers, 2);
    statusText = getHeaderValue(row.payload, headers, 3);
    dueValue = getHeaderValue(row.payload, headers, 4);
    comments = getHeaderValue(row.payload, headers, 11);
  } else if (sheetName === "Season 2") {
    invoiceNumber = getHeaderValue(row.payload, headers, 0);
    item = getHeaderValue(row.payload, headers, 1);
    amountValue = getHeaderValue(row.payload, headers, 2);
    statusText = getHeaderValue(row.payload, headers, 3);
    dueValue = getHeaderValue(row.payload, headers, 4);
    comments = getHeaderValue(row.payload, headers, 5);
  } else if (sheetName === "Season 3") {
    invoiceNumber = getHeaderValue(row.payload, headers, 0);
    item = getHeaderValue(row.payload, headers, 1);
    amountValue = getHeaderValue(row.payload, headers, 3) || getHeaderValue(row.payload, headers, 2);
    statusText = getHeaderValue(row.payload, headers, 4);
    dueValue = getHeaderValue(row.payload, headers, 5);
    comments = getHeaderValue(row.payload, headers, 6);
    explicitStatus = getHeaderValue(row.payload, headers, 4);
  }

  const normalizedInvoice = normalizeInvoiceNumber(invoiceNumber);
  const amount = parseMoney(amountValue);
  const due = parseMoney(dueValue);
  const mergedComments = [comments, supplement?.comments].filter(Boolean).join("\n\n");
  const mergedItem = normalizeWhitespace(item || supplement?.item);
  const invoiceStatus = mapInvoiceStatus(
    explicitStatus || statusText,
    due?.amount ?? null,
    amount?.amount ?? null,
    Boolean(normalizedInvoice)
  );

  return {
    invoiceNumber: normalizedInvoice,
    item: mergedItem,
    amount,
    due,
    statusText: explicitStatus || statusText,
    invoiceStatus,
    comments: mergedComments,
    sourceDocumentId: row.source_document_id,
    sourceRowKey: row.source_row_key,
    sourceName: row.source_name,
    sheetName
  };
}

function mapEmailOnlyRecord(row) {
  const invoiceNumber = normalizeInvoiceNumber(row.payload.Invoice);
  const amount = parseMoney(row.payload["Amount USD"]);
  const comments = normalizeWhitespace(row.payload["TBR Comments"]);

  return {
    invoiceNumber,
    item: normalizeWhitespace(row.payload.Item),
    amount,
    due: null,
    statusText: comments,
    invoiceStatus: "issued",
    comments,
    sourceDocumentId: row.source_document_id,
    sourceRowKey: row.source_row_key,
    sourceName: row.source_name,
    sheetName: "Email sent on Apr3"
  };
}

function buildPayments(record, invoiceId) {
  const payments = [];
  const totalAmount = record.amount?.amount ?? null;
  const dueAmount = record.due?.amount ?? null;

  if (totalAmount === null) {
    return payments;
  }

  if (totalAmount < 0) {
    payments.push({
      invoiceId,
      direction: "inflow",
      status: "settled",
      amount: Math.abs(totalAmount),
      currencyCode: record.amount.currencyCode,
      description: `${record.item} credit note offset`
    });
    return payments;
  }

  if (record.invoiceStatus === "paid") {
    payments.push({
      invoiceId,
      direction: "outflow",
      status: "settled",
      amount: totalAmount,
      currencyCode: record.amount.currencyCode,
      description: record.item
    });
    return payments;
  }

  if (dueAmount !== null && dueAmount > 0) {
    const settledAmount = totalAmount - dueAmount;
    if (settledAmount > 0.005) {
      payments.push({
        invoiceId,
        direction: "outflow",
        status: "settled",
        amount: settledAmount,
        currencyCode: record.amount.currencyCode,
        description: `${record.item} settled portion`
      });
    }

    payments.push({
      invoiceId,
      direction: "outflow",
      status: "planned",
      amount: dueAmount,
      currencyCode: record.amount.currencyCode,
      description: `${record.item} due portion`
    });
    return payments;
  }

  if (record.invoiceStatus === "issued" || record.invoiceStatus === "overdue") {
    payments.push({
      invoiceId,
      direction: "outflow",
      status: "planned",
      amount: totalAmount,
      currencyCode: record.amount.currencyCode,
      description: record.item
    });
  }

  return payments;
}

async function fetchSheetRows(client) {
  const { rows } = await client.query(
    `select
       sd.id as source_document_id,
       sd.source_name,
       sd.metadata->'headerNames' as headers,
       rir.source_row_key,
       rir.payload
     from source_documents sd
     join raw_import_rows rir on rir.source_document_id = sd.id
     where sd.source_name like $1
     order by sd.source_name, rir.source_row_key`,
    [`${WORKBOOK_PREFIX}%`]
  );

  return rows;
}

async function ensureCounterparty(client, companyId) {
  const normalizedName = "e1-series";
  const existing = await client.query(
    `select id from sponsors_or_customers where company_id = $1 and normalized_name = $2`,
    [companyId, normalizedName]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `insert into sponsors_or_customers (
       company_id,
       name,
       normalized_name,
       counterparty_type,
       notes
     )
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      companyId,
      "E1 Series",
      normalizedName,
      "vendor",
      "Organizer / vendor counterparty for E1 payable normalization."
    ]
  );

  return inserted.rows[0].id;
}

async function clearExistingCanonicalRows(client) {
  await client.query(
    `delete from payments
     where source_document_id in (
       select id from source_documents where source_name like $1
     )
     or invoice_id in (
       select id from invoices where source_document_id in (
         select id from source_documents where source_name like $1
       )
     )`,
    [`${WORKBOOK_PREFIX}%`]
  );

  await client.query(
    `delete from invoices
     where source_document_id in (
       select id from source_documents where source_name like $1
     )`,
    [`${WORKBOOK_PREFIX}%`]
  );
}

async function insertInvoice(client, companyId, counterpartyId, record) {
  const noteLines = [
    `Workflow: e1_vendor_payables`,
    `Source sheet: ${record.sheetName}`,
    `Source row: ${record.sourceRowKey}`,
    `Item: ${record.item}`
  ];

  if (record.comments) {
    noteLines.push(`Comments: ${record.comments}`);
  }

  const notes = noteLines.join("\n");
  const existing = await client.query(
    `select id
     from invoices
     where company_id = $1
       and source_document_id = $2
       and notes like $3
     limit 1`,
    [companyId, record.sourceDocumentId, `%Source row: ${record.sourceRowKey}%`]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const result = await client.query(
    `insert into invoices (
       company_id,
       sponsor_or_customer_id,
       source_document_id,
       direction,
       invoice_number,
       invoice_status,
       currency_code,
       subtotal_amount,
       total_amount,
       notes
     )
     values ($1, $2, $3, 'payable', $4, $5::invoice_status, $6, $7, $8, $9)
     returning id`,
    [
      companyId,
      counterpartyId,
      record.sourceDocumentId,
      record.invoiceNumber,
      record.invoiceStatus,
      record.amount?.currencyCode ?? "USD",
      record.amount?.amount ?? 0,
      record.amount?.amount ?? 0,
      notes
    ]
  );

  return result.rows[0].id;
}

async function insertPayment(client, companyId, sourceDocumentId, payment) {
  const existing = await client.query(
    `select id
     from payments
     where invoice_id = $1
       and source_document_id = $2
       and direction = $3::payment_direction
       and payment_status = $4::payment_status
       and currency_code = $5
       and amount = $6
       and description = $7
     limit 1`,
    [
      payment.invoiceId,
      sourceDocumentId,
      payment.direction,
      payment.status,
      payment.currencyCode,
      payment.amount,
      payment.description
    ]
  );

  if (existing.rows[0]) {
    return;
  }

  await client.query(
    `insert into payments (
       company_id,
       invoice_id,
       source_document_id,
       direction,
       payment_status,
       currency_code,
       amount,
       description
     )
     values ($1, $2, $3, $4::payment_direction, $5::payment_status, $6, $7, $8)`,
    [
      companyId,
      payment.invoiceId,
      sourceDocumentId,
      payment.direction,
      payment.status,
      payment.currencyCode,
      payment.amount,
      payment.description
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

    const counterpartyId = await ensureCounterparty(client, companyId);
    const sourceRows = await fetchSheetRows(client);
    const rowsBySource = new Map();

    for (const row of sourceRows) {
      const list = rowsBySource.get(row.source_name) ?? [];
      list.push(row);
      rowsBySource.set(row.source_name, list);
    }

    const emailRows = rowsBySource.get(`${WORKBOOK_PREFIX}Email sent on Apr3`) ?? [];
    const supplements = buildEmailSupplement(emailRows);
    const primarySheets = ["Season 1", "Season 2", "Season 3"];
    const canonicalRecords = [];
    const seenPrimaryInvoices = new Set();

    for (const sheetName of primarySheets) {
      const sourceName = `${WORKBOOK_PREFIX}${sheetName}`;
      const sheetRows = rowsBySource.get(sourceName) ?? [];
      if (sheetRows.length === 0) {
        continue;
      }

      const headers = Array.isArray(sheetRows[0].headers) ? sheetRows[0].headers : [];

      for (const row of sheetRows) {
        const invoiceSeed = normalizeInvoiceNumber(getHeaderValue(row.payload, headers, 0));
        const supplement = invoiceSeed ? supplements.get(invoiceSeed) : null;
        const record = mapSeasonRecord(sheetName, row, headers, supplement);

        if (shouldSkipRecord(record)) {
          continue;
        }

        if (record.invoiceNumber) {
          seenPrimaryInvoices.add(record.invoiceNumber);
        }

        canonicalRecords.push(record);
      }
    }

    for (const row of emailRows) {
      const record = mapEmailOnlyRecord(row);
      if (!record.invoiceNumber || seenPrimaryInvoices.has(record.invoiceNumber) || shouldSkipRecord(record)) {
        continue;
      }

      canonicalRecords.push(record);
    }

    await clearExistingCanonicalRows(client);

    let invoiceCount = 0;
    let paymentCount = 0;
    const skippedSheets = ["Spare parts Provision S2"];

    for (const record of canonicalRecords) {
      const invoiceId = await insertInvoice(client, companyId, counterpartyId, record);
      invoiceCount += 1;

      for (const payment of buildPayments(record, invoiceId)) {
        await insertPayment(client, companyId, record.sourceDocumentId, payment);
        paymentCount += 1;
      }
    }

    await client.query("commit");

    console.log(
      JSON.stringify(
        {
          workflow: "e1_vendor_payables",
          invoicesInserted: invoiceCount,
          paymentsInserted: paymentCount,
          skippedSheets,
          sourceWorkbook: "LSC - E1 Payments Summaries.xlsx"
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
