"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function clean(val: unknown): string {
  return String(val ?? "").replace(/\s+/g, " ").trim();
}

export async function toggleChecklistItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const itemId = clean(formData.get("itemId"));
  const currentStatus = clean(formData.get("currentStatus"));
  if (!itemId) return;

  const newStatus = currentStatus === "done" ? "pending" : "done";
  const completedAt = newStatus === "done" ? "now()" : "null";

  await executeAdmin(
    `update project_checklist
     set status = $1::checklist_status,
         completed_at = ${completedAt},
         updated_at = now()
     where id = $2`,
    [newStatus, itemId]
  );

  revalidatePath("/project-checklist");
}

export async function updateStatusAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const itemId = clean(formData.get("itemId"));
  const newStatus = clean(formData.get("newStatus"));
  if (!itemId || !["done", "in_progress", "blocked", "pending"].includes(newStatus)) return;

  const completedAt = newStatus === "done" ? "now()" : "null";

  await executeAdmin(
    `update project_checklist
     set status = $1::checklist_status,
         completed_at = ${completedAt},
         updated_at = now()
     where id = $2`,
    [newStatus, itemId]
  );

  revalidatePath("/project-checklist");
}

export async function addChecklistItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const title = clean(formData.get("title"));
  const description = clean(formData.get("description"));
  const section = clean(formData.get("section")) || "General";
  const priority = clean(formData.get("priority")) || "medium";
  const route = clean(formData.get("route")) || null;
  const dependsOn = clean(formData.get("dependsOn")) || null;

  if (!title) {
    return redirect("/project-checklist?status=error&message=Title+is+required" as Route);
  }

  // Get max sort_order for this section
  const maxOrder = await queryRowsAdmin<{ max_order: string }>(
    `select coalesce(max(sort_order), 0)::text as max_order
     from project_checklist where section = $1`,
    [section]
  );

  await executeAdmin(
    `insert into project_checklist (title, description, section, priority, route, depends_on, sort_order)
     values ($1, $2, $3, $4::checklist_priority, $5, $6::uuid, $7)`,
    [title, description || null, section, priority, route, dependsOn, Number(maxOrder[0]?.max_order ?? 0) + 10]
  );

  revalidatePath("/project-checklist");
  redirect("/project-checklist?status=success&message=Item+added" as Route);
}

export async function deleteChecklistItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const itemId = clean(formData.get("itemId"));
  if (!itemId) return;

  // Clear any dependencies pointing to this item first
  await executeAdmin(
    `update project_checklist set depends_on = null where depends_on = $1`,
    [itemId]
  );

  await executeAdmin(
    `delete from project_checklist where id = $1`,
    [itemId]
  );

  revalidatePath("/project-checklist");
  redirect("/project-checklist?status=success&message=Item+deleted" as Route);
}

export async function updatePriorityAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const itemId = clean(formData.get("itemId"));
  const newPriority = clean(formData.get("newPriority"));
  if (!itemId || !["critical", "high", "medium", "low"].includes(newPriority)) return;

  await executeAdmin(
    `update project_checklist
     set priority = $1::checklist_priority, updated_at = now()
     where id = $2`,
    [newPriority, itemId]
  );

  revalidatePath("/project-checklist");
}
