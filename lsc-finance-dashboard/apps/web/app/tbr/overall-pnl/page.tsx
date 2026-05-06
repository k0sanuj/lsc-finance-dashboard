import Link from "next/link";
import { getTbrOverallPnlDashboard } from "@lsc/db";
import {
  HorizontalMetricBars,
  formatCompactCurrency,
  type HorizontalBarRow
} from "../../components/dashboard-charts";
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

  const bridgeRows: HorizontalBarRow[] = selected
    ? [
        { label: "Sponsorship revenue", value: selected.sponsorshipRevenueUsd, displayValue: selected.sponsorshipRevenue, tone: "good" },
        { label: "Prize money revenue", value: selected.prizeMoneyRevenueUsd, displayValue: selected.prizeMoneyRevenue, tone: "good" },
        { label: "Operating baseline", value: selected.operatingBaselineUsd, displayValue: selected.operatingBaseline, tone: "risk" },
        { label: "E1 incremental cost", value: selected.e1IncrementalCostUsd, displayValue: selected.e1IncrementalCost, tone: "warn" },
        { label: "E1 overlap variance", value: selected.e1OverlapVarianceUsd, displayValue: selected.e1OverlapVariance, tone: "warn" }
      ]
    : [];
  const seasonComparisonRows: HorizontalBarRow[] = data.rows.map((row) => ({
    label: row.seasonLabel,
    value: row.ebitdaUsd,
    displayValue: row.ebitda,
    sublabel: `Revenue ${row.totalRevenue} · Cost ${row.totalCost}`,
    tone: row.ebitdaUsd >= 0 ? "good" : "risk"
  }));

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

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Revenue</span>
          </div>
          <div className="metric-value">{selected?.totalRevenue ?? "$0"}</div>
          <span className="metric-subvalue">Sponsorship, prize money, other</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Total cost</span>
          </div>
          <div className="metric-value">{selected?.totalCost ?? "$0"}</div>
          <span className="metric-subvalue">Baseline + E1 incremental/variance</span>
        </article>
        <article className={`metric-card ${selected && selected.ebitdaUsd >= 0 ? "accent-good" : "accent-risk"}`}>
          <div className="metric-topline">
            <span className="metric-label">EBITDA</span>
          </div>
          <div className="metric-value">{selected?.ebitda ?? "$0"}</div>
          <span className="metric-subvalue">Derived in Postgres</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Overlap variance</span>
          </div>
          <div className="metric-value">{selected?.e1OverlapVariance ?? "$0"}</div>
          <span className="metric-subvalue">Only positive excess is counted</span>
        </article>
      </section>

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">P&amp;L bridge</span>
              <h3>{selected?.seasonLabel ?? data.selectedSeasonCode} waterfall inputs</h3>
            </div>
            <span className="badge">{selected?.ebitda ?? "$0"} EBITDA</span>
          </div>
          <HorizontalMetricBars rows={bridgeRows} />
        </article>
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Season comparison</span>
              <h3>EBITDA by season</h3>
            </div>
          </div>
          <HorizontalMetricBars rows={seasonComparisonRows} />
        </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Revenue rule cards</span>
            <h3>Explicit revenue assumptions now in P&amp;L</h3>
          </div>
          <span className="pill">Business-rule backed</span>
        </div>
        <div className="stats-grid compact-stats">
          <article className="metric-card accent-good">
            <span className="metric-label">Season 1 sponsorship</span>
            <div className="metric-value">$150K</div>
            <span className="metric-subvalue">Classic Car Club Manhattan</span>
          </article>
          <article className="metric-card accent-good">
            <span className="metric-label">Season 2 prize money</span>
            <div className="metric-value">€100K</div>
            <span className="metric-subvalue">Stored original EUR; reported USD</span>
          </article>
          <article className="metric-card accent-brand">
            <span className="metric-label">Selected season revenue</span>
            <div className="metric-value">{selected?.totalRevenue ?? "$0"}</div>
            <span className="metric-subvalue">
              {selected ? `${formatCompactCurrency(selected.sponsorshipRevenueUsd)} sponsorship · ${formatCompactCurrency(selected.prizeMoneyRevenueUsd)} prize` : "No selected row"}
            </span>
          </article>
        </div>
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
