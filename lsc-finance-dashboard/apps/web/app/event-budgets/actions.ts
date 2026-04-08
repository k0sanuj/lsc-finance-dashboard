"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function clean(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function redir(eventId: string, status: string, msg: string): never {
  redirect(`/event-budgets?eventId=${eventId}&status=${status}&message=${encodeURIComponent(msg)}` as Route);
}

async function getSportIdByCode(sportCode: string): Promise<string> {
  const rows = await queryRowsAdmin<{ id: string }>(
    `select fs.id from fsp_sports fs join companies c on c.id = fs.company_id
     where c.code = 'FSP'::company_code and fs.sport_code = $1::fsp_sport_code`,
    [sportCode]
  );
  return rows[0]?.id ?? "";
}

// ─── Create Event ─────────────────────────────────────────

export async function createEventAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const sportCode = clean(formData.get("sportCode"));
  const eventName = clean(formData.get("eventName"));
  const city = clean(formData.get("city"));
  const venueName = clean(formData.get("venueName"));
  const eventDate = clean(formData.get("eventDate"));
  const totalBudget = clean(formData.get("totalBudget")) || "0";

  if (!sportCode || !eventName || !city) {
    redirect("/event-budgets?status=error&message=Sport%2C+event+name%2C+and+city+are+required" as Route);
  }

  const sportId = await getSportIdByCode(sportCode);
  if (!sportId) {
    redirect("/event-budgets?status=error&message=Sport+not+found" as Route);
  }

  const rows = await queryRowsAdmin<{ id: string }>(
    `insert into fsp_events (sport_id, event_name, city, venue_name, event_date, total_budget)
     values ($1, $2, $3, $4, $5::date, $6::numeric)
     returning id`,
    [sportId, eventName, city, venueName || null, eventDate || null, totalBudget]
  );

  const eventId = rows[0]?.id ?? "";
  revalidatePath("/event-budgets");
  redir(eventId, "success", `Event "${eventName}" created.`);
}

// ─── Add Budget Item ──────────────────────────────────────

export async function addBudgetItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const eventId = clean(formData.get("eventId"));
  const category = clean(formData.get("category"));
  const subCategory = clean(formData.get("subCategory"));
  const description = clean(formData.get("description"));
  const vendorName = clean(formData.get("vendorName"));
  const budgetAmount = clean(formData.get("budgetAmount")) || "0";

  if (!eventId || !category || !subCategory) {
    redir(eventId, "error", "Category and item name are required.");
  }

  const maxOrder = await queryRowsAdmin<{ mx: string }>(
    `select coalesce(max(display_order), 0)::text as mx
     from fsp_event_budget_items where event_id = $1`,
    [eventId]
  );

  await executeAdmin(
    `insert into fsp_event_budget_items (event_id, category, sub_category, description, vendor_name, budget_amount, display_order)
     values ($1, $2, $3, $4, $5, $6::numeric, $7)`,
    [eventId, category, subCategory, description || null, vendorName || null, budgetAmount, Number(maxOrder[0]?.mx ?? 0) + 10]
  );

  revalidatePath("/event-budgets");
  redir(eventId, "success", `Budget item "${subCategory}" added.`);
}

// ─── Add Checklist Item ───────────────────────────────────

export async function addChecklistItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const eventId = clean(formData.get("eventId"));
  const category = clean(formData.get("category"));
  const requirement = clean(formData.get("requirement"));
  const whatToCheck = clean(formData.get("whatToCheck"));
  const verificationProof = clean(formData.get("verificationProof"));
  const owner = clean(formData.get("owner"));
  const dueDate = clean(formData.get("dueDate"));

  if (!eventId || !category || !requirement) {
    redir(eventId, "error", "Category and requirement are required.");
  }

  const maxOrder = await queryRowsAdmin<{ mx: string }>(
    `select coalesce(max(display_order), 0)::text as mx
     from fsp_event_checklist where event_id = $1`,
    [eventId]
  );

  await executeAdmin(
    `insert into fsp_event_checklist (event_id, category, requirement, what_to_check, verification_proof_required, owner, due_date, display_order)
     values ($1, $2, $3, $4, $5, $6, $7::date, $8)`,
    [eventId, category, requirement, whatToCheck || null, verificationProof || null, owner || null, dueDate || null, Number(maxOrder[0]?.mx ?? 0) + 10]
  );

  revalidatePath("/event-budgets");
  redir(eventId, "success", `Checklist item "${requirement}" added.`);
}

// ─── Update Checklist Status ──────────────────────────────

export async function updateChecklistStatusAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const eventId = clean(formData.get("eventId"));
  const itemId = clean(formData.get("itemId"));
  const currentStatus = clean(formData.get("currentStatus"));
  if (!itemId) return;

  const cycle: Record<string, string> = {
    pending: "in_progress",
    in_progress: "completed",
    completed: "pending"
  };
  const newStatus = cycle[currentStatus] ?? "pending";
  const completedAt = newStatus === "completed" ? "now()" : "null";

  await executeAdmin(
    `update fsp_event_checklist
     set status = $1, completed_at = ${completedAt}
     where id = $2`,
    [newStatus, itemId]
  );

  revalidatePath("/event-budgets");
  redir(eventId, "success", `Checklist item status updated to ${newStatus}.`);
}
