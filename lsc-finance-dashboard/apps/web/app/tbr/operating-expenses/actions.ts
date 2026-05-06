"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../../lib/auth";

const CATEGORY_LABELS: Record<string, string> = {
  stay_accommodation: "Stay & Accommodation",
  travel: "Travel",
  merchandise_cost: "Merchandise Cost",
  content_capture: "Content Capture",
  miscellaneous_expenses: "Miscellaneous / Other Expenses",
  food_beverages: "Food & Beverages",
  vip_passes: "VIP Passes",
  racesuits_helmets: "Racesuits & Helmets",
  team_insurance: "Team Insurance",
  pre_season_testing_fee: "Pre-Season Testing Fee",
  spare_parts: "Spare Parts Cost",
  pilot_training: "Pilot Training",
  pilot_stipend: "Pilot Stipend",
  mechanic_stipend: "Mechanic Stipend"
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: unknown) {
  const amount = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeCategoryKey(value: unknown) {
  const raw = normalizeWhitespace(String(value ?? ""));
  if (CATEGORY_LABELS[raw]) return raw;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function redirectToOperating(status: "success" | "error", message: string, seasonCode: string): never {
  redirect(
    `/tbr/operating-expenses?season=${encodeURIComponent(seasonCode)}&status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}`
  );
}

export async function addTbrOperatingExpenseLineAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const seasonCode = normalizeWhitespace(String(formData.get("seasonCode") ?? "S3")).toUpperCase();
  const categoryKey = normalizeCategoryKey(formData.get("categoryKey"));
  const categoryName = CATEGORY_LABELS[categoryKey] ?? normalizeWhitespace(String(formData.get("categoryName") ?? ""));
  const amount = parseAmount(formData.get("amount"));
  const notes = normalizeWhitespace(String(formData.get("notes") ?? "")) || null;

  if (!seasonCode || !categoryKey || !categoryName) {
    redirectToOperating("error", "Season and category are required.", seasonCode || "S3");
  }

  if (amount <= 0) {
    redirectToOperating("error", "Enter a positive USD amount.", seasonCode);
  }

  const rows = await queryRowsAdmin<{ company_id: string; season_id: string }>(
    `select c.id as company_id, ts.id as season_id
     from companies c
     join tbr_seasons ts on ts.company_id = c.id
     where c.code = 'TBR'::company_code
       and ts.season_code = $1
     limit 1`,
    [seasonCode]
  );
  const context = rows[0];

  if (!context) {
    redirectToOperating("error", "TBR season was not found. Run the TBR finance normalizer first.", seasonCode);
  }

  const sourceIdentifier = `manual:tbr-operating:${seasonCode}:${Date.now()}`;
  const sourceDocRows = await queryRowsAdmin<{ id: string }>(
    `insert into source_documents (
       company_id,
       document_type,
       source_system,
       source_identifier,
       source_name,
       metadata
     )
     values ($1, 'manual_upload'::source_document_type, 'manual_entry', $2, $3, $4::jsonb)
     returning id`,
    [
      context.company_id,
      sourceIdentifier,
      `Manual TBR operating expense :: ${seasonCode}`,
      JSON.stringify({ workflow: "tbr_operating_expenses", seasonCode, categoryKey, notes })
    ]
  );
  const sourceDocumentId = sourceDocRows[0]?.id ?? null;

  const inserted = await queryRowsAdmin<{ id: string }>(
    `insert into tbr_operating_expense_lines (
       company_id,
       season_id,
       source_document_id,
       source_import_key,
       source_row_key,
       source_workbook_name,
       source_sheet_name,
       source_row_number,
       line_kind,
       season_code,
       category_key,
       category_name,
       display_order,
       source_amount,
       source_currency,
       fx_rate,
       fx_source,
       reporting_amount_usd,
       is_spare_parts,
       include_in_operating_baseline,
       notes,
       metadata
     )
     values (
       $1, $2, $3, $4, $4, 'manual_entry', 'manual_entry', 1,
       'season_category_summary', $5, $6, $7, 900, $8, 'USD', 1,
       'manual_usd', $8, $9, true, $10, $11::jsonb
     )
     returning id`,
    [
      context.company_id,
      context.season_id,
      sourceDocumentId,
      sourceIdentifier,
      seasonCode,
      categoryKey,
      categoryName,
      amount,
      categoryKey === "spare_parts",
      notes,
      JSON.stringify({ enteredBy: session.id, categoryKey, seasonCode })
    ]
  );
  const insertedId = inserted[0]?.id ?? sourceIdentifier;

  await cascadeUpdate({
    trigger: "tbr-finance:operating-line-saved",
    entityType: "tbr_operating_expense_line",
    entityId: insertedId,
    action: "create",
    after: { seasonCode, categoryKey, categoryName, amount, notes },
    performedBy: session.id,
    agentId: "finance-agent"
  });

  revalidatePath("/tbr/operating-expenses");
  revalidatePath("/tbr/overall-pnl");
  redirectToOperating("success", "Operating expense line saved.", seasonCode);
}
