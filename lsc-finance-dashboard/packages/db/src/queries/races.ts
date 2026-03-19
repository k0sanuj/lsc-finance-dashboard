import "server-only";

import { queryRows } from "../query";
import {
  formatCurrency,
  formatDateLabel,
  getBackend,
  getSeasonLabel,
  inferRaceGeography
} from "./shared";

export type SeasonSummaryRow = {
  seasonYear: number;
  seasonLabel: string;
  raceCount: string;
  revenue: string;
  cost: string;
  openPayables: string;
  status: string;
};

export type RaceCardRow = {
  id: string;
  name: string;
  location: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  seasonYear: number;
  eventDate: string;
  eventInvoices: string;
  reimbursements: string;
  totalCost: string;
  recognizedRevenue: string;
  openPayables: string;
  openInvoiceCount: string;
  submittedExpenses: string;
  approvedExpenses: string;
  pendingReceipts: string;
  status: string;
};

export type SeasonSummarySource = {
  season_year: number;
  race_count: string;
  revenue_total: string;
  cost_total: string;
  open_payables: string;
};

export type RaceCardSource = {
  id: string;
  race_name: string;
  location: string | null;
  season_year: number;
  event_start_date: string | null;
  event_invoice_total: string;
  reimbursement_total: string;
  recognized_revenue: string;
  open_payables: string;
  open_invoice_count: string;
  submitted_expense_total: string;
  approved_expense_total: string;
  pending_receipt_count: string;
};

export async function getTbrSeasonSummaries() {
  if (getBackend() === "database") {
    const rows = await queryRows<SeasonSummarySource>(
      `with season_races as (
         select re.season_year, count(*)::text as race_count
         from race_events re
         join companies c on c.id = re.company_id
         where c.code = 'TBR'::company_code
           and re.season_year is not null
         group by re.season_year
       ),
       season_revenue as (
         select extract(year from rr.recognition_date)::int as season_year,
                coalesce(sum(rr.amount), 0)::text as revenue_total
         from revenue_records rr
         join companies c on c.id = rr.company_id
         where c.code = 'TBR'::company_code
         group by extract(year from rr.recognition_date)
       ),
       season_cost as (
         select re.season_year,
                coalesce(sum(e.amount), 0)::text as cost_total
         from expenses e
         join race_events re on re.id = e.race_event_id
         join companies c on c.id = e.company_id
         where c.code = 'TBR'::company_code
           and e.expense_status in ('approved', 'paid')
           and re.season_year is not null
         group by re.season_year
       ),
       season_payables as (
         select re.season_year,
                coalesce(sum(i.total_amount), 0)::text as open_payables
         from invoices i
         join race_events re on re.id = i.race_event_id
         join companies c on c.id = i.company_id
         where c.code = 'TBR'::company_code
           and i.direction = 'payable'
           and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
           and re.season_year is not null
         group by re.season_year
       )
       select
         sr.season_year,
         sr.race_count,
         coalesce(srev.revenue_total, '0') as revenue_total,
         coalesce(sc.cost_total, '0') as cost_total,
         coalesce(sp.open_payables, '0') as open_payables
       from season_races sr
       left join season_revenue srev on srev.season_year = sr.season_year
       left join season_cost sc on sc.season_year = sr.season_year
       left join season_payables sp on sp.season_year = sr.season_year
       order by sr.season_year`
    );

    if (rows.length > 0) {
      const seasonYears = rows.map((row) => row.season_year).sort((a, b) => a - b);
      return rows.map((row) => ({
        seasonYear: row.season_year,
        seasonLabel: getSeasonLabel(row.season_year, seasonYears),
        raceCount: row.race_count,
        revenue: formatCurrency(row.revenue_total),
        cost: formatCurrency(row.cost_total),
        openPayables: formatCurrency(row.open_payables),
        status: row.season_year === Math.max(...seasonYears) ? "In progress" : "Completed"
      })) satisfies SeasonSummaryRow[];
    }
  }

  return [] satisfies SeasonSummaryRow[];
}

export async function getTbrRaceCards(seasonYear: number) {
  if (getBackend() === "database") {
    const rows = await queryRows<RaceCardSource>(
      `select
         re.id,
         re.name as race_name,
         re.location,
         re.season_year,
         re.event_start_date::text,
         coalesce((
           select sum(i.total_amount)
           from invoices i
           where i.race_event_id = re.id
             and i.direction = 'payable'
         ), 0)::text as event_invoice_total,
         coalesce((
           select sum(e.amount)
           from expenses e
           where e.race_event_id = re.id
             and e.expense_status in ('approved', 'paid')
         ), 0)::text as reimbursement_total,
         coalesce((
           select sum(rr.amount)
           from revenue_records rr
           where rr.race_event_id = re.id
         ), 0)::text as recognized_revenue,
         coalesce((
           select sum(i.total_amount)
           from invoices i
           where i.race_event_id = re.id
             and i.direction = 'payable'
             and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
         ), 0)::text as open_payables,
         (
           select count(*)::text
           from invoices i
           where i.race_event_id = re.id
             and i.direction = 'payable'
             and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
         ) as open_invoice_count,
         coalesce((
           select sum(esi.amount)
           from expense_submissions es
           join expense_submission_items esi on esi.submission_id = es.id
           where es.race_event_id = re.id
         ), 0)::text as submitted_expense_total,
         coalesce((
           select sum(esi.amount)
           from expense_submissions es
           join expense_submission_items esi on esi.submission_id = es.id
           where es.race_event_id = re.id
             and es.submission_status in ('approved', 'posted')
         ), 0)::text as approved_expense_total,
         (
           select count(*)::text
           from document_intake_events die
           where die.workflow_context like ('tbr-race:' || re.id::text || '%')
             and die.intake_status in ('analyzed', 'reused')
         ) as pending_receipt_count
       from race_events re
       join companies c on c.id = re.company_id
       where c.code = 'TBR'::company_code
         and re.season_year = $1
       order by re.event_start_date nulls last, re.name`,
      [seasonYear]
    );

    return rows.map((row) => {
      const eventInvoiceTotal = Number(row.event_invoice_total);
      const reimbursementTotal = Number(row.reimbursement_total);
      const totalCost = eventInvoiceTotal + reimbursementTotal;
      const geography = inferRaceGeography(row.race_name, row.location);

      return {
        id: row.id,
        name: row.race_name,
        location: row.location ?? "Location pending",
        countryCode: geography.countryCode,
        countryName: geography.countryName,
        countryFlag: geography.countryFlag,
        seasonYear: row.season_year,
        eventDate: formatDateLabel(row.event_start_date),
        eventInvoices: formatCurrency(row.event_invoice_total),
        reimbursements: formatCurrency(row.reimbursement_total),
        totalCost: formatCurrency(totalCost),
        recognizedRevenue: formatCurrency(row.recognized_revenue),
        openPayables: formatCurrency(row.open_payables),
        openInvoiceCount: row.open_invoice_count,
        submittedExpenses: formatCurrency(row.submitted_expense_total),
        approvedExpenses: formatCurrency(row.approved_expense_total),
        pendingReceipts: row.pending_receipt_count,
        status: totalCost > 0 ? "Live finance data" : "Schedule only"
      };
    }) satisfies RaceCardRow[];
  }

  return [] satisfies RaceCardRow[];
}

export async function getTbrRaceCardById(raceId: string) {
  if (getBackend() !== "database") {
    return null;
  }

  const rows = await queryRows<RaceCardSource>(
    `select
       re.id,
       re.name as race_name,
       re.location,
       re.season_year,
       re.event_start_date::text,
       coalesce((
         select sum(i.total_amount)
         from invoices i
         where i.race_event_id = re.id
           and i.direction = 'payable'
       ), 0)::text as event_invoice_total,
       coalesce((
         select sum(e.amount)
         from expenses e
         where e.race_event_id = re.id
           and e.expense_status in ('approved', 'paid')
       ), 0)::text as reimbursement_total,
       coalesce((
         select sum(rr.amount)
         from revenue_records rr
         where rr.race_event_id = re.id
       ), 0)::text as recognized_revenue,
       coalesce((
         select sum(i.total_amount)
         from invoices i
         where i.race_event_id = re.id
           and i.direction = 'payable'
           and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
       ), 0)::text as open_payables,
       (
         select count(*)::text
         from invoices i
         where i.race_event_id = re.id
           and i.direction = 'payable'
           and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
       ) as open_invoice_count,
       coalesce((
         select sum(esi.amount)
         from expense_submissions es
         join expense_submission_items esi on esi.submission_id = es.id
         where es.race_event_id = re.id
       ), 0)::text as submitted_expense_total,
       coalesce((
         select sum(esi.amount)
         from expense_submissions es
         join expense_submission_items esi on esi.submission_id = es.id
         where es.race_event_id = re.id
           and es.submission_status in ('approved', 'posted')
       ), 0)::text as approved_expense_total,
       (
         select count(*)::text
         from document_intake_events die
         where die.workflow_context like ('tbr-race:' || re.id::text || '%')
           and die.intake_status in ('analyzed', 'reused')
       ) as pending_receipt_count
     from race_events re
     join companies c on c.id = re.company_id
     where c.code = 'TBR'::company_code
       and re.id = $1
     limit 1`,
    [raceId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  const geography = inferRaceGeography(row.race_name, row.location);
  const eventInvoiceTotal = Number(row.event_invoice_total);
  const reimbursementTotal = Number(row.reimbursement_total);
  const totalCost = eventInvoiceTotal + reimbursementTotal;

  return {
    id: row.id,
    name: row.race_name,
    location: row.location ?? "Location pending",
    countryCode: geography.countryCode,
    countryName: geography.countryName,
    countryFlag: geography.countryFlag,
    seasonYear: row.season_year,
    eventDate: formatDateLabel(row.event_start_date),
    eventInvoices: formatCurrency(row.event_invoice_total),
    reimbursements: formatCurrency(row.reimbursement_total),
    totalCost: formatCurrency(totalCost),
    recognizedRevenue: formatCurrency(row.recognized_revenue),
    openPayables: formatCurrency(row.open_payables),
    openInvoiceCount: row.open_invoice_count,
    submittedExpenses: formatCurrency(row.submitted_expense_total),
    approvedExpenses: formatCurrency(row.approved_expense_total),
    pendingReceipts: row.pending_receipt_count,
    status: totalCost > 0 ? "Live finance data" : "Schedule only"
  } satisfies RaceCardRow;
}
