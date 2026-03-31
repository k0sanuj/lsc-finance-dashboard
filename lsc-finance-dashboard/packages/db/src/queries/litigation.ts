import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type LitigationCostRow = {
  id: string;
  caseReference: string;
  caseName: string;
  costType: string;
  amount: string;
  incurredDate: string;
  description: string;
  companyCode: string;
};

export type LitigationReserveRow = {
  id: string;
  caseReference: string;
  caseName: string;
  estimatedExposure: string;
  reserveAmount: string;
  insuranceCoverage: string;
  netExposure: string;
  status: string;
  companyCode: string;
};

export type LitigationSummary = {
  totalCases: number;
  totalCostsToDate: number;
  totalExposure: number;
  totalReserves: number;
  totalInsurance: number;
};

export type ComplianceCostRow = {
  id: string;
  category: string;
  description: string;
  amount: string;
  jurisdiction: string;
  periodStart: string;
  periodEnd: string;
  companyCode: string;
};

export type SubsidyRow = {
  id: string;
  subsidyName: string;
  grantingBody: string;
  approvedAmount: string;
  disbursedAmount: string;
  remaining: string;
  status: string;
  conditions: string;
  nextDisbursement: string;
  companyCode: string;
};

export async function getLitigationCosts(companyCode?: string): Promise<LitigationCostRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    case_reference: string;
    case_name: string;
    cost_type: string;
    amount: string;
    incurred_date: string;
    description: string | null;
    company_code: string;
  }>(
    `select lc.id, lc.case_reference, lc.case_name, lc.cost_type,
            lc.amount, lc.incurred_date::text, lc.description,
            c.code::text as company_code
     from litigation_costs lc
     join companies c on c.id = lc.company_id
     ${where}
     order by lc.incurred_date desc`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    caseReference: r.case_reference,
    caseName: r.case_name,
    costType: r.cost_type.replace(/_/g, " "),
    amount: formatCurrency(r.amount),
    incurredDate: formatDateLabel(r.incurred_date),
    description: r.description ?? "",
    companyCode: r.company_code
  }));
}

export async function getLitigationReserves(companyCode?: string): Promise<LitigationReserveRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    case_reference: string;
    case_name: string;
    estimated_exposure: string;
    reserve_amount: string;
    insurance_coverage: string;
    status: string;
    company_code: string;
  }>(
    `select lr.id, lr.case_reference, lr.case_name,
            lr.estimated_exposure, lr.reserve_amount, lr.insurance_coverage,
            lr.status, c.code::text as company_code
     from litigation_reserves lr
     join companies c on c.id = lr.company_id
     ${where}
     order by lr.estimated_exposure desc`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    caseReference: r.case_reference,
    caseName: r.case_name,
    estimatedExposure: formatCurrency(r.estimated_exposure),
    reserveAmount: formatCurrency(r.reserve_amount),
    insuranceCoverage: formatCurrency(r.insurance_coverage),
    netExposure: formatCurrency(Number(r.estimated_exposure) - Number(r.reserve_amount) - Number(r.insurance_coverage)),
    status: r.status,
    companyCode: r.company_code
  }));
}

export async function getLitigationSummary(companyCode?: string): Promise<LitigationSummary> {
  if (getBackend() !== "database") {
    return { totalCases: 0, totalCostsToDate: 0, totalExposure: 0, totalReserves: 0, totalInsurance: 0 };
  }

  const where = companyCode ? "and c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const [costs, reserves] = await Promise.all([
    queryRows<{ total_costs: string; case_count: string }>(
      `select coalesce(sum(lc.amount), 0)::numeric(14,2)::text as total_costs,
              count(distinct lc.case_reference)::text as case_count
       from litigation_costs lc
       join companies c on c.id = lc.company_id
       where true ${where}`,
      params
    ),
    queryRows<{ total_exposure: string; total_reserves: string; total_insurance: string }>(
      `select coalesce(sum(lr.estimated_exposure), 0)::numeric(14,2)::text as total_exposure,
              coalesce(sum(lr.reserve_amount), 0)::numeric(14,2)::text as total_reserves,
              coalesce(sum(lr.insurance_coverage), 0)::numeric(14,2)::text as total_insurance
       from litigation_reserves lr
       join companies c on c.id = lr.company_id
       where lr.status = 'active' ${where}`,
      params
    )
  ]);

  return {
    totalCases: Number(costs[0]?.case_count ?? 0),
    totalCostsToDate: Number(costs[0]?.total_costs ?? 0),
    totalExposure: Number(reserves[0]?.total_exposure ?? 0),
    totalReserves: Number(reserves[0]?.total_reserves ?? 0),
    totalInsurance: Number(reserves[0]?.total_insurance ?? 0)
  };
}

export async function getComplianceCosts(companyCode?: string): Promise<ComplianceCostRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    cost_category: string;
    description: string | null;
    amount: string;
    jurisdiction: string | null;
    period_start: string | null;
    period_end: string | null;
    company_code: string;
  }>(
    `select cc.id, cc.cost_category, cc.description, cc.amount,
            cc.jurisdiction, cc.period_start::text, cc.period_end::text,
            c.code::text as company_code
     from compliance_costs cc
     join companies c on c.id = cc.company_id
     ${where}
     order by cc.created_at desc`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    category: r.cost_category,
    description: r.description ?? "",
    amount: formatCurrency(r.amount),
    jurisdiction: r.jurisdiction ?? "",
    periodStart: formatDateLabel(r.period_start),
    periodEnd: formatDateLabel(r.period_end),
    companyCode: r.company_code
  }));
}

export async function getSubsidies(companyCode?: string): Promise<SubsidyRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    subsidy_name: string;
    granting_body: string | null;
    approved_amount: string;
    disbursed_amount: string;
    status: string;
    conditions: string | null;
    next_disbursement_date: string | null;
    company_code: string;
  }>(
    `select sf.id, sf.subsidy_name, sf.granting_body,
            sf.approved_amount, sf.disbursed_amount, sf.status,
            sf.conditions, sf.next_disbursement_date::text,
            c.code::text as company_code
     from subsidies_finance sf
     join companies c on c.id = sf.company_id
     ${where}
     order by sf.approved_amount desc`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    subsidyName: r.subsidy_name,
    grantingBody: r.granting_body ?? "",
    approvedAmount: formatCurrency(r.approved_amount),
    disbursedAmount: formatCurrency(r.disbursed_amount),
    remaining: formatCurrency(Number(r.approved_amount) - Number(r.disbursed_amount)),
    status: r.status.replace(/_/g, " "),
    conditions: r.conditions ?? "",
    nextDisbursement: formatDateLabel(r.next_disbursement_date),
    companyCode: r.company_code
  }));
}
