import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "../../../lib/auth";
import { getFspPnlSummaries, getFspSports } from "@lsc/db";

const fmt = (value: number): string =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const pct = (value: number): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

type YearKey = 1 | 2 | 3;

function revForYear(s: { revenueY1: number; revenueY2: number; revenueY3: number }, y: YearKey): number {
  return y === 1 ? s.revenueY1 : y === 2 ? s.revenueY2 : s.revenueY3;
}
function cogsForYear(s: { cogsY1: number; cogsY2: number; cogsY3: number }, y: YearKey): number {
  return y === 1 ? s.cogsY1 : y === 2 ? s.cogsY2 : s.cogsY3;
}
function opexForYear(s: { opexY1: number; opexY2: number; opexY3: number }, y: YearKey): number {
  return y === 1 ? s.opexY1 : y === 2 ? s.opexY2 : s.opexY3;
}
function ebitdaForYear(s: { ebitdaY1: number; ebitdaY2: number; ebitdaY3: number }, y: YearKey): number {
  return y === 1 ? s.ebitdaY1 : y === 2 ? s.ebitdaY2 : s.ebitdaY3;
}
function marginForYear(s: { ebitdaMarginY1: number; ebitdaMarginY2: number; ebitdaMarginY3: number }, y: YearKey): number {
  return y === 1 ? s.ebitdaMarginY1 : y === 2 ? s.ebitdaMarginY2 : s.ebitdaMarginY3;
}

export default async function FspConsolidatedPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);

  const params = await searchParams;
  const selectedYear: YearKey =
    params.year === "2" ? 2 : params.year === "3" ? 3 : 1;

  const [summaries, sports] = await Promise.all([
    getFspPnlSummaries(),
    getFspSports(),
  ]);

  /* ── Consolidated totals ─────────────────────────────────── */
  const totals = summaries.reduce(
    (acc, s) => ({
      revenueY1: acc.revenueY1 + s.revenueY1,
      revenueY2: acc.revenueY2 + s.revenueY2,
      revenueY3: acc.revenueY3 + s.revenueY3,
      cogsY1: acc.cogsY1 + s.cogsY1,
      cogsY2: acc.cogsY2 + s.cogsY2,
      cogsY3: acc.cogsY3 + s.cogsY3,
      opexY1: acc.opexY1 + s.opexY1,
      opexY2: acc.opexY2 + s.opexY2,
      opexY3: acc.opexY3 + s.opexY3,
      ebitdaY1: acc.ebitdaY1 + s.ebitdaY1,
      ebitdaY2: acc.ebitdaY2 + s.ebitdaY2,
      ebitdaY3: acc.ebitdaY3 + s.ebitdaY3,
      ebitdaMarginY1: 0,
      ebitdaMarginY2: 0,
      ebitdaMarginY3: 0,
    }),
    {
      revenueY1: 0, revenueY2: 0, revenueY3: 0,
      cogsY1: 0, cogsY2: 0, cogsY3: 0,
      opexY1: 0, opexY2: 0, opexY3: 0,
      ebitdaY1: 0, ebitdaY2: 0, ebitdaY3: 0,
      ebitdaMarginY1: 0, ebitdaMarginY2: 0, ebitdaMarginY3: 0,
    }
  );

  // Compute margins after summing
  totals.ebitdaMarginY1 = totals.revenueY1 ? (totals.ebitdaY1 / totals.revenueY1) * 100 : 0;
  totals.ebitdaMarginY2 = totals.revenueY2 ? (totals.ebitdaY2 / totals.revenueY2) * 100 : 0;
  totals.ebitdaMarginY3 = totals.revenueY3 ? (totals.ebitdaY3 / totals.revenueY3) * 100 : 0;

  const yearRevenue = revForYear(totals, selectedYear);
  const yearCogs = cogsForYear(totals, selectedYear);
  const yearOpex = opexForYear(totals, selectedYear);
  const yearEbitda = ebitdaForYear(totals, selectedYear);
  const yearMargin = marginForYear(totals, selectedYear);

  /* ── Sports with data vs without ─────────────────────────── */
  const sportsWithData = summaries.filter(
    (s) => s.revenueY1 > 0 || s.cogsY1 > 0 || s.revenueY2 > 0 || s.cogsY2 > 0 || s.revenueY3 > 0 || s.cogsY3 > 0
  );
  const sportCodesWithData = new Set(sportsWithData.map((s) => s.sportCode));
  const sportsWithoutData = sports.filter((sp) => !sportCodesWithData.has(sp.sportCode));

  /* ── Revenue composition for selected year ───────────────── */
  const revBySport = sportsWithData
    .map((s) => ({ sportId: s.sportId, sportName: s.sportName, sportCode: s.sportCode, revenue: revForYear(s, selectedYear) }))
    .filter((s) => s.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const maxRevSelected = Math.max(...revBySport.map((s) => s.revenue), 1);

  return (
    <div className="page-grid">
      {/* ── Header ──────────────────────────────────────────── */}
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Future of Sports</span>
          <h3>FSP Consolidated View</h3>
          <p className="muted">Aggregated P&amp;L across all sports</p>
        </div>
      </section>

      {/* ── Year selector ───────────────────────────────────── */}
      <section className="inline-actions">
        {([1, 2, 3] as const).map((y) => (
          <Link
            key={y}
            className={`segment-chip${selectedYear === y ? " active" : ""}`}
            href={`/fsp/consolidated?year=${y}` as Route}
          >
            Year {y}
          </Link>
        ))}
      </section>

      {/* ── Consolidated stats for selected year ────────────── */}
      <section className="stats-grid compact-stats">
        <div className="metric-card accent-brand">
          <span className="metric-topline">
            <span className="metric-label">Total Revenue</span>
          </span>
          <span className="metric-value">{fmt(yearRevenue)}</span>
          <span className="metric-subvalue">Year {selectedYear}</span>
        </div>

        <div className="metric-card accent-warn">
          <span className="metric-topline">
            <span className="metric-label">Total COGS</span>
          </span>
          <span className="metric-value">{fmt(yearCogs)}</span>
          <span className="metric-subvalue">Year {selectedYear}</span>
        </div>

        <div className="metric-card accent-warn">
          <span className="metric-topline">
            <span className="metric-label">Total OPEX</span>
          </span>
          <span className="metric-value">{fmt(yearOpex)}</span>
          <span className="metric-subvalue">Year {selectedYear}</span>
        </div>

        <div className={`metric-card ${yearEbitda >= 0 ? "accent-good" : "accent-risk"}`}>
          <span className="metric-topline">
            <span className="metric-label">EBITDA</span>
            <span className={`signal-pill ${yearEbitda >= 0 ? "signal-good" : "signal-risk"}`}>
              {yearEbitda >= 0 ? "Positive" : "Negative"}
            </span>
          </span>
          <span className="metric-value">{fmt(yearEbitda)}</span>
          <span className="metric-subvalue">Margin: {pct(yearMargin)}</span>
        </div>
      </section>

      {/* ── Per-sport P&L cards ─────────────────────────────── */}
      {sportsWithData.length > 0 && (
        <section className="card-grid">
          {sportsWithData.map((s) => {
            const latestEbitda = ebitdaForYear(s, selectedYear);

            return (
              <article className="card" key={s.sportId}>
                <div className="card-title-row">
                  <h3>{s.sportName}</h3>
                  <span
                    className={`signal-pill ${
                      latestEbitda >= 0 ? "signal-good" : "signal-risk"
                    }`}
                  >
                    {latestEbitda >= 0 ? "Profitable" : "Loss"}
                  </span>
                </div>

                <div className="table-wrapper clean-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>Revenue</th>
                        <th>COGS</th>
                        <th>OPEX</th>
                        <th>EBITDA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([1, 2, 3] as const).map((y) => {
                        const ebitda = ebitdaForYear(s, y);
                        return (
                          <tr key={y}>
                            <td><strong>Y{y}</strong></td>
                            <td>{fmt(revForYear(s, y))}</td>
                            <td>{fmt(cogsForYear(s, y))}</td>
                            <td>{fmt(opexForYear(s, y))}</td>
                            <td>
                              <span
                                className={`signal-pill ${
                                  ebitda >= 0 ? "signal-good" : "signal-risk"
                                }`}
                              >
                                {fmt(ebitda)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="muted metric-subvalue">
                  EBITDA Margin: Y1: {pct(s.ebitdaMarginY1)} &middot; Y2: {pct(s.ebitdaMarginY2)} &middot; Y3: {pct(s.ebitdaMarginY3)}
                </p>

                <Link
                  className="ghost-link"
                  href={`/fsp/sports/${s.sportCode}` as Route}
                >
                  Open module &rarr;
                </Link>
              </article>
            );
          })}
        </section>
      )}

      {/* ── Revenue composition (selected year bars) ────────── */}
      {revBySport.length > 0 && (
        <article className="card">
          <div className="card-title-row">
            <h3>Revenue Composition (Year {selectedYear})</h3>
          </div>
          <div className="chart-list">
            {revBySport.map((s) => {
              const widthPct = (s.revenue / maxRevSelected) * 100;
              return (
                <div className="chart-row" key={s.sportId}>
                  <div className="chart-meta">
                    <span>{s.sportName}</span>
                    <span className="muted">{fmt(s.revenue)}</span>
                  </div>
                  <div className="chart-track">
                    <div
                      className="chart-fill good"
                      style={{ width: `${Math.max(4, widthPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      )}

      {/* ── Sports without data ─────────────────────────────── */}
      {sportsWithoutData.length > 0 && (
        <article className="card">
          <div className="card-title-row">
            <h3>Sports Awaiting Setup</h3>
          </div>
          <p className="muted">
            These sports have no financial projections configured yet. Open each sport module to set up revenue and cost data.
          </p>
          <div className="inline-actions">
            {sportsWithoutData.map((sp) => (
              <Link
                key={sp.id}
                className="action-button secondary"
                href={`/fsp/sports/${sp.sportCode}` as Route}
              >
                {sp.displayName} &rarr;
              </Link>
            ))}
          </div>
        </article>
      )}

      {/* ── Empty state: no data at all ─────────────────────── */}
      {sportsWithData.length === 0 && summaries.length === 0 && (
        <article className="card">
          <div className="card-title-row">
            <h3>No Financial Data</h3>
          </div>
          <p className="muted">
            No sports have financial projections yet. Open individual sport modules from the{" "}
            <Link className="ghost-link" href={"/fsp" as Route}>FSP section</Link>{" "}
            to configure P&amp;L data.
          </p>
        </article>
      )}
    </div>
  );
}
