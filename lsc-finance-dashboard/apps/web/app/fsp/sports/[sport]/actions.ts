"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { requireRole } from "../../../../lib/auth";

function clean(v: unknown): string { return String(v ?? "").replace(/\s+/g, " ").trim(); }

function redir(sport: string, tab: string, status: string, msg: string): never {
  redirect(`/fsp/sports/${sport}?tab=${tab}&status=${status}&message=${encodeURIComponent(msg)}` as Route);
}

async function getSportId(sportCode: string): Promise<string> {
  const rows = await queryRowsAdmin<{ id: string }>(
    `select fs.id from fsp_sports fs join companies c on c.id = fs.company_id
     where c.code = 'FSP'::company_code and fs.sport_code = $1::fsp_sport_code`, [sportCode]
  );
  return rows[0]?.id ?? "";
}

// ─── P&L Line Items ────────────────────────────────────────

export async function addPnlLineItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const section = clean(formData.get("section"));
  const category = clean(formData.get("category"));
  const y1 = clean(formData.get("y1Budget")) || "0";
  const y2 = clean(formData.get("y2Budget")) || "0";
  const y3 = clean(formData.get("y3Budget")) || "0";
  const scenario = clean(formData.get("scenario")) || "base";

  if (!category) redir(sport, "summary", "error", "Category name is required.");

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "summary", "error", "Sport not found.");

  const maxOrder = await queryRowsAdmin<{ mx: string }>(
    `select coalesce(max(display_order), 0)::text as mx from fsp_pnl_line_items where sport_id = $1 and section = $2::pnl_section`,
    [sportId, section]
  );

  await executeAdmin(
    `insert into fsp_pnl_line_items (sport_id, section, category, year_1_budget, year_2_budget, year_3_budget, scenario, display_order)
     values ($1, $2::pnl_section, $3, $4::numeric, $5::numeric, $6::numeric, $7::fsp_scenario, $8)`,
    [sportId, section, category, y1, y2, y3, scenario, Number(maxOrder[0]?.mx ?? 0) + 10]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "summary", "success", `Added "${category}" to ${section}.`);
}

export async function updatePnlLineItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const itemId = clean(formData.get("itemId"));
  const y1 = clean(formData.get("y1Budget"));
  const y2 = clean(formData.get("y2Budget"));
  const y3 = clean(formData.get("y3Budget"));

  if (!itemId) redir(sport, "summary", "error", "Item ID required.");

  await executeAdmin(
    `update fsp_pnl_line_items
     set year_1_budget = $2::numeric, year_2_budget = $3::numeric, year_3_budget = $4::numeric, updated_at = now()
     where id = $1`,
    [itemId, y1 || "0", y2 || "0", y3 || "0"]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "summary", "success", "Line item updated.");
}

export async function deletePnlLineItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const itemId = clean(formData.get("itemId"));

  await executeAdmin(`delete from fsp_pnl_line_items where id = $1`, [itemId]);

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "summary", "success", "Line item removed.");
}

// ─── Sponsorships ──────────────────────────────────────────

export async function addSponsorshipAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const segment = clean(formData.get("segment"));
  const sponsorName = clean(formData.get("sponsorName"));
  const tier = clean(formData.get("tier")) || "official";
  const contractStatus = clean(formData.get("contractStatus")) || "pipeline";
  const y1 = clean(formData.get("y1Value")) || "0";
  const y2 = clean(formData.get("y2Value")) || "0";
  const y3 = clean(formData.get("y3Value")) || "0";
  const contractStart = clean(formData.get("contractStart"));
  const contractEnd = clean(formData.get("contractEnd"));
  const paymentSchedule = clean(formData.get("paymentSchedule"));
  const deliverables = clean(formData.get("deliverables"));

  if (!segment) redir(sport, "sponsorship", "error", "Segment is required.");

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "sponsorship", "error", "Sport not found.");

  await executeAdmin(
    `insert into fsp_sponsorships (sport_id, segment, sponsor_name, tier, contract_status,
       year_1_value, year_2_value, year_3_value, contract_start, contract_end, payment_schedule, deliverables_summary)
     values ($1, $2, $3, $4::sponsorship_tier, $5::sponsorship_contract_status,
       $6::numeric, $7::numeric, $8::numeric, $9::date, $10::date, $11, $12)`,
    [sportId, segment, sponsorName || null, tier, contractStatus, y1, y2, y3,
     contractStart || null, contractEnd || null, paymentSchedule || null, deliverables || null]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "sponsorship", "success", `Sponsorship "${segment}" added.`);
}

export async function updateSponsorshipStatusAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const sponsorshipId = clean(formData.get("sponsorshipId"));
  const newStatus = clean(formData.get("newStatus"));

  await executeAdmin(
    `update fsp_sponsorships set contract_status = $2::sponsorship_contract_status, updated_at = now() where id = $1`,
    [sponsorshipId, newStatus]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "sponsorship", "success", "Sponsorship status updated.");
}

// ─── League Payroll ────────────────────────────────────────

export async function addLeagueRoleAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const roleTitle = clean(formData.get("roleTitle"));
  const department = clean(formData.get("department"));
  const employmentType = clean(formData.get("employmentType")) || "full_time";
  const y1 = clean(formData.get("y1Salary")) || "0";
  const y2 = clean(formData.get("y2Salary")) || "0";
  const y3 = clean(formData.get("y3Salary")) || "0";
  const raise = clean(formData.get("annualRaise")) || "5";

  if (!roleTitle) redir(sport, "league-payroll", "error", "Role title required.");

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "league-payroll", "error", "Sport not found.");

  await executeAdmin(
    `insert into fsp_league_payroll (sport_id, role_title, department, employment_type, year_1_salary, year_2_salary, year_3_salary, annual_raise_pct)
     values ($1, $2, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8::numeric)`,
    [sportId, roleTitle, department || null, employmentType, y1, y2, y3, raise]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "league-payroll", "success", `Role "${roleTitle}" added.`);
}

// ─── Tech Payroll ──────────────────────────────────────────

export async function addTechRoleAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const roleTitle = clean(formData.get("roleTitle"));
  const y1 = clean(formData.get("y1Salary")) || "0";
  const y2 = clean(formData.get("y2Salary")) || "0";
  const y3 = clean(formData.get("y3Salary")) || "0";
  const alloc = clean(formData.get("allocationPct")) || "100";
  const raise = clean(formData.get("annualRaise")) || "10";

  if (!roleTitle) redir(sport, "tech", "error", "Role title required.");

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "tech", "error", "Sport not found.");

  await executeAdmin(
    `insert into fsp_tech_payroll (sport_id, role_title, year_1_salary, year_2_salary, year_3_salary, allocation_pct, annual_raise_pct)
     values ($1, $2, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7::numeric)`,
    [sportId, roleTitle, y1, y2, y3, alloc, raise]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "tech", "success", `Role "${roleTitle}" added.`);
}

// ─── Revenue Share ─────────────────────────────────────────

export async function updateRevenueShareAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const yearNumber = clean(formData.get("yearNumber"));
  const teamCount = clean(formData.get("teamCount")) || "6";
  const licenseFee = clean(formData.get("licenseFee")) || "0";
  const teamsPct = clean(formData.get("teamsPct")) || "40";
  const gbName = clean(formData.get("gbName"));
  const gbPct = clean(formData.get("gbPct")) || "5";

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "revenue-share", "error", "Sport not found.");

  await executeAdmin(
    `insert into fsp_revenue_share (sport_id, year_number, team_count, team_licensing_fee, teams_share_pct, governing_body_name, governing_body_share_pct)
     values ($1, $2::integer, $3::integer, $4::numeric, $5::numeric, $6, $7::numeric)
     on conflict (sport_id, year_number) do update
     set team_count = $3::integer, team_licensing_fee = $4::numeric, teams_share_pct = $5::numeric,
         governing_body_name = $6, governing_body_share_pct = $7::numeric, updated_at = now()`,
    [sportId, yearNumber, teamCount, licenseFee, teamsPct, gbName || null, gbPct]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "revenue-share", "success", `Year ${yearNumber} revenue share updated.`);
}

// ─── Event Config ──────────────────────────────────────────

export async function updateEventConfigAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const segments = clean(formData.get("segments")) || "4";
  const evY1 = clean(formData.get("eventsY1")) || "1";
  const evY2 = clean(formData.get("eventsY2")) || "2";
  const evY3 = clean(formData.get("eventsY3")) || "4";
  const venueCost = clean(formData.get("venueCost")) || "0";

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "config", "error", "Sport not found.");

  await executeAdmin(
    `insert into fsp_event_config (sport_id, segments_per_event, events_per_year_1, events_per_year_2, events_per_year_3, venue_cost_per_event)
     values ($1, $2::integer, $3::integer, $4::integer, $5::integer, $6::numeric)
     on conflict (sport_id) do update
     set segments_per_event = $2::integer, events_per_year_1 = $3::integer, events_per_year_2 = $4::integer,
         events_per_year_3 = $5::integer, venue_cost_per_event = $6::numeric, updated_at = now()`,
    [sportId, segments, evY1, evY2, evY3, venueCost]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "config", "success", "Event configuration updated.");
}

// ─── OPEX Items ────────────────────────────────────────────

export async function addOpexItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const opexCategory = clean(formData.get("opexCategory"));
  const subCategory = clean(formData.get("subCategory"));
  const y1 = clean(formData.get("y1Budget")) || "0";
  const y2 = clean(formData.get("y2Budget")) || "0";
  const y3 = clean(formData.get("y3Budget")) || "0";

  if (!opexCategory || !subCategory) redir(sport, "opex", "error", "Category and sub-category required.");

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "opex", "error", "Sport not found.");

  await executeAdmin(
    `insert into fsp_opex_items (sport_id, opex_category, sub_category, year_1_budget, year_2_budget, year_3_budget)
     values ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric)`,
    [sportId, opexCategory, subCategory, y1, y2, y3]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "opex", "success", `Added "${subCategory}" under ${opexCategory}.`);
}

// ─── Event Production Items ────────────────────────────────

export async function addProductionItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const sport = clean(formData.get("sport"));
  const costCategory = clean(formData.get("costCategory"));
  const subCategory = clean(formData.get("subCategory"));
  const unitCost = clean(formData.get("unitCost")) || "0";
  const quantity = clean(formData.get("quantity")) || "1";

  if (!costCategory || !subCategory) redir(sport, "production", "error", "Category and item name required.");

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "production", "error", "Sport not found.");

  const lineTotal = Number(unitCost) * Number(quantity);

  await executeAdmin(
    `insert into fsp_event_production (sport_id, cost_category, sub_category, unit_cost, quantity, line_total)
     values ($1, $2, $3, $4::numeric, $5::integer, $6::numeric)`,
    [sportId, costCategory, subCategory, unitCost, quantity, lineTotal]
  );

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "production", "success", `Added "${subCategory}" to ${costCategory}.`);
}
