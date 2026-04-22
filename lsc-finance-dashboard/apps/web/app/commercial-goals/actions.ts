"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

type DeliverableItemDraft = {
  itemLabel: string;
  itemDescription: string;
  responsibleOwnerId: string;
  dueDate: string;
  revenueAmount: string;
};

export async function createDeliverableChecklistAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin", "commercial_user"]);
  const session = await requireSession();

  const contractId = normalizeWhitespace(String(formData.get("contractId") ?? ""));
  const sponsorId = normalizeWhitespace(String(formData.get("sponsorId") ?? ""));
  const checklistTitle = normalizeWhitespace(String(formData.get("checklistTitle") ?? ""));
  const totalRevenueValue = parseAmount(String(formData.get("totalRevenueValue") ?? "0"));
  const currencyCode = normalizeWhitespace(String(formData.get("currencyCode") ?? "USD")) || "USD";
  const returnPath = normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/commercial-goals/TBR?view=deliverables";

  let items: DeliverableItemDraft[] = [];
  try {
    items = JSON.parse(String(formData.get("itemsJson") ?? "[]"));
  } catch {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Invalid items data.")}` as Route);
  }

  if (!contractId || !checklistTitle || items.length === 0) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Contract, title, and at least one item are required.")}` as Route);
  }

  // Look up company from contract
  const contractRows = await queryRowsAdmin<{ company_id: string }>(
    `select company_id from contracts where id = $1 limit 1`,
    [contractId]
  );
  const companyId = contractRows[0]?.company_id;
  if (!companyId) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Contract not found.")}` as Route);
  }

  // Insert checklist
  const checklistRows = await queryRowsAdmin<{ id: string }>(
    `insert into deliverable_checklists (
       contract_id, sponsor_or_customer_id, company_id,
       checklist_title, total_revenue_value, currency_code,
       created_by_user_id
     )
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [contractId, sponsorId, companyId, checklistTitle, totalRevenueValue, currencyCode, session.id]
  );

  const checklistId = checklistRows[0]?.id;
  if (!checklistId) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Checklist could not be created.")}` as Route);
  }

  // Insert items
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = normalizeWhitespace(item.itemLabel);
    if (!label) continue;

    await executeAdmin(
      `insert into deliverable_items (
         checklist_id, item_label, item_description,
         responsible_owner_id, due_date, revenue_amount, sort_order
       )
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        checklistId,
        label,
        normalizeWhitespace(item.itemDescription) || null,
        item.responsibleOwnerId || null,
        item.dueDate || null,
        parseAmount(item.revenueAmount),
        i
      ]
    );
  }

  await cascadeUpdate({
    trigger: "commercial-target:changed",
    entityType: "deliverable_checklist",
    entityId: checklistId,
    action: "create-with-items",
    after: { contractId, sponsorId, checklistTitle, totalRevenueValue, currencyCode, itemCount: items.length },
    performedBy: session.id,
    agentId: "commercial-agent",
  });

  revalidatePath("/commercial-goals");
  revalidatePath("/receivables");
  redirect(`${returnPath}&status=success&message=${encodeURIComponent(`Checklist "${checklistTitle}" created with ${items.length} deliverables.`)}` as Route);
}

export async function updateDeliverableItemStatusAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin", "commercial_user"]);
  const session = await requireSession();

  const itemId = normalizeWhitespace(String(formData.get("itemId") ?? ""));
  const newStatus = normalizeWhitespace(String(formData.get("newStatus") ?? ""));
  const notes = normalizeWhitespace(String(formData.get("notes") ?? "")) || null;
  const returnPath = normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/commercial-goals/TBR?view=deliverables";

  const validStatuses = ["pending", "in_progress", "completed", "waived"];
  if (!itemId || !validStatuses.includes(newStatus)) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Invalid item or status.")}` as Route);
  }

  if (newStatus === "completed") {
    await executeAdmin(
      `update deliverable_items
       set completion_status = $1::deliverable_completion_status,
           completed_at = now(),
           completed_by_user_id = $2,
           notes = coalesce($3, notes),
           updated_at = now()
       where id = $4`,
      [newStatus, session.id, notes, itemId]
    );
  } else {
    await executeAdmin(
      `update deliverable_items
       set completion_status = $1::deliverable_completion_status,
           completed_at = null,
           completed_by_user_id = null,
           notes = coalesce($2, notes),
           updated_at = now()
       where id = $3`,
      [newStatus, notes, itemId]
    );
  }

  await cascadeUpdate({
    trigger: "commercial-target:changed",
    entityType: "deliverable_item",
    entityId: itemId,
    action: "status-change",
    after: { status: newStatus, notes },
    performedBy: session.id,
    agentId: "commercial-agent",
  });

  revalidatePath("/commercial-goals");
  revalidatePath("/receivables");
  redirect(`${returnPath}&status=success&message=${encodeURIComponent(`Item updated to "${newStatus}".`)}` as Route);
}

export async function addDeliverableItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin", "commercial_user"]);
  const session = await requireSession();

  const checklistId = normalizeWhitespace(String(formData.get("checklistId") ?? ""));
  const itemLabel = normalizeWhitespace(String(formData.get("itemLabel") ?? ""));
  const revenueAmount = parseAmount(String(formData.get("revenueAmount") ?? "0"));
  const responsibleOwnerId = normalizeWhitespace(String(formData.get("responsibleOwnerId") ?? "")) || null;
  const dueDate = normalizeWhitespace(String(formData.get("dueDate") ?? "")) || null;
  const returnPath = normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/commercial-goals/TBR?view=deliverables";

  if (!checklistId || !itemLabel) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Checklist ID and item label are required.")}` as Route);
  }

  // Get max sort order
  const maxRows = await queryRowsAdmin<{ max_sort: string }>(
    `select coalesce(max(sort_order), 0)::text as max_sort from deliverable_items where checklist_id = $1`,
    [checklistId]
  );
  const nextSort = Number(maxRows[0]?.max_sort ?? 0) + 1;

  await executeAdmin(
    `insert into deliverable_items (
       checklist_id, item_label, responsible_owner_id,
       due_date, revenue_amount, sort_order
     )
     values ($1, $2, $3, $4, $5, $6)`,
    [checklistId, itemLabel, responsibleOwnerId, dueDate, revenueAmount, nextSort]
  );

  await cascadeUpdate({
    trigger: "commercial-target:changed",
    entityType: "deliverable_item",
    entityId: checklistId,
    action: "add-item",
    after: { itemLabel, revenueAmount, responsibleOwnerId, dueDate },
    performedBy: session.id,
    agentId: "commercial-agent",
  });

  revalidatePath("/commercial-goals");
  redirect(`${returnPath}&status=success&message=${encodeURIComponent(`Item "${itemLabel}" added.`)}` as Route);
}
