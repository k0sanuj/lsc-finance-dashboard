"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";
import { normalizeCompanyCode } from "../lib/entities";

function norm(v: string) { return v.replace(/\s+/g, " ").trim(); }

function redir(view: string, status: string, message: string): never {
  redirect(`/xtz-expenses?view=${view}&status=${status}&message=${encodeURIComponent(message)}` as Route);
}

export async function submitExpenseAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin", "team_member"]);
  const session = await requireSession();

  const title = norm(String(formData.get("title") ?? ""));
  const billingEntityCode = normalizeCompanyCode(norm(String(formData.get("billingEntity") ?? "XTZ")), "XTZ");
  const reimbursingEntityCode = normalizeCompanyCode(norm(String(formData.get("reimbursingEntity") ?? "XTZ")), "XTZ");
  const taggedBrand = norm(String(formData.get("taggedBrand") ?? ""));
  const operatorNote = norm(String(formData.get("operatorNote") ?? ""));
  const merchantName = norm(String(formData.get("merchantName") ?? ""));
  const expenseDate = norm(String(formData.get("expenseDate") ?? ""));
  const amount = norm(String(formData.get("amount") ?? "0"));
  const currency = norm(String(formData.get("currency") ?? "INR"));
  const description = norm(String(formData.get("description") ?? ""));

  if (!title || !amount || Number(amount) <= 0) {
    redir("submit", "error", "Title and amount are required.");
  }

  // Resolve company IDs
  const [billingRows, reimbursingRows, xtzRows] = await Promise.all([
    queryRowsAdmin<{ id: string }>(`select id from companies where code = $1::company_code`, [billingEntityCode]),
    queryRowsAdmin<{ id: string }>(`select id from companies where code = $1::company_code`, [reimbursingEntityCode]),
    queryRowsAdmin<{ id: string }>(`select id from companies where code = 'XTZ'::company_code`)
  ]);

  const billingEntityId = billingRows[0]?.id;
  const reimbursingEntityId = reimbursingRows[0]?.id;
  const companyId = xtzRows[0]?.id;

  if (!companyId) redir("submit", "error", "XTZ company not found.");

  // Create submission
  const subRows = await queryRowsAdmin<{ id: string }>(
    `insert into expense_submissions (
       company_id, submitted_by_user_id, submission_status,
       submission_title, operator_note, submitted_at,
       billing_entity_id, reimbursing_entity_id, tagged_brand
     ) values ($1, $2, 'submitted', $3, $4, now(), $5, $6, $7)
     returning id`,
    [companyId, session.id, title, operatorNote || null, billingEntityId, reimbursingEntityId, taggedBrand || null]
  );

  const submissionId = subRows[0]?.id;
  if (!submissionId) redir("submit", "error", "Failed to create submission.");

  // Create the line item
  await executeAdmin(
    `insert into expense_submission_items (
       submission_id, merchant_name, expense_date, currency_code, amount, description
     ) values ($1, $2, $3::date, $4, $5::numeric, $6)`,
    [submissionId, merchantName || null, expenseDate || null, currency, amount, description || null]
  );

  await cascadeUpdate({
    trigger: "expense-submission:approved",
    entityType: "expense_submission",
    entityId: submissionId as string,
    action: "submit",
    after: { title, billingEntityCode, reimbursingEntityCode, amount, currency, merchantName },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  revalidatePath("/xtz-expenses");
  redir("submit", "success", `Expense "${title}" submitted for review.`);
}

export async function reviewExpenseAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const submissionId = norm(String(formData.get("submissionId") ?? ""));
  const newStatus = norm(String(formData.get("newStatus") ?? ""));
  const reviewNote = norm(String(formData.get("reviewNote") ?? ""));

  if (!submissionId || !newStatus) {
    redir("review", "error", "Submission and status required.");
  }

  await executeAdmin(
    `update expense_submissions
     set submission_status = $2::expense_submission_status,
         reviewed_by_user_id = $3,
         review_note = $4,
         reviewed_at = now(),
         updated_at = now()
     where id = $1`,
    [submissionId, newStatus, session.id, reviewNote || null]
  );

  const trigger =
    newStatus === "approved"
      ? "expense-submission:approved"
      : newStatus === "rejected"
        ? "expense-submission:rejected"
        : "expense-submission:posted";
  await cascadeUpdate({
    trigger,
    entityType: "expense_submission",
    entityId: submissionId,
    action: newStatus,
    after: { status: newStatus, reviewNote: reviewNote || undefined },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  revalidatePath("/xtz-expenses");
  redir("review", "success", `Expense ${newStatus.replace(/_/g, " ")}.`);
}
