"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { requireRole, requireSession } from "../../../lib/auth";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function redirectToInvoiceHub(status: "success" | "error" | "info", message: string) {
  redirect(
    `/tbr/invoice-hub?status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}`
  );
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
    [companyId, raceEventId || null, session.id, vendorName, invoiceNumber, dueDate || null, totalAmount, categoryHint, operatorNote]
  );

  revalidatePath("/payments");
  revalidatePath("/tbr");
  revalidatePath("/tbr/invoice-hub");
  redirectToInvoiceHub("success", "Invoice intake created.");
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

  revalidatePath("/tbr/invoice-hub");
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
       canonical_invoice_id
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

  const invoiceRows = await queryRowsAdmin<{ id: string }>(
    `insert into invoices (
       company_id,
       sponsor_or_customer_id,
       owner_id,
       race_event_id,
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
     values ($1, $2, null, $3, 'payable', $4, 'issued', current_date, $5, 'USD', $6, $6, $7)
     returning id`,
    [
      intake.company_id,
      sponsorOrCustomerId ?? null,
      intake.race_event_id,
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

  revalidatePath("/payments");
  revalidatePath("/tbr");
  revalidatePath("/tbr/invoice-hub");
  redirectToInvoiceHub("success", "Invoice intake approved and posted into payable invoices.");
}
