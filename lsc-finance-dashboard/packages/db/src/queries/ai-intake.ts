import "server-only";

import { queryRowsAdmin } from "../query";
import { resolveDocumentPreview } from "../document-storage";
import {
  formatDateLabel,
  formatDateValue,
  formatDecimalAmount,
  formatStatusLabel,
  getBackend,
} from "./shared";

export type AiIntakeQueueRow = {
  id: string;
  companyCode: string;
  companyName: string;
  sourceName: string;
  sourceType: string;
  targetKind: string;
  targetEntityType: string | null;
  targetEntityId: string | null;
  workflowContext: string | null;
  status: string;
  detectedDocumentType: string;
  proposedTarget: string;
  financeInterpretation: string;
  confidence: string;
  submittedBy: string;
  createdAt: string;
  previewAvailable: boolean;
};

export type AiIntakeDraftFieldRow = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  extractedValue: string;
  previewValue: string;
  normalizedValue: string;
  confidence: string;
  approvalStatus: string;
  canonicalTargetTable: string;
  canonicalTargetColumn: string;
  reviewerNotes: string;
};

export type AiIntakePostingEventRow = {
  id: string;
  status: string;
  targetTable: string;
  targetId: string | null;
  summary: string;
  error: string;
  createdAt: string;
};

export type AiIntakeRaceBillRow = {
  id: string;
  intakeEventId: string;
  documentName: string;
  expenseDate: string;
  originalAmount: string;
  originalCurrency: string;
  convertedUsdAmount: string;
  status: string;
  previewDataUrl?: string | null;
  linkedSubmissionTitle?: string | null;
  canSelect: boolean;
};

export type AiIntakeDraftDetail = AiIntakeQueueRow & {
  sourceDocumentId: string | null;
  inputText: string | null;
  errorMessage: string | null;
  previewDataUrl: string | null;
  previewMimeType: string | null;
  extractedSummary: Record<string, unknown>;
  fields: AiIntakeDraftFieldRow[];
  postingEvents: AiIntakePostingEventRow[];
};

type QueueSource = {
  id: string;
  company_code: string | null;
  company_name: string | null;
  source_name: string | null;
  source_type: string;
  target_kind: string;
  target_entity_type: string | null;
  target_entity_id: string | null;
  workflow_context: string | null;
  status: string;
  detected_document_type: string | null;
  proposed_target: string | null;
  finance_interpretation: string | null;
  overall_confidence: string | null;
  submitter_name: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type DetailSource = QueueSource & {
  source_document_id: string | null;
  input_text: string | null;
  error_message: string | null;
  extracted_summary: Record<string, unknown> | null;
};

function stringifyJsonValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function fieldText(fields: Record<string, unknown> | null, ...keys: string[]) {
  if (!fields) return "";
  for (const key of keys) {
    const value = fields[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  }
  return "";
}

function parseAmount(value: string) {
  const amount = Number(value.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function parseCurrency(value: string, fallback = "USD") {
  const match = value.toUpperCase().match(/[A-Z]{3}/);
  return match?.[0] ?? fallback;
}

function normalizeConfidence(value: string | null) {
  if (!value) return "0.00";
  return Number(value).toFixed(2);
}

function rowToQueueRow(row: QueueSource, previewAvailable: boolean): AiIntakeQueueRow {
  return {
    id: row.id,
    companyCode: row.company_code ?? "LSC",
    companyName: row.company_name ?? "Unknown company",
    sourceName: row.source_name ?? "Typed intake",
    sourceType: row.source_type,
    targetKind: row.target_kind,
    targetEntityType: row.target_entity_type,
    targetEntityId: row.target_entity_id,
    workflowContext: row.workflow_context,
    status: row.status,
    detectedDocumentType: row.detected_document_type ?? "Unknown",
    proposedTarget: row.proposed_target ?? "pending review",
    financeInterpretation: row.finance_interpretation ?? "",
    confidence: normalizeConfidence(row.overall_confidence),
    submittedBy: row.submitter_name ?? "Unknown user",
    createdAt: formatDateLabel(row.created_at),
    previewAvailable,
  };
}

export async function getAiIntakeQueue(options: {
  appUserId?: string | null;
  companyCode?: string | null;
  workflowContextPrefix?: string | null;
  targetKind?: string | null;
  limit?: number;
} = {}): Promise<AiIntakeQueueRow[]> {
  if (getBackend() !== "database") return [];

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const rows = await queryRowsAdmin<QueueSource>(
    `select
       aid.id,
       c.code::text as company_code,
       c.name as company_name,
       coalesce(aid.source_name, sd.source_name) as source_name,
       aid.source_type,
       aid.target_kind,
       aid.target_entity_type,
       aid.target_entity_id::text,
       aid.workflow_context,
       aid.status,
       aid.detected_document_type,
       aid.proposed_target,
       aid.finance_interpretation,
       aid.overall_confidence::text,
       au.full_name as submitter_name,
       aid.created_at::text,
       sd.metadata
     from ai_intake_drafts aid
     left join companies c on c.id = aid.company_id
     left join source_documents sd on sd.id = aid.source_document_id
     left join app_users au on au.id = aid.submitted_by_user_id
     where ($1::uuid is null or aid.submitted_by_user_id = $1::uuid)
       and ($2::text is null or c.code::text = $2::text)
       and ($3::text is null or aid.workflow_context like ($3::text || '%'))
       and ($4::text is null or aid.target_kind = $4::text)
     order by aid.created_at desc
     limit $5`,
    [
      options.appUserId ?? null,
      options.companyCode ?? null,
      options.workflowContextPrefix ?? null,
      options.targetKind ?? null,
      limit,
    ]
  );

  return Promise.all(
    rows.map(async (row) => {
      const preview = await resolveDocumentPreview(row.metadata);
      return rowToQueueRow(row, Boolean(preview.previewDataUrl));
    })
  );
}

export async function getAiIntakeDraftDetail(
  draftId: string,
  appUserId?: string | null
): Promise<AiIntakeDraftDetail | null> {
  if (getBackend() !== "database") return null;

  const rows = await queryRowsAdmin<DetailSource>(
    `select
       aid.id,
       c.code::text as company_code,
       c.name as company_name,
       aid.source_document_id::text,
       coalesce(aid.source_name, sd.source_name) as source_name,
       aid.source_type,
       aid.target_kind,
       aid.target_entity_type,
       aid.target_entity_id::text,
       aid.workflow_context,
       aid.status,
       aid.detected_document_type,
       aid.proposed_target,
       aid.finance_interpretation,
       aid.overall_confidence::text,
       aid.input_text,
       aid.error_message,
       aid.extracted_summary,
       au.full_name as submitter_name,
       aid.created_at::text,
       sd.metadata
     from ai_intake_drafts aid
     left join companies c on c.id = aid.company_id
     left join source_documents sd on sd.id = aid.source_document_id
     left join app_users au on au.id = aid.submitted_by_user_id
     where aid.id = $1::uuid
       and ($2::uuid is null or aid.submitted_by_user_id = $2::uuid)
     limit 1`,
    [draftId, appUserId ?? null]
  );

  const row = rows[0];
  if (!row) return null;

  const [fields, postingEvents, preview] = await Promise.all([
    getAiIntakeDraftFields(draftId),
    getAiIntakePostingEvents(draftId),
    resolveDocumentPreview(row.metadata),
  ]);

  return {
    ...rowToQueueRow(row, Boolean(preview.previewDataUrl)),
    sourceDocumentId: row.source_document_id,
    inputText: row.input_text,
    errorMessage: row.error_message,
    previewDataUrl: preview.previewDataUrl,
    previewMimeType: preview.previewMimeType,
    extractedSummary: row.extracted_summary ?? {},
    fields,
    postingEvents,
  };
}

export async function getAiIntakeDraftFields(draftId: string): Promise<AiIntakeDraftFieldRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRowsAdmin<{
    id: string;
    field_key: string;
    field_label: string;
    extracted_value: unknown;
    preview_value: unknown;
    normalized_value: string | null;
    confidence: string | null;
    approval_status: string;
    canonical_target_table: string | null;
    canonical_target_column: string | null;
    reviewer_notes: string | null;
  }>(
    `select id, field_key, field_label, extracted_value, preview_value,
            normalized_value, confidence::text, approval_status,
            canonical_target_table, canonical_target_column, reviewer_notes
     from ai_intake_draft_fields
     where draft_id = $1::uuid
     order by sort_order, field_label`,
    [draftId]
  );

  return rows.map((row) => ({
    id: row.id,
    fieldKey: row.field_key,
    fieldLabel: row.field_label,
    extractedValue: stringifyJsonValue(row.extracted_value),
    previewValue: stringifyJsonValue(row.preview_value),
    normalizedValue: row.normalized_value ?? "",
    confidence: normalizeConfidence(row.confidence),
    approvalStatus: formatStatusLabel(row.approval_status),
    canonicalTargetTable: row.canonical_target_table ?? "",
    canonicalTargetColumn: row.canonical_target_column ?? "",
    reviewerNotes: row.reviewer_notes ?? "",
  }));
}

export async function getAiIntakePostingEvents(draftId: string): Promise<AiIntakePostingEventRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRowsAdmin<{
    id: string;
    posting_status: string;
    canonical_target_table: string;
    canonical_target_id: string | null;
    posting_summary: string | null;
    error_message: string | null;
    created_at: string;
  }>(
    `select id, posting_status, canonical_target_table,
            canonical_target_id::text, posting_summary, error_message,
            created_at::text
     from ai_intake_posting_events
     where draft_id = $1::uuid
     order by created_at desc`,
    [draftId]
  );

  return rows.map((row) => ({
    id: row.id,
    status: formatStatusLabel(row.posting_status),
    targetTable: row.canonical_target_table,
    targetId: row.canonical_target_id,
    summary: row.posting_summary ?? "",
    error: row.error_message ?? "",
    createdAt: formatDateLabel(row.created_at),
  }));
}

export async function getAiIntakeRaceBills(
  appUserId: string,
  raceId: string
): Promise<AiIntakeRaceBillRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRowsAdmin<{
    id: string;
    source_name: string | null;
    status: string;
    source_document_id: string | null;
    field_values: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    linked_submission_title: string | null;
    linked_submission_status: string | null;
  }>(
    `select
       aid.id,
       coalesce(aid.source_name, sd.source_name) as source_name,
       aid.status,
       aid.source_document_id::text,
       fields.field_values,
       sd.metadata,
       linked.submission_title as linked_submission_title,
       linked.submission_status as linked_submission_status
     from ai_intake_drafts aid
     left join source_documents sd on sd.id = aid.source_document_id
     left join lateral (
       select jsonb_object_agg(aidf.field_key, aidf.preview_value) as field_values
       from ai_intake_draft_fields aidf
       where aidf.draft_id = aid.id
     ) fields on true
     left join lateral (
       select
         es.submission_title,
         es.submission_status
       from expense_submission_items esi
       join expense_submissions es on es.id = esi.submission_id
       where esi.source_document_id = aid.source_document_id
       order by esi.created_at desc
       limit 1
     ) linked on true
     where aid.submitted_by_user_id = $1::uuid
       and aid.workflow_context like ('tbr-race:' || $2::text || ':%')
       and aid.target_kind in ('expense_receipt', 'reimbursement_bundle')
       and aid.status in ('needs_review', 'approved', 'posted')
     order by aid.created_at desc
     limit 50`,
    [appUserId, raceId]
  );

  return Promise.all(
    rows.map(async (row) => {
      const fields = row.field_values ?? {};
      const currency = parseCurrency(
        fieldText(fields, "currency_code", "original_currency", "currency"),
        "USD"
      );
      const usdAmount = parseAmount(fieldText(fields, "usd_amount"));
      const originalAmount =
        parseAmount(fieldText(fields, "original_amount", "total_amount", "amount")) || usdAmount;
      const expenseDate = fieldText(fields, "expense_date", "transaction_date", "document_date", "date");
      const preview = await resolveDocumentPreview(row.metadata);
      const linked = Boolean(row.linked_submission_title);
      const approved = row.status === "approved";

      return {
        id: row.id,
        intakeEventId: `ai:${row.id}`,
        documentName: row.source_name ?? "AI intake receipt",
        expenseDate: formatDateValue(expenseDate),
        originalAmount: formatDecimalAmount(originalAmount, currency),
        originalCurrency: currency,
        convertedUsdAmount:
          usdAmount > 0
            ? formatDecimalAmount(usdAmount, "USD")
            : currency === "USD"
              ? formatDecimalAmount(originalAmount, "USD")
              : "Pending FX",
        status: linked
          ? `in report · ${formatStatusLabel(row.linked_submission_status)}`
          : approved
            ? "approved"
            : "review first",
        previewDataUrl: preview.previewDataUrl,
        linkedSubmissionTitle: row.linked_submission_title,
        canSelect: approved && !linked,
      };
    })
  );
}
