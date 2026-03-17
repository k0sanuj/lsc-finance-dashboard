import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const SPONSOR_RULE = {
  sourceIdentifier: "business_rule:tbr:season1_classic_car_club_manhattan",
  sourceName: "TBR Business Rule :: Season 1 Sponsorship",
  sponsorName: "Classic Car Club Manhattan",
  contractName: "Season 1 Sponsorship",
  revenueType: "sponsorship",
  amountUsd: 100000,
  currencyCode: "USD",
  recognitionDate: "2024-02-02",
  notes:
    "User-provided business rule: recognize USD 100,000 sponsorship revenue from Classic Car Club Manhattan in Season 1 only."
};

const EUR_USD_RATE = 1.1571;

const PRIZE_RULE = {
  sourceIdentifier: "business_rule:tbr:season2_prize_pool_after_miami",
  sourceName: "TBR Business Rule :: Season 2 Prize Pool",
  sponsorName: "E1 Prize Pool",
  contractName: "Season 2 P3 Prize Money",
  revenueType: "prize_money",
  amountEur: 100000,
  amountUsd: Number((100000 * EUR_USD_RATE).toFixed(2)),
  currencyCode: "USD",
  recognitionDate: "2025-11-09",
  notes:
    "User-provided business rule: recognize EUR 100,000 Season 2 prize money after Miami, normalized to USD using ECB reference rate 1 EUR = 1.1571 USD from November 10, 2025 (nearest working day after November 9, 2025)."
};

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

function normalizeName(value) {
  return normalizeWhitespace(value).toLowerCase();
}

async function getCompanyId(client) {
  const { rows } = await client.query(`select id from companies where code = 'TBR'::company_code`);
  return rows[0]?.id ?? null;
}

async function ensureOwner(client, companyId, ownerName) {
  const normalized = normalizeName(ownerName);
  const existing = await client.query(
    `select id from owners where company_id = $1 and lower(name) = $2`,
    [companyId, normalized]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `insert into owners (company_id, name, role)
     values ($1, $2, 'Commercial Owner')
     returning id`,
    [companyId, ownerName]
  );

  return inserted.rows[0].id;
}

async function ensureCounterparty(client, companyId, name, counterpartyType, notes = null) {
  const normalized = normalizeName(name);
  const existing = await client.query(
    `select id from sponsors_or_customers where company_id = $1 and normalized_name = $2`,
    [companyId, normalized]
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
    [companyId, name, normalized, counterpartyType, notes]
  );

  return inserted.rows[0].id;
}

async function ensureContract(client, params) {
  const existing = await client.query(
    `select id
     from contracts
     where company_id = $1
       and sponsor_or_customer_id = $2
       and contract_name = $3
     limit 1`,
    [params.companyId, params.sponsorOrCustomerId, params.contractName]
  );

  if (existing.rows[0]) {
    await client.query(
      `update contracts
       set owner_id = $1,
           contract_status = 'active',
           contract_value = $2,
           currency_code = $3,
           start_date = $4,
           end_date = $5,
           is_recurring = false,
           billing_frequency = null,
           notes = $6,
           updated_at = now()
       where id = $7`,
      [
        params.ownerId,
        params.contractValue,
        params.currencyCode,
        params.startDate,
        params.endDate,
        params.notes,
        existing.rows[0].id
      ]
    );

    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `insert into contracts (
       company_id,
       sponsor_or_customer_id,
       owner_id,
       contract_name,
       contract_status,
       contract_value,
       currency_code,
       start_date,
       end_date,
       is_recurring,
       billing_frequency,
       notes
     )
     values ($1, $2, $3, $4, 'active', $5, $6, $7, $8, false, null, $9)
     returning id`,
    [
      params.companyId,
      params.sponsorOrCustomerId,
      params.ownerId,
      params.contractName,
      params.contractValue,
      params.currencyCode,
      params.startDate,
      params.endDate,
      params.notes
    ]
  );

  return inserted.rows[0].id;
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

async function clearRevenueRows(client) {
  await client.query(
    `delete from payments
     where source_document_id in (
       select id from source_documents where source_system = 'business_rule'
     )`
  );

  await client.query(
    `delete from invoices
     where source_document_id in (
       select id from source_documents where source_system = 'business_rule'
     )`
  );

  await client.query(
    `delete from revenue_records
     where source_document_id in (
       select id from source_documents where source_system = 'business_rule'
     )`
  );
}

async function insertReceivableInvoice(client, params) {
  const result = await client.query(
    `insert into invoices (
       company_id,
       contract_id,
       sponsor_or_customer_id,
       owner_id,
       source_document_id,
       direction,
       invoice_number,
       invoice_status,
       issue_date,
       currency_code,
       subtotal_amount,
       total_amount,
       notes
     )
     values ($1, $2, $3, $4, $5, 'receivable', $6, 'paid', $7, $8, $9, $10, $11)
     returning id`,
    [
      params.companyId,
      params.contractId,
      params.sponsorOrCustomerId,
      params.ownerId,
      params.sourceDocumentId,
      params.invoiceNumber,
      params.issueDate,
      params.currencyCode,
      params.totalAmount,
      params.totalAmount,
      params.notes
    ]
  );

  return result.rows[0].id;
}

async function insertPayment(client, params) {
  await client.query(
    `insert into payments (
       company_id,
       invoice_id,
       source_document_id,
       direction,
       payment_status,
       payment_date,
       currency_code,
       amount,
       description
     )
     values ($1, $2, $3, 'inflow', 'settled', $4, $5, $6, $7)`,
    [
      params.companyId,
      params.invoiceId,
      params.sourceDocumentId,
      params.paymentDate,
      params.currencyCode,
      params.amount,
      params.description
    ]
  );
}

async function insertRevenueRecord(client, params) {
  await client.query(
    `insert into revenue_records (
       company_id,
       contract_id,
       invoice_id,
       sponsor_or_customer_id,
       owner_id,
       race_event_id,
       source_document_id,
       revenue_type,
       recognition_date,
       currency_code,
       amount,
       notes
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::revenue_type, $9, $10, $11, $12)`,
    [
      params.companyId,
      params.contractId,
      params.invoiceId,
      params.sponsorOrCustomerId,
      params.ownerId,
      params.raceEventId,
      params.sourceDocumentId,
      params.revenueType,
      params.recognitionDate,
      params.currencyCode,
      params.amount,
      params.notes
    ]
  );
}

async function getRaceEventId(client, code) {
  const { rows } = await client.query(
    `select id from race_events
     where company_id = (select id from companies where code = 'TBR'::company_code)
       and code = $1`,
    [code]
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

    const companyId = await getCompanyId(client);
    if (!companyId) {
      throw new Error("TBR company not found.");
    }

    await clearRevenueRows(client);

    const sponsorOwnerId = await ensureOwner(client, companyId, "Partner One");
    const sponsorCounterpartyId = await ensureCounterparty(
      client,
      companyId,
      SPONSOR_RULE.sponsorName,
      "sponsor",
      SPONSOR_RULE.notes
    );
    const sponsorContractId = await ensureContract(client, {
      companyId,
      sponsorOrCustomerId: sponsorCounterpartyId,
      ownerId: sponsorOwnerId,
      contractName: SPONSOR_RULE.contractName,
      contractValue: SPONSOR_RULE.amountUsd,
      currencyCode: SPONSOR_RULE.currencyCode,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      notes: SPONSOR_RULE.notes
    });
    const sponsorSourceDocumentId = await ensureSourceDocument(client, {
      companyId,
      documentType: "manual_upload",
      sourceSystem: "business_rule",
      sourceIdentifier: SPONSOR_RULE.sourceIdentifier,
      sourceName: SPONSOR_RULE.sourceName,
      metadata: {
        finance_stream: "sponsorship",
        operating_workflow: "commercial_revenue_tracking",
        source_role: "business_rule",
        rule: SPONSOR_RULE.notes
      }
    });
    const sponsorInvoiceId = await insertReceivableInvoice(client, {
      companyId,
      contractId: sponsorContractId,
      sponsorOrCustomerId: sponsorCounterpartyId,
      ownerId: sponsorOwnerId,
      sourceDocumentId: sponsorSourceDocumentId,
      invoiceNumber: "CCCM-S1-100000",
      issueDate: SPONSOR_RULE.recognitionDate,
      currencyCode: SPONSOR_RULE.currencyCode,
      totalAmount: SPONSOR_RULE.amountUsd,
      notes: SPONSOR_RULE.notes
    });
    await insertPayment(client, {
      companyId,
      invoiceId: sponsorInvoiceId,
      sourceDocumentId: sponsorSourceDocumentId,
      paymentDate: SPONSOR_RULE.recognitionDate,
      currencyCode: SPONSOR_RULE.currencyCode,
      amount: SPONSOR_RULE.amountUsd,
      description: "Classic Car Club Manhattan Season 1 sponsorship cash"
    });
    await insertRevenueRecord(client, {
      companyId,
      contractId: sponsorContractId,
      invoiceId: sponsorInvoiceId,
      sponsorOrCustomerId: sponsorCounterpartyId,
      ownerId: sponsorOwnerId,
      raceEventId: await getRaceEventId(client, "S1_JEDDAH"),
      sourceDocumentId: sponsorSourceDocumentId,
      revenueType: SPONSOR_RULE.revenueType,
      recognitionDate: SPONSOR_RULE.recognitionDate,
      currencyCode: SPONSOR_RULE.currencyCode,
      amount: SPONSOR_RULE.amountUsd,
      notes: SPONSOR_RULE.notes
    });

    const prizeOwnerId = await ensureOwner(client, companyId, "Partner One");
    const prizeCounterpartyId = await ensureCounterparty(
      client,
      companyId,
      PRIZE_RULE.sponsorName,
      "prize_pool",
      PRIZE_RULE.notes
    );
    const prizeContractId = await ensureContract(client, {
      companyId,
      sponsorOrCustomerId: prizeCounterpartyId,
      ownerId: prizeOwnerId,
      contractName: PRIZE_RULE.contractName,
      contractValue: PRIZE_RULE.amountUsd,
      currencyCode: PRIZE_RULE.currencyCode,
      startDate: PRIZE_RULE.recognitionDate,
      endDate: PRIZE_RULE.recognitionDate,
      notes: PRIZE_RULE.notes
    });
    const prizeSourceDocumentId = await ensureSourceDocument(client, {
      companyId,
      documentType: "manual_upload",
      sourceSystem: "business_rule",
      sourceIdentifier: PRIZE_RULE.sourceIdentifier,
      sourceName: PRIZE_RULE.sourceName,
      metadata: {
        finance_stream: "prize_money",
        operating_workflow: "commercial_revenue_tracking",
        source_role: "business_rule",
        fx_source: "ECB 2025-11-10 EUR/USD 1.1571",
        rule: PRIZE_RULE.notes
      }
    });
    await insertRevenueRecord(client, {
      companyId,
      contractId: prizeContractId,
      invoiceId: null,
      sponsorOrCustomerId: prizeCounterpartyId,
      ownerId: prizeOwnerId,
      raceEventId: await getRaceEventId(client, "S2_MIAMI"),
      sourceDocumentId: prizeSourceDocumentId,
      revenueType: PRIZE_RULE.revenueType,
      recognitionDate: PRIZE_RULE.recognitionDate,
      currencyCode: PRIZE_RULE.currencyCode,
      amount: PRIZE_RULE.amountUsd,
      notes: PRIZE_RULE.notes
    });

    await client.query("commit");

    console.log(
      JSON.stringify(
        {
          workflow: "commercial_revenue_tracking",
          sponsorshipRevenueUsd: SPONSOR_RULE.amountUsd,
          prizeMoneyUsd: PRIZE_RULE.amountUsd,
          prizeFxRate: EUR_USD_RATE,
          prizeRecognitionDate: PRIZE_RULE.recognitionDate
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
