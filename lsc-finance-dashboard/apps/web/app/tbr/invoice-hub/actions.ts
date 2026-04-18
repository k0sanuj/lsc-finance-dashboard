"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../../lib/auth";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function redirectToInvoiceHub(status: "success" | "error" | "info", message: string): never {
  redirect(
    `/tbr/invoice-hub?status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}`
  );
}

function revalidateInvoicePaths() {
  revalidatePath("/payments");
  revalidatePath("/tbr");
  revalidatePath("/tbr/invoice-hub");
  revalidatePath("/tbr/expense-management");
  revalidatePath("/tbr/my-expenses");
}

export async function createInvoiceIntakeAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const vendorName = normalizeWhitespace(String(formData.get("vendorName") ?? ""));
  const invoiceNumber = normalizeWhitespace(String(formData.get("invoiceNumber") ?? "")) || null;
  const dueDate = normalizeWhitespace(String(formData.get("dueDate") ?? "")) || null;
  const raceEventId = normalizeWhitespace(String(formData.get("raceEventId") ?? "")) || null;
  const totalAmount = parseAmount(String(formData.get("totalAmount") ?? "0"));
  const categoryHint = normalizeWhitespace(String(formData.get("categoryHint") ?? "")) || null;
  const operatorNote = normalizeWhitespace(String(formData.get("operatorNote") ?? "")) || null;
  const paymentType = normalizeWhitespace(String(formData.get("paymentType") ?? "direct"));
  const paidByUserId = normalizeWhitespace(String(formData.get("paidByUserId") ?? "")) || null;

  if (!vendorName || totalAmount <= 0) {
    redirectToInvoiceHub("error", "Vendor name and a positive amount are required.");
  }

  const companyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = 'TBR'::company_code limit 1`
  );
  const companyId = companyRows[0]?.id;

  if (!companyId) {
    redirectToInvoiceHub("error", "TBR company record was not found.");
  }

  // Build the operator note with reimbursement context
  const isReimbursement = paymentType === "reimbursement";
  let fullNote = operatorNote ?? "";

  if (isReimbursement && paidByUserId) {
    const userRows = await queryRowsAdmin<{ full_name: string }>(
      `select full_name from app_users where id = $1 limit 1`,
      [paidByUserId]
    );
    const paidByName = userRows[0]?.full_name ?? "Unknown";
    fullNote = `[REIMBURSEMENT] Paid by: ${paidByName}. ${fullNote}`.trim();
  } else if (isReimbursement) {
    fullNote = `[REIMBURSEMENT] ${fullNote}`.trim();
  }

  await executeAdmin(
    `insert into invoice_intakes (
       company_id,
       race_event_id,
       submitted_by_user_id,
       intake_status,
       vendor_name,
       invoice_number,
       due_date,
       total_amount,
       category_hint,
       operator_note,
       submitted_at
     )
     values ($1, $2, $3, 'submitted', $4, $5, $6, $7, $8, $9, now())`,
    [companyId, raceEventId || null, session.id, vendorName, invoiceNumber, dueDate || null, totalAmount, categoryHint, fullNote || null]
  );

  // If reimbursement, create an expense submission linked to this invoice
  if (isReimbursement && paidByUserId) {
    const submitterId = paidByUserId;
    await executeAdmin(
      `insert into expense_submissions (
         company_id,
         race_event_id,
         submitted_by_user_id,
         submission_status,
         submission_title,
         operator_note,
         submitted_at
       )
       values ($1, $2, $3, 'submitted', $4, $5, now())`,
      [
        companyId,
        raceEventId || null,
        submitterId,
        `Reimbursement: ${vendorName} - $${totalAmount}`,
        `Auto-created from Invoice Hub. ${fullNote}`
      ]
    );
  }

  revalidateInvoicePaths();
  redirectToInvoiceHub(
    "success",
    isReimbursement
      ? "Invoice intake created and reimbursement flagged for the expense pipeline."
      : "Invoice intake created."
  );
}

export async function updateInvoiceIntakeStatusAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const intakeId = normalizeWhitespace(String(formData.get("intakeId") ?? ""));
  const nextStatus = normalizeWhitespace(String(formData.get("nextStatus") ?? ""));

  if (!intakeId || !["in_review", "rejected"].includes(nextStatus)) {
    redirectToInvoiceHub("error", "Invalid invoice intake status update.");
  }

  await executeAdmin(
    `update invoice_intakes
     set intake_status = $2::invoice_intake_status,
         reviewed_by_user_id = $3,
         reviewed_at = now(),
         updated_at = now()
     where id = $1`,
    [intakeId, nextStatus, session.id]
  );

  revalidateInvoicePaths();
  redirectToInvoiceHub(
    "success",
    nextStatus === "rejected" ? "Invoice intake rejected." : "Invoice intake moved into review."
  );
}

export async function approveAndPostInvoiceIntakeAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const intakeId = normalizeWhitespace(String(formData.get("intakeId") ?? ""));

  if (!intakeId) {
    redirectToInvoiceHub("error", "Missing invoice intake id.");
  }

  const intakeRows = await queryRowsAdmin<{
    id: string;
    company_id: string;
    race_event_id: string | null;
    vendor_name: string;
    invoice_number: string | null;
    due_date: string | null;
    total_amount: string;
    operator_note: string | null;
    canonical_invoice_id: string | null;
    source_document_id: string | null;
  }>(
    `select
       id,
       company_id,
       race_event_id,
       vendor_name,
       invoice_number,
       due_date::text,
       total_amount::text,
       operator_note,
       canonical_invoice_id,
       source_document_id
     from invoice_intakes
     where id = $1
     limit 1`,
    [intakeId]
  );

  const intake = intakeRows[0];

  if (!intake) {
    redirectToInvoiceHub("error", "Invoice intake was not found.");
  }

  if (intake.canonical_invoice_id) {
    redirectToInvoiceHub("info", "This invoice intake has already been posted.");
  }

  // Create or find the vendor counterparty
  const counterpartyRows = await queryRowsAdmin<{ id: string }>(
    `insert into sponsors_or_customers (
       company_id,
       name,
       normalized_name,
       counterparty_type,
       notes
     )
     values ($1, $2, lower($2), 'vendor', 'Created from invoice intake workflow')
     on conflict (company_id, normalized_name) do update
       set name = excluded.name,
           updated_at = now()
     returning id`,
    [intake.company_id, intake.vendor_name]
  );

  const sponsorOrCustomerId = counterpartyRows[0]?.id;

  // Determine if this is a reimbursement
  const isReimbursement = (intake.operator_note ?? "").includes("[REIMBURSEMENT]");

  // Post to canonical invoices
  const invoiceRows = await queryRowsAdmin<{ id: string }>(
    `insert into invoices (
       company_id,
       sponsor_or_customer_id,
       race_event_id,
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
     values ($1, $2, $3, $4, 'payable', $5, 'issued', current_date, $6, 'USD', $7, $7, $8)
     returning id`,
    [
      intake.company_id,
      sponsorOrCustomerId ?? null,
      intake.race_event_id,
      intake.source_document_id,
      intake.invoice_number,
      intake.due_date,
      intake.total_amount,
      intake.operator_note ?? "Posted from invoice intake workflow."
    ]
  );

  const canonicalInvoiceId = invoiceRows[0]?.id;

  if (!canonicalInvoiceId) {
    redirectToInvoiceHub("error", "Canonical payable invoice posting failed.");
  }

  // Update the intake record
  await executeAdmin(
    `update invoice_intakes
     set intake_status = 'posted',
         canonical_invoice_id = $2,
         reviewed_by_user_id = $3,
         reviewed_at = now(),
         posted_at = now(),
         updated_at = now()
     where id = $1`,
    [intakeId, canonicalInvoiceId, session.id]
  );

  // Cascade: canonical invoice was created from an approved intake
  await cascadeUpdate({
    trigger: "invoice:created",
    entityType: "invoice",
    entityId: canonicalInvoiceId as string,
    action: "post-from-intake",
    after: {
      intakeId,
      vendorName: intake.vendor_name,
      invoiceNumber: intake.invoice_number,
      totalAmount: intake.total_amount,
      dueDate: intake.due_date,
      raceEventId: intake.race_event_id,
      isReimbursement,
    },
    performedBy: session.id,
    agentId: "invoice-agent",
  });

  // Cascade: the intake itself moved to 'posted'
  await cascadeUpdate({
    trigger: "invoice-intake:posted",
    entityType: "invoice_intake",
    entityId: intakeId,
    action: "approve",
    after: { canonicalInvoiceId },
    performedBy: session.id,
    agentId: "invoice-agent",
  });

  // If reimbursement, also create an expense record linked to this invoice
  if (isReimbursement) {
    await executeAdmin(
      `insert into expenses (
         company_id,
         invoice_id,
         race_event_id,
         vendor_name,
         expense_status,
         expense_date,
         currency_code,
         amount,
         description,
         is_reimbursable
       )
       values ($1, $2, $3, $4, 'approved', current_date, 'USD', $5, $6, true)`,
      [
        intake.company_id,
        canonicalInvoiceId,
        intake.race_event_id,
        intake.vendor_name,
        intake.total_amount,
        `Reimbursable expense from Invoice Hub: ${intake.vendor_name}`
      ]
    );
  }

  revalidateInvoicePaths();
  redirectToInvoiceHub(
    "success",
    isReimbursement
      ? "Invoice approved, posted to payables, and reimbursement expense created."
      : "Invoice intake approved and posted into payable invoices."
  );
}
