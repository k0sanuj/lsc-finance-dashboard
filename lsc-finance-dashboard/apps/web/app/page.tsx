import Link from "next/link";
import {
  formatCurrency,
  getEntitySnapshots,
  getFspPnlSummaries,
  getGigPayoutSummary,
  getGigWorkers,
  getMonthlyCashFlow,
  getOverviewMetrics,
  getReceivablesAgingSummary,
  getTbrSeasonSummaries,
  getUpcomingPayments
} from "@lsc/db";
import { CashTrendChart, HorizontalMetricBars, formatCompactCurrency, parseCurrency } from "./components/dashboard-charts";
import { getEntityMetadata, getVisibleEntities, type VisibleEntityCode } from "./lib/entities";

function metricValue(metrics: Awaited<ReturnType<typeof getOverviewMetrics>>, label: string) {
  return metrics.find((metric) => metric.label === label)?.value ?? "$0";
}

function metricScope(metrics: Awaited<ReturnType<typeof getOverviewMetrics>>, label: string) {
  return metrics.find((metric) => metric.label === label)?.scope ?? "LSC Consolidated";
}

function insightTone(value: number) {
  if (value > 0) return "signal-pill signal-good";
  if (value < 0) return "signal-pill signal-risk";
  return "pill";
}

export default async function OverviewPage() {
  const [
    entitySnapshots,
    overviewMetrics,
    monthlyCashFlow,
    tbrSeasons,
    receivablesAging,
    upcomingPayments,
    fspSports,
    xtzPayoutSummary,
    xtzWorkers
  ] = await Promise.all([
    getEntitySnapshots(),
    getOverviewMetrics(),
    getMonthlyCashFlow(),
    getTbrSeasonSummaries(),
    getReceivablesAgingSummary(),
    getUpcomingPayments(),
    getFspPnlSummaries("base"),
    getGigPayoutSummary("XTZ"),
    getGigWorkers("XTZ")
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
  const upcoming = parseCurrency(metricValue(overviewMetrics, "Upcoming Payments"));
  const receivables = parseCurrency(metricValue(overviewMetrics, "Receivables"));
  const latestSeason = tbrSeasons.at(-1);
  const fspWithFinancials = fspSports.filter(
    (sport) => sport.revenueY1 > 0 || sport.cogsY1 > 0 || sport.opexY1 > 0 || sport.ebitdaY1 !== 0
  );
  const fspRevenueY1 = fspSports.reduce((sum, sport) => sum + sport.revenueY1, 0);
  const fspCostY1 = fspSports.reduce((sum, sport) => sum + sport.cogsY1 + sport.opexY1, 0);
  const fspEbitdaY1 = fspSports.reduce((sum, sport) => sum + sport.ebitdaY1, 0);

  const entityContributionRows = entities.map((entity) => ({
    label: entity.shortLabel,
    value: Math.max(parseCurrency(entity.revenue), parseCurrency(entity.cost), Math.abs(parseCurrency(entity.margin))),
    displayValue: entity.margin,
    sublabel: `Revenue ${entity.revenue} · Cost ${entity.cost}`,
    tone: parseCurrency(entity.margin) >= 0 ? "good" as const : "risk" as const,
  }));

  const receivablesRows = receivablesAging
    .filter((row) => row.rawTotal > 0 || row.count > 0)
    .map((row) => ({
      label: row.label,
      value: row.rawTotal,
      displayValue: row.totalOutstanding,
      sublabel: `${row.count} open`,
      tone: row.bucket === "current" ? "good" as const : row.bucket === "90_plus" ? "risk" as const : "warn" as const,
    }));

  const fspRows = fspSports.slice(0, 5).map((sport) => ({
    label: sport.sportName,
    value: Math.abs(sport.ebitdaY1),
    displayValue: formatCurrency(sport.ebitdaY1),
    sublabel: `Y1 revenue ${formatCurrency(sport.revenueY1)}`,
    tone: sport.ebitdaY1 >= 0 ? "good" as const : "risk" as const,
  }));

  return (
    <div className="page-grid">
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

      <section className="entity-grid command-entity-grid">
        {entities.map((entity) => (
          <article className={`entity-card ${entity.code.toLowerCase()}`} key={entity.code}>
            <div className="entity-card-top">
              <div>
                <span className="section-kicker">{entity.code}</span>
                <h3>{entity.label}</h3>
              </div>
              <span className="pill">{entity.status}</span>
            </div>
            <p>{entity.note}</p>
            <div className="entity-stats">
              <div>
                <span>Revenue</span>
                <strong>{entity.revenue}</strong>
              </div>
              <div>
                <span>Cost</span>
                <strong>{entity.cost}</strong>
              </div>
              <div>
                <span>Margin</span>
                <strong>{entity.margin}</strong>
              </div>
            </div>
            <div className="entity-actions">
              <Link className="ghost-link" href={entity.homeHref}>
                Open {entity.shortLabel}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="stats-grid compact-stats">
        {[
          ["Total Revenue", metricValue(overviewMetrics, "Total Revenue"), "accent-good"],
          ["Total Cost", metricValue(overviewMetrics, "Total Cost"), "accent-risk"],
          ["Margin", metricValue(overviewMetrics, "Margin"), margin >= 0 ? "accent-good" : "accent-risk"],
          ["Cash", metricValue(overviewMetrics, "Cash"), "accent-brand"],
          ["Receivables", metricValue(overviewMetrics, "Receivables"), "accent-warn"],
          ["Upcoming Payments", metricValue(overviewMetrics, "Upcoming Payments"), "accent-accent"],
        ].map(([label, value, accent]) => (
          <article className={`metric-card ${accent}`} key={label}>
            <div className="metric-topline">
              <span className="metric-label">{label}</span>
            </div>
            <div className="metric-value">{value}</div>
            <span className="metric-subvalue">{metricScope(overviewMetrics, label)}</span>
          </article>
        ))}
      </section>

      <section className="grid-two portfolio-panels">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Revenue vs cost</span>
              <h3>Consolidated position</h3>
            </div>
            <span className={insightTone(margin)}>{formatCompactCurrency(margin)}</span>
          </div>
          <HorizontalMetricBars
            rows={[
              { label: "Revenue", value: revenue, displayValue: formatCompactCurrency(revenue), tone: "good" },
              { label: "Cost", value: cost, displayValue: formatCompactCurrency(cost), tone: "risk" },
              { label: "Margin", value: Math.abs(margin), displayValue: formatCompactCurrency(margin), tone: margin >= 0 ? "good" : "risk" },
            ]}
          />
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Entity contribution</span>
              <h3>Margin by workspace</h3>
            </div>
            <span className="pill">{entities.length} entities</span>
          </div>
          <HorizontalMetricBars rows={entityContributionRows} />
        </article>
      </section>

      <section className="grid-two portfolio-panels">
        <article className="card trend-chart">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Cash in / out</span>
              <h3>Monthly movement</h3>
            </div>
            <span className="pill">LSC + legacy Dubai</span>
          </div>
          <CashTrendChart rows={monthlyCashFlow} />
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Receivables aging</span>
              <h3>Outstanding collection risk</h3>
            </div>
            <span className="pill">{formatCompactCurrency(receivables)}</span>
          </div>
          <HorizontalMetricBars rows={receivablesRows} />
        </article>
      </section>

      <section className="grid-two portfolio-panels">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Payments timeline</span>
              <h3>Upcoming payables</h3>
            </div>
            <span className="pill">{formatCompactCurrency(upcoming)}</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Payable</th>
                  <th>Context</th>
                  <th>Due</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {upcomingPayments.slice(0, 6).map((payment) => (
                  <tr key={`${payment.vendor}-${payment.dueDate}-${payment.amount}`}>
                    <td><strong>{payment.vendor}</strong></td>
                    <td>{payment.race || payment.category}</td>
                    <td>{payment.dueDate}</td>
                    <td><strong>{payment.amount}</strong></td>
                  </tr>
                ))}
                {upcomingPayments.length === 0 ? (
                  <tr><td className="muted" colSpan={4}>No upcoming payables.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">AI insight panel</span>
              <h3>Approved-metric signals</h3>
            </div>
            <span className="pill">Derived only</span>
          </div>
          <div className="process-list">
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
        </article>
      </section>

      <section className="grid-two portfolio-panels">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">TBR race P&amp;L</span>
              <h3>Season leaderboard</h3>
            </div>
            <Link className="ghost-link" href={latestSeason ? `/tbr/races?season=${latestSeason.seasonYear}` : "/tbr/races"}>
              Open races
            </Link>
          </div>
          <div className="season-grid compact-season-grid">
            {tbrSeasons.map((season) => (
              <Link className="season-card" href={`/tbr/races?season=${season.seasonYear}`} key={season.seasonYear}>
                <div className="season-card-top">
                  <span className="badge">{season.status}</span>
                  <span className="season-tag">{season.seasonLabel}</span>
                </div>
                <h3>{season.raceCount} races</h3>
                <div className="season-metrics">
                  <div><span>Revenue</span><strong>{season.revenue}</strong></div>
                  <div><span>Cost</span><strong>{season.cost}</strong></div>
                  <div><span>Open payables</span><strong>{season.openPayables}</strong></div>
                </div>
              </Link>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">FSP sports portfolio</span>
              <h3>Sport asset EBITDA</h3>
            </div>
            <Link className="ghost-link" href="/fsp/sports">Open FSP</Link>
          </div>
          <HorizontalMetricBars rows={fspRows} />
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">XTZ India</span>
            <h3>Payroll, vendors, and payouts</h3>
          </div>
          <Link className="ghost-link" href={getEntityMetadata("XTZ" satisfies VisibleEntityCode).homeHref}>
            Open XTZ India
          </Link>
        </div>
        <section className="stats-grid compact-stats">
          <article className="metric-card accent-brand">
            <div className="metric-topline"><span className="metric-label">Active workers</span></div>
            <div className="metric-value">{xtzPayoutSummary.activeWorkers || xtzWorkers.filter((worker) => worker.isActive).length}</div>
            <span className="metric-subvalue">{xtzPayoutSummary.totalWorkers || xtzWorkers.length} total</span>
          </article>
          <article className="metric-card accent-warn">
            <div className="metric-topline"><span className="metric-label">Pending payouts</span></div>
            <div className="metric-value">{xtzPayoutSummary.pendingPayouts}</div>
            <span className="metric-subvalue">{formatCurrency(xtzPayoutSummary.pendingAmount)}</span>
          </article>
          <article className="metric-card accent-good">
            <div className="metric-topline"><span className="metric-label">MTD paid</span></div>
            <div className="metric-value">{formatCurrency(xtzPayoutSummary.mtdPaid)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-topline"><span className="metric-label">YTD paid</span></div>
            <div className="metric-value">{formatCurrency(xtzPayoutSummary.ytdPaid)}</div>
          </article>
        </section>
      </section>
    </div>
  );
}
