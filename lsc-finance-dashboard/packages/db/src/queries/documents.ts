import "server-only";

import {
  documentAnalysisQueue,
  documentExtractedFields,
  documentPostingEvents
} from "../seed-data";
import { queryRows } from "../query";
import { hasDocumentPreview, resolveDocumentPreview } from "../document-storage";
import {
  formatDateLabel,
  formatDateValue,
  formatDecimalAmount,
  formatStatusLabel,
  getBackend,
  parseIntakeFields,
  parsePlatformUpdates
} from "./shared";

export type DocumentQueueRow = {
  id?: string;
  intakeEventId?: string;
  sourceDocumentId?: string;
  documentName: string;
  documentType: string;
  status: string;
  confidence: string;
  proposedTarget: string;
  createdAt?: string;
  workflowContext?: string;
  intakeStatus?: string;
  originCountry?: string;
  currencyCode?: string;
  previewAvailable?: boolean;
  previewDataUrl?: string | null;
  expenseDate?: string;
  originalAmount?: string;
  originalCurrency?: string;
  convertedUsdAmount?: string;
  linkedSubmissionId?: string | null;
  linkedSubmissionTitle?: string | null;
  linkedSubmissionStatus?: string | null;
  intakeCategory?: string;
  updateSummary?: string;
};

export type DocumentFieldRow = {
  field: string;
  proposedValue: string;
  confidence: string;
  approval: string;
};

export type DocumentPostingRow = {
  target: string;
  status: string;
  summary: string;
};

export type DocumentDetailRow = {
  analysisRunId: string;
  sourceDocumentId: string;
  documentName: string;
  documentType: string;
  status: string;
  confidence: string;
  proposedTarget: string;
  financeInterpretation: string;
  createdAt: string;
  uploaderName: string;
  workflowContext: string;
  previewDataUrl: string | null;
  previewMimeType: string | null;
  originSource: string;
  originCountry: string;
  currencyCode: string;
  issuerCountry: string;
  intakeCategory: string;
  intakeFields: Array<{ label: string; value: string }>;
  platformUpdates: Array<{ area: string; effect: string }>;
};

export type DocumentAnalysisSource = {
  id: string;
  source_file_name: string | null;
  detected_document_type: string | null;
  analysis_status: string;
  overall_confidence: string | null;
  extracted_summary: Record<string, unknown> | null;
};

export type DocumentQueueSource = {
  intake_event_id: string;
  analysis_run_id: string;
  source_file_name: string | null;
  detected_document_type: string | null;
  analysis_status: string;
  overall_confidence: string | null;
  extracted_summary: Record<string, unknown> | null;
  created_at: string;
  workflow_context: string | null;
  intake_status: string;
  metadata: Record<string, unknown> | null;
  source_document_id: string;
  linked_submission_id: string | null;
  linked_submission_title: string | null;
  linked_submission_status: string | null;
};

export type DocumentFieldSource = {
  field_label: string;
  normalized_value: string | null;
  confidence: string | null;
  approval_status: string;
};

export type DocumentPostingSource = {
  canonical_target_table: string;
  posting_status: string;
  posting_summary: string | null;
};

export type DocumentDetailSource = {
  analysis_run_id: string;
  source_document_id: string;
  source_file_name: string | null;
  detected_document_type: string | null;
  analysis_status: string;
  overall_confidence: string | null;
  extracted_summary: Record<string, unknown> | null;
  created_at: string;
  workflow_context: string | null;
  uploader_name: string;
  metadata: Record<string, unknown> | null;
};

export type RaceWorkflowDocumentSource = {
  intake_event_id: string;
  analysis_run_id: string;
  source_document_id: string;
  source_file_name: string | null;
  detected_document_type: string | null;
  analysis_status: string;
  overall_confidence: string | null;
  extracted_summary: Record<string, unknown> | null;
  created_at: string;
  workflow_context: string | null;
  intake_status: string;
  metadata: Record<string, unknown> | null;
};

export async function getDocumentAnalysisQueue(appUserId?: string, workflowContextPrefix?: string) {
  if (getBackend() === "database") {
    const rows = await queryRows<DocumentQueueSource>(
      `select
         die.id as intake_event_id,
         dar.id as analysis_run_id,
         sd.id as source_document_id,
         dar.source_file_name,
         dar.detected_document_type,
         dar.analysis_status,
         dar.overall_confidence::text,
         dar.extracted_summary,
         die.created_at::text,
         die.workflow_context,
         die.intake_status,
         sd.metadata,
         linked.submission_id as linked_submission_id,
         linked.submission_title as linked_submission_title,
         linked.submission_status as linked_submission_status
       from document_intake_events die
       join document_analysis_runs dar on dar.id = die.analysis_run_id
       join source_documents sd on sd.id = die.source_document_id
       left join lateral (
         select
           es.id as submission_id,
           es.submission_title,
           es.submission_status
         from expense_submission_items esi
         join expense_submissions es on es.id = esi.submission_id
         where esi.source_document_id = sd.id
           and ($1::uuid is null or es.submitted_by_user_id = $1::uuid)
         order by esi.created_at desc
         limit 1
       ) linked on true
       where ($1::uuid is null or die.app_user_id = $1::uuid)
         and ($2::text is null or die.workflow_context like ($2 || '%'))
       order by die.created_at desc
       limit 12`,
      [appUserId ?? null, workflowContextPrefix ?? null]
    );

    if (rows.length > 0) {
      return Promise.all(rows.map(async (row) => {
        const preview = await resolveDocumentPreview(row.metadata);
        const platformUpdates = parsePlatformUpdates(row.extracted_summary);

        return {
          id: row.analysis_run_id,
          intakeEventId: row.intake_event_id,
          sourceDocumentId: row.source_document_id,
          documentName: row.source_file_name ?? "Uploaded Document",
          documentType: row.detected_document_type ?? "Unknown",
          status: row.linked_submission_status
            ? `in report \u00B7 ${formatStatusLabel(row.linked_submission_status)}`
            : row.analysis_status,
          confidence: row.overall_confidence ?? "0.00",
          proposedTarget: String(row.extracted_summary?.proposedTarget ?? "pending review"),
          createdAt: formatDateLabel(row.created_at),
          workflowContext: row.workflow_context ?? "documents",
          intakeStatus: row.intake_status,
          originCountry: String(row.extracted_summary?.originCountry ?? "Unknown"),
          currencyCode: String(row.extracted_summary?.currencyCode ?? "Unknown"),
          previewAvailable: hasDocumentPreview(row.metadata),
          previewDataUrl: preview.previewDataUrl,
          expenseDate: formatDateValue(String(row.extracted_summary?.expenseDate ?? "")),
          originalAmount: formatDecimalAmount(
            Number(row.extracted_summary?.originalAmount ?? 0),
            String(row.extracted_summary?.originalCurrency ?? row.extracted_summary?.currencyCode ?? "USD")
          ),
          originalCurrency: String(
            row.extracted_summary?.originalCurrency ?? row.extracted_summary?.currencyCode ?? "Unknown"
          ),
          convertedUsdAmount: formatDecimalAmount(Number(row.extracted_summary?.usdAmount ?? 0), "USD"),
          linkedSubmissionId: row.linked_submission_id,
          linkedSubmissionTitle: row.linked_submission_title,
          linkedSubmissionStatus: row.linked_submission_status,
          intakeCategory: String(
            (row.extracted_summary?.intakePayload as Record<string, unknown> | undefined)?.label ?? "Unmapped"
          ),
          updateSummary:
            platformUpdates
              .slice(0, 2)
              .map((item) => item.area)
              .join(" \u2022 ") || "Pending workflow mapping"
        };
      }));
    }
  }

  return [...documentAnalysisQueue];
}

export async function getDocumentAnalysisDetail(analysisRunId?: string, appUserId?: string) {
  if (getBackend() === "database") {
    const rows = await queryRows<DocumentDetailSource>(
      `select
         dar.id as analysis_run_id,
         sd.id as source_document_id,
         dar.source_file_name,
         dar.detected_document_type,
         dar.analysis_status,
         dar.overall_confidence::text,
         dar.extracted_summary,
         die.created_at::text,
         die.workflow_context,
         au.full_name as uploader_name,
         sd.metadata
       from document_intake_events die
       join document_analysis_runs dar on dar.id = die.analysis_run_id
       join source_documents sd on sd.id = die.source_document_id
       join app_users au on au.id = die.app_user_id
       where ($1::uuid is null or dar.id = $1::uuid)
         and ($2::uuid is null or die.app_user_id = $2::uuid)
       order by die.created_at desc
       limit 1`,
      [analysisRunId ?? null, appUserId ?? null]
    );

    const row = rows[0];

    if (row) {
      const preview = await resolveDocumentPreview(row.metadata);
      const intakePayload =
        row.extracted_summary && typeof row.extracted_summary.intakePayload === "object"
          ? (row.extracted_summary.intakePayload as Record<string, unknown>)
          : null;

      return {
        analysisRunId: row.analysis_run_id,
        sourceDocumentId: row.source_document_id,
        documentName: row.source_file_name ?? "Uploaded Document",
        documentType: row.detected_document_type ?? "Unknown",
        status: row.analysis_status,
        confidence: row.overall_confidence ?? "0.00",
        proposedTarget: String(row.extracted_summary?.proposedTarget ?? "pending review"),
        financeInterpretation: String(
          row.extracted_summary?.financeInterpretation ?? "Awaiting finance interpretation."
        ),
        createdAt: formatDateLabel(row.created_at),
        uploaderName: row.uploader_name,
        workflowContext: row.workflow_context ?? "documents",
        previewDataUrl: preview.previewDataUrl,
        previewMimeType: preview.previewMimeType,
        originSource: String(row.extracted_summary?.originSource ?? row.metadata?.source_system ?? "portal_upload"),
        originCountry: String(row.extracted_summary?.originCountry ?? "Unknown"),
        currencyCode: String(row.extracted_summary?.currencyCode ?? "Unknown"),
        issuerCountry: String(row.extracted_summary?.issuerCountry ?? "Unknown"),
        intakeCategory: String(intakePayload?.label ?? "Unmapped"),
        intakeFields: parseIntakeFields(row.extracted_summary),
        platformUpdates: parsePlatformUpdates(row.extracted_summary)
      } satisfies DocumentDetailRow;
    }
  }

  return null;
}

export async function getDocumentExtractedFields(analysisRunId?: string) {
  if (getBackend() === "database") {
    const rows = await queryRows<{
      field_label: string;
      normalized_value: string | null;
      confidence: string | null;
      approval_status: string;
    }>(
      `select field_label, normalized_value, confidence::text, approval_status
       from document_extracted_fields
       where ($1::uuid is null or analysis_run_id = $1::uuid)
       order by created_at desc
       limit 20`,
      [analysisRunId ?? null]
    );

    if (rows.length > 0) {
      return rows.map((row: DocumentFieldSource) => ({
        field: row.field_label,
        proposedValue: row.normalized_value ?? "Pending extraction",
        confidence: row.confidence ?? "0.00",
        approval: row.approval_status
      }));
    }
  }

  return [...documentExtractedFields];
}

export async function getDocumentPostingEvents(analysisRunId?: string) {
  if (getBackend() === "database") {
    const rows = await queryRows<{
      canonical_target_table: string;
      posting_status: string;
      posting_summary: string | null;
    }>(
      `select canonical_target_table, posting_status, posting_summary
       from document_posting_events
       where ($1::uuid is null or analysis_run_id = $1::uuid)
       order by created_at desc
       limit 10`,
      [analysisRunId ?? null]
    );

    if (rows.length > 0) {
      return rows.map((row: DocumentPostingSource) => ({
        target: row.canonical_target_table,
        status: row.posting_status,
        summary: row.posting_summary ?? "Awaiting posting summary"
      }));
    }
  }

  return [...documentPostingEvents];
}
