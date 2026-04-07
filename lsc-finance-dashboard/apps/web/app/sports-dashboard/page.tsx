import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "../../lib/auth";
import { getFspPnlSummaries, getFspSports } from "@lsc/db";

const fmt = (v: number): string =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function marginPct(ebitda: number, revenue: number): string {
  if (!revenue) return "0.0%";
  return `${((ebitda / revenue) * 100).toFixed(1)}%`;
}

function ebitdaTone(v: number): string {
  return v >= 0 ? "signal-pill signal-good" : "signal-pill signal-risk";
}

const CHART_FILLS = ["good", "secondary", "warn", "risk", "good", "secondary"];

export default async function SportsDashboardPage() {
  await requireRole(["super_admin", "finance_admin", "commercial_user", "viewer"]);

  const [summaries, allSports] = await Promise.all([
    getFspPnlSummaries("base"),
    getFspSports(),
  ]);

  /* ── Filter: only sports with data ───────────────────────── */
  const activeSummaries = summaries.filter(
    (s) => s.revenueY1 > 0 || s.cogsY1 > 0 || s.opexY1 > 0 ||
           s.revenueY2 > 0 || s.cogsY2 > 0 || s.opexY2 > 0 ||
           s.revenueY3 > 0 || s.cogsY3 > 0 || s.opexY3 > 0
  );
  const activeCodesSet = new Set(activeSummaries.map((s) => s.sportCode));

  /* ── Consolidated totals ─────────────────────────────────── */
  const totRevY1 = activeSummaries.reduce((a, s) => a + s.revenueY1, 0);
  const totRevY3 = activeSummaries.reduce((a, s) => a + s.revenueY3, 0);
  const totCogsY1 = activeSummaries.reduce((a, s) => a + s.cogsY1, 0);
  const totCogsY3 = activeSummaries.reduce((a, s) => a + s.cogsY3, 0);
  const totOpexY1 = activeSummaries.reduce((a, s) => a + s.opexY1, 0);
  const totOpexY3 = activeSummaries.reduce((a, s) => a + s.opexY3, 0);
  const totEbitdaY1 = totRevY1 - totCogsY1 - totOpexY1;
  const totEbitdaY3 = totRevY3 - totCogsY3 - totOpexY3;

  /* ── Table totals (all 3 years for the total row) ────────── */
  const totRevY2 = activeSummaries.reduce((a, s) => a + s.revenueY2, 0);
  const totCogsY2 = activeSummaries.reduce((a, s) => a + s.cogsY2, 0);
  const totOpexY2 = activeSummaries.reduce((a, s) => a + s.opexY2, 0);
  const totEbitdaY2 = totRevY2 - totCogsY2 - totOpexY2;

  const totalSportsCount = allSports.length;
  const withDataCount = activeSummaries.length;

  /* ── Chart data ──────────────────────────────────────────── */
  const revChartData = activeSummaries
    .filter((s) => s.revenueY1 > 0)
    .sort((a, b) => b.revenueY1 - a.revenueY1);
  const maxRevY1 = Math.max(...revChartData.map((s) => s.revenueY1), 1);

  const ebitdaChartData = activeSummaries
    .filter((s) => s.ebitdaY1 !== 0)
    .sort((a, b) => b.ebitdaY1 - a.ebitdaY1);
  const maxAbsEbitda = Math.max(...ebitdaChartData.map((s) => Math.abs(s.ebitdaY1)), 1);

  return (
    <div className="page-grid">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">All sports overview</span>
          <h3>Sports Dashboard</h3>
          <p className="muted">
            Unified financial summary across all FSP sports modules
          </p>
        </div>
        <div>
          <Link className="ghost-link" href={"/fsp/consolidated" as Route}>
            Detailed consolidated P&amp;L &rarr;
          </Link>
        </div>
      </header>

      {/* ── Overview stats (5 cards, ONE value each) ────────── */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total Sports</span>
          </div>
          <div className="metric-value">{totalSportsCount}</div>
          <span className="metric-subvalue">
            {withDataCount} with financial data
          </span>
        </article>

        {totRevY1 > 0 && (
          <article className="metric-card accent-good">
            <div className="metric-topline">
              <span className="metric-label">Y1 Revenue</span>
            </div>
            <div className="metric-value">{fmt(totRevY1)}</div>
          </article>
        )}

        {(totRevY1 > 0 || totEbitdaY1 !== 0) && (
          <article className={`metric-card ${totEbitdaY1 >= 0 ? "accent-good" : "accent-risk"}`}>
            <div className="metric-topline">
              <span className="metric-label">Y1 EBITDA</span>
            </div>
            <div className="metric-value">{fmt(totEbitdaY1)}</div>
            <span className="metric-subvalue">
              Margin: {marginPct(totEbitdaY1, totRevY1)}
            </span>
          </article>
        )}

        {totRevY3 > 0 && (
          <article className="metric-card accent-good">
            <div className="metric-topline">
              <span className="metric-label">Y3 Revenue</span>
            </div>
            <div className="metric-value">{fmt(totRevY3)}</div>
            <span className="metric-subvalue">Growth trajectory</span>
          </article>
        )}

        {(totRevY3 > 0 || totEbitdaY3 !== 0) && (
          <article className={`metric-card ${totEbitdaY3 >= 0 ? "accent-good" : "accent-risk"}`}>
            <div className="metric-topline">
              <span className="metric-label">Y3 EBITDA</span>
            </div>
            <div className="metric-value">{fmt(totEbitdaY3)}</div>
            <span className="metric-subvalue">
              Margin: {marginPct(totEbitdaY3, totRevY3)}
            </span>
          </article>
        )}
      </section>

      {/* ── Sport-by-sport comparison table ─────────────────── */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Sport-by-sport P&amp;L</span>
            <h3>3-Year Financial Comparison</h3>
          </div>
          {activeSummaries.length > 0 && (
            <span className="badge">{activeSummaries.length} sports</span>
          )}
        </div>
        {activeSummaries.length > 0 ? (
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Sport</th>
                  <th>Rev Y1</th>
                  <th>Rev Y2</th>
                  <th>Rev Y3</th>
                  <th>EBITDA Y1</th>
                  <th>EBITDA Y2</th>
                  <th>EBITDA Y3</th>
                  <th>Margin Y1</th>
                  <th>Module</th>
                </tr>
              </thead>
              <tbody>
                {activeSummaries.map((s) => (
                  <tr key={s.sportId}>
                    <td>
                      <Link
                        className="ghost-link"
                        href={`/fsp/sports/${s.sportCode}` as Route}
                      >
                        <strong>{s.sportName}</strong>
                      </Link>
                    </td>
                    <td>{fmt(s.revenueY1)}</td>
                    <td>{fmt(s.revenueY2)}</td>
                    <td>{fmt(s.revenueY3)}</td>
                    <td>
                      <span className={ebitdaTone(s.ebitdaY1)}>
                        {fmt(s.ebitdaY1)}
                      </span>
                    </td>
                    <td>
                      <span className={ebitdaTone(s.ebitdaY2)}>
                        {fmt(s.ebitdaY2)}
                      </span>
                    </td>
                    <td>
                      <span className={ebitdaTone(s.ebitdaY3)}>
                        {fmt(s.ebitdaY3)}
                      </span>
                    </td>
                    <td>{s.ebitdaMarginY1.toFixed(1)}%</td>
                    <td>
                      <Link
                        className="action-button secondary"
                        href={`/fsp/sports/${s.sportCode}` as Route}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Total</strong></td>
                  <td><strong>{fmt(totRevY1)}</strong></td>
                  <td><strong>{fmt(totRevY2)}</strong></td>
                  <td><strong>{fmt(totRevY3)}</strong></td>
                  <td>
                    <strong>
                      <span className={ebitdaTone(totEbitdaY1)}>
                        {fmt(totEbitdaY1)}
                      </span>
                    </strong>
                  </td>
                  <td>
                    <strong>
                      <span className={ebitdaTone(totEbitdaY2)}>
                        {fmt(totEbitdaY2)}
                      </span>
                    </strong>
                  </td>
                  <td>
                    <strong>
                      <span className={ebitdaTone(totEbitdaY3)}>
                        {fmt(totEbitdaY3)}
                      </span>
                    </strong>
                  </td>
                  <td>
                    <strong>{marginPct(totEbitdaY1, totRevY1)}</strong>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            No sport financial data yet. Configure sports via the{" "}
            <Link className="ghost-link" href={"/fsp" as Route}>
              FSP section
            </Link>
            .
          </p>
        )}
      </article>

      {/* ── Revenue & EBITDA breakdown (grid-two) ──────────── */}
      {activeSummaries.length > 0 && (
        <section className="grid-two">
          {/* Left: Y1 Revenue by sport */}
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Revenue breakdown</span>
                <h3>Y1 Revenue by Sport</h3>
              </div>
            </div>
            <div className="chart-list">
              {revChartData.length > 0 ? (
                revChartData.map((s, i) => (
                  <div className="chart-row" key={s.sportId}>
                    <div className="chart-meta">
                      <strong>{s.sportName}</strong>
                      <span>
                        {fmt(s.revenueY1)}
                        {totRevY1 > 0 && (
                          <span className="muted">
                            {" "}({((s.revenueY1 / totRevY1) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="chart-track">
                      <div
                        className={`chart-fill ${CHART_FILLS[i % CHART_FILLS.length]}`}
                        style={{ width: `${Math.max(4, (s.revenueY1 / maxRevY1) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">No revenue data yet.</p>
              )}
            </div>
          </article>

          {/* Right: Y1 EBITDA by sport */}
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">EBITDA breakdown</span>
                <h3>Y1 Profitability by Sport</h3>
              </div>
            </div>
            <div className="chart-list">
              {ebitdaChartData.length > 0 ? (
                ebitdaChartData.map((s) => (
                  <div className="chart-row" key={s.sportId}>
                    <div className="chart-meta">
                      <strong>{s.sportName}</strong>
                      <span>
                        {fmt(s.ebitdaY1)}
                        <span className="muted">
                          {" "}({s.ebitdaMarginY1.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                    <div className="chart-track">
                      <div
                        className={`chart-fill ${s.ebitdaY1 >= 0 ? "good" : "risk"}`}
                        style={{ width: `${Math.max(4, (Math.abs(s.ebitdaY1) / maxAbsEbitda) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">No EBITDA data yet.</p>
              )}
            </div>
          </article>
        </section>
      )}

      {/* ── Quick access: sport module cards ────────────────── */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Quick access</span>
            <h3>All Sport Modules</h3>
          </div>
        </div>
        <div className="card-grid">
          {allSports.map((sp) => {
            const hasData = activeCodesSet.has(sp.sportCode);
            return (
              <Link
                className="workflow-tile"
                href={`/fsp/sports/${sp.sportCode}` as Route}
                key={sp.id}
              >
                <span>
                  {hasData ? (
                    <span className="signal-pill signal-good">Has data</span>
                  ) : (
                    <span className="signal-pill signal-risk">Needs setup</span>
                  )}
                </span>
                <strong>{sp.displayName}</strong>
                <span className="muted">{sp.leagueName}</span>
              </Link>
            );
          })}
        </div>
      </article>
    </div>
  );
}
