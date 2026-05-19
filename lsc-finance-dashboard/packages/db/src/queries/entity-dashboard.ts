import "server-only";

import { getAiIntakeQueue } from "./ai-intake";
import { getFspPnlSummaries, getSportModuleCompleteness } from "./fsp-modules";
import { getFspSports } from "./employees";
import { getGigPayoutSummary, getGigWorkers } from "./gig-workers";
import { getOverviewAnalytics, getOverviewMetrics } from "./finance";
import {
  getTbrE1AccountingDashboard,
  getTbrOperatingExpenseDashboard,
  getTbrOverallPnlDashboard
} from "./tbr-finance";
import { getXtzInvoiceAccrualSummary, getXtzInvoiceSummary } from "./xtz-invoices";
import { formatCurrency } from "./shared";

export type EntityDashboardCode = "LSC" | "TBR" | "FSP" | "XTZ";
export type EntityDashboardTone = "brand" | "good" | "amber" | "ruby" | "iris" | "slate";

export type EntityDashboardMetric = {
  label: string;
  value: string | number;
  helper: string;
  amountUsd: number;
  tone: EntityDashboardTone;
};

export type EntityDashboardPoint = {
  name: string;
  value: number;
  displayValue: string;
  sublabel?: string;
  tone: EntityDashboardTone;
  revenue?: number;
  cost?: number;
  margin?: number;
  cashIn?: number;
  cashOut?: number;
  net?: number;
  paid?: number;
  due?: number;
  committed?: number;
  count?: number;
};

export type EntityDashboardInsight = {
  title: string;
  summary: string;
  tone: EntityDashboardTone;
};

export type EntityDashboardLink = {
  label: string;
  href: string;
  helper: string;
};

export type EntityDashboard = {
  entityCode: EntityDashboardCode;
  title: string;
  subtitle: string;
  policyNote: string;
  metrics: EntityDashboardMetric[];
  trend: EntityDashboardPoint[];
  primaryMix: EntityDashboardPoint[];
  secondaryMix: EntityDashboardPoint[];
  statusMix: EntityDashboardPoint[];
  insights: EntityDashboardInsight[];
  links: EntityDashboardLink[];
};

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCurrency(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function metricValue(metrics: Awaited<ReturnType<typeof getOverviewMetrics>>, label: string) {
  return metrics.find((metric) => metric.label === label)?.value ?? "$0";
}

function metricAmount(metrics: Awaited<ReturnType<typeof getOverviewMetrics>>, label: string) {
  return parseCurrency(metricValue(metrics, label));
}

function toneForAmount(value: number, positiveTone: EntityDashboardTone = "good") {
  if (value > 0) return positiveTone;
  if (value < 0) return "ruby";
  return "slate";
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

async function getLscEntityDashboard(): Promise<EntityDashboard> {
  const [metrics, analytics, xtzAccrual] = await Promise.all([
    getOverviewMetrics(),
    getOverviewAnalytics(),
    getXtzInvoiceAccrualSummary()
  ]);
  const revenue = metricAmount(metrics, "Total Revenue");
  const cost = metricAmount(metrics, "Total Cost");
  const margin = metricAmount(metrics, "Margin");
  const receivables = metricAmount(metrics, "Receivables");
  const upcoming = metricAmount(metrics, "Upcoming Payments");
  const lscInvoiceExposure = xtzAccrual.recipientRows.find((row) => row.companyCode === "LSC");

  return {
    entityCode: "LSC",
    title: "LSC command center",
    subtitle: "Consolidated holding view excluding FSP scenario planning values.",
    policyNote: "FSP sport scenarios stay inside FSP dashboards until explicitly promoted to approved actual consolidation data.",
    metrics: [
      { label: "Revenue", value: formatCurrency(revenue), helper: "Approved consolidated revenue", amountUsd: revenue, tone: "good" },
      { label: "Cost", value: formatCurrency(cost), helper: "Approved cost and paid intercompany invoices", amountUsd: cost, tone: "ruby" },
      { label: "Margin", value: formatCurrency(margin), helper: "Revenue less approved cost", amountUsd: margin, tone: toneForAmount(margin) },
      { label: "XTZ committed", value: lscInvoiceExposure?.committed ?? "$0", helper: "Generated/sent invoices owed by LSC", amountUsd: lscInvoiceExposure?.committedUsd ?? 0, tone: "amber" },
      { label: "Receivables", value: formatCurrency(receivables), helper: "Open customer/sponsor invoices", amountUsd: receivables, tone: "iris" },
      { label: "Upcoming", value: formatCurrency(upcoming), helper: "Open vendor payable timeline", amountUsd: upcoming, tone: "brand" },
    ],
    trend: analytics.trend.map((row) => ({
      name: row.month,
      value: row.marginUsd,
      displayValue: row.margin,
      revenue: row.revenueUsd,
      cost: row.costUsd,
      margin: row.marginUsd,
      cashIn: row.cashInUsd,
      cashOut: row.cashOutUsd,
      net: row.netCashUsd,
      tone: toneForAmount(row.marginUsd)
    })),
    primaryMix: analytics.entities.map((row) => ({
      name: row.label,
      value: Math.abs(row.marginUsd),
      displayValue: row.margin,
      sublabel: `Revenue ${row.revenue} · Cost ${row.cost}`,
      revenue: row.revenueUsd,
      cost: row.costUsd,
      margin: row.marginUsd,
      tone: toneForAmount(row.marginUsd)
    })),
    secondaryMix: xtzAccrual.recipientRows.map((row) => ({
      name: row.companyCode,
      value: row.committedUsd + row.paidUsd,
      displayValue: formatCurrency(row.committedUsd + row.paidUsd),
      sublabel: `Committed ${row.committed} · Paid ${row.paid}`,
      committed: row.committedUsd,
      paid: row.paidUsd,
      tone: row.committedUsd > 0 ? "amber" : "good"
    })),
    statusMix: [
      { name: "Receivables", value: receivables, displayValue: formatCurrency(receivables), tone: "iris" },
      { name: "Upcoming", value: upcoming, displayValue: formatCurrency(upcoming), tone: "amber" },
      { name: "XTZ committed", value: lscInvoiceExposure?.committedUsd ?? 0, displayValue: lscInvoiceExposure?.committed ?? "$0", tone: "brand" },
      { name: "XTZ paid", value: lscInvoiceExposure?.paidUsd ?? 0, displayValue: lscInvoiceExposure?.paid ?? "$0", tone: "good" }
    ],
    insights: [
      {
        title: "XTZ invoices now separate committed from paid cost",
        summary: `${lscInvoiceExposure?.committed ?? "$0"} is committed but not cash cost until the invoice is marked paid.`,
        tone: "amber"
      },
      {
        title: "FSP is visible but not consolidated into LSC scenario totals",
        summary: "Sport portfolio numbers are reported inside FSP so Squash planning data cannot distort LSC holding metrics.",
        tone: "brand"
      },
      {
        title: margin >= 0 ? "Holding margin remains positive" : "Holding margin needs review",
        summary: `${formatCurrency(margin)} margin is derived from approved backend finance views.`,
        tone: toneForAmount(margin)
      }
    ],
    links: [
      { label: "Costs", href: "/costs/LSC", helper: "Approved and committed cost control" },
      { label: "Payments", href: "/payments/LSC", helper: "Payables and cash movement" },
      { label: "Documents", href: "/documents/LSC", helper: "Source-backed support" },
      { label: "XTZ invoices", href: "/payroll-invoices", helper: "Intercompany invoice register" }
    ]
  };
}

async function getTbrEntityDashboard(): Promise<EntityDashboard> {
  const [overall, e1, operating] = await Promise.all([
    getTbrOverallPnlDashboard(),
    getTbrE1AccountingDashboard(),
    getTbrOperatingExpenseDashboard()
  ]);
  const selected = overall.selected ?? overall.rows.at(-1) ?? null;
  const e1Summary = e1.summary;
  const operatingSummary = operating.summary;
  const totalRevenue = overall.rows.reduce((sum, row) => sum + row.totalRevenueUsd, 0);
  const totalCost = overall.rows.reduce((sum, row) => sum + row.totalCostUsd, 0);
  const totalEbitda = overall.rows.reduce((sum, row) => sum + row.ebitdaUsd, 0);

  return {
    entityCode: "TBR",
    title: "TBR finance command center",
    subtitle: "Season P&L, operating baseline, E1 accounting, and race finance control.",
    policyNote: "TBR overview uses TBR season finance views, not generic expense rows, so operating baseline and E1 costs are visible.",
    metrics: [
      { label: "Revenue", value: formatCurrency(totalRevenue), helper: "All loaded seasons", amountUsd: totalRevenue, tone: "good" },
      { label: "Cost", value: formatCurrency(totalCost), helper: "Operating baseline + E1 variance/incremental", amountUsd: totalCost, tone: "ruby" },
      { label: "EBITDA", value: formatCurrency(totalEbitda), helper: "Backend-derived season total", amountUsd: totalEbitda, tone: toneForAmount(totalEbitda) },
      { label: "E1 due/open", value: e1Summary?.dueAmount ?? "$0", helper: "Open E1 ledger amount", amountUsd: e1Summary?.dueAmountUsd ?? 0, tone: "amber" },
      { label: "E1 paid", value: e1Summary?.paidAmount ?? "$0", helper: "Rows marked paid", amountUsd: e1Summary?.paidAmountUsd ?? 0, tone: "good" },
      { label: "Baseline", value: operatingSummary?.totalOperatingExpense ?? "$0", helper: operatingSummary?.seasonLabel ?? "Selected season", amountUsd: operatingSummary?.totalOperatingExpenseUsd ?? 0, tone: "brand" },
    ],
    trend: overall.rows.map((row) => ({
      name: row.seasonLabel,
      value: row.ebitdaUsd,
      displayValue: row.ebitda,
      revenue: row.totalRevenueUsd,
      cost: row.totalCostUsd,
      margin: row.ebitdaUsd,
      sublabel: `Revenue ${row.totalRevenue} · Cost ${row.totalCost}`,
      tone: toneForAmount(row.ebitdaUsd)
    })),
    primaryMix: operating.categories.map((row) => ({
      name: row.categoryName,
      value: row.reportingAmountUsd,
      displayValue: row.amount,
      sublabel: row.isSpareParts ? "Spare parts sensitivity" : "Operating baseline",
      tone: row.isSpareParts ? "ruby" : "brand"
    })),
    secondaryMix: overall.rows.map((row) => ({
      name: row.seasonLabel,
      value: row.totalCostUsd,
      displayValue: row.totalCost,
      sublabel: `Baseline ${row.operatingBaseline} · E1 ${formatCurrency(row.e1IncrementalCostUsd + row.e1OverlapVarianceUsd)}`,
      tone: "ruby"
    })),
    statusMix: e1Summary
      ? [
          { name: "Paid", value: e1Summary.paidAmountUsd, displayValue: e1Summary.paidAmount, tone: "good" },
          { name: "Due / open", value: e1Summary.dueAmountUsd, displayValue: e1Summary.dueAmount, tone: "ruby" },
          { name: "Credit", value: e1Summary.creditNoteAmountUsd, displayValue: e1Summary.creditNoteAmount, tone: "amber" },
          { name: "Incremental", value: e1Summary.incrementalVisibleAmountUsd, displayValue: e1Summary.incrementalVisibleAmount, tone: "brand" }
        ]
      : [],
    insights: [
      {
        title: selected ? `${selected.seasonLabel} EBITDA is ${selected.ebitda}` : "Season P&L is ready for review",
        summary: selected
          ? `Revenue ${selected.totalRevenue} less total cost ${selected.totalCost}, using the variance-only E1 rule.`
          : "Load a TBR season to review revenue, baseline cost, E1 variance, and EBITDA.",
        tone: selected ? toneForAmount(selected.ebitdaUsd) : "slate"
      },
      {
        title: "E1 ledger is visible without double counting",
        summary: `${e1Summary?.grossE1Amount ?? "$0"} gross E1 ledger is visible; only incremental or positive variance reaches Overall P&L.`,
        tone: "brand"
      },
      {
        title: "Operating baseline replaces generic zero-cost cards",
        summary: `${operatingSummary?.totalOperatingExpense ?? "$0"} is available from TBR Financial Plan controls for ${operatingSummary?.seasonLabel ?? "the selected season"}.`,
        tone: "good"
      }
    ],
    links: [
      { label: "Operating Expenses", href: "/tbr/operating-expenses", helper: "Season baseline matrix" },
      { label: "E1 Accounting", href: "/tbr/e1-accounting", helper: "Invoice/payment ledger" },
      { label: "Overall P&L", href: "/tbr/overall-pnl", helper: "No-double-count P&L" },
      { label: "Costs", href: "/costs/TBR", helper: "Entity cost workspace" }
    ]
  };
}

async function getFspEntityDashboard(): Promise<EntityDashboard> {
  const [pnlSummaries, sports, aiDrafts] = await Promise.all([
    getFspPnlSummaries("base"),
    getFspSports(),
    getAiIntakeQueue({ companyCode: "FSP", workflowContextPrefix: "fsp-sport:", limit: 8 })
  ]);
  const completenessRows = await Promise.all(
    sports.map(async (sport) => ({
      sport,
      completeness: await getSportModuleCompleteness(sport.id)
    }))
  );
  const totalRevenue = pnlSummaries.reduce((sum, row) => sum + row.revenueY1, 0);
  const totalCost = pnlSummaries.reduce((sum, row) => sum + row.cogsY1 + row.opexY1, 0);
  const totalEbitda = pnlSummaries.reduce((sum, row) => sum + row.ebitdaY1, 0);
  const modeledSports = pnlSummaries.filter((row) => row.revenueY1 > 0 || row.cogsY1 > 0 || row.opexY1 > 0 || row.ebitdaY1 !== 0);
  const activeSports = sports.filter((sport) => sport.isActive).length;
  const needsReview = aiDrafts.filter((draft) => draft.status === "needs_review").length;
  const yearRows = ([1, 2, 3] as const).map((year) => {
    const revenue = pnlSummaries.reduce((sum, row) => sum + (year === 1 ? row.revenueY1 : year === 2 ? row.revenueY2 : row.revenueY3), 0);
    const cogs = pnlSummaries.reduce((sum, row) => sum + (year === 1 ? row.cogsY1 : year === 2 ? row.cogsY2 : row.cogsY3), 0);
    const opex = pnlSummaries.reduce((sum, row) => sum + (year === 1 ? row.opexY1 : year === 2 ? row.opexY2 : row.opexY3), 0);
    const ebitda = pnlSummaries.reduce((sum, row) => sum + (year === 1 ? row.ebitdaY1 : year === 2 ? row.ebitdaY2 : row.ebitdaY3), 0);
    return { year, revenue, cost: cogs + opex, ebitda };
  });

  return {
    entityCode: "FSP",
    title: "FSP sport portfolio command center",
    subtitle: "Scenario P&L, sport readiness, media/sponsorship support, and AI intake queue.",
    policyNote: "FSP scenario values are portfolio planning metrics only and do not roll into LSC holding totals.",
    metrics: [
      { label: "Sports", value: sports.length, helper: `${activeSports} active modules`, amountUsd: sports.length, tone: "brand" },
      { label: "Modeled sports", value: modeledSports.length, helper: "Sports with financial data", amountUsd: modeledSports.length, tone: "iris" },
      { label: "Y1 revenue", value: formatCurrency(totalRevenue), helper: "Base scenario only", amountUsd: totalRevenue, tone: "good" },
      { label: "Y1 cost", value: formatCurrency(totalCost), helper: "COGS + OPEX scenario cost", amountUsd: totalCost, tone: "ruby" },
      { label: "Y1 EBITDA", value: formatCurrency(totalEbitda), helper: "Portfolio scenario result", amountUsd: totalEbitda, tone: toneForAmount(totalEbitda) },
      { label: "AI review", value: needsReview, helper: "Drafts awaiting approval", amountUsd: needsReview, tone: "amber" },
    ],
    trend: yearRows.map((row) => ({
      name: `Y${row.year}`,
      value: row.ebitda,
      displayValue: formatCurrency(row.ebitda),
      revenue: row.revenue,
      cost: row.cost,
      margin: row.ebitda,
      sublabel: `Revenue ${formatCurrency(row.revenue)} · Cost ${formatCurrency(row.cost)}`,
      tone: toneForAmount(row.ebitda)
    })),
    primaryMix: pnlSummaries.map((row) => ({
      name: row.sportName,
      value: Math.abs(row.ebitdaY1),
      displayValue: formatCurrency(row.ebitdaY1),
      sublabel: `Revenue ${formatCurrency(row.revenueY1)} · Cost ${formatCurrency(row.cogsY1 + row.opexY1)}`,
      revenue: row.revenueY1,
      cost: row.cogsY1 + row.opexY1,
      margin: row.ebitdaY1,
      tone: toneForAmount(row.ebitdaY1)
    })),
    secondaryMix: completenessRows.map(({ sport, completeness }) => {
      const score = Math.round(
        ([
          completeness.pnlLineItems > 0,
          completeness.sponsorships > 0,
          completeness.mediaChannelsConfigured > 0,
          completeness.opexItems > 0,
          completeness.productionItems > 0,
          completeness.leagueRoles > 0 || completeness.techRoles > 0,
          completeness.revenueShareRows > 0,
          completeness.hasEventConfig
        ].filter(Boolean).length /
          8) *
          100
      );
      return {
        name: sport.displayName,
        value: score,
        displayValue: `${score}%`,
        sublabel: `${completeness.pnlLineItems} P&L rows · ${completeness.sponsorships} sponsorship rows`,
        tone: score >= 70 ? "good" : score >= 35 ? "amber" : "slate"
      } satisfies EntityDashboardPoint;
    }),
    statusMix: [
      { name: "Needs review", value: needsReview, displayValue: String(needsReview), tone: "amber" },
      { name: "Posted", value: aiDrafts.filter((draft) => draft.status === "posted").length, displayValue: String(aiDrafts.filter((draft) => draft.status === "posted").length), tone: "good" },
      { name: "Media kits", value: aiDrafts.filter((draft) => draft.targetKind === "fsp_sport_media_kit").length, displayValue: String(aiDrafts.filter((draft) => draft.targetKind === "fsp_sport_media_kit").length), tone: "brand" },
      { name: "Sponsorship docs", value: aiDrafts.filter((draft) => draft.targetKind === "fsp_sport_sponsorship_document").length, displayValue: String(aiDrafts.filter((draft) => draft.targetKind === "fsp_sport_sponsorship_document").length), tone: "iris" }
    ],
    insights: [
      {
        title: modeledSports.length > 0 ? `${modeledSports[0]?.sportName ?? "FSP"} is now visible in FSP dashboards` : "FSP modules are ready for sport data",
        summary: `${formatCurrency(totalRevenue)} Y1 scenario revenue and ${formatCurrency(totalCost)} Y1 scenario cost stay inside FSP reporting.`,
        tone: "brand"
      },
      {
        title: "Squash and future sports are portfolio planning facts",
        summary: "They should inform FSP decisions without changing LSC consolidated finance until approved as actuals.",
        tone: "iris"
      },
      {
        title: needsReview > 0 ? "AI intake needs review" : "AI queue is clear",
        summary: `${needsReview} FSP sport draft${needsReview === 1 ? "" : "s"} currently need human approval.`,
        tone: needsReview > 0 ? "amber" : "good"
      }
    ],
    links: [
      { label: "All Sports", href: "/fsp/sports", helper: "Sport asset cards and cockpits" },
      { label: "Consolidated P&L", href: "/fsp/consolidated", helper: "FSP-only scenario dashboard" },
      { label: "Costs", href: "/costs/FSP", helper: "Scenario cost workspace" },
      { label: "Documents", href: "/documents/FSP", helper: "Media kits and sponsorship support" }
    ]
  };
}

async function getXtzEntityDashboard(): Promise<EntityDashboard> {
  const [invoiceSummary, accrual, payoutSummary, workers] = await Promise.all([
    getXtzInvoiceSummary(),
    getXtzInvoiceAccrualSummary(),
    getGigPayoutSummary("XTZ"),
    getGigWorkers("XTZ")
  ]);
  const activeWorkers = payoutSummary.activeWorkers || workers.filter((worker) => worker.isActive).length;

  return {
    entityCode: "XTZ",
    title: "XTZ India command center",
    subtitle: "Payroll invoices, vendor support, payouts, and intercompany inflow.",
    policyNote: "Generated and sent invoices are commitments; only paid invoices are recognized as cost/cash in the billed entity.",
    metrics: [
      { label: "Committed invoices", value: accrual.committed, helper: "Generated/sent, not paid yet", amountUsd: accrual.committedUsd, tone: "amber" },
      { label: "Paid invoices", value: accrual.paid, helper: "Recognized XTZ revenue/cash-in", amountUsd: accrual.paidUsd, tone: "good" },
      { label: "Active invoices", value: invoiceSummary.activeInvoices, helper: "Generated, sent, or paid", amountUsd: invoiceSummary.activeInvoices, tone: "brand" },
      { label: "Active workers", value: activeWorkers, helper: "Payroll/vendor roster", amountUsd: activeWorkers, tone: "iris" },
      { label: "Pending payouts", value: formatCurrency(payoutSummary.pendingAmount), helper: `${payoutSummary.pendingPayouts} payout rows`, amountUsd: payoutSummary.pendingAmount, tone: "ruby" },
      { label: "MTD paid", value: formatCurrency(payoutSummary.mtdPaid), helper: "Confirmed worker payouts", amountUsd: payoutSummary.mtdPaid, tone: "good" },
    ],
    trend: accrual.monthlyTrend.map((row) => ({
      name: row.month,
      value: row.paidUsd,
      displayValue: row.paid,
      paid: row.paidUsd,
      committed: row.committedUsd,
      sublabel: `Committed ${row.committed}`,
      tone: row.paidUsd > 0 ? "good" : "amber"
    })),
    primaryMix: accrual.recipientRows.map((row) => ({
      name: row.companyCode,
      value: row.committedUsd + row.paidUsd,
      displayValue: formatCurrency(row.committedUsd + row.paidUsd),
      sublabel: `Committed ${row.committed} · Paid ${row.paid}`,
      committed: row.committedUsd,
      paid: row.paidUsd,
      tone: row.committedUsd > 0 ? "amber" : "good"
    })),
    secondaryMix: [
      { name: "India workers", value: payoutSummary.indiaWorkers, displayValue: String(payoutSummary.indiaWorkers), tone: "brand" },
      { name: "Kenya workers", value: payoutSummary.kenyaWorkers, displayValue: String(payoutSummary.kenyaWorkers), tone: "iris" },
      { name: "Pending payouts", value: payoutSummary.pendingAmount, displayValue: formatCurrency(payoutSummary.pendingAmount), tone: "ruby" },
      { name: "YTD paid", value: payoutSummary.ytdPaid, displayValue: formatCurrency(payoutSummary.ytdPaid), tone: "good" }
    ],
    statusMix: accrual.statusRows.map((row) => ({
      name: row.status.replace(/_/g, " "),
      value: row.amountUsd || row.count,
      displayValue: row.amountUsd ? row.amount : String(row.count),
      count: row.count,
      tone: row.status === "paid" ? "good" : row.status === "void" ? "ruby" : row.status === "sent" ? "brand" : "amber"
    })),
    insights: [
      {
        title: "Generated invoices now have operational visibility",
        summary: `${accrual.committed} is committed and should appear in invoice/cost workspaces before it becomes paid cost.`,
        tone: "amber"
      },
      {
        title: "Paid XTZ invoices feed billed-entity cost",
        summary: `${accrual.paid} is recognized as XTZ revenue and billed-entity approved cost/cash movement.`,
        tone: "good"
      },
      {
        title: "Payout operations stay separate from invoice recognition",
        summary: `${formatCurrency(payoutSummary.pendingAmount)} remains in worker payout workflow until processed and paid.`,
        tone: "brand"
      }
    ],
    links: [
      { label: "Invoice Dashboard", href: "/payroll-invoices", helper: "Generated/sent/paid register" },
      { label: "Generate Invoice", href: "/payroll-invoices/generator", helper: "Payroll/vendor invoice builder" },
      { label: "Gig Workers", href: "/gig-workers", helper: "Worker roster and payouts" },
      { label: "XTZ Expenses", href: "/xtz-expenses?view=review", helper: "Expense review and support" }
    ]
  };
}

export async function getEntityDashboard(entityCode: EntityDashboardCode): Promise<EntityDashboard> {
  switch (entityCode) {
    case "TBR":
      return getTbrEntityDashboard();
    case "FSP":
      return getFspEntityDashboard();
    case "XTZ":
      return getXtzEntityDashboard();
    case "LSC":
    default:
      return getLscEntityDashboard();
  }
}
