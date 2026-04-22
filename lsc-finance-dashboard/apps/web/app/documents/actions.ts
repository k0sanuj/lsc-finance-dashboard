"use server";

import crypto from "node:crypto";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Pool, type PoolClient } from "pg";
import { getImportDatabaseUrl, storeUploadedDocument, type StoredDocumentMetadata } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";
import { analyzeDocumentWithGemini, type GeminiAnalyzerContext } from "./gemini";

const ANALYZER_TYPE = "gemini_document_analyzer";
const ANALYZER_CONTEXT_VERSION = "2026-03-14-receipt-context-v1";
const DEFAULT_COMPANY_CODE = "TBR";

declare global {
  // eslint-disable-next-line no-var
  var __lscImportPool: Pool | undefined;
}

type AnalysisField = {
  key: string;
  label: string;
  value: string;
  normalizedValue: string;
  confidence: number;
  canonicalTargetTable: string;
  canonicalTargetColumn: string;
};

type PlatformUpdate = {
  area: string;
  effect: string;
};

type IntakePayload = {
  category: string;
  label: string;
  operatorFields: Record<string, string>;
  platformUpdates: PlatformUpdate[];
};

type AnalysisRunRow = {
  id: string;
  source_document_id: string;
  company_id: string;
  source_file_name: string | null;
  detected_document_type: string | null;
  extracted_summary: Record<string, unknown> | null;
};

type CompanyContext = {
  id: string;
  code: string;
  name: string;
};

type RaceContext = {
  id: string;
  name: string;
  seasonYear: number;
  location: string;
  countryCode: string;
  countryName: string;
  eventDate: string | null;
  defaultCurrencyCode: string | null;
};

const COUNTRY_CURRENCY_FALLBACKS: Record<string, { country: string; currency: string; rateToUsd: number }> = {
  AE: { country: "United Arab Emirates", currency: "AED", rateToUsd: 0.2723 },
  QA: { country: "Qatar", currency: "QAR", rateToUsd: 0.2747 },
  SA: { country: "Saudi Arabia", currency: "SAR", rateToUsd: 0.2667 },
  HR: { country: "Croatia", currency: "EUR", rateToUsd: 1.09 },
  IT: { country: "Italy", currency: "EUR", rateToUsd: 1.09 },
  MC: { country: "Monaco", currency: "EUR", rateToUsd: 1.09 },
  NG: { country: "Nigeria", currency: "NGN", rateToUsd: 0.00067 },
  US: { country: "United States", currency: "USD", rateToUsd: 1 }
};

const COUNTRY_KEYWORDS = [
  { match: ["dubai", "uae", "united arab emirates", "abu dhabi"], code: "AE" },
  { match: ["jeddah", "riyadh", "saudi arabia"], code: "SA" },
  { match: ["doha", "qatar"], code: "QA" },
  { match: ["dubrovnik", "croatia"], code: "HR" },
  { match: ["milan", "venice", "italy"], code: "IT" },
  { match: ["monaco"], code: "MC" },
  { match: ["lagos", "nigeria"], code: "NG" },
  { match: ["miami", "usa", "united states"], code: "US" }
] as const;

const INTAKE_FIELD_LABELS: Record<string, string> = {
  counterpartyName: "Counterparty",
  merchantName: "Merchant",
  invoiceNumber: "Invoice Number",
  documentDate: "Document Date",
  dueDate: "Due Date",
  originalAmount: "Original Amount",
  originalCurrency: "Original Currency",
  costCategoryHint: "Cost Category",
  documentDescription: "Description"
};

const INTAKE_CATEGORY_LABELS: Record<string, string> = {
  expense_receipt: "Expense Receipt",
  reimbursement_bundle: "Reimbursement Bundle",
  vendor_invoice: "Vendor Invoice",
  e1_invoice: "E1 Invoice",
  reimbursement_invoice: "Reimbursement Invoice",
  sponsorship_contract: "Sponsorship Contract",
  prize_statement: "Prize Statement",
  commercial_term_sheet: "Commercial Term Sheet"
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function inferRaceGeography(raceName: string, location: string | null) {
  const haystack = normalizeText(`${raceName} ${location ?? ""}`);

  const knownMappings = [
    { match: ["jeddah", "saudi"], countryCode: "SA", countryName: "Saudi Arabia" },
    { match: ["doha", "qatar"], countryCode: "QA", countryName: "Qatar" },
    { match: ["dubrovnik", "croatia"], countryCode: "HR", countryName: "Croatia" },
    { match: ["lagos", "nigeria"], countryCode: "NG", countryName: "Nigeria" },
    { match: ["miami", "united states", "usa"], countryCode: "US", countryName: "United States" },
    { match: ["monaco"], countryCode: "MC", countryName: "Monaco" },
    { match: ["venice", "italy"], countryCode: "IT", countryName: "Italy" },
    { match: ["milan", "italy"], countryCode: "IT", countryName: "Italy" }
  ];

  for (const mapping of knownMappings) {
    if (mapping.match.some((token) => haystack.includes(token))) {
      return mapping;
    }
  }

  return {
    countryCode: "UN",
    countryName: "Unknown"
  };
}

function extractRaceIdFromWorkflowContext(workflowContext: string) {
  const [scope, raceId] = workflowContext.split(":");
  if (scope !== "tbr-race" || !raceId) {
    return null;
  }

  return raceId;
}

function classifyWorkflowKind(workflowContext: string): GeminiAnalyzerContext["workflow"]["kind"] {
  if (workflowContext.startsWith("tbr-race:")) {
    return "tbr_race_expense_submission";
  }

  if (workflowContext === "invoice-hub") {
    return "finance_invoice_intake";
  }

  if (workflowContext === "costs") {
    return "finance_cost_review";
  }

  return "generic_document_review";
}

function inferDefaultIntakeCategory(workflowContext: string) {
  const workflow = normalizeWhitespace(workflowContext).toLowerCase();

  if (workflow.includes("contract") || workflow.includes("commercial")) {
    return "sponsorship_contract";
  }

  if (workflow.includes("invoice")) {
    return "vendor_invoice";
  }

  return "expense_receipt";
}

function buildPlatformUpdates(companyCode: string, workflowContext: string, intakeCategory: string): PlatformUpdate[] {
  const companyLabel = companyCode === "FSP" ? "FSP" : "TBR";

  switch (intakeCategory) {
    case "expense_receipt":
    case "reimbursement_bundle":
      return [
        { area: `${companyLabel} / My Expenses`, effect: "adds a bill or bundle row that can feed an expense report" },
        { area: `${companyLabel} / Races`, effect: "shows up in the selected race intake workflow" },
        { area: `Costs / ${companyLabel}`, effect: "supports category and race-side cost review" },
        { area: "LSC overview", effect: "affects consolidated cost after approval and posting" }
      ];
    case "vendor_invoice":
    case "e1_invoice":
    case "reimbursement_invoice":
      return [
        { area: `${companyLabel} / Invoice Hub`, effect: "creates or supports payable invoice intake" },
        { area: `Payments / ${companyLabel}`, effect: "feeds due tracking after approval and posting" },
        { area: `Costs / ${companyLabel}`, effect: "supports cost-side breakdown where invoices are linked" },
        { area: "LSC overview", effect: "affects consolidated cost after posting" }
      ];
    case "prize_statement":
      return [
        { area: `${companyLabel} / Overview`, effect: "updates prize revenue after approval" },
        { area: `Commercial Goals / ${companyLabel}`, effect: "contributes to actual closed value where relevant" },
        { area: "LSC overview", effect: "rolls into consolidated revenue and margin" }
      ];
    case "commercial_term_sheet":
      return [
        { area: `Documents / ${companyLabel}`, effect: "stays in review until the posting mapper is clear" },
        { area: `Commercial Goals / ${companyLabel}`, effect: "supports planning commentary and review context" }
      ];
    case "sponsorship_contract":
    default:
      return [
        { area: `${companyLabel} / Overview`, effect: "updates sponsorship revenue and counterparty records after approval" },
        { area: `Commercial Goals / ${companyLabel}`, effect: "feeds target-versus-actual tracking" },
        { area: "LSC overview", effect: "rolls into consolidated revenue and margin" }
      ];
  }
}

function buildIntakePayload(formData: FormData, companyCode: string, workflowContext: string): IntakePayload {
  const requestedCategory =
    normalizeWhitespace(String(formData.get("intakeCategory") ?? "")).toLowerCase() ||
    inferDefaultIntakeCategory(workflowContext);

  const category = INTAKE_CATEGORY_LABELS[requestedCategory] ? requestedCategory : inferDefaultIntakeCategory(workflowContext);
  const operatorFields = Object.fromEntries(
    Object.keys(INTAKE_FIELD_LABELS)
      .map((key) => [key, normalizeWhitespace(String(formData.get(key) ?? ""))] as const)
      .filter((entry) => Boolean(entry[1]))
  );

  return {
    category,
    label: INTAKE_CATEGORY_LABELS[category] ?? "Document Intake",
    operatorFields,
    platformUpdates: buildPlatformUpdates(companyCode, workflowContext, category)
  };
}

async function getCompanyContext(client: PoolClient, code: string) {
  const { rows } = await client.query<CompanyContext>(
    `select id, code::text, name
     from companies
     where code = $1::company_code
     limit 1`,
    [code]
  );

  return rows[0] ?? null;
}

async function getRaceContext(client: PoolClient, raceId: string) {
  const { rows } = await client.query<{
    id: string;
    name: string;
    season_year: number;
    location: string | null;
    event_start_date: string | null;
  }>(
    `select
       id,
       name,
       season_year,
       location,
       event_start_date::text
     from race_events
     where id = $1::uuid
     limit 1`,
    [raceId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  const geography = inferRaceGeography(row.name, row.location);
  const fallback = COUNTRY_CURRENCY_FALLBACKS[geography.countryCode];

  return {
    id: row.id,
    name: row.name,
    seasonYear: row.season_year,
    location: row.location ?? row.name,
    countryCode: geography.countryCode,
    countryName: geography.countryName ?? fallback?.country ?? "Unknown",
    eventDate: row.event_start_date ?? null,
    defaultCurrencyCode: fallback?.currency ?? null
  } satisfies RaceContext;
}

async function buildAnalyzerContext(client: PoolClient, params: {
  company: CompanyContext;
  actorRole: string;
  workflowContext: string;
  submissionMode: string | null;
  redirectPath: string;
  intakePayload: IntakePayload;
}) {
  const workflowKind = classifyWorkflowKind(params.workflowContext);
  const raceId = extractRaceIdFromWorkflowContext(params.workflowContext);
  const race = raceId ? await getRaceContext(client, raceId) : null;

  const expectedDocumentTypes =
    workflowKind === "tbr_race_expense_submission"
      ? ["Expense Receipt", "Vendor Invoice", "Reimbursement Report", "Unknown"]
      : workflowKind === "finance_invoice_intake"
        ? ["Vendor Invoice", "Unknown"]
        : [
            "Sponsorship Contract",
            "Vendor Invoice",
            "Expense Receipt",
            "Prize Statement",
            "Reimbursement Report",
            "Controlled Manual Entry",
            "Unknown"
          ];

  const preferredFields =
    workflowKind === "tbr_race_expense_submission"
      ? [
          "merchant_name",
          "transaction_date",
          "expense_date",
          "total_amount",
          "currency_code",
          "origin_country",
          "issuer_country"
        ]
      : workflowKind === "finance_invoice_intake"
        ? [
            "vendor_name",
            "invoice_number",
            "issue_date",
            "due_date",
            "total_amount",
            "currency_code",
            "origin_country"
          ]
        : ["counterparty_name", "amount", "currency_code", "issue_date", "due_date"];

  return {
    analysisVersion: ANALYZER_CONTEXT_VERSION,
    company: {
      code: params.company.code,
      name: params.company.name
    },
    actor: {
      role: params.actorRole
    },
    workflow: {
      raw: params.workflowContext,
      kind: workflowKind,
      submissionMode: params.submissionMode,
      redirectPath: params.redirectPath
    },
    race,
    hints: {
      expectedDocumentTypes,
      preferredFields,
      outputCurrencyCode: "USD",
      defaultCountryCode: race?.countryCode ?? null,
      defaultCountryName: race?.countryName ?? null,
      defaultCurrencyCode: race?.defaultCurrencyCode ?? null,
      useContextFallbacks: true,
      intakeCategory: params.intakePayload.label,
      operatorSuppliedFields: params.intakePayload.operatorFields,
      expectedPlatformUpdates: params.intakePayload.platformUpdates
    }
  } satisfies GeminiAnalyzerContext;
}

function buildAnalysisSignature(context: GeminiAnalyzerContext) {
  return JSON.stringify({
    v: context.analysisVersion,
    company: context.company.code,
    workflow: context.workflow.kind,
    workflowRaw: context.workflow.raw,
    submissionMode: context.workflow.submissionMode,
    redirectPath: context.workflow.redirectPath,
    raceId: context.race?.id ?? null,
    intakeCategory: context.hints.intakeCategory ?? null,
    operatorFields: context.hints.operatorSuppliedFields ?? null
  });
}

function getImportPool() {
  if (!globalThis.__lscImportPool) {
    globalThis.__lscImportPool = new Pool({
      connectionString: getImportDatabaseUrl(),
      allowExitOnIdle: true,
      max: 3
    });
  }

  return globalThis.__lscImportPool;
}

function buildRedirect(status: "success" | "error" | "info", message: string): Route {
  return `/documents?status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}` as Route;
}

function withSearchParams(pathname: string, entries: Record<string, string | null | undefined>) {
  const url = new URL(pathname, "https://lsc.local");

  for (const [key, value] of Object.entries(entries)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}` as Route;
}

function sanitizeRedirectPath(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/documents";
  }

  return trimmed;
}

function buildWorkflowRedirect(
  pathname: string,
  status: "success" | "error" | "info",
  message: string,
  extra: Record<string, string | null | undefined> = {}
): Route {
  return withSearchParams(sanitizeRedirectPath(pathname), {
    status,
    message,
    ...extra
  });
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeName(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function isIsoCurrency(value: string | null | undefined) {
  return Boolean(value && /^[A-Z]{3}$/.test(value));
}

function normalizeDate(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function parseMoney(raw: string | undefined) {
  if (!raw) {
    return 0;
  }

  const normalized = raw.replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function findFieldValue(fields: AnalysisField[], ...keys: string[]) {
  const normalizedAliases = new Set(keys.map((key) => normalizeName(key)));

  for (const key of keys) {
    const match = fields.find((field) => field.key === key);
    if (match?.normalizedValue || match?.value) {
      return match.normalizedValue || match.value;
    }
  }

  for (const field of fields) {
    if (
      normalizedAliases.has(normalizeName(field.key)) ||
      normalizedAliases.has(normalizeName(field.label))
    ) {
      if (field.normalizedValue || field.value) {
        return field.normalizedValue || field.value;
      }
    }
  }

  return null;
}

function collectAnalysisText(analysis: {
  proposedTarget: string;
  financeInterpretation: string;
  fields: AnalysisField[];
}) {
  return normalizeName(
    [
      analysis.proposedTarget,
      analysis.financeInterpretation,
      ...analysis.fields.flatMap((field) => [field.key, field.label, field.value, field.normalizedValue])
    ].join(" ")
  );
}

function inferCountryCodeFromAnalysis(analysis: {
  proposedTarget: string;
  financeInterpretation: string;
  fields: AnalysisField[];
}, context?: GeminiAnalyzerContext | null) {
  const explicitCountry = findFieldValue(
    analysis.fields,
    "origin_country",
    "transaction_country",
    "country",
    "issuer_country",
    "vendor_country",
    "merchant_country"
  );
  const explicitHaystack = normalizeName(explicitCountry ?? "");
  const textHaystack = collectAnalysisText(analysis);

  for (const keyword of COUNTRY_KEYWORDS) {
    if (keyword.match.some((token) => explicitHaystack.includes(token) || textHaystack.includes(token))) {
      return keyword.code;
    }
  }

  return context?.hints.defaultCountryCode ?? null;
}

function inferCurrencyCode(analysis: {
  proposedTarget: string;
  financeInterpretation: string;
  fields: AnalysisField[];
}, countryCode: string | null) {
  const explicitCurrency = String(
    findFieldValue(analysis.fields, "currency_code", "currency", "invoice_currency", "original_currency") ?? ""
  )
    .trim()
    .toUpperCase();

  if (isIsoCurrency(explicitCurrency)) {
    return explicitCurrency;
  }

  const haystack = collectAnalysisText(analysis);
  if (haystack.includes("aed") || haystack.includes("dirham")) {
    return "AED";
  }
  if (haystack.includes("eur") || haystack.includes("euro")) {
    return "EUR";
  }
  if (haystack.includes("usd") || haystack.includes("dollar")) {
    return "USD";
  }
  if (haystack.includes("sar") || haystack.includes("riyal")) {
    return "SAR";
  }
  if (haystack.includes("qar")) {
    return "QAR";
  }

  if (countryCode && COUNTRY_CURRENCY_FALLBACKS[countryCode]) {
    return COUNTRY_CURRENCY_FALLBACKS[countryCode].currency;
  }

  return "Unknown";
}

function inferUsdRate(currencyCode: string) {
  if (currencyCode === "USD") {
    return 1;
  }

  const matched = Object.values(COUNTRY_CURRENCY_FALLBACKS).find(
    (entry) => entry.currency === currencyCode
  );

  return matched?.rateToUsd ?? null;
}

function buildExpenseSummaryFields(analysis: {
  proposedTarget: string;
  financeInterpretation: string;
  fields: AnalysisField[];
}, context?: GeminiAnalyzerContext | null) {
  const countryCode = inferCountryCodeFromAnalysis(analysis, context);
  const countryFallback = countryCode ? COUNTRY_CURRENCY_FALLBACKS[countryCode] : null;
  const originalCurrency = inferCurrencyCode(analysis, countryCode);
  const originalAmount = parseMoney(
    String(
      findFieldValue(
        analysis.fields,
        "total_amount",
        "amount",
        "invoice_total",
        "expense_amount",
        "receipt_total"
      ) ?? ""
    )
  );
  const expenseDate =
    normalizeDate(
      String(
        findFieldValue(
          analysis.fields,
          "transaction_date",
          "expense_date",
          "issue_date",
          "invoice_date",
          "date"
        ) ?? ""
      )
    ) ?? null;
  const fxRate = inferUsdRate(originalCurrency);
  const usdAmount = fxRate !== null ? Number((originalAmount * fxRate).toFixed(2)) : null;

  return {
    originCountry:
      countryFallback?.country ?? context?.hints.defaultCountryName ?? "Unknown",
    issuerCountry:
      String(
        findFieldValue(analysis.fields, "issuer_country", "vendor_country", "merchant_country") ?? ""
      ) ||
      countryFallback?.country ||
      context?.hints.defaultCountryName ||
      "Unknown",
    currencyCode: originalCurrency,
    originalCurrency,
    originalAmount,
    expenseDate,
    fxRateToUsd: fxRate,
    usdAmount
  };
}

function buildExtractedSummary(
  analysis: {
    proposedTarget: string;
    financeInterpretation: string;
    fields: AnalysisField[];
  },
  mimeType: string,
  context: GeminiAnalyzerContext | null,
  analysisSignature: string,
  intakePayload: IntakePayload
) {
  const expenseSummary = buildExpenseSummaryFields(analysis, context);

  return {
    analysisSignature,
    analysisContext: context,
    intakePayload,
    platformUpdates: intakePayload.platformUpdates,
    proposedTarget: analysis.proposedTarget,
    financeInterpretation: analysis.financeInterpretation,
    originSource:
      findFieldValue(analysis.fields, "origin_source", "source_origin") ??
      (mimeType.startsWith("image/") ? "receipt_image" : "portal_upload"),
    originCountry:
      findFieldValue(analysis.fields, "origin_country", "transaction_country", "country") ??
      expenseSummary.originCountry,
    issuerCountry: expenseSummary.issuerCountry,
    currencyCode: expenseSummary.currencyCode,
    originalCurrency: expenseSummary.originalCurrency,
    originalAmount: expenseSummary.originalAmount,
    expenseDate: expenseSummary.expenseDate,
    fxRateToUsd: expenseSummary.fxRateToUsd,
    usdAmount: expenseSummary.usdAmount
  };
}

async function upsertSourceDocument(client: PoolClient, params: {
  companyId: string;
  fileHash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  note: string | null;
  intakeMode: string | null;
  uploadedByUserId: string;
  workflowContext: string | null;
  storedDocument: StoredDocumentMetadata | null;
  previewDataUrl: string | null;
  previewMimeType: string | null;
  intakePayload: IntakePayload;
}) {
  const { rows } = await client.query<{ id: string }>(
    `insert into source_documents (
       company_id,
       document_type,
       source_system,
       source_identifier,
       source_name,
       metadata
     )
     values (
       $1,
       'manual_upload'::source_document_type,
       'portal_upload',
       $2,
       $3,
       $4::jsonb
     )
     on conflict (source_system, source_identifier)
     do update set
       source_name = excluded.source_name,
       metadata = source_documents.metadata || excluded.metadata,
       updated_at = now()
     returning id`,
    [
      params.companyId,
      `portal_upload:${params.fileHash}`,
      params.fileName,
      JSON.stringify({
        mimeType: params.mimeType,
        fileSize: params.fileSize,
        upload_note: params.note ?? null,
        intake_mode: params.intakeMode,
        file_hash: params.fileHash,
        last_uploaded_by_user_id: params.uploadedByUserId,
        last_workflow_context: params.workflowContext,
        last_uploaded_at: new Date().toISOString(),
        last_intake_payload: params.intakePayload,
        document_storage: params.storedDocument,
        preview_data_url: params.previewDataUrl,
        preview_mime_type: params.previewMimeType
      })
    ]
  );

  return rows[0].id;
}

async function getCachedRun(client: PoolClient, sourceDocumentId: string, analysisSignature: string) {
  const { rows } = await client.query<{ id: string }>(
    `select dar.id
     from document_analysis_runs dar
     where dar.source_document_id = $1
       and dar.analyzer_type = $2
       and coalesce(dar.extracted_summary->>'analysisSignature', '') = $3
       and dar.analysis_status in ('pending_review', 'approved')
     order by dar.created_at desc
     limit 1`,
    [sourceDocumentId, ANALYZER_TYPE, analysisSignature]
  );

  return rows[0]?.id ?? null;
}

async function insertAnalysisRun(client: PoolClient, params: {
  sourceDocumentId: string;
  companyId: string;
  fileName: string;
  mimeType: string;
  documentType: string;
  overallConfidence: number;
  proposedTarget: string;
  financeInterpretation: string;
  extractedSummary: Record<string, unknown>;
}) {
  const { rows } = await client.query<{ id: string }>(
    `insert into document_analysis_runs (
       source_document_id,
       company_id,
       analyzer_type,
       analysis_status,
       source_file_name,
       source_file_type,
       detected_document_type,
       extracted_summary,
       overall_confidence
     )
     values ($1, $2, $3, 'pending_review', $4, $5, $6, $7::jsonb, $8)
     returning id`,
    [
      params.sourceDocumentId,
      params.companyId,
      ANALYZER_TYPE,
      params.fileName,
      params.mimeType,
      params.documentType,
      JSON.stringify(params.extractedSummary),
      params.overallConfidence
    ]
  );

  return rows[0].id;
}

async function insertDocumentIntakeEvent(client: PoolClient, params: {
  sourceDocumentId: string;
  analysisRunId: string;
  companyId: string;
  appUserId: string;
  fileName: string;
  workflowContext: string | null;
  intakeStatus: "analyzed" | "reused";
  note: string | null;
}) {
  const { rows } = await client.query<{ id: string }>(
    `insert into document_intake_events (
       source_document_id,
       analysis_run_id,
       company_id,
       app_user_id,
       source_file_name,
       workflow_context,
       intake_status,
       intake_note
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      params.sourceDocumentId,
      params.analysisRunId,
      params.companyId,
      params.appUserId,
      params.fileName,
      params.workflowContext,
      params.intakeStatus,
      params.note
    ]
  );

  return rows[0].id;
}

async function insertExtractedFields(client: PoolClient, analysisRunId: string, fields: AnalysisField[]) {
  for (const field of fields) {
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
       values ($1, $2, $3, $4::jsonb, $5, $6, 'pending', $7, $8)`,
      [
        analysisRunId,
        field.key,
        field.label,
        JSON.stringify(field.value),
        field.normalizedValue,
        field.confidence,
        field.canonicalTargetTable,
        field.canonicalTargetColumn
      ]
    );
  }
}

async function ensureCounterparty(
  client: PoolClient,
  companyId: string,
  name: string,
  counterpartyType: string,
  notes: string
) {
  const normalized = normalizeName(name);
  const existing = await client.query<{ id: string }>(
    `select id from sponsors_or_customers
     where company_id = $1 and normalized_name = $2`,
    [companyId, normalized]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
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

async function ensureContract(
  client: PoolClient,
  params: {
    companyId: string;
    sourceDocumentId: string;
    sponsorOrCustomerId: string;
    contractName: string;
    contractValue: number;
    startDate: string | null;
    endDate: string | null;
    notes: string;
  }
) {
  const existing = await client.query<{ id: string }>(
    `select id from contracts
     where company_id = $1
       and source_document_id = $2
     limit 1`,
    [params.companyId, params.sourceDocumentId]
  );

  if (existing.rows[0]) {
    await client.query(
      `update contracts
       set sponsor_or_customer_id = $1,
           contract_name = $2,
           contract_status = 'active',
           contract_value = $3,
           currency_code = 'USD',
           start_date = $4,
           end_date = $5,
           notes = $6,
           updated_at = now()
       where id = $7`,
      [
        params.sponsorOrCustomerId,
        params.contractName,
        params.contractValue,
        params.startDate,
        params.endDate,
        params.notes,
        existing.rows[0].id
      ]
    );

    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
    `insert into contracts (
       company_id,
       sponsor_or_customer_id,
       source_document_id,
       contract_name,
       contract_status,
       contract_value,
       currency_code,
       start_date,
       end_date,
       notes
     )
     values ($1, $2, $3, $4, 'active', $5, 'USD', $6, $7, $8)
     returning id`,
    [
      params.companyId,
      params.sponsorOrCustomerId,
      params.sourceDocumentId,
      params.contractName,
      params.contractValue,
      params.startDate,
      params.endDate,
      params.notes
    ]
  );

  return inserted.rows[0].id;
}

async function upsertRevenueRecord(client: PoolClient, params: {
  companyId: string;
  sourceDocumentId: string;
  sponsorOrCustomerId: string;
  contractId: string | null;
  revenueType: "sponsorship" | "prize_money";
  recognitionDate: string;
  amount: number;
  notes: string;
}) {
  const existing = await client.query<{ id: string }>(
    `select id from revenue_records
     where source_document_id = $1
       and revenue_type = $2::revenue_type
     limit 1`,
    [params.sourceDocumentId, params.revenueType]
  );

  if (existing.rows[0]) {
    await client.query(
      `update revenue_records
       set contract_id = $1,
           sponsor_or_customer_id = $2,
           recognition_date = $3,
           amount = $4,
           notes = $5,
           updated_at = now()
       where id = $6`,
      [
        params.contractId,
        params.sponsorOrCustomerId,
        params.recognitionDate,
        params.amount,
        params.notes,
        existing.rows[0].id
      ]
    );

    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
    `insert into revenue_records (
       company_id,
       contract_id,
       sponsor_or_customer_id,
       source_document_id,
       revenue_type,
       recognition_date,
       currency_code,
       amount,
       notes
     )
     values ($1, $2, $3, $4, $5::revenue_type, $6, 'USD', $7, $8)
     returning id`,
    [
      params.companyId,
      params.contractId,
      params.sponsorOrCustomerId,
      params.sourceDocumentId,
      params.revenueType,
      params.recognitionDate,
      params.amount,
      params.notes
    ]
  );

  return inserted.rows[0].id;
}

function getFieldMap(fields: Array<{ field_key: string; normalized_value: string | null; field_label: string }>) {
  const map = new Map<string, string>();
  for (const field of fields) {
    const value = field.normalized_value ?? "";
    map.set(field.field_key, value);
    map.set(normalizeName(field.field_label), value);
  }
  return map;
}

async function clearPostingEvents(client: PoolClient, analysisRunId: string) {
  await client.query(`delete from document_posting_events where analysis_run_id = $1`, [analysisRunId]);
}

async function insertPostingEvent(
  client: PoolClient,
  params: { analysisRunId: string; status: string; targetTable: string; targetId?: string; summary: string }
) {
  await client.query(
    `insert into document_posting_events (
       analysis_run_id,
       posting_status,
       canonical_target_table,
       canonical_target_id,
       posting_summary,
       completed_at
     )
     values ($1, $2, $3, $4, $5, case when $2 = 'posted' then now() else null end)`,
    [params.analysisRunId, params.status, params.targetTable, params.targetId ?? null, params.summary]
  );
}

async function postApprovedAnalysis(client: PoolClient, run: AnalysisRunRow) {
  const { rows: fields } = await client.query<{
    field_key: string;
    normalized_value: string | null;
    field_label: string;
  }>(
    `select field_key, normalized_value, field_label
     from document_extracted_fields
     where analysis_run_id = $1`,
    [run.id]
  );

  const fieldMap = getFieldMap(fields);
  const summary = run.extracted_summary ?? {};
  const financeInterpretation = String(summary.financeInterpretation ?? "Approved document analysis");
  const docType = run.detected_document_type ?? "Unknown";

  await clearPostingEvents(client, run.id);

  if (docType === "Sponsorship Contract") {
    const counterpartyName =
      fieldMap.get("counterparty_name") ||
      fieldMap.get("counterparty") ||
      fieldMap.get("counterparty") ||
      "Unspecified Sponsor";
    const contractValue = parseMoney(
      fieldMap.get("contract_value_usd") || fieldMap.get("contract_value") || fieldMap.get("amount")
    );
    const startDate = normalizeDate(fieldMap.get("start_date") || fieldMap.get("effective_date"));
    const endDate = normalizeDate(fieldMap.get("end_date"));
    const contractName = normalizeWhitespace(
      fieldMap.get("contract_title") || run.source_file_name || "Uploaded Sponsorship Contract"
    );
    const sponsorId = await ensureCounterparty(
      client,
      run.company_id,
      counterpartyName,
      "sponsor",
      financeInterpretation
    );
    const contractId = await ensureContract(client, {
      companyId: run.company_id,
      sourceDocumentId: run.source_document_id,
      sponsorOrCustomerId: sponsorId,
      contractName,
      contractValue,
      startDate,
      endDate,
      notes: financeInterpretation
    });

    await insertPostingEvent(client, {
      analysisRunId: run.id,
      status: "posted",
      targetTable: "contracts",
      targetId: contractId,
      summary: "Approved sponsorship contract fields were posted into canonical contracts."
    });

    if (contractValue > 0) {
      const revenueId = await upsertRevenueRecord(client, {
        companyId: run.company_id,
        sourceDocumentId: run.source_document_id,
        sponsorOrCustomerId: sponsorId,
        contractId,
        revenueType: "sponsorship",
        recognitionDate: startDate ?? new Date().toISOString().slice(0, 10),
        amount: contractValue,
        notes: financeInterpretation
      });

      await insertPostingEvent(client, {
        analysisRunId: run.id,
        status: "posted",
        targetTable: "revenue_records",
        targetId: revenueId,
        summary: "Approved sponsorship value was posted into canonical revenue records."
      });
    }

    return;
  }

  if (docType === "Prize Statement") {
    const counterpartyName = fieldMap.get("counterparty_name") || fieldMap.get("counterparty") || "Prize Counterparty";
    const amount = parseMoney(fieldMap.get("normalized_usd") || fieldMap.get("amount_usd") || fieldMap.get("amount"));
    const recognitionDate = normalizeDate(fieldMap.get("recognition_date") || fieldMap.get("award_date"));
    const counterpartyId = await ensureCounterparty(
      client,
      run.company_id,
      counterpartyName,
      "prize_pool",
      financeInterpretation
    );

    if (amount > 0) {
      const revenueId = await upsertRevenueRecord(client, {
        companyId: run.company_id,
        sourceDocumentId: run.source_document_id,
        sponsorOrCustomerId: counterpartyId,
        contractId: null,
        revenueType: "prize_money",
        recognitionDate: recognitionDate ?? new Date().toISOString().slice(0, 10),
        amount,
        notes: financeInterpretation
      });

      await insertPostingEvent(client, {
        analysisRunId: run.id,
        status: "posted",
        targetTable: "revenue_records",
        targetId: revenueId,
        summary: "Approved prize-statement facts were posted into canonical revenue records."
      });
      return;
    }
  }

  await insertPostingEvent(client, {
    analysisRunId: run.id,
    status: "pending",
    targetTable: "manual_review",
    summary: "This document type is approved but still requires a dedicated canonical posting mapper."
  });
}

export async function analyzeDocumentAction(formData: FormData) {
  const session = await requireRole(["super_admin", "finance_admin", "team_member"]);
  const uploads = formData
    .getAll("document")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const redirectPath = sanitizeRedirectPath(String(formData.get("redirectPath") ?? "/documents"));
  const workflowContext =
    normalizeWhitespace(String(formData.get("workflowContext") ?? "")).slice(0, 120) || redirectPath;
  const intakeMode =
    normalizeWhitespace(String(formData.get("submissionMode") ?? "")).slice(0, 40) || null;

  if (uploads.length === 0) {
    redirect(buildWorkflowRedirect(redirectPath, "error", "Choose a document before running AI Analyze."));
  }

  const note = normalizeWhitespace(String(formData.get("documentNote") ?? "")).slice(0, 400) || null;
  const companyCode = normalizeWhitespace(String(formData.get("companyCode") ?? DEFAULT_COMPANY_CODE));
  const intakePayload = buildIntakePayload(formData, companyCode, workflowContext);
  const pool = getImportPool();
  const client = await pool.connect();
  let redirectUrl = buildRedirect(
    "success",
    "Document analyzed. Review the extracted fields before approval."
  );

  try {
    await client.query("begin");

    const company = await getCompanyContext(client, companyCode);
    if (!company) {
      throw new Error(`Company ${companyCode} was not found.`);
    }
    const companyId = company.id;
    const analyzerContext = await buildAnalyzerContext(client, {
      company,
      actorRole: session.role,
      workflowContext,
      submissionMode: intakeMode,
      redirectPath,
      intakePayload
    });
    const analysisSignature = buildAnalysisSignature(analyzerContext);

    let lastAnalysisRunId: string | null = null;
    let analyzedCount = 0;
    let reusedCount = 0;

    for (const upload of uploads) {
      const buffer = Buffer.from(await upload.arrayBuffer());
      const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
      const storedDocument = await storeUploadedDocument({
        buffer,
        fileName: upload.name,
        mimeType: upload.type || "application/octet-stream",
        fileSize: upload.size,
        fileHash,
        companyCode,
        workflowContext
      });

      const sourceDocumentId = await upsertSourceDocument(client, {
        companyId,
        fileHash,
        fileName: upload.name,
        mimeType: upload.type || "application/octet-stream",
        fileSize: upload.size,
        note,
        intakeMode,
        uploadedByUserId: session.id,
        workflowContext,
        storedDocument: storedDocument.storageMetadata,
        previewDataUrl: storedDocument.previewDataUrl,
        previewMimeType: storedDocument.previewMimeType,
        intakePayload
      });

      const cachedRunId = await getCachedRun(client, sourceDocumentId, analysisSignature);
      if (cachedRunId) {
        await insertDocumentIntakeEvent(client, {
          sourceDocumentId,
          analysisRunId: cachedRunId,
          companyId,
          appUserId: session.id,
          fileName: upload.name,
          workflowContext,
          intakeStatus: "reused",
          note
        });
        reusedCount += 1;
        lastAnalysisRunId = cachedRunId;
        continue;
      }

      const analysis = await analyzeDocumentWithGemini({
        fileName: upload.name,
        mimeType: upload.type || "application/octet-stream",
        buffer,
        note,
        context: analyzerContext
      });

      const analysisRunId = await insertAnalysisRun(client, {
        sourceDocumentId,
        companyId,
        fileName: upload.name,
        mimeType: upload.type || "application/octet-stream",
        documentType: analysis.documentType,
        overallConfidence: analysis.overallConfidence,
        proposedTarget: analysis.proposedTarget,
        financeInterpretation: analysis.financeInterpretation,
        extractedSummary: buildExtractedSummary(
          analysis,
          upload.type || "application/octet-stream",
          analyzerContext,
          analysisSignature,
          intakePayload
        )
      });

      await insertExtractedFields(client, analysisRunId, analysis.fields);
      await insertDocumentIntakeEvent(client, {
        sourceDocumentId,
        analysisRunId,
        companyId,
        appUserId: session.id,
        fileName: upload.name,
        workflowContext,
        intakeStatus: "analyzed",
        note
      });
      analyzedCount += 1;
      lastAnalysisRunId = analysisRunId;
    }

    await client.query("commit");
    const uploadCount = uploads.length;
    const message =
      uploadCount === 1
        ? reusedCount === 1
          ? "Existing analysis was reused for this document hash."
          : "Document analyzed. Review the extracted fields before approval."
        : `${uploadCount} files processed: ${analyzedCount} analyzed, ${reusedCount} reused.`;

    redirectUrl = buildWorkflowRedirect(
      redirectPath,
      reusedCount === uploadCount ? "info" : "success",
      message,
      { analysisRunId: lastAnalysisRunId }
    );
  } catch (error) {
    await client.query("rollback");
    redirect(
      buildWorkflowRedirect(
        redirectPath,
        "error",
        error instanceof Error ? error.message : "Document analysis failed."
      )
    );
  } finally {
    client.release();
  }

  await cascadeUpdate({
    trigger: "document:analyzed",
    entityType: "document_analysis_run",
    entityId: workflowContext,
    action: "analyze-batch",
    after: { workflowContext, uploadedCount: uploads.length, companyCode },
    performedBy: session.id,
    agentId: "document-agent",
  });

  revalidatePath("/documents");
  revalidatePath(redirectPath);
  redirect(redirectUrl);
}

export async function approveDocumentAnalysisAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const analysisRunId = normalizeWhitespace(String(formData.get("analysisRunId") ?? ""));
  const redirectPath = sanitizeRedirectPath(String(formData.get("redirectPath") ?? "/documents"));

  if (!analysisRunId) {
    redirect(buildWorkflowRedirect(redirectPath, "error", "Missing analysis run id."));
  }

  const pool = getImportPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows } = await client.query<AnalysisRunRow>(
      `select id, source_document_id, company_id, source_file_name, detected_document_type, extracted_summary
       from document_analysis_runs
       where id = $1
       limit 1`,
      [analysisRunId]
    );

    const run = rows[0];
    if (!run) {
      throw new Error("Document analysis run not found.");
    }

    await client.query(
      `update document_extracted_fields
       set approval_status = 'approved',
           updated_at = now()
       where analysis_run_id = $1`,
      [analysisRunId]
    );

    await postApprovedAnalysis(client, run);

    await client.query(
      `update document_analysis_runs
       set analysis_status = 'approved',
           approved_at = now(),
           approved_by = 'Portal Reviewer',
           updated_at = now()
       where id = $1`,
      [analysisRunId]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    redirect(
      buildWorkflowRedirect(
        redirectPath,
        "error",
        error instanceof Error ? error.message : "Approval failed."
      )
    );
  } finally {
    client.release();
  }

  await cascadeUpdate({
    trigger: "document:approved",
    entityType: "document_analysis_run",
    entityId: analysisRunId,
    action: "approve-and-post",
    performedBy: session.id,
    agentId: "document-agent",
  });

  revalidatePath("/documents");
  revalidatePath(redirectPath);
  revalidatePath("/");
  revalidatePath("/tbr");
  revalidatePath("/commercial-goals");
  redirect(buildWorkflowRedirect(redirectPath, "success", "Approved fields were posted into the finance model."));
}
