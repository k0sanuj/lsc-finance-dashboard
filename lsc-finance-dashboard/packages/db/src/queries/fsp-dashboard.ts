import "server-only";

import { queryRows } from "../query";
import { getBackend } from "./shared";

// ─── Headcount across sports ────────────────────────────────

export type SportHeadcount = {
  sportId: string;
  sportCode: string;
  sportName: string;
  leagueRoles: number;
  techRoles: number;
  leagueY1Cost: number;
  techY1Cost: number;
};

export async function getSportsHeadcountSummary(): Promise<SportHeadcount[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    sport_id: string;
    sport_code: string;
    sport_name: string;
    league_count: number;
    tech_count: number;
    league_cost: string;
    tech_cost: string;
  }>(
    `select fs.id::text as sport_id,
            fs.sport_code::text,
            fs.display_name as sport_name,
            coalesce(lp.cnt, 0)::int as league_count,
            coalesce(tp.cnt, 0)::int as tech_count,
            coalesce(lp.y1_cost, 0)::text as league_cost,
            coalesce(tp.y1_cost, 0)::text as tech_cost
     from fsp_sports fs
     left join lateral (
       select count(*)::int as cnt, sum(year_1_salary)::numeric as y1_cost
       from fsp_league_payroll where sport_id = fs.id
     ) lp on true
     left join lateral (
       select count(*)::int as cnt,
              sum(year_1_salary * allocation_pct / 100.0)::numeric as y1_cost
       from fsp_tech_payroll where sport_id = fs.id
     ) tp on true
     order by fs.display_name`
  );

  return rows.map((r) => ({
    sportId: r.sport_id,
    sportCode: r.sport_code,
    sportName: r.sport_name,
    leagueRoles: r.league_count,
    techRoles: r.tech_count,
    leagueY1Cost: Number(r.league_cost) || 0,
    techY1Cost: Number(r.tech_cost) || 0,
  }));
}

// ─── Sponsorship pipeline across sports ─────────────────────

export type SponsorshipPipelineRow = {
  sportCode: string;
  sportName: string;
  pipeline: number;
  loi: number;
  signed: number;
  active: number;
  expired: number;
  archived: number;
  totalY1Value: number;
  totalY3Value: number;
};

export async function getSponsorshipPipelineAcrossSports(): Promise<SponsorshipPipelineRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    sport_code: string;
    sport_name: string;
    pipeline: number;
    loi: number;
    signed: number;
    active: number;
    expired: number;
    archived: number;
    y1: string;
    y3: string;
  }>(
    `select fs.sport_code::text,
            fs.display_name as sport_name,
            count(*) filter (where sp.contract_status = 'pipeline')::int as pipeline,
            count(*) filter (where sp.contract_status = 'loi')::int as loi,
            count(*) filter (where sp.contract_status = 'signed')::int as signed,
            count(*) filter (where sp.contract_status = 'active')::int as active,
            count(*) filter (where sp.contract_status = 'expired')::int as expired,
            count(*) filter (where sp.contract_status = 'archived')::int as archived,
            coalesce(sum(sp.year_1_value), 0)::text as y1,
            coalesce(sum(sp.year_3_value), 0)::text as y3
     from fsp_sports fs
     left join fsp_sponsorships sp on sp.sport_id = fs.id
     group by fs.sport_code, fs.display_name
     order by fs.display_name`
  );

  return rows.map((r) => ({
    sportCode: r.sport_code,
    sportName: r.sport_name,
    pipeline: r.pipeline,
    loi: r.loi,
    signed: r.signed,
    active: r.active,
    expired: r.expired,
    archived: r.archived,
    totalY1Value: Number(r.y1) || 0,
    totalY3Value: Number(r.y3) || 0,
  }));
}

// ─── Media revenue across sports ────────────────────────────

export type SportMediaTotals = {
  sportCode: string;
  sportName: string;
  nonLinearY1: number;
  linearY1: number;
  nonLinearY3: number;
  linearY3: number;
  influencerAnnualValue: number;
};

export async function getMediaRevenueAcrossSports(): Promise<SportMediaTotals[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    sport_code: string;
    sport_name: string;
    nl_y1: string;
    lin_y1: string;
    nl_y3: string;
    lin_y3: string;
    inf_value: string;
  }>(
    `select fs.sport_code::text,
            fs.display_name as sport_name,
            coalesce(sum(case when fmr.channel = 'non_linear' then fmr.impressions_y1 / 1000.0 * fmr.cpm_y1 else 0 end), 0)::text as nl_y1,
            coalesce(sum(case when fmr.channel = 'linear'     then fmr.impressions_y1 / 1000.0 * fmr.cpm_y1 else 0 end), 0)::text as lin_y1,
            coalesce(sum(case when fmr.channel = 'non_linear' then fmr.impressions_y3 / 1000.0 * fmr.cpm_y3 else 0 end), 0)::text as nl_y3,
            coalesce(sum(case when fmr.channel = 'linear'     then fmr.impressions_y3 / 1000.0 * fmr.cpm_y3 else 0 end), 0)::text as lin_y3,
            (select coalesce(sum(
               fie.creators_count * fie.posts_per_year * fie.cost_per_post_usd * (fie.brand_deal_split_pct / 100.0)
             ), 0) from fsp_influencer_economics fie where fie.sport_id = fs.id)::text as inf_value
     from fsp_sports fs
     left join fsp_media_revenue_cpm fmr on fmr.sport_id = fs.id
     group by fs.sport_code, fs.display_name, fs.id
     order by fs.display_name`
  );

  return rows.map((r) => ({
    sportCode: r.sport_code,
    sportName: r.sport_name,
    nonLinearY1: Number(r.nl_y1) || 0,
    linearY1: Number(r.lin_y1) || 0,
    nonLinearY3: Number(r.nl_y3) || 0,
    linearY3: Number(r.lin_y3) || 0,
    influencerAnnualValue: Number(r.inf_value) || 0,
  }));
}
