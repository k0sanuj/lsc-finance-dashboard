import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateValue, getBackend } from "./shared";

// ─── Types ─────────────────────────────────────────────────

export type TreasuryProjectionRow = {
  id: string;
  projectionDate: string;
  projectedBalance: string;
  committedOutflows: string;
  expectedInflows: string;
  netPosition: string;
  projectionType: string;
  currency: string;
};

export type TreasurySummary = {
  currentBalance: string;
  next30dOutflows: string;
  next30dInflows: string;
  projectedNet30d: string;
  projectedNet60d: string;
  projectedNet90d: string;
  rawCurrentBalance: number;
  rawNet30d: number;
  rawNet60d: number;
  rawNet90d: number;
};

// ─── Queries ───────────────────────────────────────────────

export async function getTreasuryProjections(companyCode?: string): Promise<TreasuryProjectionRow[]> {
  if (getBackend() !== "database") return [];

  const whereClause = companyCode
    ? `where tp.company_id = (select id from companies where code = $1)`
    : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    projection_date: string;
    projected_balance: string;
    committed_outflows: string;
    expected_inflows: string;
    net_position: string;
    projection_type: string;
    currency: string;
  }>(
    `select
       tp.id,
       tp.projection_date::text,
       coalesce(tp.projected_balance, 0)::numeric(14,2)::text as projected_balance,
       coalesce(tp.committed_outflows, 0)::numeric(14,2)::text as committed_outflows,
       coalesce(tp.expected_inflows, 0)::numeric(14,2)::text as expected_inflows,
       coalesce(tp.net_position, 0)::numeric(14,2)::text as net_position,
       tp.projection_type,
       coalesce(tp.currency, 'USD') as currency
     from treasury_projections tp
     ${whereClause}
     order by tp.projection_date desc`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    projectionDate: formatDateValue(r.projection_date),
    projectedBalance: formatCurrency(r.projected_balance),
    committedOutflows: formatCurrency(r.committed_outflows),
    expectedInflows: formatCurrency(r.expected_inflows),
    netPosition: formatCurrency(r.net_position),
    projectionType: r.projection_type.replace(/_/g, " "),
    currency: r.currency
  }));
}

export async function getTreasurySummary(companyCode?: string): Promise<TreasurySummary> {
  if (getBackend() !== "database") {
    return {
      currentBalance: formatCurrency(0),
      next30dOutflows: formatCurrency(0),
      next30dInflows: formatCurrency(0),
      projectedNet30d: formatCurrency(0),
      projectedNet60d: formatCurrency(0),
      projectedNet90d: formatCurrency(0),
      rawCurrentBalance: 0,
      rawNet30d: 0,
      rawNet60d: 0,
      rawNet90d: 0
    };
  }

  const companyFilter = companyCode
    ? `and tp.company_id = (select id from companies where code = $1)`
    : "";
  const params = companyCode ? [companyCode] : [];

  // Get the latest projection as current balance
  const latestRows = await queryRows<{ projected_balance: string }>(
    `select coalesce(tp.projected_balance, 0)::numeric(14,2)::text as projected_balance
     from treasury_projections tp
     where tp.projection_date <= current_date ${companyFilter}
     order by tp.projection_date desc
     limit 1`,
    params
  );
  const currentBalance = Number(latestRows[0]?.projected_balance ?? 0);

  // Aggregate 30-day window
  const agg30 = await queryRows<{ total_outflows: string; total_inflows: string; total_net: string }>(
    `select
       coalesce(sum(tp.committed_outflows), 0)::numeric(14,2)::text as total_outflows,
       coalesce(sum(tp.expected_inflows), 0)::numeric(14,2)::text as total_inflows,
       coalesce(sum(tp.net_position), 0)::numeric(14,2)::text as total_net
     from treasury_projections tp
     where tp.projection_date > current_date
       and tp.projection_date <= current_date + 30
       ${companyFilter}`,
    params
  );

  // Aggregate 60-day window
  const agg60 = await queryRows<{ total_net: string }>(
    `select coalesce(sum(tp.net_position), 0)::numeric(14,2)::text as total_net
     from treasury_projections tp
     where tp.projection_date > current_date
       and tp.projection_date <= current_date + 60
       ${companyFilter}`,
    params
  );

  // Aggregate 90-day window
  const agg90 = await queryRows<{ total_net: string }>(
    `select coalesce(sum(tp.net_position), 0)::numeric(14,2)::text as total_net
     from treasury_projections tp
     where tp.projection_date > current_date
       and tp.projection_date <= current_date + 90
       ${companyFilter}`,
    params
  );

  const outflows30 = Number(agg30[0]?.total_outflows ?? 0);
  const inflows30 = Number(agg30[0]?.total_inflows ?? 0);
  const net30 = Number(agg30[0]?.total_net ?? 0);
  const net60 = Number(agg60[0]?.total_net ?? 0);
  const net90 = Number(agg90[0]?.total_net ?? 0);

  return {
    currentBalance: formatCurrency(currentBalance),
    next30dOutflows: formatCurrency(outflows30),
    next30dInflows: formatCurrency(inflows30),
    projectedNet30d: formatCurrency(net30),
    projectedNet60d: formatCurrency(net60),
    projectedNet90d: formatCurrency(net90),
    rawCurrentBalance: currentBalance,
    rawNet30d: net30,
    rawNet60d: net60,
    rawNet90d: net90
  };
}
