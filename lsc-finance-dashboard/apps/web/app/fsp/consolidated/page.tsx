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

export default async function FspConsolidatedPage() {
  await requireRole(["super_admin", "finance_admin", "viewer"]);

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
    }),
    {
      revenueY1: 0, revenueY2: 0, revenueY3: 0,
      cogsY1: 0, cogsY2: 0, cogsY3: 0,
      opexY1: 0, opexY2: 0, opexY3: 0,
      ebitdaY1: 0, ebitdaY2: 0, ebitdaY3: 0,
    }
  );

  const ebitdaSignal =
    totals.ebitdaY1 >= 0 && totals.ebitdaY2 >= 0 && totals.ebitdaY3 >= 0
      ? "signal-good"
      : "signal-risk";

  /* ── Revenue composition (Y1) for chart bars ──────────────── */
  const maxRevY1 = Math.max(...summaries.map((s) => s.revenueY1), 1);

  return (
    <div className="page-grid">
      {/* ── Header ──────────────────────────────────────────── */}
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Future of Sports</span>
          <h3>FSP Consolidated View</h3>
          <p className="muted">
            Aggregated P&amp;L across all sports &mdash; read-only roll-up
          </p>
        </div>
      </section>

      {/* ── Consolidated totals ─────────────────────────────── */}
      <section className="stats-grid compact-stats">
        <div className="metric-card accent-brand">
          <span className="metric-topline">
            <span className="metric-label">Total Revenue</span>
          </span>
          <span className="metric-value">
            Y1: {fmt(totals.revenueY1)} | Y2: {fmt(totals.revenueY2)} | Y3:{" "}
            {fmt(totals.revenueY3)}
          </span>
        </div>

        <div className="metric-card accent-warn">
          <span className="metric-topline">
            <span className="metric-label">Total COGS</span>
          </span>
          <span className="metric-value">
            Y1: {fmt(totals.cogsY1)} | Y2: {fmt(totals.cogsY2)} | Y3:{" "}
            {fmt(totals.cogsY3)}
          </span>
        </div>

        <div className="metric-card accent-risk">
          <span className="metric-topline">
            <span className="metric-label">Total OPEX</span>
          </span>
          <span className="metric-value">
            Y1: {fmt(totals.opexY1)} | Y2: {fmt(totals.opexY2)} | Y3:{" "}
            {fmt(totals.opexY3)}
          </span>
        </div>

        <div className="metric-card accent-good">
          <span className="metric-topline">
            <span className="metric-label">Total EBITDA</span>
            <span className={`signal-pill ${ebitdaSignal}`}>
              {totals.ebitdaY1 >= 0 ? "Positive" : "Negative"}
            </span>
          </span>
          <span className="metric-value">
            Y1: {fmt(totals.ebitdaY1)} | Y2: {fmt(totals.ebitdaY2)} | Y3:{" "}
            {fmt(totals.ebitdaY3)}
          </span>
        </div>
      </section>

      {/* ── Per-sport P&L cards ─────────────────────────────── */}
      {summaries.length > 0 && (
        <section className="card-grid">
          {summaries.map((s) => {
            const marginY1 = s.ebitdaMarginY1;
            const marginY2 = s.ebitdaMarginY2;
            const marginY3 = s.ebitdaMarginY3;

            return (
              <article className="card" key={s.sportId}>
                <div className="card-title-row">
                  <h3>{s.sportName}</h3>
                  <span
                    className={`signal-pill ${
                      s.ebitdaY1 >= 0 ? "signal-good" : "signal-risk"
                    }`}
                  >
                    {s.ebitdaY1 >= 0 ? "Profitable" : "Loss"}
                  </span>
                </div>

                <div className="table-wrapper clean-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Y1</th>
                        <th>Y2</th>
                        <th>Y3</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Revenue</td>
                        <td>{fmt(s.revenueY1)}</td>
                        <td>{fmt(s.revenueY2)}</td>
                        <td>{fmt(s.revenueY3)}</td>
                      </tr>
                      <tr>
                        <td>COGS</td>
                        <td>{fmt(s.cogsY1)}</td>
                        <td>{fmt(s.cogsY2)}</td>
                        <td>{fmt(s.cogsY3)}</td>
                      </tr>
                      <tr>
                        <td>OPEX</td>
                        <td>{fmt(s.opexY1)}</td>
                        <td>{fmt(s.opexY2)}</td>
                        <td>{fmt(s.opexY3)}</td>
                      </tr>
                      <tr>
                        <td>
                          <strong>EBITDA</strong>
                        </td>
                        <td>
                          <span
                            className={`signal-pill ${
                              s.ebitdaY1 >= 0 ? "signal-good" : "signal-risk"
                            }`}
                          >
                            {fmt(s.ebitdaY1)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`signal-pill ${
                              s.ebitdaY2 >= 0 ? "signal-good" : "signal-risk"
                            }`}
                          >
                            {fmt(s.ebitdaY2)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`signal-pill ${
                              s.ebitdaY3 >= 0 ? "signal-good" : "signal-risk"
                            }`}
                          >
                            {fmt(s.ebitdaY3)}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td>EBITDA Margin</td>
                        <td>{pct(marginY1)}</td>
                        <td>{pct(marginY2)}</td>
                        <td>{pct(marginY3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <Link
                  className="ghost-link"
                  href={`/fsp/sports/${s.sportCode}` as Route}
                >
                  View {s.sportName} module &rarr;
                </Link>
              </article>
            );
          })}
        </section>
      )}

      {/* ── Revenue composition (Y1 bars) ───────────────────── */}
      {summaries.length > 0 && (
        <article className="card">
          <div className="card-title-row">
            <h3>Revenue Composition (Y1)</h3>
          </div>
          <div className="chart-list">
            {summaries.map((s) => {
              const widthPct = maxRevY1 > 0 ? (s.revenueY1 / maxRevY1) * 100 : 0;
              const fillClass =
                s.ebitdaY1 >= 0
                  ? "chart-fill good"
                  : s.revenueY1 > 0
                    ? "chart-fill secondary"
                    : "chart-fill warn";

              return (
                <div className="chart-row" key={s.sportId}>
                  <div className="chart-meta">
                    <span>{s.sportName}</span>
                    <span className="muted">{fmt(s.revenueY1)}</span>
                  </div>
                  <div className="chart-track">
                    <div
                      className={fillClass}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      )}

      {/* ── All sports list with status ─────────────────────── */}
      <article className="card">
        <div className="card-title-row">
          <h3>All Sports</h3>
          <span className="badge">{sports.length} sports</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Sport</th>
                <th>League</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sports.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No sports configured yet.
                  </td>
                </tr>
              )}
              {sports.map((sp) => (
                <tr key={sp.id}>
                  <td>{sp.displayName}</td>
                  <td className="muted">{sp.leagueName || "--"}</td>
                  <td>
                    <span
                      className={`pill ${
                        sp.isActive ? "signal-good" : "signal-risk"
                      }`}
                    >
                      {sp.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="ghost-link"
                      href={`/fsp/sports/${sp.sportCode}` as Route}
                    >
                      Open &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
