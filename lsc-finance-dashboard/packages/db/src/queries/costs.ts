import "server-only";

import { costCategories, tbrRaceCosts } from "../seed-data";
import { queryRows } from "../query";
import {
  formatCurrency,
  getBackend,
  parseMoney
} from "./shared";

export type RaceCostRow = {
  race: string;
  eventInvoices: string;
  reimbursements: string;
  total: string;
};

export type CostCategoryRow = {
  name: string;
  amount: string;
  description: string;
};

export type CostInsightRow = {
  title: string;
  summary: string;
};

export type RaceCostRowSource = {
  race_name: string;
  season_year: number | null;
  event_start_date: string | null;
  event_invoice_total: string;
  reimbursement_total: string;
  total_race_cost: string;
};

export type CostCategoryRowSource = {
  category_name: string;
  total_amount: string;
};

async function getDbTbrRaceCosts(): Promise<RaceCostRow[]> {
  const rows = await queryRows<{
    race_name: string;
    season_year: number | null;
    event_start_date: string | null;
    event_invoice_total: string;
    reimbursement_total: string;
    total_race_cost: string;
  }>(
    `select race_name, season_year, event_start_date, event_invoice_total, reimbursement_total, total_race_cost
     from tbr_race_cost_summary
     order by season_year nulls last, event_start_date nulls last, race_name`
  );

  if (rows.length === 0) {
    return [...tbrRaceCosts];
  }

  return rows
    .filter(
      (row: RaceCostRowSource) =>
        Number(row.event_invoice_total) > 0 ||
        Number(row.reimbursement_total) > 0 ||
        Number(row.total_race_cost) > 0
    )
    .map((row: RaceCostRowSource) => ({
      race: row.race_name,
      eventInvoices: formatCurrency(row.event_invoice_total),
      reimbursements: formatCurrency(row.reimbursement_total),
      total: formatCurrency(row.total_race_cost)
    }));
}

async function getDbCostCategories(): Promise<CostCategoryRow[]> {
  const rows = await queryRows<{
    category_name: string;
    total_amount: string;
  }>(
    `select cc.name as category_name, coalesce(sum(e.amount), 0)::text as total_amount
     from cost_categories cc
     left join expenses e on e.cost_category_id = cc.id and e.expense_status in ('approved', 'paid')
     join companies c on c.id = cc.company_id
     where c.code = 'TBR'
     group by cc.name
     order by cc.name`
  );

  if (rows.length === 0) {
    return [...costCategories];
  }

  return rows.map((row: CostCategoryRowSource) => ({
    name: row.category_name,
    amount: formatCurrency(row.total_amount),
    description: "Live category total from approved TBR expenses."
  }));
}

export async function getTbrRaceCosts() {
  if (getBackend() === "database") {
    return getDbTbrRaceCosts();
  }

  return [...tbrRaceCosts];
}

export async function getCostCategories() {
  if (getBackend() === "database") {
    return getDbCostCategories();
  }

  return [...costCategories];
}

export async function getTbrSeasonCostCategories(seasonYear: number) {
  if (getBackend() === "database") {
    const rows = await queryRows<{
      category_name: string;
      total_amount: string;
    }>(
      `select
         cc.name as category_name,
         coalesce(sum(e.amount), 0)::text as total_amount
       from cost_categories cc
       join companies c on c.id = cc.company_id
       left join expenses e
         on e.cost_category_id = cc.id
        and e.expense_status in ('approved', 'paid')
       left join race_events re on re.id = e.race_event_id
       where c.code = 'TBR'
         and re.season_year = $1
       group by cc.name
       having coalesce(sum(e.amount), 0) > 0
       order by coalesce(sum(e.amount), 0) desc, cc.name`,
      [seasonYear]
    );

    return rows.map((row: CostCategoryRowSource) => ({
      name: row.category_name,
      amount: formatCurrency(row.total_amount),
      description: `Approved reimbursement cost inside Season ${seasonYear}.`
    })) satisfies CostCategoryRow[];
  }

  return [] satisfies CostCategoryRow[];
}

export async function getCostInsights(companyCode: "TBR" | "FSP" = "TBR") {
  if (companyCode === "FSP") {
    return [
      {
        title: "FSP cost workspace is still preparatory",
        summary: "Keep the structure ready for launch costs, but do not over-interpret placeholder values before FSP has live operating records."
      },
      {
        title: "Use the same operating model later",
        summary: "When FSP costs arrive, review them by category, by source document, and by payable timing just like TBR."
      }
    ] satisfies CostInsightRow[];
  }

  const [categories, races] = await Promise.all([getCostCategories(), getTbrRaceCosts()]);
  const rankedCategories = [...categories].sort((left, right) => parseMoney(right.amount) - parseMoney(left.amount));
  const rankedRaces = [...races].sort((left, right) => parseMoney(right.total) - parseMoney(left.total));

  const topCategory = rankedCategories[0];
  const topRace = rankedRaces[0];
  const totalCost = rankedCategories.reduce((sum, row) => sum + parseMoney(row.amount), 0);
  const topCategoryShare = totalCost > 0 && topCategory ? Math.round((parseMoney(topCategory.amount) / totalCost) * 100) : 0;

  return [
    {
      title: topCategory
        ? `${topCategory.name} is currently the dominant cost bucket`
        : "No approved cost bucket is active yet",
      summary: topCategory
        ? `${topCategory.amount} is sitting in ${topCategory.name}, which is about ${topCategoryShare}% of current approved TBR spend.`
        : "Once live cost rows are approved, this section should call out which category is driving the spend concentration."
    },
    {
      title: topRace ? `${topRace.race} is the heaviest race-cost event so far` : "Race-level cost intensity is still light",
      summary: topRace
        ? `${topRace.total} is currently the largest race total, combining ${topRace.eventInvoices} of event invoices and ${topRace.reimbursements} of reimbursements.`
        : "Race-by-race totals will become useful once more cost rows are linked to race events."
    },
    {
      title: "Review source-backed support after the rollup",
      summary: "Use the analyzer and source queue only after the category and race tables point to something unusual. That keeps finance review focused instead of document-first."
    }
  ] satisfies CostInsightRow[];
}
