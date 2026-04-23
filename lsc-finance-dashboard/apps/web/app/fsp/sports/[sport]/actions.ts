"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../../../lib/auth";

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
  const session = await requireSession();
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

  await cascadeUpdate({
    trigger: "sport-pnl:created",
    entityType: "fsp_pnl_line_item",
    entityId: sportId,
    action: "create",
    after: { sport, section, category, y1, y2, y3, scenario },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "summary", "success", `Added "${category}" to ${section}.`);
}

export async function updatePnlLineItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
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

  await cascadeUpdate({
    trigger: "sport-pnl:updated",
    entityType: "fsp_pnl_line_item",
    entityId: itemId,
    action: "update",
    after: { sport, y1, y2, y3 },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "summary", "success", "Line item updated.");
}

export async function deletePnlLineItemAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const itemId = clean(formData.get("itemId"));

  await executeAdmin(`delete from fsp_pnl_line_items where id = $1`, [itemId]);

  await cascadeUpdate({
    trigger: "sport-pnl:deleted",
    entityType: "fsp_pnl_line_item",
    entityId: itemId,
    action: "delete",
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "summary", "success", "Line item removed.");
}

// ─── Sponsorships ──────────────────────────────────────────

export async function addSponsorshipAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
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

  await cascadeUpdate({
    trigger: "sport-sponsorship:created",
    entityType: "fsp_sponsorship",
    entityId: sportId,
    action: "create",
    after: { sport, segment, sponsorName, tier, contractStatus, y1, y2, y3 },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "sponsorship", "success", `Sponsorship "${segment}" added.`);
}

export async function updateSponsorshipStatusAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const sponsorshipId = clean(formData.get("sponsorshipId"));
  const newStatus = clean(formData.get("newStatus"));

  await executeAdmin(
    `update fsp_sponsorships set contract_status = $2::sponsorship_contract_status, updated_at = now() where id = $1`,
    [sponsorshipId, newStatus]
  );

  await cascadeUpdate({
    trigger: "sport-sponsorship:status:changed",
    entityType: "fsp_sponsorship",
    entityId: sponsorshipId,
    action: "status-change",
    after: { status: newStatus },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "sponsorship", "success", "Sponsorship status updated.");
}

export async function updateSponsorshipAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const sponsorshipId = clean(formData.get("sponsorshipId"));
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

  if (!sponsorshipId) redir(sport, "sponsorship", "error", "Sponsorship id required.");
  if (!segment) redir(sport, "sponsorship", "error", "Segment is required.");

  await executeAdmin(
    `update fsp_sponsorships
     set segment = $2, sponsor_name = $3, tier = $4::sponsorship_tier,
         contract_status = $5::sponsorship_contract_status,
         year_1_value = $6::numeric, year_2_value = $7::numeric, year_3_value = $8::numeric,
         contract_start = $9::date, contract_end = $10::date,
         payment_schedule = $11, deliverables_summary = $12,
         updated_at = now()
     where id = $1`,
    [
      sponsorshipId,
      segment,
      sponsorName || null,
      tier,
      contractStatus,
      y1,
      y2,
      y3,
      contractStart || null,
      contractEnd || null,
      paymentSchedule || null,
      deliverables || null,
    ]
  );

  await cascadeUpdate({
    trigger: "sport-sponsorship:status:changed",
    entityType: "fsp_sponsorship",
    entityId: sponsorshipId,
    action: "update",
    after: { segment, sponsorName, tier, contractStatus, y1, y2, y3 },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "sponsorship", "success", `Sponsorship "${segment}" updated.`);
}

export async function archiveSponsorshipAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const sponsorshipId = clean(formData.get("sponsorshipId"));

  if (!sponsorshipId) redir(sport, "sponsorship", "error", "Sponsorship id required.");

  await executeAdmin(
    `update fsp_sponsorships
     set contract_status = 'archived'::sponsorship_contract_status, updated_at = now()
     where id = $1`,
    [sponsorshipId]
  );

  await cascadeUpdate({
    trigger: "sport-sponsorship:status:changed",
    entityType: "fsp_sponsorship",
    entityId: sponsorshipId,
    action: "archive",
    after: { status: "archived" },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "sponsorship", "success", "Sponsorship archived.");
}

export async function uploadSponsorshipContractAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const sponsorshipId = clean(formData.get("sponsorshipId"));
  const file = formData.get("contract");

  if (!sponsorshipId) redir(sport, "sponsorship", "error", "Sponsorship id required.");
  if (!(file instanceof File) || file.size === 0) {
    redir(sport, "sponsorship", "error", "Select a contract file to upload.");
  }

  // Find sponsorship + sport's company_id
  const contextRows = await queryRowsAdmin<{ company_id: string; segment: string }>(
    `select fs.company_id, sp.segment
     from fsp_sponsorships sp
     join fsp_sports fs on fs.id = sp.sport_id
     where sp.id = $1`,
    [sponsorshipId]
  );
  const ctx = contextRows[0];
  if (!ctx) redir(sport, "sponsorship", "error", "Sponsorship not found.");

  // Insert a source_documents row referencing the upload.
  // NOTE: source_documents holds metadata only — the actual S3 upload is handled by
  // a separate flow (storeUploadedDocument). For sponsorship contracts, we record
  // the filename + mime type for now; uploading to storage is a follow-up.
  const castFile = file as File;
  const docRows = await queryRowsAdmin<{ id: string }>(
    `insert into source_documents (
       company_id, document_type, source_system, source_identifier,
       source_name, metadata
     )
     values ($1, 'sponsorship_contract', 'upload', $2, $3, $4::jsonb)
     returning id`,
    [
      ctx.company_id,
      `sponsorship:${sponsorshipId}:${Date.now()}`,
      castFile.name,
      JSON.stringify({
        mimeType: castFile.type || "application/octet-stream",
        sizeBytes: castFile.size,
        uploadedBy: session.id,
        linkedSponsorshipId: sponsorshipId,
      }),
    ]
  );

  const documentId = docRows[0]?.id;
  if (!documentId) {
    redir(sport, "sponsorship", "error", "Document record creation failed.");
  }

  await executeAdmin(
    `update fsp_sponsorships set document_id = $2, updated_at = now() where id = $1`,
    [sponsorshipId, documentId]
  );

  await cascadeUpdate({
    trigger: "document:analyzed",
    entityType: "fsp_sponsorship",
    entityId: sponsorshipId,
    action: "upload-contract",
    after: { documentId, fileName: castFile.name, sizeBytes: castFile.size },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "sponsorship", "success", `Contract linked to "${ctx.segment}".`);
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

// ─── Media Revenue (CPM model) ─────────────────────────────

export async function upsertMediaRevenueAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const channel = clean(formData.get("channel")); // "non_linear" | "linear"
  const impressionsY1 = clean(formData.get("impressionsY1")) || "0";
  const impressionsY2 = clean(formData.get("impressionsY2")) || "0";
  const impressionsY3 = clean(formData.get("impressionsY3")) || "0";
  const cpmY1 = clean(formData.get("cpmY1")) || "0";
  const cpmY2 = clean(formData.get("cpmY2")) || "0";
  const cpmY3 = clean(formData.get("cpmY3")) || "0";
  const avgViewership = clean(formData.get("avgViewership")) || "0";
  const notes = clean(formData.get("notes"));

  if (!["non_linear", "linear"].includes(channel)) {
    redir(sport, "media", "error", "Invalid channel.");
  }

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "media", "error", "Sport not found.");

  await executeAdmin(
    `insert into fsp_media_revenue_cpm
       (sport_id, channel, impressions_y1, impressions_y2, impressions_y3,
        cpm_y1, cpm_y2, cpm_y3, avg_viewership, notes)
     values ($1, $2, $3::numeric, $4::numeric, $5::numeric,
             $6::numeric, $7::numeric, $8::numeric, $9::numeric, $10)
     on conflict (sport_id, channel) do update
     set impressions_y1 = excluded.impressions_y1,
         impressions_y2 = excluded.impressions_y2,
         impressions_y3 = excluded.impressions_y3,
         cpm_y1 = excluded.cpm_y1,
         cpm_y2 = excluded.cpm_y2,
         cpm_y3 = excluded.cpm_y3,
         avg_viewership = excluded.avg_viewership,
         notes = excluded.notes,
         updated_at = now()`,
    [
      sportId, channel, impressionsY1, impressionsY2, impressionsY3,
      cpmY1, cpmY2, cpmY3, avgViewership, notes || null,
    ]
  );

  await cascadeUpdate({
    trigger: "sport-pnl:updated",
    entityType: "fsp_media_revenue_cpm",
    entityId: sportId,
    action: "upsert",
    after: { sport, channel, impressionsY1, impressionsY2, impressionsY3, cpmY1, cpmY2, cpmY3 },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "media", "success", `${channel === "non_linear" ? "Non-linear" : "Linear"} media config saved.`);
}

// ─── Influencer Economics ──────────────────────────────────

export async function addInfluencerAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const creatorTier = clean(formData.get("creatorTier")); // nano/micro/mid/macro/mega
  const creatorsCount = clean(formData.get("creatorsCount")) || "0";
  const avgFollowers = clean(formData.get("avgFollowers")) || "0";
  const postsPerYear = clean(formData.get("postsPerYear")) || "0";
  const costPerPostUsd = clean(formData.get("costPerPostUsd")) || "0";
  const engagementRatePct = clean(formData.get("engagementRatePct")) || "0";
  const brandDealSplitPct = clean(formData.get("brandDealSplitPct")) || "50";
  const notes = clean(formData.get("notes"));

  if (!["nano", "micro", "mid", "macro", "mega"].includes(creatorTier)) {
    redir(sport, "media", "error", "Invalid creator tier.");
  }

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "media", "error", "Sport not found.");

  await executeAdmin(
    `insert into fsp_influencer_economics
       (sport_id, creator_tier, creators_count, avg_followers, posts_per_year,
        cost_per_post_usd, engagement_rate_pct, brand_deal_split_pct, notes)
     values ($1, $2, $3::integer, $4::integer, $5::integer,
             $6::numeric, $7::numeric, $8::numeric, $9)`,
    [
      sportId, creatorTier, creatorsCount, avgFollowers, postsPerYear,
      costPerPostUsd, engagementRatePct, brandDealSplitPct, notes || null,
    ]
  );

  await cascadeUpdate({
    trigger: "sport-pnl:updated",
    entityType: "fsp_influencer_economics",
    entityId: sportId,
    action: "add",
    after: { sport, creatorTier, creatorsCount, costPerPostUsd, brandDealSplitPct },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "media", "success", `${creatorTier} creator tier added.`);
}

export async function deleteInfluencerAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const id = clean(formData.get("id"));
  if (!id) redir(sport, "media", "error", "Missing id.");

  await executeAdmin(`delete from fsp_influencer_economics where id = $1`, [id]);

  await cascadeUpdate({
    trigger: "sport-pnl:updated",
    entityType: "fsp_influencer_economics",
    entityId: id,
    action: "delete",
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}`);
  redir(sport, "media", "success", "Creator tier removed.");
}
