"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminPool, storeUploadedDocument } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole } from "../../../lib/auth";

const E1_STATUSES = [
  "paid",
  "issued",
  "partially_paid",
  "due",
  "unpaid",
  "credit_note",
  "void",
  "not_applicable",
  "pending_review",
  "source_check"
] as const;

const E1_LINE_TYPES = ["invoice", "credit_note", "support", "source_check"] as const;

const E1_PNL_TREATMENTS = [
  "overlap_variance",
  "incremental",
  "excluded_duplicate",
  "excluded_inapplicable",
  "excluded_contingent",
  "source_check",
  "pending_review"
] as const;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: unknown) {
  const raw = normalizeWhitespace(String(value ?? ""));
  if (!raw) return null;
  const amount = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function normalizeCurrency(value: unknown) {
  const currency = normalizeWhitespace(String(value ?? "USD")).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

function optionOr<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]) {
  const normalized = normalizeWhitespace(String(value ?? fallback));
  return options.includes(normalized) ? normalized as T[number] : fallback;
}

function buildE1Redirect(
  seasonCode: string,
  status: "success" | "error",
  message: string
): never {
  redirect(
    `/tbr/e1-accounting?season=${encodeURIComponent(seasonCode)}&status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}`
  );
}

function revalidateE1Workflows() {
  revalidatePath("/tbr/e1-accounting");
  revalidatePath("/tbr/overall-pnl");
  revalidatePath("/costs/TBR");
  revalidatePath("/costs");
}

function appendNoteSql() {
  return `
    case
      when $4::text is null or $4::text = '' then comments
      when comments is null or comments = '' then $4::text
      else comments || E'\n' || $4::text
    end
  `;
}

export async function updateTbrE1LineAction(formData: FormData) {
  const session = await requireRole(["super_admin", "finance_admin"]);
  const seasonCode = normalizeWhitespace(String(formData.get("seasonCode") ?? "S2")).toUpperCase();
  const lineId = normalizeWhitespace(String(formData.get("lineId") ?? ""));

  if (!lineId) {
    buildE1Redirect(seasonCode, "error", "Missing E1 row id.");
  }

  const invoiceNumber = normalizeWhitespace(String(formData.get("invoiceNumber") ?? "")) || null;
  const item = normalizeWhitespace(String(formData.get("item") ?? ""));
  const normalizedStatus = optionOr(formData.get("normalizedStatus"), E1_STATUSES, "pending_review");
  const lineType = optionOr(formData.get("lineType"), E1_LINE_TYPES, "invoice");
  const pnlTreatment = optionOr(formData.get("pnlTreatment"), E1_PNL_TREATMENTS, "pending_review");
  const overlapCategoryKey = normalizeWhitespace(String(formData.get("overlapCategoryKey") ?? "")) || null;
  const sourceCurrency = normalizeCurrency(formData.get("sourceCurrency"));
  const sourceAmount = parseAmount(formData.get("sourceAmount"));
  const fxRate = parseAmount(formData.get("fxRate")) ?? 1;
  const reportingAmountUsd = parseAmount(formData.get("reportingAmountUsd")) ?? 0;
  const dueAmountSource = parseAmount(formData.get("dueAmountSource"));
  const dueAmountReportingUsd = parseAmount(formData.get("dueAmountReportingUsd")) ?? 0;
  const comments = normalizeWhitespace(String(formData.get("comments") ?? "")) || null;

  if (!item) {
    buildE1Redirect(seasonCode, "error", "E1 item description is required.");
  }

  const pool = getAdminPool();
  const client = await pool.connect();
  let before: Record<string, unknown> | null = null;
  let after: Record<string, unknown> | null = null;

  try {
    await client.query("begin");
    const beforeRows = await client.query(
      `select id, invoice_number, item, normalized_status, line_type, pnl_treatment,
              overlap_category_key, source_amount, source_currency, fx_rate,
              reporting_amount_usd, due_amount_source, due_amount_reporting_usd,
              comments, source_document_id::text
       from tbr_e1_accounting_lines
       where id = $1
       for update`,
      [lineId]
    );
    before = beforeRows.rows[0] ?? null;

    if (!before) {
      throw new Error("E1 row was not found.");
    }

    const updatedRows = await client.query(
      `update tbr_e1_accounting_lines
       set invoice_number = $2,
           item = $3,
           normalized_status = $4,
           status_text = $4,
           line_type = $5,
           pnl_treatment = $6,
           overlap_category_key = $7,
           source_amount = $8,
           source_currency = $9,
           fx_rate = $10,
           fx_source = case when $10::numeric = 1 then fx_source else 'manual_edit' end,
           reporting_amount_usd = $11,
           due_amount_source = $12,
           due_amount_reporting_usd = $13,
           comments = $14,
           metadata = metadata || $15::jsonb,
           updated_at = now()
       where id = $1
       returning id, invoice_number, item, normalized_status, line_type, pnl_treatment,
                 overlap_category_key, source_amount, source_currency, fx_rate,
                 reporting_amount_usd, due_amount_source, due_amount_reporting_usd,
                 comments, source_document_id::text`,
      [
        lineId,
        invoiceNumber,
        item,
        normalizedStatus,
        lineType,
        pnlTreatment,
        overlapCategoryKey,
        sourceAmount,
        sourceCurrency,
        fxRate,
        reportingAmountUsd,
        dueAmountSource,
        dueAmountReportingUsd,
        comments,
        JSON.stringify({ lastEditedBy: session.id, lastEditedAt: new Date().toISOString() })
      ]
    );
    after = updatedRows.rows[0] ?? null;
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    buildE1Redirect(seasonCode, "error", error instanceof Error ? error.message : "Unable to update E1 row.");
  } finally {
    client.release();
  }

  await cascadeUpdate({
    trigger: "tbr-e1:line-updated",
    entityType: "tbr_e1_accounting_line",
    entityId: lineId,
    action: "update",
    before: before ?? undefined,
    after: after ?? undefined,
    performedBy: session.id,
    agentId: "finance-agent"
  });

  revalidateE1Workflows();
  buildE1Redirect(seasonCode, "success", "E1 row updated. Costs and P&L views have been refreshed.");
}

export async function updateTbrE1InvoiceStatusAction(formData: FormData) {
  const session = await requireRole(["super_admin", "finance_admin"]);
  const seasonCode = normalizeWhitespace(String(formData.get("seasonCode") ?? "S2")).toUpperCase();
  const invoiceNumber = normalizeWhitespace(String(formData.get("invoiceNumber") ?? "")) || null;
  const nextStatus = optionOr(formData.get("normalizedStatus"), E1_STATUSES, "pending_review");
  const note = normalizeWhitespace(String(formData.get("statusNote") ?? "")) || null;

  const pool = getAdminPool();
  const client = await pool.connect();
  let changedCount = 0;

  try {
    await client.query("begin");
    const rows = await client.query<{ id: string }>(
      `update tbr_e1_accounting_lines
       set normalized_status = $3,
           status_text = $3,
           due_amount_source = case
             when $3 in ('paid', 'void', 'not_applicable', 'credit_note') then 0
             else due_amount_source
           end,
           due_amount_reporting_usd = case
             when $3 in ('paid', 'void', 'not_applicable', 'credit_note') then 0
             else due_amount_reporting_usd
           end,
           pnl_treatment = case
             when $3 in ('void', 'not_applicable') then 'excluded_inapplicable'
             else pnl_treatment
           end,
           line_type = case
             when $3 = 'credit_note' then 'credit_note'
             else line_type
           end,
           comments = ${appendNoteSql()},
           metadata = metadata || $5::jsonb,
           updated_at = now()
       where season_code = $1
         and invoice_number is not distinct from $2
         and line_type <> 'source_check'
       returning id`,
      [
        seasonCode,
        invoiceNumber,
        nextStatus,
        note,
        JSON.stringify({
          invoiceStatusUpdatedBy: session.id,
          invoiceStatusUpdatedAt: new Date().toISOString()
        })
      ]
    );
    changedCount = rows.rowCount ?? 0;
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    buildE1Redirect(seasonCode, "error", error instanceof Error ? error.message : "Unable to update invoice status.");
  } finally {
    client.release();
  }

  await cascadeUpdate({
    trigger: "tbr-e1:invoice-status-updated",
    entityType: "tbr_e1_invoice_group",
    entityId: `${seasonCode}:${invoiceNumber ?? "no-invoice"}`,
    action: "update",
    after: { seasonCode, invoiceNumber, nextStatus, note, changedCount },
    performedBy: session.id,
    agentId: "finance-agent"
  });

  revalidateE1Workflows();
  buildE1Redirect(seasonCode, "success", `Invoice status updated across ${changedCount} E1 row${changedCount === 1 ? "" : "s"}.`);
}

export async function attachTbrE1InvoiceDocumentAction(formData: FormData) {
  const session = await requireRole(["super_admin", "finance_admin"]);
  const seasonCode = normalizeWhitespace(String(formData.get("seasonCode") ?? "S2")).toUpperCase();
  const invoiceNumber = normalizeWhitespace(String(formData.get("invoiceNumber") ?? "")) || null;
  const note = normalizeWhitespace(String(formData.get("documentNote") ?? "")) || null;
  const upload = formData.get("document");

  if (!(upload instanceof File) || upload.size <= 0) {
    buildE1Redirect(seasonCode, "error", "Choose an invoice document before uploading.");
  }

  const pool = getAdminPool();
  const client = await pool.connect();
  let sourceDocumentId: string | null = null;
  let linkedCount = 0;

  try {
    const contextRows = await client.query<{ company_id: string }>(
      `select c.id as company_id
       from companies c
       where c.code = 'TBR'::company_code
       limit 1`
    );
    const companyId = contextRows.rows[0]?.company_id;

    if (!companyId) {
      throw new Error("TBR company was not found.");
    }

    const buffer = Buffer.from(await upload.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const workflowContext = `tbr-e1-accounting:${seasonCode}:${invoiceNumber ?? "no-invoice"}`;
    const storedDocument = await storeUploadedDocument({
      buffer,
      fileName: upload.name,
      mimeType: upload.type || "application/octet-stream",
      fileSize: upload.size,
      fileHash,
      companyCode: "TBR",
      workflowContext
    });

    await client.query("begin");
    const sourceRows = await client.query<{ id: string }>(
      `insert into source_documents (
         company_id,
         document_type,
         source_system,
         source_identifier,
         source_name,
         metadata
       )
       values ($1, 'invoice_file'::source_document_type, 'e1_invoice_upload', $2, $3, $4::jsonb)
       on conflict (source_system, source_identifier)
       do update set
         source_name = excluded.source_name,
         metadata = source_documents.metadata || excluded.metadata,
         updated_at = now()
       returning id`,
      [
        companyId,
        `e1:${seasonCode}:${invoiceNumber ?? "no-invoice"}:${fileHash}`,
        upload.name,
        JSON.stringify({
          workflow: "tbr_e1_accounting",
          workflowContext,
          invoiceNumber,
          seasonCode,
          upload_note: note,
          file_hash: fileHash,
          uploaded_by_user_id: session.id,
          uploaded_at: new Date().toISOString(),
          document_storage: storedDocument.storageMetadata,
          preview_data_url: storedDocument.previewDataUrl,
          preview_mime_type: storedDocument.previewMimeType
        })
      ]
    );
    sourceDocumentId = sourceRows.rows[0]?.id ?? null;

    if (!sourceDocumentId) {
      throw new Error("Unable to create source document.");
    }

    await client.query(
      `insert into document_intake_events (
         source_document_id,
         company_id,
         app_user_id,
         source_file_name,
         workflow_context,
         intake_status,
         intake_note
       )
       values ($1, $2, $3, $4, $5, 'uploaded', $6)`,
      [sourceDocumentId, companyId, session.id, upload.name, workflowContext, note]
    );

    await client.query(
      `insert into tbr_e1_invoice_documents (
         season_id,
         invoice_number,
         source_document_id,
         linked_by_user_id,
         notes
       )
       select ts.id, $2, $3, $4, $5
       from tbr_seasons ts
       where ts.season_code = $1
       on conflict (season_id, invoice_number, source_document_id)
       do update set
         linked_by_user_id = excluded.linked_by_user_id,
         notes = coalesce(excluded.notes, tbr_e1_invoice_documents.notes)`,
      [seasonCode, invoiceNumber, sourceDocumentId, session.id, note]
    );

    const linkedRows = await client.query<{ id: string }>(
      `update tbr_e1_accounting_lines
       set source_document_id = $3,
           metadata = metadata || $4::jsonb,
           updated_at = now()
       where season_code = $1
         and invoice_number is not distinct from $2
         and line_type <> 'source_check'
       returning id`,
      [
        seasonCode,
        invoiceNumber,
        sourceDocumentId,
        JSON.stringify({ sourceDocumentLinkedBy: session.id, sourceDocumentLinkedAt: new Date().toISOString() })
      ]
    );
    linkedCount = linkedRows.rowCount ?? 0;
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    buildE1Redirect(seasonCode, "error", error instanceof Error ? error.message : "Unable to attach invoice document.");
  } finally {
    client.release();
  }

  await cascadeUpdate({
    trigger: "tbr-e1:invoice-document-attached",
    entityType: "source_document",
    entityId: sourceDocumentId ?? `${seasonCode}:${invoiceNumber ?? "no-invoice"}`,
    action: "create",
    after: { seasonCode, invoiceNumber, sourceDocumentId, linkedCount, fileName: upload.name },
    performedBy: session.id,
    agentId: "document-agent"
  });

  revalidateE1Workflows();
  revalidatePath("/documents/TBR");
  buildE1Redirect(seasonCode, "success", `Document attached to ${linkedCount} E1 row${linkedCount === 1 ? "" : "s"}.`);
}
