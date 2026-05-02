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

// ─── Module completeness (used by the Sport Overview tab) ────────────

export type SportModuleCompleteness = {
  pnlLineItems: number;
  sponsorships: number;
  sponsorshipsSigned: number;
  mediaChannelsConfigured: number; // 0, 1, or 2 (non_linear + linear)
  influencerTiers: number;
  opexItems: number;
  productionItems: number;
  leagueRoles: number;
  techRoles: number;
  revenueShareRows: number;
  hasEventConfig: boolean;
  hasAnyData: boolean;
};

export type FspSportCockpitMetrics = {
  sportId: string;
  sportCode: string;
  sportName: string;
  scenario: string;
  revenueY1: number;
  revenueY2: number;
  revenueY3: number;
  cogsY1: number;
  cogsY2: number;
  cogsY3: number;
  opexY1: number;
  opexY2: number;
  opexY3: number;
  ebitdaY1: number;
  ebitdaY2: number;
  ebitdaY3: number;
  ebitdaMarginY1: number;
  sponsorshipPipelineY1: number;
  sponsorshipPipelineY2: number;
  sponsorshipPipelineY3: number;
  sponsorshipRecordCount: number;
  signedSponsorshipCount: number;
  mediaRevenueY1: number;
  mediaRevenueY2: number;
  mediaRevenueY3: number;
  mediaChannelCount: number;
  productionCostPerEvent: number;
  productionItemCount: number;
  opexItemCount: number;
  moduleCompletenessScore: number;
};

function scoreCompleteness(counts: SportModuleCompleteness) {
  const modules = [
    counts.pnlLineItems > 0,
    counts.sponsorships > 0,
    counts.mediaChannelsConfigured > 0,
    counts.influencerTiers > 0,
    counts.opexItems > 0,
    counts.productionItems > 0,
    counts.leagueRoles > 0,
    counts.techRoles > 0,
    counts.revenueShareRows > 0,
    counts.hasEventConfig,
  ];
  return Math.round((modules.filter(Boolean).length / modules.length) * 100);
}

export async function getSportModuleCompleteness(
  sportId: string
): Promise<SportModuleCompleteness> {
  if (getBackend() !== "database") {
    return {
      pnlLineItems: 0,
      sponsorships: 0,
      sponsorshipsSigned: 0,
      mediaChannelsConfigured: 0,
      influencerTiers: 0,
      opexItems: 0,
      productionItems: 0,
      leagueRoles: 0,
      techRoles: 0,
      revenueShareRows: 0,
      hasEventConfig: false,
      hasAnyData: false,
    };
  }

  const rows = await queryRows<{
    pnl: string;
    sponsorships: string;
    sponsorships_signed: string;
    media_channels: string;
    influencer_tiers: string;
    opex_items: string;
    production_items: string;
    league_roles: string;
    tech_roles: string;
    revenue_share: string;
    has_event_config: boolean;
  }>(
    `select
       (select count(*) from fsp_pnl_line_items where sport_id = $1)::text as pnl,
       (select count(*) from fsp_sponsorships where sport_id = $1)::text as sponsorships,
       (select count(*) from fsp_sponsorships
          where sport_id = $1
            and contract_status in ('signed', 'active'))::text as sponsorships_signed,
       (select count(*) from fsp_media_revenue_cpm where sport_id = $1)::text as media_channels,
       (select count(*) from fsp_influencer_economics where sport_id = $1)::text as influencer_tiers,
       (select count(*) from fsp_opex_items where sport_id = $1)::text as opex_items,
       (select count(*) from fsp_event_production where sport_id = $1)::text as production_items,
       (select count(*) from fsp_league_payroll where sport_id = $1)::text as league_roles,
       (select count(*) from fsp_tech_payroll where sport_id = $1)::text as tech_roles,
       (select count(*) from fsp_revenue_share where sport_id = $1)::text as revenue_share,
       exists(select 1 from fsp_event_config where sport_id = $1) as has_event_config`,
    [sportId]
  );

  const row = rows[0];
  const toNum = (v: string | undefined) => Number(v ?? 0) || 0;

  const completeness: SportModuleCompleteness = {
    pnlLineItems: toNum(row?.pnl),
    sponsorships: toNum(row?.sponsorships),
    sponsorshipsSigned: toNum(row?.sponsorships_signed),
    mediaChannelsConfigured: toNum(row?.media_channels),
    influencerTiers: toNum(row?.influencer_tiers),
    opexItems: toNum(row?.opex_items),
    productionItems: toNum(row?.production_items),
    leagueRoles: toNum(row?.league_roles),
    techRoles: toNum(row?.tech_roles),
    revenueShareRows: toNum(row?.revenue_share),
    hasEventConfig: row?.has_event_config === true,
    hasAnyData: false,
  };

  completeness.hasAnyData =
    completeness.pnlLineItems > 0 ||
    completeness.sponsorships > 0 ||
    completeness.mediaChannelsConfigured > 0 ||
    completeness.influencerTiers > 0 ||
    completeness.opexItems > 0 ||
    completeness.productionItems > 0 ||
    completeness.leagueRoles > 0 ||
    completeness.techRoles > 0 ||
    completeness.revenueShareRows > 0 ||
    completeness.hasEventConfig;

  return completeness;
}

export async function getFspSportCockpitMetrics(
  sportId: string,
  scenario: string = "base"
): Promise<FspSportCockpitMetrics | null> {
  if (getBackend() !== "database") return null;

  const [rows, completeness] = await Promise.all([
    queryRows<{
      sport_id: string;
      sport_code: string;
      sport_name: string;
      scenario: string | null;
      revenue_y1: string;
      revenue_y2: string;
      revenue_y3: string;
      cogs_y1: string;
      cogs_y2: string;
      cogs_y3: string;
      opex_y1: string;
      opex_y2: string;
      opex_y3: string;
      ebitda_y1: string;
      ebitda_y2: string;
      ebitda_y3: string;
      sponsorship_y1: string;
      sponsorship_y2: string;
      sponsorship_y3: string;
      sponsorship_count: string;
      sponsorship_signed_count: string;
      media_y1: string;
      media_y2: string;
      media_y3: string;
      media_channel_count: string;
      production_cost_per_event: string;
      production_item_count: string;
      opex_item_count: string;
    }>(
      `with pnl as (
         select sport_id,
                sport_code::text,
                sport_name,
                scenario::text,
                revenue_y1::text,
                revenue_y2::text,
                revenue_y3::text,
                cogs_y1::text,
                cogs_y2::text,
                cogs_y3::text,
                opex_y1::text,
                opex_y2::text,
                opex_y3::text,
                ebitda_y1::text,
                ebitda_y2::text,
                ebitda_y3::text
         from fsp_pnl_summary
         where sport_id = $1::uuid
           and (scenario::text = $2::text or scenario::text = 'base' or scenario is null)
         order by case
           when scenario::text = $2::text then 0
           when scenario::text = 'base' then 1
           else 2
         end
         limit 1
       ),
       sponsorship as (
         select sport_id,
                coalesce(sum(year_1_value), 0)::text as sponsorship_y1,
                coalesce(sum(year_2_value), 0)::text as sponsorship_y2,
                coalesce(sum(year_3_value), 0)::text as sponsorship_y3,
                count(*)::text as sponsorship_count,
                count(*) filter (where contract_status in ('signed', 'active'))::text as sponsorship_signed_count
         from fsp_sponsorships
         where sport_id = $1::uuid
         group by sport_id
       ),
       media as (
         select sport_id,
                coalesce(sum((impressions_y1 / 1000) * cpm_y1), 0)::numeric(14,2)::text as media_y1,
                coalesce(sum((impressions_y2 / 1000) * cpm_y2), 0)::numeric(14,2)::text as media_y2,
                coalesce(sum((impressions_y3 / 1000) * cpm_y3), 0)::numeric(14,2)::text as media_y3,
                count(*)::text as media_channel_count
         from fsp_media_revenue_cpm
         where sport_id = $1::uuid
         group by sport_id
       ),
       production as (
         select sport_id,
                coalesce(sum(line_total), 0)::text as production_cost_per_event,
                count(*)::text as production_item_count
         from fsp_event_production
         where sport_id = $1::uuid
         group by sport_id
       ),
       opex as (
         select sport_id,
                count(*)::text as opex_item_count
         from fsp_opex_items
         where sport_id = $1::uuid
         group by sport_id
       )
       select fs.id::text as sport_id,
              fs.sport_code::text,
              fs.display_name as sport_name,
              coalesce(pnl.scenario, $2::text) as scenario,
              coalesce(pnl.revenue_y1, '0') as revenue_y1,
              coalesce(pnl.revenue_y2, '0') as revenue_y2,
              coalesce(pnl.revenue_y3, '0') as revenue_y3,
              coalesce(pnl.cogs_y1, '0') as cogs_y1,
              coalesce(pnl.cogs_y2, '0') as cogs_y2,
              coalesce(pnl.cogs_y3, '0') as cogs_y3,
              coalesce(pnl.opex_y1, '0') as opex_y1,
              coalesce(pnl.opex_y2, '0') as opex_y2,
              coalesce(pnl.opex_y3, '0') as opex_y3,
              coalesce(pnl.ebitda_y1, '0') as ebitda_y1,
              coalesce(pnl.ebitda_y2, '0') as ebitda_y2,
              coalesce(pnl.ebitda_y3, '0') as ebitda_y3,
              coalesce(sponsorship.sponsorship_y1, '0') as sponsorship_y1,
              coalesce(sponsorship.sponsorship_y2, '0') as sponsorship_y2,
              coalesce(sponsorship.sponsorship_y3, '0') as sponsorship_y3,
              coalesce(sponsorship.sponsorship_count, '0') as sponsorship_count,
              coalesce(sponsorship.sponsorship_signed_count, '0') as sponsorship_signed_count,
              coalesce(media.media_y1, '0') as media_y1,
              coalesce(media.media_y2, '0') as media_y2,
              coalesce(media.media_y3, '0') as media_y3,
              coalesce(media.media_channel_count, '0') as media_channel_count,
              coalesce(production.production_cost_per_event, '0') as production_cost_per_event,
              coalesce(production.production_item_count, '0') as production_item_count,
              coalesce(opex.opex_item_count, '0') as opex_item_count
       from fsp_sports fs
       left join pnl on pnl.sport_id = fs.id
       left join sponsorship on sponsorship.sport_id = fs.id
       left join media on media.sport_id = fs.id
       left join production on production.sport_id = fs.id
       left join opex on opex.sport_id = fs.id
       where fs.id = $1::uuid
       limit 1`,
      [sportId, scenario]
    ),
    getSportModuleCompleteness(sportId),
  ]);

  const row = rows[0];
  if (!row) return null;

  const revenueY1 = Number(row.revenue_y1) || 0;
  const ebitdaY1 = Number(row.ebitda_y1) || 0;

  return {
    sportId: row.sport_id,
    sportCode: row.sport_code,
    sportName: row.sport_name,
    scenario: row.scenario ?? scenario,
    revenueY1,
    revenueY2: Number(row.revenue_y2) || 0,
    revenueY3: Number(row.revenue_y3) || 0,
    cogsY1: Number(row.cogs_y1) || 0,
    cogsY2: Number(row.cogs_y2) || 0,
    cogsY3: Number(row.cogs_y3) || 0,
    opexY1: Number(row.opex_y1) || 0,
    opexY2: Number(row.opex_y2) || 0,
    opexY3: Number(row.opex_y3) || 0,
    ebitdaY1,
    ebitdaY2: Number(row.ebitda_y2) || 0,
    ebitdaY3: Number(row.ebitda_y3) || 0,
    ebitdaMarginY1: revenueY1 ? Number(((ebitdaY1 / revenueY1) * 100).toFixed(1)) : 0,
    sponsorshipPipelineY1: Number(row.sponsorship_y1) || 0,
    sponsorshipPipelineY2: Number(row.sponsorship_y2) || 0,
    sponsorshipPipelineY3: Number(row.sponsorship_y3) || 0,
    sponsorshipRecordCount: Number(row.sponsorship_count) || 0,
    signedSponsorshipCount: Number(row.sponsorship_signed_count) || 0,
    mediaRevenueY1: Number(row.media_y1) || 0,
    mediaRevenueY2: Number(row.media_y2) || 0,
    mediaRevenueY3: Number(row.media_y3) || 0,
    mediaChannelCount: Number(row.media_channel_count) || 0,
    productionCostPerEvent: Number(row.production_cost_per_event) || 0,
    productionItemCount: Number(row.production_item_count) || 0,
    opexItemCount: Number(row.opex_item_count) || 0,
    moduleCompletenessScore: scoreCompleteness(completeness),
  };
}
