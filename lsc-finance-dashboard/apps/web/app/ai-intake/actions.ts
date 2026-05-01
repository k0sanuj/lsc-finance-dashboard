"use server";

import crypto from "node:crypto";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { getAdminPool, storeUploadedDocument } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";
import {
  getEntityMetadata,
  normalizeCompanyCode,
  type VisibleEntityCode,
} from "../lib/entities";
import { analyzeDocumentWithGemini, type GeminiAnalyzerContext } from "../documents/gemini";

type TargetKind =
  | "vendor_invoice"
  | "expense_receipt"
  | "reimbursement_bundle"
  | "sponsorship_commercial_document"
  | "fsp_sport_media_kit"
  | "fsp_sport_sponsorship_document"
  | "xtz_payroll_vendor_invoice_support";

type DraftRow = {
  id: string;
  company_id: string | null;
  source_document_id: string | null;
  submitted_by_user_id: string | null;
  target_kind: TargetKind;
  target_entity_type: string | null;
  target_entity_id: string | null;
  workflow_context: string | null;
  source_name: string | null;
  status: string;
};

type DraftFieldRow = {
  id: string;
  field_key: string;
  field_label: string;
  extracted_value: unknown;
  preview_value: unknown;
  normalized_value: string | null;
  confidence: string | null;
  canonical_target_table: string | null;
  canonical_target_column: string | null;
};

type PostingResult = {
  targetTable: string;
  targetId: string | null;
  summary: string;
  status?: "posted" | "manual_review";
};

const TARGET_KIND_LABELS: Record<TargetKind, string> = {
  vendor_invoice: "Vendor invoice",
  expense_receipt: "Expense receipt",
  reimbursement_bundle: "Reimbursement bundle",
  sponsorship_commercial_document: "Sponsorship / commercial document",
  fsp_sport_media_kit: "FSP sport media kit",
  fsp_sport_sponsorship_document: "FSP sport sponsorship document",
  xtz_payroll_vendor_invoice_support: "XTZ India payroll/vendor support",
};

const TARGET_KINDS = new Set(Object.keys(TARGET_KIND_LABELS));

function clean(value: FormDataEntryValue | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value: FormDataEntryValue | null | undefined) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function parseTargetKind(value: FormDataEntryValue | null): TargetKind {
  const raw = clean(value);
  return TARGET_KINDS.has(raw) ? (raw as TargetKind) : "vendor_invoice";
}

function hasUpload(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "size" in value &&
      Number((value as File).size) > 0
  );
}

function buildRedirectPath(
  rawPath: string,
  status: "success" | "error",
  message: string,
  draftId?: string | null
) {
  const url = new URL(rawPath || "/", "http://lsc.local");
  url.searchParams.set("status", status);
  url.searchParams.set("message", message);
  if (draftId) {
    url.searchParams.set("aiDraftId", draftId);
    url.searchParams.delete("analysisRunId");
  }
  return `${url.pathname}${url.search}` as Route;
}

function isNextRedirect(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

function workflowKindForTarget(targetKind: TargetKind): GeminiAnalyzerContext["workflow"]["kind"] {
  if (targetKind.startsWith("fsp_")) return "fsp_sport_asset_intake";
  if (targetKind === "xtz_payroll_vendor_invoice_support") return "xtz_india_support_intake";
  if (targetKind === "vendor_invoice") return "finance_invoice_intake";
  if (targetKind === "expense_receipt" || targetKind === "reimbursement_bundle") {
    return "tbr_race_expense_submission";
  }
  return "ai_intake_review";
}

function expectedDocumentTypes(targetKind: TargetKind) {
  switch (targetKind) {
    case "vendor_invoice":
      return ["Vendor Invoice"];
    case "expense_receipt":
      return ["Expense Receipt"];
    case "reimbursement_bundle":
      return ["Reimbursement Report", "Expense Receipt"];
    case "sponsorship_commercial_document":
      return ["Sponsorship Contract", "Prize Statement", "Controlled Manual Entry"];
    case "fsp_sport_media_kit":
      return ["FSP Media Kit"];
    case "fsp_sport_sponsorship_document":
      return ["FSP Sponsorship Document", "Sponsorship Contract"];
    case "xtz_payroll_vendor_invoice_support":
      return ["XTZ Payroll Support", "Vendor Invoice", "Reimbursement Report"];
  }
}

function preferredFields(targetKind: TargetKind) {
  switch (targetKind) {
    case "fsp_sport_media_kit":
      return [
        "channel",
        "non_linear_impressions_y1",
        "linear_impressions_y1",
        "non_linear_cpm_y1",
        "linear_cpm_y1",
        "avg_viewership",
      ];
    case "fsp_sport_sponsorship_document":
      return [
        "sponsor_name",
        "segment",
        "tier",
        "contract_status",
        "year_1_value",
        "year_2_value",
        "year_3_value",
      ];
    case "xtz_payroll_vendor_invoice_support":
      return [
        "vendor_name",
        "employee_or_payee",
        "payroll_month",
        "section",
        "amount",
        "currency_code",
        "due_date",
      ];
    case "sponsorship_commercial_document":
      return ["counterparty_name", "contract_value", "currency_code", "start_date", "end_date"];
    case "vendor_invoice":
      return ["vendor_name", "invoice_number", "issue_date", "due_date", "total_amount", "currency_code"];
    case "expense_receipt":
    case "reimbursement_bundle":
      return ["merchant_name", "expense_date", "amount", "usd_amount", "currency_code", "category", "paid_by"];
  }
}

async function getCompanyId(client: PoolClient, companyCode: VisibleEntityCode) {
  const { rows } = await client.query<{ id: string }>(
    `select id from companies where code = $1::company_code limit 1`,
    [companyCode]
  );
  return rows[0]?.id ?? null;
}

function buildAnalyzerContext(params: {
  companyCode: VisibleEntityCode;
  actorRole: string;
  targetKind: TargetKind;
  workflowContext: string | null;
  redirectPath: string;
  targetEntityType: string | null;
  targetEntityId: string | null;
  operatorNote: string | null;
}): GeminiAnalyzerContext {
  const entity = getEntityMetadata(params.companyCode);

  return {
    analysisVersion: "2026-05-01-ai-intake-v1",
    company: {
      code: entity.code,
      name: entity.label,
    },
    actor: {
      role: params.actorRole,
    },
    workflow: {
      raw: params.workflowContext ?? `ai-intake:${params.targetKind}`,
      kind: workflowKindForTarget(params.targetKind),
      submissionMode: params.targetKind,
      redirectPath: params.redirectPath,
    },
    race: null,
    hints: {
      expectedDocumentTypes: expectedDocumentTypes(params.targetKind),
      preferredFields: preferredFields(params.targetKind),
      outputCurrencyCode: "USD",
      defaultCountryCode: null,
      defaultCountryName: entity.country,
      defaultCurrencyCode: entity.defaultCurrency,
      useContextFallbacks: true,
      intakeCategory: params.targetKind,
      operatorSuppliedFields: {
        targetKind: params.targetKind,
        targetEntityType: params.targetEntityType ?? "",
        targetEntityId: params.targetEntityId ?? "",
        operatorNote: params.operatorNote ?? "",
      },
      expectedPlatformUpdates: [
        {
          area: "AI intake draft",
          effect: "Create editable preview for user approval before any canonical write.",
        },
      ],
    },
  };
}

async function upsertSourceDocument(client: PoolClient, params: {
  companyId: string;
  companyCode: VisibleEntityCode;
  sourceSystem: "ai_intake_upload" | "ai_intake_text";
  sourceIdentifier: string;
  sourceName: string;
  metadata: Record<string, unknown>;
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
     values ($1, 'manual_upload'::source_document_type, $2, $3, $4, $5::jsonb)
     on conflict (source_system, source_identifier)
     do update set
       company_id = excluded.company_id,
       source_name = excluded.source_name,
       metadata = source_documents.metadata || excluded.metadata,
       updated_at = now()
     returning id`,
    [
      params.companyId,
      params.sourceSystem,
      params.sourceIdentifier,
      params.sourceName,
      JSON.stringify({
        ...params.metadata,
        company_code: params.companyCode,
        last_ai_intake_at: new Date().toISOString(),
      }),
    ]
  );
  return rows[0]?.id ?? null;
}

async function insertDraft(client: PoolClient, params: {
  companyId: string;
  sourceDocumentId: string;
  submittedByUserId: string;
  sourceType: "upload" | "typed_input";
  targetKind: TargetKind;
  targetEntityType: string | null;
  targetEntityId: string | null;
  workflowContext: string | null;
  sourceName: string;
  inputText: string | null;
}) {
  const { rows } = await client.query<{ id: string }>(
    `insert into ai_intake_drafts (
       company_id,
       source_document_id,
       submitted_by_user_id,
       source_type,
       target_kind,
       target_entity_type,
       target_entity_id,
       workflow_context,
       source_name,
       input_text,
       status
     )
     values ($1, $2, $3, $4, $5, $6, $7::uuid, $8, $9, $10, 'extracting')
     returning id`,
    [
      params.companyId,
      params.sourceDocumentId,
      params.submittedByUserId,
      params.sourceType,
      params.targetKind,
      params.targetEntityType,
      params.targetEntityId || null,
      params.workflowContext,
      params.sourceName,
      params.inputText,
    ]
  );
  return rows[0]?.id ?? null;
}

async function insertDraftFields(client: PoolClient, draftId: string, fields: Array<{
  key: string;
  label: string;
  value: string;
  normalizedValue: string;
  confidence: number;
  canonicalTargetTable: string;
  canonicalTargetColumn: string;
}>) {
  for (const [index, field] of fields.entries()) {
    const previewValue = field.normalizedValue || field.value || "";
    await client.query(
      `insert into ai_intake_draft_fields (
         draft_id,
         field_key,
         field_label,
         extracted_value,
         preview_value,
         normalized_value,
         confidence,
         approval_status,
         canonical_target_table,
         canonical_target_column,
         sort_order
       )
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, 'pending', $8, $9, $10)
       on conflict (draft_id, field_key)
       do update set
         field_label = excluded.field_label,
         extracted_value = excluded.extracted_value,
         preview_value = excluded.preview_value,
         normalized_value = excluded.normalized_value,
         confidence = excluded.confidence,
         canonical_target_table = excluded.canonical_target_table,
         canonical_target_column = excluded.canonical_target_column,
         sort_order = excluded.sort_order,
         updated_at = now()`,
      [
        draftId,
        field.key,
        field.label,
        JSON.stringify(field.value ?? ""),
        JSON.stringify(previewValue),
        field.normalizedValue || null,
        Number.isFinite(field.confidence) ? field.confidence : 0,
        field.canonicalTargetTable || null,
        field.canonicalTargetColumn || null,
        index,
      ]
    );
  }
}

async function safeCascade(params: Parameters<typeof cascadeUpdate>[0]) {
  try {
    await cascadeUpdate(params);
  } catch (error) {
    console.error("AI intake audit cascade failed", error);
  }
}

export async function createAiIntakeDraftAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin", "team_member", "commercial_user"]);
  const session = await requireSession();

  const redirectPath = clean(formData.get("redirectPath")) || "/";
  const companyCode = normalizeCompanyCode(clean(formData.get("companyCode")), "LSC");
  const targetKind = parseTargetKind(formData.get("targetKind"));
  const targetEntityType = clean(formData.get("targetEntityType")) || null;
  const targetEntityId = clean(formData.get("targetEntityId")) || null;
  const workflowContext = clean(formData.get("workflowContext")) || `ai-intake:${companyCode.toLowerCase()}:${targetKind}`;
  const operatorNote = cleanMultiline(formData.get("documentNote")).slice(0, 1000) || null;
  const typedInput = cleanMultiline(formData.get("typedInput")).slice(0, 24000) || null;
  const upload = formData.get("document");

  if (!hasUpload(upload) && !typedInput) {
    redirect(buildRedirectPath(redirectPath, "error", "Upload a file or paste/type source text before running AI extract."));
  }

  const pool = getAdminPool();
  const client = await pool.connect();
  let draftId: string | null = null;

  try {
    const companyId = await getCompanyId(client, companyCode);
    if (!companyId) throw new Error(`Company ${companyCode} was not found.`);

    const sourceType: "upload" | "typed_input" = hasUpload(upload) ? "upload" : "typed_input";
    const sourceName = hasUpload(upload)
      ? upload.name
      : `Typed ${TARGET_KIND_LABELS[targetKind]} intake`;
    const mimeType = hasUpload(upload) ? upload.type || "application/octet-stream" : "text/plain";
    const buffer = hasUpload(upload)
      ? Buffer.from(await upload.arrayBuffer())
      : Buffer.from(typedInput ?? "", "utf8");
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const storedDocument = hasUpload(upload)
      ? await storeUploadedDocument({
          buffer,
          fileName: upload.name,
          mimeType,
          fileSize: upload.size,
          fileHash,
          companyCode,
          workflowContext,
        })
      : { storageMetadata: null, previewDataUrl: null, previewMimeType: null };

    await client.query("begin");
    const sourceDocumentId = await upsertSourceDocument(client, {
      companyId,
      companyCode,
      sourceSystem: sourceType === "upload" ? "ai_intake_upload" : "ai_intake_text",
      sourceIdentifier: `${companyCode}:${targetKind}:${fileHash}`,
      sourceName,
      metadata: {
        ai_intake_target_kind: targetKind,
        workflow_context: workflowContext,
        operator_note: operatorNote,
        file_hash: fileHash,
        mimeType,
        fileSize: hasUpload(upload) ? upload.size : buffer.byteLength,
        typed_input_preview: sourceType === "typed_input" ? typedInput?.slice(0, 2000) : null,
        document_storage: storedDocument.storageMetadata,
        preview_data_url: storedDocument.previewDataUrl,
        preview_mime_type: storedDocument.previewMimeType,
      },
    });
    if (!sourceDocumentId) throw new Error("Failed to create source document.");

    draftId = await insertDraft(client, {
      companyId,
      sourceDocumentId,
      submittedByUserId: session.id,
      sourceType,
      targetKind,
      targetEntityType,
      targetEntityId,
      workflowContext,
      sourceName,
      inputText: sourceType === "typed_input" ? typedInput : null,
    });
    if (!draftId) throw new Error("Failed to create AI intake draft.");
    await client.query("commit");

    const analyzerContext = buildAnalyzerContext({
      companyCode,
      actorRole: session.role,
      targetKind,
      workflowContext,
      redirectPath,
      targetEntityType,
      targetEntityId,
      operatorNote,
    });
    const analysis = await analyzeDocumentWithGemini({
      fileName: sourceName,
      mimeType,
      buffer,
      note: operatorNote,
      context: analyzerContext,
    });

    await client.query("begin");
    await insertDraftFields(client, draftId, analysis.fields);
    await client.query(
      `update ai_intake_drafts
       set status = 'needs_review',
           detected_document_type = $2,
           proposed_target = $3,
           finance_interpretation = $4,
           extracted_summary = $5::jsonb,
           overall_confidence = $6,
           extracted_at = now(),
           updated_at = now()
       where id = $1::uuid`,
      [
        draftId,
        analysis.documentType,
        analysis.proposedTarget,
        analysis.financeInterpretation,
        JSON.stringify({
          proposedTarget: analysis.proposedTarget,
          financeInterpretation: analysis.financeInterpretation,
          aiIntakeTargetKind: targetKind,
          analyzerContext,
        }),
        analysis.overallConfidence,
      ]
    );
    await client.query("commit");

    await safeCascade({
      trigger: "ai-intake:draft-created",
      entityType: "ai_intake_draft",
      entityId: draftId,
      action: "create",
      after: {
        companyCode,
        targetKind,
        sourceType,
        sourceName,
        detectedDocumentType: analysis.documentType,
      },
      performedBy: session.id,
      agentId: "ai-intake-agent",
    });

    revalidatePath(redirectPath);
    redirect(buildRedirectPath(redirectPath, "success", "AI extracted fields. Review the mapped preview before posting.", draftId));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    try {
      await client.query("rollback");
    } catch {
      // Ignore rollback failures from already-committed phases.
    }

    if (draftId) {
      await client.query(
        `update ai_intake_drafts
         set status = 'failed',
             error_message = $2,
             updated_at = now()
         where id = $1::uuid`,
        [draftId, error instanceof Error ? error.message : "AI extraction failed."]
      );
    }

    redirect(buildRedirectPath(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "AI extraction failed.",
      draftId
    ));
  } finally {
    client.release();
  }
}

function valueToText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildFieldLookup(fields: DraftFieldRow[]) {
  const lookup = new Map<string, string>();
  for (const field of fields) {
    const preview = valueToText(field.preview_value);
    lookup.set(normalizeKey(field.field_key), preview);
    lookup.set(normalizeKey(field.field_label), preview);
  }
  return lookup;
}

function pick(lookup: Map<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = lookup.get(normalizeKey(key));
    if (value) return value.trim();
  }
  return "";
}

function parseAmount(value: string) {
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function parseCurrency(value: string, fallback = "USD") {
  const match = value.toUpperCase().match(/[A-Z]{3}/);
  return match?.[0] ?? fallback;
}

function parseDate(value: string) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function hasFinanceApprovalRole(role: string) {
  return role === "super_admin" || role === "finance_admin";
}

function isSelfServiceExpenseTarget(targetKind: TargetKind) {
  return targetKind === "expense_receipt" || targetKind === "reimbursement_bundle";
}

function assertDraftReviewAllowed(params: {
  role: string;
  userId: string;
  draft: DraftRow;
  intent: string;
}) {
  const isFinanceApprover = hasFinanceApprovalRole(params.role);
  if (!isFinanceApprover && params.draft.submitted_by_user_id !== params.userId) {
    throw new Error("You can only review your own AI intake drafts.");
  }

  if (
    params.intent === "approve" &&
    !isFinanceApprover &&
    !isSelfServiceExpenseTarget(params.draft.target_kind)
  ) {
    throw new Error("Finance approval is required before this AI intake draft can post canonical records.");
  }
}

function monthStart(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return new Date().toISOString().slice(0, 7) + "-01";
  return `${parsed.slice(0, 7)}-01`;
}

async function recordPosting(client: PoolClient, draftId: string, result: PostingResult) {
  await client.query(
    `insert into ai_intake_posting_events (
       draft_id,
       posting_status,
       canonical_target_table,
       canonical_target_id,
       posting_summary,
       completed_at
     )
     values ($1, $2, $3, $4::uuid, $5, now())`,
    [
      draftId,
      result.status ?? "posted",
      result.targetTable,
      result.targetId,
      result.summary,
    ]
  );
}

async function recordFailedPosting(client: PoolClient, draftId: string, targetTable: string, error: string) {
  await client.query(
    `insert into ai_intake_posting_events (
       draft_id,
       posting_status,
       canonical_target_table,
       posting_summary,
       error_message,
       completed_at
     )
     values ($1, 'failed', $2, 'Posting failed during approval.', $3, now())`,
    [draftId, targetTable, error]
  );
}

async function upsertCounterparty(
  client: PoolClient,
  companyId: string,
  name: string,
  type: "vendor" | "sponsor" | "customer"
) {
  if (!name) return null;
  const { rows } = await client.query<{ id: string }>(
    `insert into sponsors_or_customers (company_id, name, normalized_name, counterparty_type, notes)
     values ($1, $2, lower($2), $3, 'Created from approved AI intake draft')
     on conflict (company_id, normalized_name)
     do update set
       name = excluded.name,
       counterparty_type = excluded.counterparty_type,
       updated_at = now()
     returning id`,
    [companyId, name, type]
  );
  return rows[0]?.id ?? null;
}

async function postVendorInvoice(client: PoolClient, draft: DraftRow, fields: DraftFieldRow[]) {
  if (!draft.company_id) throw new Error("Draft is missing company context.");
  const lookup = buildFieldLookup(fields);
  const vendorName = pick(lookup, "vendor_name", "vendor", "merchant_name", "counterparty_name", "payee");
  const invoiceNumber = pick(lookup, "invoice_number", "invoice_no", "reference_number");
  const amount = parseAmount(pick(lookup, "total_amount", "amount", "invoice_amount", "original_amount"));
  const currency = parseCurrency(pick(lookup, "currency_code", "currency", "original_currency"), "USD");
  const issueDate = parseDate(pick(lookup, "issue_date", "invoice_date", "document_date"));
  const dueDate = parseDate(pick(lookup, "due_date", "payment_due_date"));
  const description = pick(lookup, "description", "document_description", "category", "cost_category");

  if (!vendorName && amount <= 0) {
    throw new Error("Vendor invoice approval needs at least a vendor name or a positive amount.");
  }

  const counterpartyId = await upsertCounterparty(client, draft.company_id, vendorName, "vendor");
  const { rows } = await client.query<{ id: string }>(
    `insert into invoices (
       company_id,
       sponsor_or_customer_id,
       source_document_id,
       direction,
       invoice_number,
       invoice_status,
       issue_date,
       due_date,
       currency_code,
       subtotal_amount,
       total_amount,
       notes
     )
     values ($1, $2, $3, 'payable', $4, 'issued', $5::date, $6::date, $7, $8, $8, $9)
     returning id`,
    [
      draft.company_id,
      counterpartyId,
      draft.source_document_id,
      invoiceNumber || null,
      issueDate,
      dueDate,
      currency,
      amount,
      `Posted from approved AI intake draft ${draft.id}.${description ? ` ${description}` : ""}`,
    ]
  );
  const invoiceId = rows[0]?.id;
  if (!invoiceId) throw new Error("Failed to post vendor invoice.");

  const results: PostingResult[] = [{
    targetTable: "invoices",
    targetId: invoiceId,
    summary: `Created payable invoice${vendorName ? ` for ${vendorName}` : ""}.`,
  }];

  if (amount > 0) {
    const paymentRows = await client.query<{ id: string }>(
      `insert into payments (
         company_id,
         invoice_id,
         source_document_id,
         direction,
         payment_status,
         due_date,
         currency_code,
         amount,
         description
       )
       values ($1, $2, $3, 'outflow', 'planned', $4::date, $5, $6, $7)
       returning id`,
      [
        draft.company_id,
        invoiceId,
        draft.source_document_id,
        dueDate,
        currency,
        amount,
        vendorName ? `Planned payment to ${vendorName}` : "Planned vendor payment from AI intake",
      ]
    );
    results.push({
      targetTable: "payments",
      targetId: paymentRows.rows[0]?.id ?? null,
      summary: "Created planned payment for the approved invoice.",
    });
  }

  return results;
}

async function postExpenseSubmission(client: PoolClient, draft: DraftRow, fields: DraftFieldRow[]) {
  if (!draft.company_id || !draft.submitted_by_user_id) {
    throw new Error("Draft is missing company or submitter context.");
  }
  const lookup = buildFieldLookup(fields);
  const merchant = pick(lookup, "merchant_name", "vendor_name", "vendor", "counterparty_name");
  const expenseDate = parseDate(pick(lookup, "expense_date", "transaction_date", "document_date", "date"));
  const amount = parseAmount(pick(lookup, "amount", "total_amount", "original_amount"));
  const currency = parseCurrency(pick(lookup, "currency_code", "currency", "original_currency"), "USD");
  const category = pick(lookup, "category", "cost_category", "cost_category_hint");
  const description = pick(lookup, "description", "document_description", "purpose");
  const paidBy = pick(lookup, "paid_by", "person", "employee_or_payee");
  const title = pick(lookup, "report_title", "title") ||
    `${merchant || "Expense"}${expenseDate ? ` - ${expenseDate}` : ""}`;

  if (amount <= 0) {
    throw new Error("Expense approval needs a positive amount.");
  }

  const { rows } = await client.query<{ id: string }>(
    `insert into expense_submissions (
       company_id,
       submitted_by_user_id,
       submission_status,
       submission_title,
       operator_note,
       submitted_at,
       billing_entity_id,
       reimbursing_entity_id,
       tagged_brand
     )
     values ($1, $2, 'submitted', $3, $4, now(), $1, $1, $5)
     returning id`,
    [
      draft.company_id,
      draft.submitted_by_user_id,
      title,
      `Created from approved AI intake draft ${draft.id}.${paidBy ? ` Paid by ${paidBy}.` : ""}`,
      category || null,
    ]
  );
  const submissionId = rows[0]?.id;
  if (!submissionId) throw new Error("Failed to post expense submission.");

  await client.query(
    `insert into expense_submission_items (
       submission_id,
       source_document_id,
       merchant_name,
       expense_date,
       currency_code,
       amount,
       description,
       ai_summary
     )
     values ($1, $2, $3, $4::date, $5, $6, $7, $8::jsonb)`,
    [
      submissionId,
      draft.source_document_id,
      merchant || null,
      expenseDate,
      currency,
      amount,
      description || category || null,
      JSON.stringify({
        aiIntakeDraftId: draft.id,
        category,
        paidBy,
        targetKind: draft.target_kind,
      }),
    ]
  );

  return [{
    targetTable: "expense_submissions",
    targetId: submissionId,
    summary: `Created expense submission for ${merchant || title}.`,
  }];
}

async function approveRaceExpenseEvidence(draft: DraftRow) {
  return [{
    targetTable: "expense_submissions",
    targetId: null,
    status: "manual_review" as const,
    summary: `Receipt approved for race expense report grouping from draft ${draft.id}.`,
  }];
}

async function postCommercialDocument(client: PoolClient, draft: DraftRow, fields: DraftFieldRow[]) {
  if (!draft.company_id) throw new Error("Draft is missing company context.");
  const lookup = buildFieldLookup(fields);
  const counterpartyName = pick(lookup, "counterparty_name", "sponsor_name", "customer_name", "partner_name");
  const contractName = pick(lookup, "contract_name", "document_title", "title") ||
    `${counterpartyName || "Commercial"} agreement`;
  const amount = parseAmount(pick(lookup, "contract_value", "total_amount", "amount", "year_1_value"));
  const currency = parseCurrency(pick(lookup, "currency_code", "currency"), "USD");
  const startDate = parseDate(pick(lookup, "start_date", "contract_start", "effective_date"));
  const endDate = parseDate(pick(lookup, "end_date", "contract_end", "expiry_date"));
  const statusValue = pick(lookup, "contract_status", "status").toLowerCase();
  const contractStatus = statusValue.includes("active") || statusValue.includes("signed") ? "active" : "draft";
  const counterpartyId = await upsertCounterparty(client, draft.company_id, counterpartyName, "sponsor");

  if (!counterpartyId) {
    throw new Error("Commercial document approval needs a counterparty or sponsor name.");
  }

  const { rows } = await client.query<{ id: string }>(
    `insert into contracts (
       company_id,
       sponsor_or_customer_id,
       contract_name,
       contract_status,
       contract_value,
       currency_code,
       start_date,
       end_date,
       notes
     )
     values ($1, $2, $3, $4::contract_status, $5, $6, $7::date, $8::date, $9)
     returning id`,
    [
      draft.company_id,
      counterpartyId,
      contractName,
      contractStatus,
      amount,
      currency,
      startDate,
      endDate,
      `Created from approved AI intake draft ${draft.id}. Source document: ${draft.source_document_id ?? "none"}.`,
    ]
  );
  const contractId = rows[0]?.id;
  if (!contractId) throw new Error("Failed to post commercial contract.");

  const results: PostingResult[] = [{
    targetTable: "contracts",
    targetId: contractId,
    summary: `Created ${contractStatus} contract for ${counterpartyName}.`,
  }];

  if (amount > 0) {
    const revenueRows = await client.query<{ id: string }>(
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
       values ($1, $2, $3, $4, 'sponsorship', coalesce($5::date, current_date), $6, $7, $8)
       returning id`,
      [
        draft.company_id,
        contractId,
        counterpartyId,
        draft.source_document_id,
        startDate,
        currency,
        amount,
        `Recognized from approved AI intake draft ${draft.id}.`,
      ]
    );
    results.push({
      targetTable: "revenue_records",
      targetId: revenueRows.rows[0]?.id ?? null,
      summary: "Created sponsorship revenue record from approved contract amount.",
    });
  }

  return results;
}

function parseSponsorshipTier(value: string) {
  const key = value.toLowerCase();
  if (key.includes("title")) return "title";
  if (key.includes("present")) return "presenting";
  if (key.includes("media")) return "media";
  if (key.includes("support")) return "supporting";
  return "official";
}

function parseFspContractStatus(value: string) {
  const key = value.toLowerCase();
  if (key.includes("active")) return "active";
  if (key.includes("signed")) return "signed";
  if (key.includes("loi") || key.includes("intent")) return "loi";
  if (key.includes("expired")) return "expired";
  return "pipeline";
}

async function postFspSponsorship(client: PoolClient, draft: DraftRow, fields: DraftFieldRow[]) {
  if (!draft.target_entity_id) throw new Error("FSP sponsorship posting needs a sport target.");
  const lookup = buildFieldLookup(fields);
  const sponsorName = pick(lookup, "sponsor_name", "counterparty_name", "partner_name");
  const segment = pick(lookup, "segment", "sponsorship_segment", "asset", "inventory") || "Sponsorship";
  const tier = parseSponsorshipTier(pick(lookup, "tier", "sponsorship_tier"));
  const contractStatus = parseFspContractStatus(pick(lookup, "contract_status", "status"));
  const y1 = parseAmount(pick(lookup, "year_1_value", "y1_value", "contract_value", "amount"));
  const y2 = parseAmount(pick(lookup, "year_2_value", "y2_value"));
  const y3 = parseAmount(pick(lookup, "year_3_value", "y3_value"));
  const currency = parseCurrency(pick(lookup, "currency_code", "currency"), "USD");
  const startDate = parseDate(pick(lookup, "contract_start", "start_date"));
  const endDate = parseDate(pick(lookup, "contract_end", "end_date"));
  const paymentSchedule = pick(lookup, "payment_schedule", "payments");
  const deliverables = pick(lookup, "deliverables_summary", "deliverables", "rights");

  const { rows } = await client.query<{ id: string }>(
    `insert into fsp_sponsorships (
       sport_id,
       segment,
       sponsor_name,
       tier,
       contract_status,
       year_1_value,
       year_2_value,
       year_3_value,
       currency_code,
       contract_start,
       contract_end,
       payment_schedule,
       deliverables_summary,
       document_id
     )
     values ($1, $2, $3, $4::sponsorship_tier, $5::sponsorship_contract_status,
             $6, $7, $8, $9, $10::date, $11::date, $12, $13, $14::uuid)
     returning id`,
    [
      draft.target_entity_id,
      segment,
      sponsorName || null,
      tier,
      contractStatus,
      y1,
      y2,
      y3,
      currency,
      startDate,
      endDate,
      paymentSchedule || null,
      deliverables || null,
      draft.source_document_id,
    ]
  );

  return [{
    targetTable: "fsp_sponsorships",
    targetId: rows[0]?.id ?? null,
    summary: `Created FSP sponsorship ${segment}${sponsorName ? ` for ${sponsorName}` : ""}.`,
  }];
}

function channelValues(lookup: Map<string, string>, prefix: "non_linear" | "linear") {
  return {
    impressionsY1: parseAmount(pick(lookup, `${prefix}_impressions_y1`, `${prefix}_impressions_year_1`)),
    impressionsY2: parseAmount(pick(lookup, `${prefix}_impressions_y2`, `${prefix}_impressions_year_2`)),
    impressionsY3: parseAmount(pick(lookup, `${prefix}_impressions_y3`, `${prefix}_impressions_year_3`)),
    cpmY1: parseAmount(pick(lookup, `${prefix}_cpm_y1`, `${prefix}_cpm_year_1`)),
    cpmY2: parseAmount(pick(lookup, `${prefix}_cpm_y2`, `${prefix}_cpm_year_2`)),
    cpmY3: parseAmount(pick(lookup, `${prefix}_cpm_y3`, `${prefix}_cpm_year_3`)),
    avgViewership: parseAmount(pick(lookup, `${prefix}_avg_viewership`, "avg_viewership", "average_viewership")),
  };
}

function hasMediaValues(values: ReturnType<typeof channelValues>) {
  return Object.values(values).some((value) => value > 0);
}

async function upsertMediaChannel(
  client: PoolClient,
  draft: DraftRow,
  channel: "non_linear" | "linear",
  values: ReturnType<typeof channelValues>,
  notes: string
) {
  const { rows } = await client.query<{ id: string }>(
    `insert into fsp_media_revenue_cpm (
       sport_id,
       channel,
       impressions_y1,
       impressions_y2,
       impressions_y3,
       cpm_y1,
       cpm_y2,
       cpm_y3,
       avg_viewership,
       notes
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (sport_id, channel)
     do update set
       impressions_y1 = excluded.impressions_y1,
       impressions_y2 = excluded.impressions_y2,
       impressions_y3 = excluded.impressions_y3,
       cpm_y1 = excluded.cpm_y1,
       cpm_y2 = excluded.cpm_y2,
       cpm_y3 = excluded.cpm_y3,
       avg_viewership = excluded.avg_viewership,
       notes = excluded.notes,
       updated_at = now()
     returning id`,
    [
      draft.target_entity_id,
      channel,
      values.impressionsY1,
      values.impressionsY2,
      values.impressionsY3,
      values.cpmY1,
      values.cpmY2,
      values.cpmY3,
      values.avgViewership,
      notes,
    ]
  );
  return rows[0]?.id ?? null;
}

async function postFspMediaKit(client: PoolClient, draft: DraftRow, fields: DraftFieldRow[]) {
  if (!draft.target_entity_id) throw new Error("FSP media posting needs a sport target.");
  const lookup = buildFieldLookup(fields);
  const nonLinear = channelValues(lookup, "non_linear");
  const linear = channelValues(lookup, "linear");
  const notes = `Created from approved AI intake draft ${draft.id}. ${pick(lookup, "assumptions", "notes", "description")}`;
  const results: PostingResult[] = [];

  if (hasMediaValues(nonLinear)) {
    results.push({
      targetTable: "fsp_media_revenue_cpm",
      targetId: await upsertMediaChannel(client, draft, "non_linear", nonLinear, notes),
      summary: "Updated non-linear FSP media CPM assumptions from media kit.",
    });
  }

  if (hasMediaValues(linear)) {
    results.push({
      targetTable: "fsp_media_revenue_cpm",
      targetId: await upsertMediaChannel(client, draft, "linear", linear, notes),
      summary: "Updated linear FSP media CPM assumptions from media kit.",
    });
  }

  if (results.length === 0) {
    const generic = {
      impressionsY1: parseAmount(pick(lookup, "impressions_y1", "impressions", "reach")),
      impressionsY2: parseAmount(pick(lookup, "impressions_y2")),
      impressionsY3: parseAmount(pick(lookup, "impressions_y3")),
      cpmY1: parseAmount(pick(lookup, "cpm_y1", "cpm")),
      cpmY2: parseAmount(pick(lookup, "cpm_y2")),
      cpmY3: parseAmount(pick(lookup, "cpm_y3")),
      avgViewership: parseAmount(pick(lookup, "avg_viewership", "average_viewership")),
    };
    if (hasMediaValues(generic)) {
      results.push({
        targetTable: "fsp_media_revenue_cpm",
        targetId: await upsertMediaChannel(client, draft, "non_linear", generic, notes),
        summary: "Updated non-linear FSP media assumptions from generic media kit fields.",
      });
    }
  }

  if (results.length === 0) {
    return [{
      targetTable: "fsp_media_revenue_cpm",
      targetId: null,
      status: "manual_review" as const,
      summary: "Media kit approved, but no CPM/impression fields were strong enough to post automatically.",
    }];
  }

  return results;
}

async function postXtzSupport(client: PoolClient, draft: DraftRow, fields: DraftFieldRow[]) {
  if (!draft.company_id) throw new Error("Draft is missing company context.");
  const lookup = buildFieldLookup(fields);
  const section = pick(lookup, "section", "category", "support_type").toLowerCase();
  const vendor = pick(lookup, "vendor_name", "vendor", "employee_or_payee", "payee");
  const description = pick(lookup, "description", "document_description", "purpose") ||
    `${vendor || "XTZ support"} document`;
  const amount = parseAmount(pick(lookup, "amount", "total_amount", "invoice_amount"));
  const currency = parseCurrency(pick(lookup, "currency_code", "currency"), "INR");
  const month = monthStart(pick(lookup, "payroll_month", "expense_month", "issue_date", "document_date"));

  if (section.includes("software")) {
    const { rows } = await client.query<{ id: string }>(
      `insert into software_expenses (
         paying_company_id,
         expense_month,
         vendor_name,
         description,
         amount,
         currency_code,
         source_document_id,
         status,
         notes
       )
       values ($1, $2::date, $3, $4, $5, $6, $7, 'unpaid', $8)
       returning id`,
      [
        draft.company_id,
        month,
        vendor || "Unknown vendor",
        description,
        amount,
        currency,
        draft.source_document_id,
        `Created from approved AI intake draft ${draft.id}.`,
      ]
    );
    return [{
      targetTable: "software_expenses",
      targetId: rows[0]?.id ?? null,
      summary: "Created XTZ software expense support record.",
    }];
  }

  if (section.includes("reimburs")) {
    const { rows } = await client.query<{ id: string }>(
      `insert into reimbursement_items (
         reimbursing_company_id,
         expense_month,
         description,
         vendor_name,
         amount,
         currency_code,
         source_document_id,
         status,
         notes
       )
       values ($1, $2::date, $3, $4, $5, $6, $7, 'pending', $8)
       returning id`,
      [
        draft.company_id,
        month,
        description,
        vendor || null,
        amount,
        currency,
        draft.source_document_id,
        `Created from approved AI intake draft ${draft.id}.`,
      ]
    );
    return [{
      targetTable: "reimbursement_items",
      targetId: rows[0]?.id ?? null,
      summary: "Created XTZ reimbursement support record.",
    }];
  }

  if (section.includes("payroll") || section.includes("provision")) {
    const { rows } = await client.query<{ id: string }>(
      `insert into provisions (
         company_id,
         provision_month,
         description,
         category,
         vendor_name,
         estimated_amount,
         currency_code,
         status,
         notes
       )
       values ($1, $2::date, $3, 'payroll_support', $4, $5, $6, 'estimated', $7)
       returning id`,
      [
        draft.company_id,
        month,
        description,
        vendor || null,
        amount,
        currency,
        `Created from approved AI intake draft ${draft.id}. Source document: ${draft.source_document_id ?? "none"}.`,
      ]
    );
    return [{
      targetTable: "provisions",
      targetId: rows[0]?.id ?? null,
      summary: "Created XTZ payroll/provision support record.",
    }];
  }

  return postVendorInvoice(client, draft, fields);
}

async function postDraftToCanonical(client: PoolClient, draft: DraftRow, fields: DraftFieldRow[]) {
  switch (draft.target_kind) {
    case "vendor_invoice":
      return postVendorInvoice(client, draft, fields);
    case "expense_receipt":
    case "reimbursement_bundle":
      if (draft.workflow_context?.startsWith("tbr-race:")) {
        return approveRaceExpenseEvidence(draft);
      }
      return postExpenseSubmission(client, draft, fields);
    case "sponsorship_commercial_document":
      return postCommercialDocument(client, draft, fields);
    case "fsp_sport_sponsorship_document":
      return postFspSponsorship(client, draft, fields);
    case "fsp_sport_media_kit":
      return postFspMediaKit(client, draft, fields);
    case "xtz_payroll_vendor_invoice_support":
      return postXtzSupport(client, draft, fields);
  }
}

function collectFieldUpdates(formData: FormData) {
  const updates: Array<{ id: string; value: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field:")) {
      const id = key.slice("field:".length);
      if (id) updates.push({ id, value: cleanMultiline(value) });
    }
  }
  return updates;
}

async function getDraftForUpdate(client: PoolClient, draftId: string) {
  const { rows } = await client.query<DraftRow>(
    `select id, company_id::text, source_document_id::text, submitted_by_user_id::text,
            target_kind, target_entity_type, target_entity_id::text,
            workflow_context, source_name, status
     from ai_intake_drafts
     where id = $1::uuid
     for update`,
    [draftId]
  );
  return rows[0] ?? null;
}

async function getDraftFields(client: PoolClient, draftId: string) {
  const { rows } = await client.query<DraftFieldRow>(
    `select id, field_key, field_label, extracted_value, preview_value,
            normalized_value, confidence::text, canonical_target_table, canonical_target_column
     from ai_intake_draft_fields
     where draft_id = $1::uuid
     order by sort_order`,
    [draftId]
  );
  return rows;
}

export async function reviewAiIntakeDraftAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin", "team_member", "commercial_user"]);
  const session = await requireSession();

  const draftId = clean(formData.get("draftId"));
  const redirectPath = clean(formData.get("redirectPath")) || "/";
  const intent = clean(formData.get("intent")) || "save";
  const reviewerNotes = cleanMultiline(formData.get("reviewerNotes")).slice(0, 1000) || null;
  if (!draftId) {
    redirect(buildRedirectPath(redirectPath, "error", "Missing AI draft id."));
  }

  const pool = getAdminPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const draft = await getDraftForUpdate(client, draftId);
    if (!draft) throw new Error("AI intake draft was not found.");
    assertDraftReviewAllowed({
      role: session.role,
      userId: session.id,
      draft,
      intent,
    });
    if (!["needs_review", "approved", "failed"].includes(draft.status) && intent !== "discard") {
      throw new Error(`Draft is ${draft.status}; it cannot be edited or posted.`);
    }

    const fieldUpdates = collectFieldUpdates(formData);
    const fieldApprovalStatus = intent === "approve" ? "approved" : "edited";
    for (const update of fieldUpdates) {
      await client.query(
        `update ai_intake_draft_fields
         set preview_value = $2::jsonb,
             normalized_value = $3,
             approval_status = $4,
             reviewer_notes = $5,
             updated_at = now()
         where id = $1::uuid
           and draft_id = $6::uuid`,
        [
          update.id,
          JSON.stringify(update.value),
          update.value || null,
          fieldApprovalStatus,
          reviewerNotes,
          draftId,
        ]
      );
    }

    if (intent === "reject") {
      await client.query(
        `update ai_intake_drafts
         set status = 'rejected',
             rejected_by_user_id = $2,
             rejected_at = now(),
             updated_at = now()
         where id = $1::uuid`,
        [draftId, session.id]
      );
      await client.query("commit");
      await safeCascade({
        trigger: "ai-intake:draft-rejected",
        entityType: "ai_intake_draft",
        entityId: draftId,
        action: "reject",
        after: { reviewerNotes },
        performedBy: session.id,
        agentId: "ai-intake-agent",
      });
      revalidatePath(redirectPath);
      redirect(buildRedirectPath(redirectPath, "success", "AI intake draft rejected. No canonical records were changed.", draftId));
    }

    if (intent === "discard") {
      await client.query(
        `update ai_intake_drafts
         set status = 'discarded',
             discarded_by_user_id = $2,
             discarded_at = now(),
             updated_at = now()
         where id = $1::uuid`,
        [draftId, session.id]
      );
      await client.query("commit");
      await safeCascade({
        trigger: "ai-intake:draft-discarded",
        entityType: "ai_intake_draft",
        entityId: draftId,
        action: "discard",
        after: { reviewerNotes },
        performedBy: session.id,
        agentId: "ai-intake-agent",
      });
      revalidatePath(redirectPath);
      redirect(buildRedirectPath(redirectPath, "success", "AI intake draft discarded. No canonical records were changed.", draftId));
    }

    if (intent === "save") {
      await client.query(
        `update ai_intake_drafts
         set status = 'needs_review',
             updated_at = now()
         where id = $1::uuid`,
        [draftId]
      );
      await client.query("commit");
      revalidatePath(redirectPath);
      redirect(buildRedirectPath(redirectPath, "success", "Preview fields saved. Approve when ready to post.", draftId));
    }

    if (intent !== "approve") {
      throw new Error(`Unsupported review action: ${intent}`);
    }

    await client.query(
      `update ai_intake_drafts
       set status = 'approved',
           approved_by_user_id = $2,
           approved_at = now(),
           updated_at = now()
       where id = $1::uuid`,
      [draftId, session.id]
    );

    const fields = await getDraftFields(client, draftId);
    let results: PostingResult[];
    try {
      results = await postDraftToCanonical(client, draft, fields);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Canonical posting failed.";
      await client.query(
        `update ai_intake_drafts
         set status = 'failed',
             error_message = $2,
             updated_at = now()
         where id = $1::uuid`,
        [draftId, message]
      );
      await recordFailedPosting(client, draftId, draft.target_kind, message);
      await client.query("commit");
      revalidatePath(redirectPath);
      redirect(buildRedirectPath(redirectPath, "error", message, draftId));
    }

    for (const result of results) {
      await recordPosting(client, draftId, result);
    }
    const posted = results.some((result) => (result.status ?? "posted") === "posted");
    const primary = results.find((result) => result.targetId);
    await client.query(
      `update ai_intake_drafts
       set status = $2,
           target_entity_type = coalesce($3, target_entity_type),
           target_entity_id = coalesce($4::uuid, target_entity_id),
           posted_at = case when $2 = 'posted' then now() else posted_at end,
           updated_at = now()
       where id = $1::uuid`,
      [
        draftId,
        posted ? "posted" : "approved",
        primary?.targetTable ?? null,
        primary?.targetId ?? null,
      ]
    );
    await client.query("commit");

    await safeCascade({
      trigger: "ai-intake:draft-approved",
      entityType: "ai_intake_draft",
      entityId: draftId,
      action: posted ? "post" : "approve",
      after: {
        targetKind: draft.target_kind,
        postingResults: results,
      },
      performedBy: session.id,
      agentId: "ai-intake-agent",
    });

    revalidatePath(redirectPath);
    redirect(buildRedirectPath(
      redirectPath,
      "success",
      posted
        ? "Approved fields posted to canonical finance tables with lineage."
        : "Draft approved and ready for the next controlled workflow step.",
      draftId
    ));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    try {
      await client.query("rollback");
    } catch {
      // Ignore rollback failures after redirects or committed branches.
    }
    redirect(buildRedirectPath(
      redirectPath,
      "error",
      error instanceof Error ? error.message : "AI intake review failed.",
      draftId
    ));
  } finally {
    client.release();
  }
}
