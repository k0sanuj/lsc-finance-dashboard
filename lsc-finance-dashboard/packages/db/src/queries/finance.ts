import "server-only";

import {
  dashboardOverview,
  monthlyCashFlow,
  sponsorBreakdown,
  upcomingPayments
} from "../seed-data";
import { queryRows } from "../query";
import {
  type CashFlowRow,
  type EntitySnapshotRow,
  type EntitySnapshotSource,
  type OverviewMetric,
  type PaymentRow,
  type PaymentRowSource,
  type SponsorRow,
  type SponsorRowSource,
  type TotalsAccumulator,
  formatCurrency,
  formatDateLabel,
  formatMonthLabel,
  getBackend
} from "./shared";

async function getDbOverviewMetrics(): Promise<OverviewMetric[]> {
  const companyMetrics = await queryRows<{
    company_code: string;
    recognized_revenue: string;
    approved_expenses: string;
    margin: string;
  }>(
    `select company_code, recognized_revenue, approved_expenses, margin
     from consolidated_company_metrics`
  );

  const totals = companyMetrics.reduce(
    (
      acc: TotalsAccumulator,
      row: { company_code: string; recognized_revenue: string; approved_expenses: string; margin: string }
    ) => {
      acc.revenue += Number(row.recognized_revenue);
      acc.expenses += Number(row.approved_expenses);
      acc.margin += Number(row.margin);
      return acc;
    },
    { revenue: 0, expenses: 0, margin: 0 }
  );

  const receivableRows = await queryRows<{ outstanding_amount: string }>(
    `select outstanding_amount from receivables_aging`
  );
  const receivables = receivableRows.reduce(
    (sum: number, row: { outstanding_amount: string }) => sum + Number(row.outstanding_amount),
    0
  );

  const payableRows = await queryRows<{ total_amount: string }>(
    `select total_amount from payments_due`
  );
  const payableTotal = payableRows.reduce(
    (sum: number, row: { total_amount: string }) => sum + Number(row.total_amount),
    0
  );

  const settledPayments = await queryRows<{ direction: "inflow" | "outflow"; amount: string }>(
    `select direction, amount
     from payments
     where payment_status = 'settled'`
  );

  let cash = 0;
  for (const payment of settledPayments) {
    cash += payment.direction === "inflow" ? Number(payment.amount) : -Number(payment.amount);
  }

  const sponsorCountRows = await queryRows<{ sponsor_count: string }>(
    `select count(*)::text as sponsor_count
     from sponsors_or_customers sc
     join companies c on c.id = sc.company_id
     where c.code = 'TBR'`
  );

  return [
    { label: "Total Revenue", value: formatCurrency(totals.revenue), scope: "LSC Consolidated" },
    { label: "Total Cost", value: formatCurrency(totals.expenses), scope: "LSC Consolidated" },
    { label: "Margin", value: formatCurrency(totals.margin), scope: "LSC Consolidated" },
    { label: "Cash", value: formatCurrency(cash), scope: "LSC Consolidated" },
    { label: "Receivables", value: formatCurrency(receivables), scope: "LSC Consolidated" },
    { label: "Upcoming Payments", value: formatCurrency(payableTotal), scope: "LSC Consolidated" },
    { label: "MRR", value: formatCurrency(0), scope: "FSP Placeholder" },
    {
      label: "Sponsor Count",
      value: sponsorCountRows[0]?.sponsor_count ?? "0",
      scope: "TBR"
    }
  ];
}

async function getDbMonthlyCashFlow(): Promise<CashFlowRow[]> {
  const rows = await queryRows<{
    month_start: string | null;
    cash_in: string;
    cash_out: string;
  }>(
    `select month_start, cash_in, cash_out
     from monthly_financial_summary
     where company_code = 'LSC'
       and month_start is not null
     order by month_start desc
     limit 6`
  );

  if (rows.length === 0) {
    return [...monthlyCashFlow];
  }

  return rows
    .slice()
    .reverse()
    .map((row: { month_start: string | null; cash_in: string; cash_out: string }) => {
      const cashIn = Number(row.cash_in);
      const cashOut = Number(row.cash_out);
      return {
        month: formatMonthLabel(row.month_start as string),
        cashIn: formatCurrency(cashIn),
        cashOut: formatCurrency(cashOut),
        net: formatCurrency(cashIn - cashOut)
      };
    });
}

async function getDbUpcomingPayments(): Promise<PaymentRow[]> {
  const rows = await queryRows<{
    invoice_number: string | null;
    due_date: string | null;
    total_amount: string;
    invoice_status: string;
    race_name: string | null;
    description: string | null;
  }>(
    `select invoice_number, due_date, total_amount, invoice_status, race_name, description
     from payments_due
     order by due_date nulls last
     limit 10`
  );

  if (rows.length === 0) {
    return [...upcomingPayments];
  }

  return rows.map((row: PaymentRowSource) => ({
    vendor: row.invoice_number || "Payable Invoice",
    race: row.race_name || "General",
    category: row.description || "Operational",
    dueDate: formatDateLabel(row.due_date),
    amount: formatCurrency(row.total_amount),
    status: row.invoice_status
  }));
}

async function getDbSponsorBreakdown(): Promise<SponsorRow[]> {
  const rows = await queryRows<{
    sponsor_name: string;
    total_contract_value: string;
    recognized_revenue: string;
    cash_collected: string;
  }>(
    `select sponsor_name, total_contract_value, recognized_revenue, cash_collected
     from tbr_sponsor_revenue_summary
     order by sponsor_name`
  );

  if (rows.length === 0) {
    return [...sponsorBreakdown];
  }

  return rows.map((row: SponsorRowSource) => ({
    name: row.sponsor_name,
    contractValue: formatCurrency(row.total_contract_value),
    recognizedRevenue: formatCurrency(row.recognized_revenue),
    cashCollected: formatCurrency(row.cash_collected)
  }));
}

export async function getOverviewMetrics() {
  if (getBackend() === "database") {
    return getDbOverviewMetrics();
  }

  return [...dashboardOverview];
}

export async function getEntitySnapshots() {
  if (getBackend() === "database") {
    const rows = await queryRows<EntitySnapshotSource>(
      `select
         c.code as company_code,
         c.name as company_name,
         coalesce(m.recognized_revenue, 0)::text as recognized_revenue,
         coalesce(m.approved_expenses, 0)::text as approved_expenses,
         coalesce(m.margin, 0)::text as margin
       from companies c
       left join consolidated_company_metrics m on m.company_code = c.code
       order by case c.code when 'LSC' then 1 when 'TBR' then 2 else 3 end`
    );

    if (rows.length > 0) {
      return rows.map((row) => ({
        code: row.company_code,
        name: row.company_name,
        revenue: formatCurrency(row.recognized_revenue),
        cost: formatCurrency(row.approved_expenses),
        margin: formatCurrency(row.margin),
        status: row.company_code === "FSP" ? "Schema ready" : "Live",
        note:
          row.company_code === "LSC"
            ? "Consolidated holding-company view across active entities."
            : row.company_code === "TBR"
              ? "Active operating entity with live canonical finance records."
              : "Future operating entity with structure in place and limited live data."
      })) satisfies EntitySnapshotRow[];
    }
  }

  return [
    {
      code: "LSC",
      name: "League Sports Co",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Live",
      note: "Consolidated holding-company view across active entities."
    },
    {
      code: "TBR",
      name: "Team Blue Rising",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Live",
      note: "Active operating entity with live canonical finance records."
    },
    {
      code: "FSP",
      name: "Future of Sports",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Schema ready",
      note: "Future operating entity with structure in place and limited live data."
    }
  ] satisfies EntitySnapshotRow[];
}

export async function getMonthlyCashFlow() {
  if (getBackend() === "database") {
    return getDbMonthlyCashFlow();
  }

  return [...monthlyCashFlow];
}

export async function getUpcomingPayments() {
  if (getBackend() === "database") {
    return getDbUpcomingPayments();
  }

  return [...upcomingPayments];
}

export async function getSponsorBreakdown() {
  if (getBackend() === "database") {
    return getDbSponsorBreakdown();
  }

  return [...sponsorBreakdown];
}
