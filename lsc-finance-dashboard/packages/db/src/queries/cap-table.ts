import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type CapTableEntryRow = {
  id: string;
  holderName: string;
  holderType: string;
  shareClass: string;
  sharesHeld: number;
  sharesVested: number;
  exercisePrice: string;
  ownershipPct: number;
  vestingStart: string;
  vestingEnd: string;
  agreementReference: string;
};

export type CapTableEventRow = {
  id: string;
  eventType: string;
  eventDate: string;
  sharesAffected: number;
  pricePerShare: string;
  fromHolder: string;
  toHolder: string;
  roundName: string;
  notes: string;
};

export type InvestorRow = {
  id: string;
  name: string;
  investorType: string;
  investmentAmount: string;
  investmentDate: string;
  shareClass: string;
  sharesHeld: number;
  ownershipPct: number;
  roundName: string;
};

export type CapTableSummary = {
  totalShares: number;
  totalHolders: number;
  shareClassBreakdown: { shareClass: string; shares: number; pct: number }[];
};

export async function getCapTableEntries(companyCode: string): Promise<CapTableEntryRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    holder_name: string;
    holder_type: string;
    share_class: string;
    shares_held: string;
    shares_vested: string;
    exercise_price: string;
    ownership_pct: string | null;
    vesting_start_date: string | null;
    vesting_end_date: string | null;
    agreement_reference: string | null;
  }>(
    `select cte.id, cte.holder_name, cte.holder_type, cte.share_class,
            cte.shares_held::text, cte.shares_vested::text, cte.exercise_price::text,
            cts.ownership_pct::text,
            cte.vesting_start_date::text, cte.vesting_end_date::text,
            cte.agreement_reference
     from cap_table_entries cte
     join companies c on c.id = cte.company_id
     left join cap_table_summary cts on cts.company_id = cte.company_id and cts.holder_name = cte.holder_name
     where c.code = $1::company_code
     order by cte.shares_held desc`,
    [companyCode]
  );

  return rows.map((r) => ({
    id: r.id,
    holderName: r.holder_name,
    holderType: r.holder_type,
    shareClass: r.share_class.replace(/_/g, " "),
    sharesHeld: Number(r.shares_held),
    sharesVested: Number(r.shares_vested),
    exercisePrice: formatCurrency(r.exercise_price),
    ownershipPct: Number(r.ownership_pct ?? 0),
    vestingStart: formatDateLabel(r.vesting_start_date),
    vestingEnd: formatDateLabel(r.vesting_end_date),
    agreementReference: r.agreement_reference ?? ""
  }));
}

export async function getCapTableEvents(companyCode: string): Promise<CapTableEventRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    event_type: string;
    event_date: string;
    shares_affected: string;
    price_per_share: string | null;
    from_holder: string | null;
    to_holder: string | null;
    round_name: string | null;
    notes: string | null;
  }>(
    `select cte.id, cte.event_type, cte.event_date::text,
            cte.shares_affected::text, cte.price_per_share::text,
            cte.from_holder, cte.to_holder, cte.round_name, cte.notes
     from cap_table_events cte
     join companies c on c.id = cte.company_id
     where c.code = $1::company_code
     order by cte.event_date desc`,
    [companyCode]
  );

  return rows.map((r) => ({
    id: r.id,
    eventType: r.event_type.replace(/_/g, " "),
    eventDate: formatDateLabel(r.event_date),
    sharesAffected: Number(r.shares_affected),
    pricePerShare: r.price_per_share ? formatCurrency(r.price_per_share) : "",
    fromHolder: r.from_holder ?? "",
    toHolder: r.to_holder ?? "",
    roundName: r.round_name ?? "",
    notes: r.notes ?? ""
  }));
}

export async function getInvestors(companyCode: string): Promise<InvestorRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    name: string;
    investor_type: string;
    investment_amount: string;
    investment_date: string | null;
    share_class: string;
    shares_held: string;
    ownership_percentage: string;
    round_name: string | null;
  }>(
    `select i.id, i.name, i.investor_type, i.investment_amount,
            i.investment_date::text, i.share_class, i.shares_held::text,
            i.ownership_percentage::text, i.round_name
     from investors i
     join companies c on c.id = i.company_id
     where c.code = $1::company_code
     order by i.investment_amount desc`,
    [companyCode]
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    investorType: r.investor_type,
    investmentAmount: formatCurrency(r.investment_amount),
    investmentDate: formatDateLabel(r.investment_date),
    shareClass: r.share_class.replace(/_/g, " "),
    sharesHeld: Number(r.shares_held),
    ownershipPct: Number(r.ownership_percentage),
    roundName: r.round_name ?? ""
  }));
}

export async function getCapTableSummary(companyCode: string): Promise<CapTableSummary> {
  if (getBackend() !== "database") {
    return { totalShares: 0, totalHolders: 0, shareClassBreakdown: [] };
  }

  const [totals, breakdown] = await Promise.all([
    queryRows<{ total_shares: string; total_holders: string }>(
      `select coalesce(sum(shares_held), 0)::text as total_shares,
              count(*)::text as total_holders
       from cap_table_entries cte
       join companies c on c.id = cte.company_id
       where c.code = $1::company_code`,
      [companyCode]
    ),
    queryRows<{ share_class: string; total_shares: string; pct: string }>(
      `select share_class::text,
              sum(shares_held)::text as total_shares,
              round(sum(shares_held)::numeric / nullif(
                (select sum(cte2.shares_held) from cap_table_entries cte2
                 join companies c2 on c2.id = cte2.company_id where c2.code = $1::company_code), 0
              ) * 100, 2)::text as pct
       from cap_table_entries cte
       join companies c on c.id = cte.company_id
       where c.code = $1::company_code
       group by share_class
       order by total_shares desc`,
      [companyCode]
    )
  ]);

  return {
    totalShares: Number(totals[0]?.total_shares ?? 0),
    totalHolders: Number(totals[0]?.total_holders ?? 0),
    shareClassBreakdown: breakdown.map((r) => ({
      shareClass: r.share_class.replace(/_/g, " "),
      shares: Number(r.total_shares),
      pct: Number(r.pct)
    }))
  };
}
