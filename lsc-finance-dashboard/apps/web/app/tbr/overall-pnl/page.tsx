import Link from "next/link";
import { CircleDollarSign, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { getTbrOverallPnlDashboard } from "@lsc/db";
import { formatCompactCurrency } from "../../components/dashboard-charts";
import { HorizontalComparisonChart, StatusDonutChart, WaterfallBridgeChart, type ChartDatum } from "../../components/lsc-dashboard-charts";
import { MetricTile, Panel } from "../../components/lsc-blue-primitives";
import { requireRole } from "../../../lib/auth";

type PageProps = {
  searchParams?: Promise<{
    season?: string;
  }>;
};

function seasonHref(seasonCode: string) {
  return `/tbr/overall-pnl?season=${encodeURIComponent(seasonCode)}`;
}

function label(value: string | null | undefined) {
  return String(value ?? "").replace(/_/g, " ");
}

export default async function TbrOverallPnlPage({ searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const params = searchParams ? await searchParams : {};
  const data = await getTbrOverallPnlDashboard(params.season?.toUpperCase());
  const selected = data.selected;

  const bridgeRows: ChartDatum[] = selected
    ? [
        { name: "Sponsorship", value: selected.sponsorshipRevenueUsd, displayValue: selected.sponsorshipRevenue, tone: "good" },
        { name: "Prize money", value: selected.prizeMoneyRevenueUsd, displayValue: selected.prizeMoneyRevenue, tone: "good" },
        { name: "Baseline", value: -selected.operatingBaselineUsd, displayValue: selected.operatingBaseline, tone: "ruby" },
        { name: "E1 incremental", value: -selected.e1IncrementalCostUsd, displayValue: selected.e1IncrementalCost, tone: "amber" },
        { name: "E1 variance", value: -selected.e1OverlapVarianceUsd, displayValue: selected.e1OverlapVariance, tone: "amber" }
      ]
    : [];
  const seasonComparisonRows: ChartDatum[] = data.rows.map((row) => ({
    name: row.seasonLabel,
    value: Math.abs(row.ebitdaUsd),
    displayValue: row.ebitda,
    sublabel: `Revenue ${row.totalRevenue} · Cost ${row.totalCost}`,
    tone: row.ebitdaUsd >= 0 ? "good" : "ruby"
  }));
  const revenueMixRows: ChartDatum[] = selected
    ? [
        { name: "Sponsorship", value: selected.sponsorshipRevenueUsd, displayValue: selected.sponsorshipRevenue, tone: "good" },
        { name: "Prize money", value: selected.prizeMoneyRevenueUsd, displayValue: selected.prizeMoneyRevenue, tone: "brand" },
        { name: "Other", value: selected.otherRevenueUsd, displayValue: selected.otherRevenue, tone: "slate" }
      ]
    : [];
  const season1 = data.rows.find((row) => row.seasonCode === "S1");

  return (
    <div className="page-grid finance-workspace">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">TBR overall P&amp;L</span>
          <h3>Season profitability without double counting</h3>
          <p>
            Operating baseline comes from the TBR Financial Plan. E1 accounting contributes only
            non-overlapping confirmed costs plus positive variance over matched baseline categories.
          </p>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            <Link className="segment-chip" href="/tbr/operating-expenses">Operating Expenses</Link>
            <Link className="segment-chip" href="/tbr/e1-accounting">E1 Accounting</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-headline">
          <div>
            <span className="section-kicker">P&amp;L season</span>
            <h3>Review revenue, baseline cost, and reconciliation</h3>
          </div>
          <span className="pill">{selected?.seasonLabel ?? data.selectedSeasonCode}</span>
        </div>
        <div className="segment-row">
          {data.seasons.map((season) => (
            <Link
              className={`segment-chip ${season.seasonCode === data.selectedSeasonCode ? "active" : ""}`}
              href={seasonHref(season.seasonCode)}
              key={season.seasonCode}
            >
              {season.seasonLabel}
            </Link>
          ))}
        </div>
      </section>

      <section className="analytics-kpi-grid">
        <MetricTile icon={TrendingUp} label="Revenue" value={selected?.totalRevenue ?? "$0"} helper="Sponsorship, prize money, other" tone="good" />
        <MetricTile icon={TrendingDown} label="Total cost" value={selected?.totalCost ?? "$0"} helper="Baseline + E1 incremental/variance" tone="ruby" />
        <MetricTile icon={Scale} label="EBITDA" value={selected?.ebitda ?? "$0"} helper="Derived in Postgres" tone={selected && selected.ebitdaUsd >= 0 ? "good" : "ruby"} />
        <MetricTile icon={CircleDollarSign} label="Overlap variance" value={selected?.e1OverlapVariance ?? "$0"} helper="Only positive excess is counted" tone="amber" />
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title={`${selected?.seasonLabel ?? data.selectedSeasonCode} waterfall inputs`}
          subtitle="Revenue less baseline, incremental, and overlap variance cost."
          trailing={<span className="badge">{selected?.ebitda ?? "$0"} EBITDA</span>}
        >
          <WaterfallBridgeChart data={bridgeRows} height={285} />
        </Panel>
        <Panel className="dashboard-chart-panel" title="EBITDA by season" subtitle="Season comparison from the overall P&L view.">
          <HorizontalComparisonChart data={seasonComparisonRows} height={285} />
        </Panel>
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel className="dashboard-chart-panel" title="Revenue mix" subtitle="Selected season revenue composition.">
          <StatusDonutChart data={revenueMixRows} height={245} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="Explicit revenue assumptions"
          subtitle="Business-rule backed revenue now in P&L."
          trailing={<span className="pill">Business-rule backed</span>}
        >
          <div className="xtz-dashboard-summary">
            <div>
              <span className="section-kicker">Season 1 sponsorship</span>
              <strong>{season1?.sponsorshipRevenue ?? "$0"}</strong>
              <span>Classic Car Club Manhattan</span>
            </div>
            <div>
              <span className="section-kicker">Season 2 prize money</span>
              <strong>€100K</strong>
              <span>Stored original EUR; reported USD</span>
            </div>
            <div>
              <span className="section-kicker">Selected revenue</span>
              <strong>{selected?.totalRevenue ?? "$0"}</strong>
              <span>{selected ? `${formatCompactCurrency(selected.sponsorshipRevenueUsd)} sponsorship · ${formatCompactCurrency(selected.prizeMoneyRevenueUsd)} prize` : "No selected row"}</span>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Overlap reconciliation</span>
              <h3>Variance-only groups</h3>
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>E1 visible</th>
                  <th>Baseline</th>
                  <th>Counted variance</th>
                </tr>
              </thead>
              <tbody>
                {data.reconciliationGroups.map((group) => (
                  <tr key={group.overlapCategoryKey}>
                    <td><strong>{label(group.overlapCategoryKey)}</strong></td>
                    <td>{group.overlapGroupE1Amount}</td>
                    <td>{group.overlapGroupBaseline}</td>
                    <td>{group.overlapGroupVariance}</td>
                  </tr>
                ))}
                {data.reconciliationGroups.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No overlap groups are loaded for this season.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Exceptions</span>
              <h3>Excluded or pending E1 rows</h3>
            </div>
          </div>
          <div className="pnl-exception-list">
            {data.exceptions.map((line) => (
              <div className="pnl-exception-row" key={line.e1LineId}>
                <strong>{line.invoiceNumber ?? "No invoice"}</strong>
                <span>{line.item}</span>
                <span className="pill risk-pill">{label(line.pnlTreatment)}</span>
              </div>
            ))}
            {data.exceptions.length === 0 ? <p className="muted">No exceptions for the selected season.</p> : null}
          </div>
        </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Season P&amp;L table</span>
            <h3>Backend-derived comparison</h3>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Season</th>
                <th>Revenue</th>
                <th>Operating baseline</th>
                <th>E1 incremental</th>
                <th>E1 variance</th>
                <th>Total cost</th>
                <th>EBITDA</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.seasonCode}>
                  <td><strong>{row.seasonLabel}</strong></td>
                  <td>{row.totalRevenue}</td>
                  <td>{row.operatingBaseline}</td>
                  <td>{row.e1IncrementalCost}</td>
                  <td>{row.e1OverlapVariance}</td>
                  <td>{row.totalCost}</td>
                  <td><strong>{row.ebitda}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
