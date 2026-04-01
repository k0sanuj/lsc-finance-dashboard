import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type ArenaFinancialRow = {
  id: string;
  partnerName: string;
  agreementType: string;
  revenue: string;
  costOfServices: string;
  netMargin: string;
  participantCount: number;
  periodStart: string;
  periodEnd: string;
  companyCode: string;
};

export type AdsRevenueRow = {
  id: string;
  adPartner: string;
  revenueAmount: string;
  paymentAmount: string;
  netRevenue: string;
  impressions: number;
  clicks: number;
  periodStart: string;
  periodEnd: string;
  companyCode: string;
};

export type ArenaAdsSummary = {
  totalArenaRevenue: number;
  totalArenaCost: number;
  totalAdRevenue: number;
  totalAdPayments: number;
  totalParticipants: number;
  arenaPartners: number;
  adPartners: number;
};

export async function getArenaFinancials(companyCode?: string): Promise<ArenaFinancialRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    partner_name: string;
    agreement_type: string;
    revenue: string;
    cost_of_services: string;
    participant_count: string;
    period_start: string | null;
    period_end: string | null;
    company_code: string;
  }>(
    `select af.id, af.partner_name, af.agreement_type,
            af.revenue, af.cost_of_services, af.participant_count::text,
            af.period_start::text, af.period_end::text,
            c.code::text as company_code
     from arena_financials af
     join companies c on c.id = af.company_id
     ${where}
     order by af.period_start desc nulls last`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    partnerName: r.partner_name,
    agreementType: r.agreement_type.replace(/_/g, " "),
    revenue: formatCurrency(r.revenue),
    costOfServices: formatCurrency(r.cost_of_services),
    netMargin: formatCurrency(Number(r.revenue) - Number(r.cost_of_services)),
    participantCount: Number(r.participant_count),
    periodStart: formatDateLabel(r.period_start),
    periodEnd: formatDateLabel(r.period_end),
    companyCode: r.company_code
  }));
}

export async function getAdsRevenue(companyCode?: string): Promise<AdsRevenueRow[]> {
  if (getBackend() !== "database") return [];

  const where = companyCode ? "where c.code = $1::company_code" : "";
  const params = companyCode ? [companyCode] : [];

  const rows = await queryRows<{
    id: string;
    ad_partner: string;
    revenue_amount: string;
    payment_amount: string;
    impressions: string | null;
    clicks: string | null;
    period_start: string | null;
    period_end: string | null;
    company_code: string;
  }>(
    `select ar.id, ar.ad_partner, ar.revenue_amount, ar.payment_amount,
            ar.impressions::text, ar.clicks::text,
            ar.period_start::text, ar.period_end::text,
            c.code::text as company_code
     from ads_revenue ar
     join companies c on c.id = ar.company_id
     ${where}
     order by ar.period_start desc nulls last`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    adPartner: r.ad_partner,
    revenueAmount: formatCurrency(r.revenue_amount),
    paymentAmount: formatCurrency(r.payment_amount),
    netRevenue: formatCurrency(Number(r.revenue_amount) - Number(r.payment_amount)),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    periodStart: formatDateLabel(r.period_start),
    periodEnd: formatDateLabel(r.period_end),
    companyCode: r.company_code
  }));
}

export async function getArenaAdsSummary(): Promise<ArenaAdsSummary> {
  if (getBackend() !== "database") {
    return { totalArenaRevenue: 0, totalArenaCost: 0, totalAdRevenue: 0, totalAdPayments: 0, totalParticipants: 0, arenaPartners: 0, adPartners: 0 };
  }

  const [arena, ads] = await Promise.all([
    queryRows<{ total_revenue: string; total_cost: string; total_participants: string; partner_count: string }>(
      `select coalesce(sum(revenue), 0)::numeric(14,2)::text as total_revenue,
              coalesce(sum(cost_of_services), 0)::numeric(14,2)::text as total_cost,
              coalesce(sum(participant_count), 0)::text as total_participants,
              count(distinct partner_name)::text as partner_count
       from arena_financials`
    ),
    queryRows<{ total_revenue: string; total_payments: string; partner_count: string }>(
      `select coalesce(sum(revenue_amount), 0)::numeric(14,2)::text as total_revenue,
              coalesce(sum(payment_amount), 0)::numeric(14,2)::text as total_payments,
              count(distinct ad_partner)::text as partner_count
       from ads_revenue`
    )
  ]);

  return {
    totalArenaRevenue: Number(arena[0]?.total_revenue ?? 0),
    totalArenaCost: Number(arena[0]?.total_cost ?? 0),
    totalAdRevenue: Number(ads[0]?.total_revenue ?? 0),
    totalAdPayments: Number(ads[0]?.total_payments ?? 0),
    totalParticipants: Number(arena[0]?.total_participants ?? 0),
    arenaPartners: Number(arena[0]?.partner_count ?? 0),
    adPartners: Number(ads[0]?.partner_count ?? 0)
  };
}
