import "server-only";

import { queryRows } from "../query";
import { formatCurrency, getBackend } from "./shared";

// ─── Types ─────────────────────────────────────────────────

export type PnlLineItemRow = {
  id: string;
  section: string;
  category: string;
  subCategory: string;
  displayOrder: number;
  y1Budget: number;
  y2Budget: number;
  y3Budget: number;
  y1Actual: number;
  y2Actual: number;
  y3Actual: number;
  sourceModule: string;
};

export type PnlSummaryRow = {
  sportId: string;
  sportCode: string;
  sportName: string;
  scenario: string;
  revenueY1: number; revenueY2: number; revenueY3: number;
  cogsY1: number; cogsY2: number; cogsY3: number;
  opexY1: number; opexY2: number; opexY3: number;
  ebitdaY1: number; ebitdaY2: number; ebitdaY3: number;
  ebitdaMarginY1: number; ebitdaMarginY2: number; ebitdaMarginY3: number;
};

export type SponsorshipRow = {
  id: string;
  segment: string;
  sponsorName: string;
  tier: string;
  contractStatus: string;
  y1Value: string; y2Value: string; y3Value: string;
  contractStart: string; contractEnd: string;
  paymentSchedule: string;
  deliverablesSummary: string | null;
  documentId: string | null;
};

export type LeaguePayrollRow = {
  id: string;
  roleTitle: string;
  department: string;
  employmentType: string;
  y1Salary: string; y2Salary: string; y3Salary: string;
  annualRaisePct: number;
};

export type TechPayrollRow = {
  id: string;
  roleTitle: string;
  y1Salary: string; y2Salary: string; y3Salary: string;
  allocationPct: number;
  annualRaisePct: number;
};

export type RevenueShareRow = {
  yearNumber: number;
  teamCount: number;
  teamLicensingFee: string;
  teamsSharePct: number;
  governingBodyName: string;
  governingBodySharePct: number;
};

export type EventConfigRow = {
  segmentsPerEvent: number;
  eventsY1: number; eventsY2: number; eventsY3: number;
  venueCostPerEvent: string;
};

export type OpexItemRow = {
  id: string;
  opexCategory: string;
  subCategory: string;
  y1Budget: number; y2Budget: number; y3Budget: number;
  y1Actual: number; y2Actual: number; y3Actual: number;
};

// ─── Queries ───────────────────────────────────────────────

export async function getFspPnlSummaries(scenario: string = "base"): Promise<PnlSummaryRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    sport_id: string; sport_code: string; sport_name: string; scenario: string;
    revenue_y1: string; revenue_y2: string; revenue_y3: string;
    cogs_y1: string; cogs_y2: string; cogs_y3: string;
    opex_y1: string; opex_y2: string; opex_y3: string;
    ebitda_y1: string; ebitda_y2: string; ebitda_y3: string;
  }>(
    `select * from fsp_pnl_summary where scenario = $1 or scenario is null`,
    [scenario]
  );

  return rows.map((r) => {
    const revY1 = Number(r.revenue_y1); const revY2 = Number(r.revenue_y2); const revY3 = Number(r.revenue_y3);
    const ebitdaY1 = Number(r.ebitda_y1); const ebitdaY2 = Number(r.ebitda_y2); const ebitdaY3 = Number(r.ebitda_y3);
    return {
      sportId: r.sport_id, sportCode: r.sport_code, sportName: r.sport_name,
      scenario: r.scenario ?? "base",
      revenueY1: revY1, revenueY2: revY2, revenueY3: revY3,
      cogsY1: Number(r.cogs_y1), cogsY2: Number(r.cogs_y2), cogsY3: Number(r.cogs_y3),
      opexY1: Number(r.opex_y1), opexY2: Number(r.opex_y2), opexY3: Number(r.opex_y3),
      ebitdaY1, ebitdaY2, ebitdaY3,
      ebitdaMarginY1: revY1 ? (ebitdaY1 / revY1) * 100 : 0,
      ebitdaMarginY2: revY2 ? (ebitdaY2 / revY2) * 100 : 0,
      ebitdaMarginY3: revY3 ? (ebitdaY3 / revY3) * 100 : 0
    };
  });
}

export async function getSportPnlLineItems(sportId: string, scenario: string = "base"): Promise<PnlLineItemRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string; section: string; category: string; sub_category: string | null;
    display_order: string; year_1_budget: string; year_2_budget: string; year_3_budget: string;
    year_1_actual: string; year_2_actual: string; year_3_actual: string; source_module: string | null;
  }>(
    `select id, section, category, sub_category, display_order::text,
            year_1_budget, year_2_budget, year_3_budget,
            year_1_actual, year_2_actual, year_3_actual, source_module
     from fsp_pnl_line_items
     where sport_id = $1 and scenario = $2
     order by section, display_order`,
    [sportId, scenario]
  );

  return rows.map((r) => ({
    id: r.id, section: r.section, category: r.category,
    subCategory: r.sub_category ?? "", displayOrder: Number(r.display_order),
    y1Budget: Number(r.year_1_budget), y2Budget: Number(r.year_2_budget), y3Budget: Number(r.year_3_budget),
    y1Actual: Number(r.year_1_actual), y2Actual: Number(r.year_2_actual), y3Actual: Number(r.year_3_actual),
    sourceModule: r.source_module ?? ""
  }));
}

export async function getSportSponsorships(sportId: string): Promise<SponsorshipRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string; segment: string; sponsor_name: string | null; tier: string;
    contract_status: string; year_1_value: string; year_2_value: string; year_3_value: string;
    contract_start: string | null; contract_end: string | null; payment_schedule: string | null;
    deliverables_summary: string | null; document_id: string | null;
  }>(
    `select id, segment, sponsor_name, tier, contract_status,
            year_1_value, year_2_value, year_3_value,
            contract_start::text, contract_end::text, payment_schedule,
            deliverables_summary, document_id::text
     from fsp_sponsorships where sport_id = $1 order by tier, segment`,
    [sportId]
  );

  return rows.map((r) => ({
    id: r.id, segment: r.segment, sponsorName: r.sponsor_name ?? "",
    tier: r.tier, contractStatus: r.contract_status.replace(/_/g, " "),
    y1Value: formatCurrency(r.year_1_value), y2Value: formatCurrency(r.year_2_value),
    y3Value: formatCurrency(r.year_3_value),
    contractStart: r.contract_start ?? "", contractEnd: r.contract_end ?? "",
    paymentSchedule: r.payment_schedule ?? "",
    deliverablesSummary: r.deliverables_summary,
    documentId: r.document_id,
  }));
}

export async function getSportLeaguePayroll(sportId: string): Promise<LeaguePayrollRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string; role_title: string; department: string | null; employment_type: string;
    year_1_salary: string; year_2_salary: string; year_3_salary: string; annual_raise_pct: string;
  }>(
    `select id, role_title, department, employment_type,
            year_1_salary, year_2_salary, year_3_salary, annual_raise_pct
     from fsp_league_payroll where sport_id = $1 order by role_title`,
    [sportId]
  );

  return rows.map((r) => ({
    id: r.id, roleTitle: r.role_title, department: r.department ?? "",
    employmentType: r.employment_type,
    y1Salary: formatCurrency(r.year_1_salary), y2Salary: formatCurrency(r.year_2_salary),
    y3Salary: formatCurrency(r.year_3_salary), annualRaisePct: Number(r.annual_raise_pct)
  }));
}

export async function getSportTechPayroll(sportId: string): Promise<TechPayrollRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string; role_title: string;
    year_1_salary: string; year_2_salary: string; year_3_salary: string;
    allocation_pct: string; annual_raise_pct: string;
  }>(
    `select id, role_title, year_1_salary, year_2_salary, year_3_salary,
            allocation_pct, annual_raise_pct
     from fsp_tech_payroll where sport_id = $1 order by role_title`,
    [sportId]
  );

  return rows.map((r) => ({
    id: r.id, roleTitle: r.role_title,
    y1Salary: formatCurrency(r.year_1_salary), y2Salary: formatCurrency(r.year_2_salary),
    y3Salary: formatCurrency(r.year_3_salary),
    allocationPct: Number(r.allocation_pct), annualRaisePct: Number(r.annual_raise_pct)
  }));
}

export async function getSportRevenueShare(sportId: string): Promise<RevenueShareRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    year_number: string; team_count: string; team_licensing_fee: string;
    teams_share_pct: string; governing_body_name: string | null; governing_body_share_pct: string;
  }>(
    `select year_number::text, team_count::text, team_licensing_fee,
            teams_share_pct, governing_body_name, governing_body_share_pct
     from fsp_revenue_share where sport_id = $1 order by year_number`,
    [sportId]
  );

  return rows.map((r) => ({
    yearNumber: Number(r.year_number), teamCount: Number(r.team_count),
    teamLicensingFee: formatCurrency(r.team_licensing_fee),
    teamsSharePct: Number(r.teams_share_pct),
    governingBodyName: r.governing_body_name ?? "",
    governingBodySharePct: Number(r.governing_body_share_pct)
  }));
}

export async function getSportEventConfig(sportId: string): Promise<EventConfigRow | null> {
  if (getBackend() !== "database") return null;

  const rows = await queryRows<{
    segments_per_event: string; events_per_year_1: string;
    events_per_year_2: string; events_per_year_3: string; venue_cost_per_event: string;
  }>(
    `select segments_per_event::text, events_per_year_1::text,
            events_per_year_2::text, events_per_year_3::text, venue_cost_per_event
     from fsp_event_config where sport_id = $1`,
    [sportId]
  );

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    segmentsPerEvent: Number(r.segments_per_event),
    eventsY1: Number(r.events_per_year_1), eventsY2: Number(r.events_per_year_2),
    eventsY3: Number(r.events_per_year_3),
    venueCostPerEvent: formatCurrency(r.venue_cost_per_event)
  };
}

export async function getSportOpexItems(sportId: string): Promise<OpexItemRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string; opex_category: string; sub_category: string;
    year_1_budget: string; year_2_budget: string; year_3_budget: string;
    year_1_actual: string; year_2_actual: string; year_3_actual: string;
  }>(
    `select id, opex_category, sub_category,
            year_1_budget, year_2_budget, year_3_budget,
            year_1_actual, year_2_actual, year_3_actual
     from fsp_opex_items where sport_id = $1 order by opex_category, sub_category`,
    [sportId]
  );

  return rows.map((r) => ({
    id: r.id, opexCategory: r.opex_category, subCategory: r.sub_category,
    y1Budget: Number(r.year_1_budget), y2Budget: Number(r.year_2_budget), y3Budget: Number(r.year_3_budget),
    y1Actual: Number(r.year_1_actual), y2Actual: Number(r.year_2_actual), y3Actual: Number(r.year_3_actual)
  }));
}

export type EventProductionRow = {
  id: string;
  costCategory: string;
  subCategory: string;
  unitCost: number;
  quantity: number;
  lineTotal: number;
};

export async function getSportEventProduction(sportId: string): Promise<EventProductionRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string; cost_category: string; sub_category: string;
    unit_cost: string; quantity: string; line_total: string;
  }>(
    `select id, cost_category, sub_category, unit_cost, quantity::text, line_total
     from fsp_event_production where sport_id = $1 order by cost_category, sub_category`,
    [sportId]
  );

  return rows.map((r) => ({
    id: r.id, costCategory: r.cost_category, subCategory: r.sub_category,
    unitCost: Number(r.unit_cost), quantity: Number(r.quantity), lineTotal: Number(r.line_total)
  }));
}

export async function getSportIdByCode(sportCode: string): Promise<string | null> {
  if (getBackend() !== "database") return null;

  const rows = await queryRows<{ id: string }>(
    `select fs.id from fsp_sports fs
     join companies c on c.id = fs.company_id
     where c.code = 'FSP'::company_code and fs.sport_code = $1::fsp_sport_code`,
    [sportCode]
  );

  return rows[0]?.id ?? null;
}
