import "server-only";

import { queryRows } from "../query";
import { getBackend } from "./shared";

export type VarianceSignal = "under" | "on_track" | "approaching" | "over";

export type TbrRaceBudgetVariance = {
  raceEventId: string;
  raceName: string;
  seasonYear: number;
  categoryId: string;
  categoryName: string;
  approvedUsd: number;
  actualUsd: number;
  variance: number;
  variancePct: number;
  signal: VarianceSignal;
};

function computeSignal(approved: number, actual: number, closeRatio = 0.95): VarianceSignal {
  if (approved <= 0) return "on_track";
  const pct = actual / approved;
  if (pct < closeRatio) return "under";
  if (pct < 1.0) return "approaching";
  if (pct > 1.0) return "over";
  return "on_track";
}

/**
 * Budget vs Actual per race per cost category for TBR.
 * approved_amount_usd comes from race_budget_rules.
 * actual is the sum of approved+posted expense_submission_items in that category, for that race.
 * Soft-groups by category (a race can have multiple rules; we sum rule approvals).
 */
export async function getTbrBudgetVariance(opts: {
  seasonYear?: number;
  raceEventId?: string;
} = {}): Promise<TbrRaceBudgetVariance[]> {
  if (getBackend() !== "database") return [];

  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.raceEventId) {
    params.push(opts.raceEventId);
    where.push(`re.id = $${params.length}`);
  }
  if (opts.seasonYear !== undefined) {
    params.push(opts.seasonYear);
    where.push(`re.season_year = $${params.length}`);
  }

  const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";

  const rows = await queryRows<{
    race_id: string;
    race_name: string;
    season_year: number;
    category_id: string;
    category_name: string;
    approved_usd: string;
    actual_usd: string;
  }>(
    `with approved as (
       select rbr.race_event_id, rbr.cost_category_id,
              sum(rbr.approved_amount_usd)::numeric as approved_usd
       from race_budget_rules rbr
       group by rbr.race_event_id, rbr.cost_category_id
     ),
     actuals as (
       select es.race_event_id, esi.cost_category_id,
              sum(esi.amount)::numeric as actual_usd
       from expense_submission_items esi
       join expense_submissions es on es.id = esi.submission_id
       where es.submission_status in ('approved', 'posted')
       group by es.race_event_id, esi.cost_category_id
     )
     select re.id::text as race_id,
            re.name as race_name,
            re.season_year,
            cc.id::text as category_id,
            cc.name as category_name,
            coalesce(a.approved_usd, 0)::text as approved_usd,
            coalesce(ac.actual_usd, 0)::text as actual_usd
     from race_events re
     join approved a on a.race_event_id = re.id
     left join actuals ac on ac.race_event_id = re.id and ac.cost_category_id = a.cost_category_id
     join cost_categories cc on cc.id = a.cost_category_id
     ${whereClause}
     order by re.season_year desc, re.name, cc.name`,
    params
  );

  return rows.map((r) => {
    const approved = Number(r.approved_usd) || 0;
    const actual = Number(r.actual_usd) || 0;
    const variance = Number((actual - approved).toFixed(2));
    const variancePct =
      approved > 0 ? Number(((actual / approved - 1) * 100).toFixed(1)) : 0;
    return {
      raceEventId: r.race_id,
      raceName: r.race_name,
      seasonYear: Number(r.season_year),
      categoryId: r.category_id,
      categoryName: r.category_name,
      approvedUsd: approved,
      actualUsd: actual,
      variance,
      variancePct,
      signal: computeSignal(approved, actual),
    };
  });
}

/**
 * FSP sport-level P&L variance — aggregates line items by section per year,
 * returns budget/actual/variance for Y1 (and optionally Y2/Y3).
 */
export async function getFspSportBudgetVariance(
  sportId: string
): Promise<Array<{
  section: string;
  category: string;
  y1Budget: number;
  y1Actual: number;
  y1Variance: number;
  y1VariancePct: number;
  signal: VarianceSignal;
}>> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    section: string;
    category: string;
    y1_budget: string;
    y1_actual: string;
  }>(
    `select section::text, category,
            year_1_budget::text as y1_budget,
            year_1_actual::text as y1_actual
     from fsp_pnl_line_items
     where sport_id = $1 and scenario = 'base'
     order by section, display_order, category`,
    [sportId]
  );

  return rows.map((r) => {
    const budget = Number(r.y1_budget) || 0;
    const actual = Number(r.y1_actual) || 0;
    const variance = Number((actual - budget).toFixed(2));
    const variancePct =
      budget > 0 ? Number(((actual / budget - 1) * 100).toFixed(1)) : 0;
    return {
      section: r.section,
      category: r.category,
      y1Budget: budget,
      y1Actual: actual,
      y1Variance: variance,
      y1VariancePct: variancePct,
      signal: computeSignal(budget, actual),
    };
  });
}
