import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "../../lib/auth";
import { getFspPnlSummaries, getFspSports } from "@lsc/db";

function fmt(v: number): string {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(v: number, total: number): string {
  if (!total) return "0%";
  return `${((v / total) * 100).toFixed(1)}%`;
}

function ebitdaTone(v: number): string {
  return v >= 0 ? "signal-pill signal-good" : "signal-pill signal-risk";
}

const CHART_FILLS = ["good", "secondary", "warn", "risk", "good", "secondary"];

export default async function SportsDashboardPage() {
  await requireRole(["super_admin", "finance_admin", "commercial_user", "viewer"]);

  const [summaries, allSports] = await Promise.all([
    getFspPnlSummaries("base"),
    getFspSports()
  ]);

  // Only sports with data
  const activeSummaries = summaries.filter((s) => s.revenueY1 > 0 || s.cogsY1 > 0 || s.opexY1 > 0);

  // Consolidated totals
  const totRevY1 = summaries.reduce((s, r) => s + r.revenueY1, 0);
  const totRevY2 = summaries.reduce((s, r) => s + r.revenueY2, 0);
  const totRevY3 = summaries.reduce((s, r) => s + r.revenueY3, 0);
  const totCogsY1 = summaries.reduce((s, r) => s + r.cogsY1, 0);
  const totCogsY2 = summaries.reduce((s, r) => s + r.cogsY2, 0);
  const totCogsY3 = summaries.reduce((s, r) => s + r.cogsY3, 0);
  const totOpexY1 = summaries.reduce((s, r) => s + r.opexY1, 0);
  const totOpexY2 = summaries.reduce((s, r) => s + r.opexY2, 0);
  const totOpexY3 = summaries.reduce((s, r) => s + r.opexY3, 0);
  const totEbitdaY1 = totRevY1 - totCogsY1 - totOpexY1;
  const totEbitdaY2 = totRevY2 - totCogsY2 - totOpexY2;
  const totEbitdaY3 = totRevY3 - totCogsY3 - totOpexY3;

  const totalSports = allSports.length;
  const populatedSports = activeSummaries.length;

  return (
    <div className="page-grid">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">All sports overview</span>
          <h3>Sports Dashboard</h3>
          <p className="muted">Unified financial summary across all FSP sports modules.</p>
        </div>
        <div>
          <Link className="ghost-link" href={"/fsp/consolidated" as Route}>Detailed consolidated P&L</Link>
        </div>
      </header>

      {/* KPI stats */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline"><span className="metric-label">Total sports</span></div>
          <div className="metric-value">{totalSports}</div>
          <span className="metric-subvalue">{populatedSports} with financial data</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline"><span className="metric-label">Total revenue (Y1)</span></div>
          <div className="metric-value">{fmt(totRevY1)}</div>
          <span className="metric-subvalue">Y2: {fmt(totRevY2)} · Y3: {fmt(totRevY3)}</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline"><span className="metric-label">Total costs (Y1)</span></div>
          <div className="metric-value">{fmt(totCogsY1 + totOpexY1)}</div>
          <span className="metric-subvalue">COGS: {fmt(totCogsY1)} + OPEX: {fmt(totOpexY1)}</span>
        </article>
        <article className={`metric-card ${totEbitdaY1 >= 0 ? "accent-good" : "accent-risk"}`}>
          <div className="metric-topline"><span className="metric-label">EBITDA (Y1)</span></div>
          <div className="metric-value">{fmt(totEbitdaY1)}</div>
          <span className="metric-subvalue">Y2: {fmt(totEbitdaY2)} · Y3: {fmt(totEbitdaY3)}</span>
        </article>
      </section>

      {/* Per-sport P&L comparison table */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Sport-by-sport P&L</span>
            <h3>3-year financial comparison</h3>
          </div>
          <span className="badge">{summaries.length} sports</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Sport</th>
                <th>Revenue Y1</th>
                <th>Revenue Y2</th>
                <th>Revenue Y3</th>
                <th>EBITDA Y1</th>
                <th>EBITDA Y2</th>
                <th>EBITDA Y3</th>
                <th>Margin Y1</th>
                <th>Module</th>
              </tr>
            </thead>
            <tbody>
              {summaries.length > 0 ? (
                summaries.map((s) => (
                  <tr key={s.sportId}>
                    <td>
                      <Link className="ghost-link" href={`/fsp/sports/${s.sportCode}` as Route}>
                        <strong>{s.sportName}</strong>
                      </Link>
                    </td>
                    <td>{fmt(s.revenueY1)}</td>
                    <td>{fmt(s.revenueY2)}</td>
                    <td>{fmt(s.revenueY3)}</td>
                    <td><span className={`pill ${ebitdaTone(s.ebitdaY1)}`}>{fmt(s.ebitdaY1)}</span></td>
                    <td><span className={`pill ${ebitdaTone(s.ebitdaY2)}`}>{fmt(s.ebitdaY2)}</span></td>
                    <td><span className={`pill ${ebitdaTone(s.ebitdaY3)}`}>{fmt(s.ebitdaY3)}</span></td>
                    <td>{s.ebitdaMarginY1.toFixed(1)}%</td>
                    <td>
                      <Link className="action-button secondary" href={`/fsp/sports/${s.sportCode}` as Route}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={9}>No sport financial data yet. Seed data via sport modules.</td>
                </tr>
              )}
              {summaries.length > 0 ? (
                <tr>
                  <td><strong>Total (all sports)</strong></td>
                  <td><strong>{fmt(totRevY1)}</strong></td>
                  <td><strong>{fmt(totRevY2)}</strong></td>
                  <td><strong>{fmt(totRevY3)}</strong></td>
                  <td><strong><span className={`pill ${ebitdaTone(totEbitdaY1)}`}>{fmt(totEbitdaY1)}</span></strong></td>
                  <td><strong><span className={`pill ${ebitdaTone(totEbitdaY2)}`}>{fmt(totEbitdaY2)}</span></strong></td>
                  <td><strong><span className={`pill ${ebitdaTone(totEbitdaY3)}`}>{fmt(totEbitdaY3)}</span></strong></td>
                  <td><strong>{totRevY1 ? ((totEbitdaY1 / totRevY1) * 100).toFixed(1) : "0"}%</strong></td>
                  <td />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      {/* Revenue breakdown by sport (Y1) */}
      <section className="grid-two">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Revenue breakdown</span>
              <h3>Year 1 revenue by sport</h3>
            </div>
          </div>
          <div className="chart-list">
            {activeSummaries.length > 0 ? (
              (() => {
                const maxRev = Math.max(1, ...activeSummaries.map((s) => s.revenueY1));
                return activeSummaries.map((s, i) => (
                  <div className="chart-row" key={s.sportId}>
                    <div className="chart-meta">
                      <strong>{s.sportName}</strong>
                      <span>{fmt(s.revenueY1)} ({pct(s.revenueY1, totRevY1)})</span>
                    </div>
                    <div className="chart-track">
                      <div
                        className={`chart-fill ${CHART_FILLS[i % CHART_FILLS.length]}`}
                        style={{ width: `${Math.max(4, (s.revenueY1 / maxRev) * 100)}%` }}
                      />
                    </div>
                  </div>
                ));
              })()
            ) : (
              <p className="muted">No revenue data yet.</p>
            )}
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">EBITDA breakdown</span>
              <h3>Year 1 profitability by sport</h3>
            </div>
          </div>
          <div className="chart-list">
            {activeSummaries.length > 0 ? (
              (() => {
                const maxAbs = Math.max(1, ...activeSummaries.map((s) => Math.abs(s.ebitdaY1)));
                return activeSummaries.map((s) => (
                  <div className="chart-row" key={s.sportId}>
                    <div className="chart-meta">
                      <strong>{s.sportName}</strong>
                      <span>{fmt(s.ebitdaY1)} ({s.ebitdaMarginY1.toFixed(1)}%)</span>
                    </div>
                    <div className="chart-track">
                      <div
                        className={`chart-fill ${s.ebitdaY1 >= 0 ? "good" : "risk"}`}
                        style={{ width: `${Math.max(4, (Math.abs(s.ebitdaY1) / maxAbs) * 100)}%` }}
                      />
                    </div>
                  </div>
                ));
              })()
            ) : (
              <p className="muted">No EBITDA data yet.</p>
            )}
          </div>
        </article>
      </section>

      {/* All sports quick links */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Quick access</span>
            <h3>All sport modules</h3>
          </div>
        </div>
        <div className="support-grid">
          {allSports.map((s) => (
            <Link className="workflow-tile" href={`/fsp/sports/${s.sportCode}` as Route} key={s.id}>
              <span className="process-step-index">
                {s.isActive ? (
                  <span className="pill signal-pill signal-good">Active</span>
                ) : (
                  <span className="pill subtle-pill">Inactive</span>
                )}
              </span>
              <strong>{s.displayName}</strong>
              <span className="muted">{s.leagueName}</span>
            </Link>
          ))}
        </div>
      </article>
    </div>
  );
}
