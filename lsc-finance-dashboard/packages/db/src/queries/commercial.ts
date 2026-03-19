import "server-only";

import { commercialGoals, partnerPerformance } from "../seed-data";
import { queryRows } from "../query";
import {
  formatCurrency,
  formatMonthLabel,
  getBackend
} from "./shared";

export type CommercialGoalRow = {
  month: string;
  target: string;
  actual: string;
  gap: string;
};

export type PartnerPerformanceRow = {
  owner: string;
  targetRevenue: string;
  closedRevenue: string;
  status: string;
};

export type CommercialGoalRowSource = {
  target_period_start: string;
  target_value: string;
  actual_revenue: string;
  gap_to_target: string;
};

export type PartnerPerformanceRowSource = {
  owner_name: string;
  target_revenue: string;
  recognized_revenue: string;
};

async function getDbCommercialGoals(): Promise<CommercialGoalRow[]> {
  const rows = await queryRows<{
    target_period_start: string;
    target_value: string;
    actual_revenue: string;
    gap_to_target: string;
  }>(
    `select target_period_start, target_value, actual_revenue, gap_to_target
     from commercial_goal_progress
     where company_code = 'TBR'
     order by target_period_start
     limit 12`
  );

  if (rows.length === 0) {
    return [...commercialGoals];
  }

  return rows.map((row: CommercialGoalRowSource) => ({
    month: formatMonthLabel(row.target_period_start),
    target: formatCurrency(row.target_value),
    actual: formatCurrency(row.actual_revenue),
    gap: formatCurrency(row.gap_to_target)
  }));
}

async function getDbPartnerPerformance(): Promise<PartnerPerformanceRow[]> {
  const rows = await queryRows<{
    owner_name: string;
    target_revenue: string;
    recognized_revenue: string;
  }>(
    `select owner_name, target_revenue, recognized_revenue
     from partner_performance
     where company_code = 'TBR'
     order by owner_name`
  );

  if (rows.length === 0) {
    return [...partnerPerformance];
  }

  return rows.map((row: PartnerPerformanceRowSource) => ({
    owner: row.owner_name,
    targetRevenue: formatCurrency(row.target_revenue),
    closedRevenue: formatCurrency(row.recognized_revenue),
    status:
      Number(row.target_revenue) > 0 && Number(row.recognized_revenue) >= Number(row.target_revenue)
        ? "on target"
        : "in progress"
  }));
}

export async function getCommercialGoals() {
  if (getBackend() === "database") {
    return getDbCommercialGoals();
  }

  return [...commercialGoals];
}

export async function getPartnerPerformance() {
  if (getBackend() === "database") {
    return getDbPartnerPerformance();
  }

  return [...partnerPerformance];
}
