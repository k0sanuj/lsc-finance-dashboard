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

const visibleEntityCodes = ["LSC", "TBR", "FSP", "XTZ"] as const;

function normalizeVisibleCompanyCode(value: string): (typeof visibleEntityCodes)[number] {
  const upper = value.toUpperCase();
  if (upper === "XTE") return "LSC";
  return visibleEntityCodes.includes(upper as (typeof visibleEntityCodes)[number])
    ? (upper as (typeof visibleEntityCodes)[number])
    : "LSC";
}

function entityDisplayName(code: string, fallbackName: string) {
  switch (normalizeVisibleCompanyCode(code)) {
    case "LSC":
      return "LSC / XTZ Esports Tech Ltd (Dubai)";
    case "TBR":
      return "Team Blue Rising";
    case "FSP":
      return "Future of Sports";
    case "XTZ":
      return "XTZ India";
    default:
      return fallbackName;
  }
}

function entityStatus(code: string) {
  switch (normalizeVisibleCompanyCode(code)) {
    case "FSP":
      return "Portfolio";
    case "LSC":
      return "Consolidated";
    default:
      return "Live";
  }
}

function entityNote(code: string) {
  switch (normalizeVisibleCompanyCode(code)) {
    case "LSC":
      return "Holding-company and consolidated Dubai view, including mapped legacy Dubai records.";
    case "TBR":
      return "Active operating entity with race, expense, invoice, and commercial workflows.";
    case "FSP":
      return "Sports-asset portfolio with scenario P&L, sponsorship, and media modules.";
    case "XTZ":
      return "India operating workspace for payroll, vendors, invoices, and payout support.";
  }
}

async function getDbOverviewMetrics(): Promise<OverviewMetric[]> {
  const companyMetrics = await queryRows<{
    company_code: string;
    recognized_revenue: string;
    approved_expenses: string;
    margin: string;
  }>(
    `select
       case when company_code::text = 'XTE' then 'LSC' else company_code::text end as company_code,
       coalesce(sum(recognized_revenue), 0)::numeric(14,2)::text as recognized_revenue,
       coalesce(sum(approved_expenses), 0)::numeric(14,2)::text as approved_expenses,
       coalesce(sum(margin), 0)::numeric(14,2)::text as margin
     from consolidated_company_metrics
     where company_code::text in ('LSC', 'TBR', 'FSP', 'XTZ', 'XTE')
     group by 1`
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
    `select
       month_start,
       coalesce(sum(cash_in), 0)::numeric(14,2)::text as cash_in,
       coalesce(sum(cash_out), 0)::numeric(14,2)::text as cash_out
     from monthly_financial_summary
     where company_code::text in ('LSC', 'XTE')
       and month_start is not null
     group by month_start
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
      `with requested(company_code, sort_order) as (
         values ('LSC', 1), ('TBR', 2), ('FSP', 3), ('XTZ', 4)
       ),
       visible_companies as (
         select
           r.company_code,
           coalesce(
             min(c.name) filter (where c.code::text != 'XTE'),
             min(c.name),
             r.company_code
           ) as company_name,
           r.sort_order
         from requested r
         left join companies c on case when c.code::text = 'XTE' then 'LSC' else c.code::text end = r.company_code
         group by r.company_code, r.sort_order
       ),
       visible_metrics as (
         select
           case when company_code::text = 'XTE' then 'LSC' else company_code::text end as company_code,
           coalesce(sum(recognized_revenue), 0)::numeric(14,2)::text as recognized_revenue,
           coalesce(sum(approved_expenses), 0)::numeric(14,2)::text as approved_expenses,
           coalesce(sum(margin), 0)::numeric(14,2)::text as margin
         from consolidated_company_metrics
         where company_code::text in ('LSC', 'TBR', 'FSP', 'XTZ', 'XTE')
         group by 1
       )
       select
         vc.company_code,
         vc.company_name,
         coalesce(vm.recognized_revenue, '0') as recognized_revenue,
         coalesce(vm.approved_expenses, '0') as approved_expenses,
         coalesce(vm.margin, '0') as margin
       from visible_companies vc
       left join visible_metrics vm on vm.company_code = vc.company_code
       order by vc.sort_order`
    );

    if (rows.length > 0) {
      return rows.map((row) => ({
        code: normalizeVisibleCompanyCode(row.company_code),
        name: entityDisplayName(row.company_code, row.company_name),
        revenue: formatCurrency(row.recognized_revenue),
        cost: formatCurrency(row.approved_expenses),
        margin: formatCurrency(row.margin),
        status: entityStatus(row.company_code),
        note: entityNote(row.company_code)
      })) satisfies EntitySnapshotRow[];
    }
  }

  return [
    {
      code: "LSC",
      name: "LSC / XTZ Esports Tech Ltd (Dubai)",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Consolidated",
      note: "Holding-company and consolidated Dubai view, including mapped legacy Dubai records."
    },
    {
      code: "TBR",
      name: "Team Blue Rising",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Live",
      note: "Active operating entity with race, expense, invoice, and commercial workflows."
    },
    {
      code: "FSP",
      name: "Future of Sports",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Portfolio",
      note: "Sports-asset portfolio with scenario P&L, sponsorship, and media modules."
    },
    {
      code: "XTZ",
      name: "XTZ India",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Live",
      note: "India operating workspace for payroll, vendors, invoices, and payout support."
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
