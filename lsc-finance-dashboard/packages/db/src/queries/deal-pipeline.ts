import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type DealRow = {
  id: string;
  dealName: string;
  dealType: string;
  department: string;
  dealOwner: string;
  dealValue: string;
  rawDealValue: number;
  stage: string;
  expectedCloseDate: string;
  riskLevel: string;
  nextAction: string;
  actionOwner: string;
  atRisk: boolean;
  sportVertical: string;
  createdAt: string;
};

export type DealPipelineSummary = {
  totalValue: string;
  rawTotalValue: number;
  dealCount: number;
  byStage: { stage: string; count: number; value: string; rawValue: number }[];
  byDepartment: { dept: string; count: number; value: string; rawValue: number }[];
  atRiskCount: number;
  wonCount: number;
};

type DealQueryFilters = {
  department?: string;
  stage?: string;
  riskLevel?: string;
};

type DealDbRow = {
  id: string;
  deal_name: string;
  deal_type: string;
  department: string;
  deal_owner: string;
  deal_value: string;
  stage: string;
  expected_close_date: string | null;
  risk_level: string;
  next_action: string | null;
  action_owner: string | null;
  at_risk: boolean;
  sport_vertical: string | null;
  created_at: string;
};

type StageAgg = {
  stage: string;
  count: string;
  total_value: string;
};

type DeptAgg = {
  department: string;
  count: string;
  total_value: string;
};

type SummaryAgg = {
  total_value: string;
  deal_count: string;
  at_risk_count: string;
  won_count: string;
};

const SEED_DEALS: DealRow[] = [
  {
    id: "seed-1",
    dealName: "Arena Naming Rights — Jeddah",
    dealType: "Arena Partnership",
    department: "Arena",
    dealOwner: "Anuj Singh",
    dealValue: formatCurrency(2500000),
    rawDealValue: 2500000,
    stage: "negotiation",
    expectedCloseDate: "Jun 15",
    riskLevel: "medium",
    nextAction: "Final term sheet review",
    actionOwner: "Anuj Singh",
    atRisk: false,
    sportVertical: "Racing",
    createdAt: "2026-01-15",
  },
  {
    id: "seed-2",
    dealName: "Season 3 Title Sponsor",
    dealType: "Sponsorship",
    department: "Growth",
    dealOwner: "Sarah Chen",
    dealValue: formatCurrency(5000000),
    rawDealValue: 5000000,
    stage: "proposal",
    expectedCloseDate: "Jul 1",
    riskLevel: "low",
    nextAction: "Send revised deck",
    actionOwner: "Sarah Chen",
    atRisk: false,
    sportVertical: "Racing",
    createdAt: "2026-02-01",
  },
  {
    id: "seed-3",
    dealName: "Broadcast Distribution — MENA",
    dealType: "Media Rights",
    department: "Growth",
    dealOwner: "James Park",
    dealValue: formatCurrency(1200000),
    rawDealValue: 1200000,
    stage: "discovery",
    expectedCloseDate: "Aug 30",
    riskLevel: "high",
    nextAction: "Schedule follow-up call",
    actionOwner: "James Park",
    atRisk: true,
    sportVertical: "Racing",
    createdAt: "2026-03-10",
  },
];

function mapDbRow(row: DealDbRow): DealRow {
  const rawValue = Number(row.deal_value ?? 0);
  return {
    id: row.id,
    dealName: row.deal_name,
    dealType: row.deal_type,
    department: row.department,
    dealOwner: row.deal_owner,
    dealValue: formatCurrency(rawValue),
    rawDealValue: rawValue,
    stage: row.stage,
    expectedCloseDate: formatDateLabel(row.expected_close_date),
    riskLevel: row.risk_level,
    nextAction: row.next_action ?? "",
    actionOwner: row.action_owner ?? "",
    atRisk: row.at_risk,
    sportVertical: row.sport_vertical ?? "",
    createdAt: row.created_at,
  };
}

export async function getDeals(filters?: DealQueryFilters): Promise<DealRow[]> {
  if (getBackend() === "seed") {
    let result = SEED_DEALS;
    if (filters?.department) {
      result = result.filter((d) => d.department === filters.department);
    }
    if (filters?.stage) {
      result = result.filter((d) => d.stage === filters.stage);
    }
    if (filters?.riskLevel) {
      result = result.filter((d) => d.riskLevel === filters.riskLevel);
    }
    return result;
  }

  const conditions: string[] = ["d.deleted_at IS NULL"];
  const values: unknown[] = [];
  let idx = 1;

  if (filters?.department) {
    conditions.push(`d.department = $${idx}`);
    values.push(filters.department);
    idx++;
  }
  if (filters?.stage) {
    conditions.push(`d.stage = $${idx}`);
    values.push(filters.stage);
    idx++;
  }
  if (filters?.riskLevel) {
    conditions.push(`d.risk_level = $${idx}`);
    values.push(filters.riskLevel);
    idx++;
  }

  const rows = await queryRows<DealDbRow>(
    `SELECT d.id, d.deal_name, d.deal_type, d.department, d.deal_owner,
            d.deal_value::text, d.stage, d.expected_close_date::text,
            d.risk_level, d.next_action, d.action_owner, d.at_risk,
            d.sport_vertical, d.created_at::text
     FROM deals d
     WHERE ${conditions.join(" AND ")}
     ORDER BY d.deal_value DESC NULLS LAST`,
    values
  );

  return rows.map(mapDbRow);
}

export async function getDealPipelineSummary(): Promise<DealPipelineSummary> {
  if (getBackend() === "seed") {
    const deals = SEED_DEALS;
    const total = deals.reduce((s, d) => s + d.rawDealValue, 0);

    const stageMap = new Map<string, { count: number; value: number }>();
    const deptMap = new Map<string, { count: number; value: number }>();

    for (const d of deals) {
      const se = stageMap.get(d.stage) ?? { count: 0, value: 0 };
      se.count++;
      se.value += d.rawDealValue;
      stageMap.set(d.stage, se);

      const de = deptMap.get(d.department) ?? { count: 0, value: 0 };
      de.count++;
      de.value += d.rawDealValue;
      deptMap.set(d.department, de);
    }

    return {
      totalValue: formatCurrency(total),
      rawTotalValue: total,
      dealCount: deals.length,
      byStage: [...stageMap.entries()].map(([stage, v]) => ({
        stage,
        count: v.count,
        value: formatCurrency(v.value),
        rawValue: v.value,
      })),
      byDepartment: [...deptMap.entries()].map(([dept, v]) => ({
        dept,
        count: v.count,
        value: formatCurrency(v.value),
        rawValue: v.value,
      })),
      atRiskCount: deals.filter((d) => d.atRisk).length,
      wonCount: deals.filter((d) => d.stage === "won").length,
    };
  }

  const [summaryRows, stageRows, deptRows] = await Promise.all([
    queryRows<SummaryAgg>(
      `SELECT COALESCE(SUM(deal_value), 0)::text AS total_value,
              COUNT(*)::text AS deal_count,
              COUNT(*) FILTER (WHERE at_risk = true)::text AS at_risk_count,
              COUNT(*) FILTER (WHERE stage = 'won')::text AS won_count
       FROM deals WHERE deleted_at IS NULL`
    ),
    queryRows<StageAgg>(
      `SELECT stage, COUNT(*)::text AS count, COALESCE(SUM(deal_value), 0)::text AS total_value
       FROM deals WHERE deleted_at IS NULL
       GROUP BY stage ORDER BY total_value DESC`
    ),
    queryRows<DeptAgg>(
      `SELECT department, COUNT(*)::text AS count, COALESCE(SUM(deal_value), 0)::text AS total_value
       FROM deals WHERE deleted_at IS NULL
       GROUP BY department ORDER BY total_value DESC`
    ),
  ]);

  const summary = summaryRows[0] ?? { total_value: "0", deal_count: "0", at_risk_count: "0", won_count: "0" };

  return {
    totalValue: formatCurrency(Number(summary.total_value)),
    rawTotalValue: Number(summary.total_value),
    dealCount: Number(summary.deal_count),
    byStage: stageRows.map((r) => ({
      stage: r.stage,
      count: Number(r.count),
      value: formatCurrency(Number(r.total_value)),
      rawValue: Number(r.total_value),
    })),
    byDepartment: deptRows.map((r) => ({
      dept: r.department,
      count: Number(r.count),
      value: formatCurrency(Number(r.total_value)),
      rawValue: Number(r.total_value),
    })),
    atRiskCount: Number(summary.at_risk_count),
    wonCount: Number(summary.won_count),
  };
}
