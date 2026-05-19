import Link from "next/link";
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  FileStack,
  Layers3,
  ReceiptText,
  Scale,
  TrendingUp,
  Trophy,
  WalletCards
} from "lucide-react";
import {
  formatCurrency,
  getEntitySnapshots,
  getFspPnlSummaries,
  getGigPayoutSummary,
  getGigWorkers,
  getOverviewAnalytics,
  getOverviewMetrics,
  getTbrSeasonSummaries,
  getUpcomingPayments,
  getXtzInvoiceSummary
} from "@lsc/db";
import { formatCompactCurrency, parseCurrency } from "./components/dashboard-charts";
import {
  CashMovementChart,
  FinanceTrendChart,
  HorizontalComparisonChart,
  MiniSparkline,
  StatusDonutChart,
  WaterfallBridgeChart,
  type ChartDatum
} from "./components/lsc-dashboard-charts";
import { MetricTile, Panel } from "./components/lsc-blue-primitives";
import { getEntityMetadata, getVisibleEntities, type VisibleEntityCode } from "./lib/entities";

function metricValue(metrics: Awaited<ReturnType<typeof getOverviewMetrics>>, label: string) {
  return metrics.find((metric) => metric.label === label)?.value ?? "$0";
}

function metricScope(metrics: Awaited<ReturnType<typeof getOverviewMetrics>>, label: string) {
  return metrics.find((metric) => metric.label === label)?.scope ?? "LSC Consolidated";
}

function chartTone(value: number): ChartDatum["tone"] {
  if (value > 0) return "good";
  if (value < 0) return "ruby";
  return "slate";
}

function bucketTone(key: string): ChartDatum["tone"] {
  if (key === "current" || key === "paid") return "good";
  if (key.includes("90") || key === "due" || key === "unpaid") return "ruby";
  if (key.includes("30") || key === "sent" || key === "partially_paid") return "amber";
  return "brand";
}

export default async function OverviewPage() {
  const [
    entitySnapshots,
    overviewMetrics,
    overviewAnalytics,
    tbrSeasons,
    upcomingPayments,
    fspSports,
    xtzPayoutSummary,
    xtzWorkers,
    xtzInvoiceSummary
  ] = await Promise.all([
    getEntitySnapshots(),
    getOverviewMetrics(),
    getOverviewAnalytics(),
    getTbrSeasonSummaries(),
    getUpcomingPayments(),
    getFspPnlSummaries("base"),
    getGigPayoutSummary("XTZ"),
    getGigWorkers("XTZ"),
    getXtzInvoiceSummary()
  ]);

  const snapshotMap = new Map(entitySnapshots.map((entity) => [entity.code, entity]));
  const entities = getVisibleEntities().map((entity) => {
    const snapshot = snapshotMap.get(entity.code);
    return {
      ...entity,
      revenue: snapshot?.revenue ?? "$0",
      cost: snapshot?.cost ?? "$0",
      margin: snapshot?.margin ?? "$0",
      status: snapshot?.status ?? entity.statusLabel,
      note: snapshot?.note ?? entity.modules.join(" · "),
    };
  });

  const revenue = parseCurrency(metricValue(overviewMetrics, "Total Revenue"));
  const cost = parseCurrency(metricValue(overviewMetrics, "Total Cost"));
  const margin = parseCurrency(metricValue(overviewMetrics, "Margin"));
  const cash = parseCurrency(metricValue(overviewMetrics, "Cash"));
  const upcoming = parseCurrency(metricValue(overviewMetrics, "Upcoming Payments"));
  const receivables = parseCurrency(metricValue(overviewMetrics, "Receivables"));
  const latestSeason = tbrSeasons.at(-1);
  const fspWithFinancials = fspSports.filter(
    (sport) => sport.revenueY1 > 0 || sport.cogsY1 > 0 || sport.opexY1 > 0 || sport.ebitdaY1 !== 0
  );
  const fspRevenueY1 = fspSports.reduce((sum, sport) => sum + sport.revenueY1, 0);
  const fspCostY1 = fspSports.reduce((sum, sport) => sum + sport.cogsY1 + sport.opexY1, 0);
  const fspEbitdaY1 = fspSports.reduce((sum, sport) => sum + sport.ebitdaY1, 0);
  const activeXtzWorkers = xtzPayoutSummary.activeWorkers || xtzWorkers.filter((worker) => worker.isActive).length;

  const trendRows: ChartDatum[] = overviewAnalytics.trend.map((row) => ({
    name: row.month,
    revenue: row.revenueUsd,
    cost: row.costUsd,
    margin: row.marginUsd,
    value: row.marginUsd,
    tone: chartTone(row.marginUsd)
  }));
  const cashRows: ChartDatum[] = overviewAnalytics.trend.map((row) => ({
    name: row.month,
    cashIn: row.cashInUsd,
    cashOut: row.cashOutUsd,
    net: row.netCashUsd,
    value: row.netCashUsd,
    tone: chartTone(row.netCashUsd)
  }));
  const entityRows: ChartDatum[] = overviewAnalytics.entities.map((entity) => ({
    name: entity.label,
    revenue: entity.revenueUsd,
    cost: entity.costUsd,
    margin: entity.marginUsd,
    value: Math.abs(entity.marginUsd),
    displayValue: entity.margin,
    sublabel: `Revenue ${entity.revenue} · Cost ${entity.cost}`,
    tone: chartTone(entity.marginUsd)
  }));
  const receivableRows: ChartDatum[] = overviewAnalytics.receivables.map((row) => ({
    name: row.label,
    value: row.amountUsd,
    displayValue: row.amount,
    sublabel: `${row.count} open`,
    tone: bucketTone(row.key)
  }));
  const payableRows: ChartDatum[] = overviewAnalytics.payables.map((row) => ({
    name: row.label,
    value: row.amountUsd,
    displayValue: row.amount,
    sublabel: `${row.count} invoices`,
    tone: bucketTone(row.key)
  }));
  const pnlBridgeRows: ChartDatum[] = [
    { name: "Revenue", value: revenue, displayValue: formatCompactCurrency(revenue), tone: "good" },
    { name: "Cost", value: -cost, displayValue: formatCompactCurrency(cost), tone: "ruby" }
  ];
  const tbrSeasonRows: ChartDatum[] = tbrSeasons.map((season) => ({
    name: season.seasonLabel,
    value: parseCurrency(season.cost),
    displayValue: season.cost,
    sublabel: `Revenue ${season.revenue} · ${season.raceCount} races`,
    tone: parseCurrency(season.revenue) - parseCurrency(season.cost) >= 0 ? "good" : "ruby"
  }));
  const fspRows: ChartDatum[] = fspSports.slice(0, 6).map((sport) => ({
    name: sport.sportName,
    value: Math.abs(sport.ebitdaY1),
    displayValue: formatCurrency(sport.ebitdaY1),
    sublabel: `Y1 revenue ${formatCurrency(sport.revenueY1)}`,
    tone: sport.ebitdaY1 >= 0 ? "good" : "ruby"
  }));
  const xtzStatusRows: ChartDatum[] = [
    { name: "Generated", value: xtzInvoiceSummary.generatedCount, displayValue: String(xtzInvoiceSummary.generatedCount), tone: "amber" },
    { name: "Sent", value: xtzInvoiceSummary.sentCount, displayValue: String(xtzInvoiceSummary.sentCount), tone: "brand" },
    { name: "Paid", value: xtzInvoiceSummary.paidCount, displayValue: String(xtzInvoiceSummary.paidCount), tone: "good" },
    { name: "Void", value: xtzInvoiceSummary.voidCount, displayValue: String(xtzInvoiceSummary.voidCount), tone: "ruby" }
  ];

  const topMetricTiles = [
    { label: "Revenue", value: metricValue(overviewMetrics, "Total Revenue"), helper: metricScope(overviewMetrics, "Total Revenue"), icon: TrendingUp, tone: "good" as const },
    { label: "Cost", value: metricValue(overviewMetrics, "Total Cost"), helper: metricScope(overviewMetrics, "Total Cost"), icon: CircleDollarSign, tone: "ruby" as const },
    { label: "Margin", value: metricValue(overviewMetrics, "Margin"), helper: "Consolidated profitability", icon: Scale, tone: margin >= 0 ? "good" as const : "ruby" as const },
    { label: "Cash", value: metricValue(overviewMetrics, "Cash"), helper: metricScope(overviewMetrics, "Cash"), icon: Banknote, tone: cash >= 0 ? "brand" as const : "ruby" as const },
    { label: "Receivables", value: metricValue(overviewMetrics, "Receivables"), helper: `${receivableRows.length} aging buckets`, icon: ReceiptText, tone: "amber" as const },
    { label: "Upcoming", value: metricValue(overviewMetrics, "Upcoming Payments"), helper: "Open payment timeline", icon: CreditCard, tone: "iris" as const },
  ];

  return (
    <div className="page-grid lsc-dashboard-page">
      <section className="workspace-header command-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Finance OS</span>
          <h3>Executive Command Center</h3>
          <p className="muted">LSC, Team Blue Rising, Future of Sports, and XTZ India.</p>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            {entities.map((entity) => (
              <Link
                className={`segment-chip${entity.code === "LSC" ? " active" : ""}`}
                href={entity.homeHref}
                key={entity.code}
              >
                {entity.shortLabel}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="analytics-kpi-grid">
        {topMetricTiles.map((tile) => (
          <MetricTile
            icon={tile.icon}
            key={tile.label}
            label={tile.label}
            value={tile.value}
            helper={tile.helper}
            tone={tile.tone}
          />
        ))}
      </section>

      <section className="lsc-dashboard-hero-grid">
        <Panel
          className="dashboard-chart-panel dashboard-primary-chart"
          title="Revenue, cost, and margin trend"
          subtitle="Approved monthly finance summary across visible LSC entities."
          trailing={<span className={`signal-pill ${margin >= 0 ? "signal-good" : "signal-risk"}`}>{formatCompactCurrency(margin)}</span>}
        >
          <FinanceTrendChart
            data={trendRows}
            series={[
              { key: "revenue", label: "Revenue", tone: "good" },
              { key: "cost", label: "Cost", tone: "ruby" },
              { key: "margin", label: "Margin", tone: margin >= 0 ? "brand" : "ruby" }
            ]}
          />
          <div className="lsc-chart-summary-strip">
            <span><strong>{formatCompactCurrency(revenue)}</strong> revenue</span>
            <span><strong>{formatCompactCurrency(cost)}</strong> cost</span>
            <span><strong>{formatCompactCurrency(margin)}</strong> margin</span>
          </div>
        </Panel>

        <div className="lsc-dashboard-side-stack">
          <MetricTile icon={Layers3} label="Entities" value={entities.length} helper="LSC, TBR, FSP, XTZ" tone="brand" />
          <MetricTile icon={Trophy} label="TBR Seasons" value={tbrSeasons.length} helper={latestSeason ? latestSeason.seasonLabel : "Season controls"} tone="iris" />
          <MetricTile icon={FileStack} label="FSP Modules" value={fspSports.length} helper={`${fspWithFinancials.length} with financial data`} tone="amber" />
          <MetricTile icon={WalletCards} label="XTZ Workers" value={activeXtzWorkers} helper="Payroll/vendor support" tone="slate" />
        </div>
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title="Consolidated P&L bridge"
          subtitle="Revenue less cost, with margin shown as the derived result."
          trailing={<span className="pill">Derived only</span>}
        >
          <WaterfallBridgeChart data={pnlBridgeRows} height={245} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="Collection and payable pressure"
          subtitle="Outstanding receivables against upcoming payment exposure."
          trailing={<span className={receivables >= upcoming ? "signal-pill signal-good" : "signal-pill signal-risk"}>{receivables >= upcoming ? "Covered" : "Watch"}</span>}
        >
          <StatusDonutChart
            data={[
              { name: "Receivables", value: receivables, displayValue: formatCompactCurrency(receivables), tone: "amber" },
              { name: "Upcoming", value: upcoming, displayValue: formatCompactCurrency(upcoming), tone: "ruby" },
              { name: "Cash", value: Math.max(0, cash), displayValue: formatCompactCurrency(cash), tone: "brand" }
            ]}
            height={220}
          />
        </Panel>
      </section>

      <section className="lsc-dashboard-grid-3">
        <Panel className="dashboard-chart-panel" title="Entity comparison" subtitle="Margin contribution by workspace.">
          <HorizontalComparisonChart data={entityRows} height={250} />
        </Panel>

        <Panel className="dashboard-chart-panel" title="Cash movement" subtitle="Monthly cash in, cash out, and net movement.">
          <CashMovementChart data={cashRows} height={250} />
        </Panel>

        <Panel className="dashboard-chart-panel" title="Receivables aging" subtitle="Collection risk by aging bucket.">
          <StatusDonutChart data={receivableRows} height={220} />
        </Panel>
      </section>

      <section className="lsc-dashboard-grid-3">
        <Panel className="dashboard-chart-panel" title="Payables mix" subtitle="Upcoming payment amount by status.">
          <StatusDonutChart data={payableRows} height={220} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="TBR season P&L"
          subtitle="Race season cost stack and revenue context."
          trailing={<Link className="ghost-link" href={latestSeason ? `/tbr/races?season=${latestSeason.seasonYear}` : "/tbr/races"}>Open races</Link>}
        >
          <HorizontalComparisonChart data={tbrSeasonRows} height={250} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="FSP sport mix"
          subtitle="Y1 EBITDA by sports asset."
          trailing={<Link className="ghost-link" href="/fsp/sports">Open FSP</Link>}
        >
          <HorizontalComparisonChart data={fspRows} height={250} />
        </Panel>
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title="XTZ invoice and payroll summary"
          subtitle="Invoice lifecycle plus active payroll/vendor support."
          trailing={<Link className="ghost-link" href={getEntityMetadata("XTZ" satisfies VisibleEntityCode).homeHref}>Open XTZ India</Link>}
        >
          <div className="xtz-dashboard-summary">
            <div>
              <span className="section-kicker">Active workers</span>
              <strong>{activeXtzWorkers}</strong>
              <MiniSparkline data={trendRows} dataKey="value" />
            </div>
            <div>
              <span className="section-kicker">Pending payouts</span>
              <strong>{xtzPayoutSummary.pendingPayouts}</strong>
              <span>{formatCurrency(xtzPayoutSummary.pendingAmount)}</span>
            </div>
            <div>
              <span className="section-kicker">Active invoices</span>
              <strong>{xtzInvoiceSummary.activeInvoices}</strong>
              <span>{formatCompactCurrency(xtzInvoiceSummary.totalInvoicedUsd)}</span>
            </div>
          </div>
          <StatusDonutChart data={xtzStatusRows} height={210} />
        </Panel>

        <Panel className="dashboard-chart-panel" title="AI metric signals" subtitle="Narrative based only on approved derived metrics.">
          <div className="process-list dashboard-signal-list">
            <div className="process-step">
              <span className="process-step-index">1</span>
              <strong>{margin >= 0 ? "Margin is positive" : "Margin needs review"}</strong>
              <span className="muted">{formatCompactCurrency(margin)} consolidated margin on {formatCompactCurrency(revenue)} revenue.</span>
            </div>
            <div className="process-step">
              <span className="process-step-index">2</span>
              <strong>{receivables > upcoming ? "Collections exceed upcoming payables" : "Payables exceed open receivables"}</strong>
              <span className="muted">{formatCompactCurrency(receivables)} receivables against {formatCompactCurrency(upcoming)} upcoming payments.</span>
            </div>
            <div className="process-step">
              <span className="process-step-index">3</span>
              <strong>{fspWithFinancials.length} FSP sport modules have financial data</strong>
              <span className="muted">Y1 FSP EBITDA is {formatCompactCurrency(fspEbitdaY1)} from {formatCompactCurrency(fspRevenueY1)} revenue and {formatCompactCurrency(fspCostY1)} cost.</span>
            </div>
          </div>
        </Panel>
      </section>

      <Panel className="dashboard-ledger-panel" title="Workspace operating ledger" subtitle="Entity totals remain traceable to canonical services and SQL views.">
        <div className="table-wrapper clean-table compact-ledger-table">
          <table>
            <thead>
              <tr>
                <th>Entity</th>
                <th>Status</th>
                <th>Revenue</th>
                <th>Cost</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => (
                <tr key={entity.code}>
                  <td>
                    <Link className="record-title" href={entity.homeHref}>{entity.shortLabel}</Link>
                    <span className="record-subtitle">{entity.label}</span>
                  </td>
                  <td><span className="pill">{entity.status}</span></td>
                  <td>{entity.revenue}</td>
                  <td>{entity.cost}</td>
                  <td><strong>{entity.margin}</strong></td>
                </tr>
              ))}
              {upcomingPayments.slice(0, 4).map((payment) => (
                <tr key={`${payment.vendor}-${payment.dueDate}-${payment.amount}`}>
                  <td>
                    <strong className="record-title">{payment.vendor}</strong>
                    <span className="record-subtitle">{payment.race || payment.category}</span>
                  </td>
                  <td><span className="pill">{payment.status}</span></td>
                  <td>-</td>
                  <td>{payment.amount}</td>
                  <td>{payment.dueDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
