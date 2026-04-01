import {
  getCapTableEntries,
  getCapTableSummary,
  getCapTableEvents,
  getInvestors
} from "@lsc/db";
import { requireRole } from "../../lib/auth";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function chartFillClass(shareClass: string, index: number): string {
  const classes = ["good", "secondary", "warn", ""];
  return classes[index % classes.length] ?? "";
}

export default async function CapTablePage() {
  await requireRole(["super_admin", "finance_admin"]);

  const [entries, summary, investors, events] = await Promise.all([
    getCapTableEntries("LSC"),
    getCapTableSummary("LSC"),
    getInvestors("LSC"),
    getCapTableEvents("LSC")
  ]);

  const barMax = Math.max(1, ...summary.shareClassBreakdown.map((sc) => sc.shares));

  return (
    <div className="page-grid">
      {/* Page header */}
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Equity structure</span>
          <h3>Cap Table</h3>
          <p className="muted">Equity ownership, share classes, and vesting schedules</p>
        </div>
      </section>

      {/* Summary stats */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total shares outstanding</span>
          </div>
          <div className="metric-value">{formatNumber(summary.totalShares)}</div>
          <span className="metric-subvalue">Across all classes</span>
        </article>

        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Total holders</span>
          </div>
          <div className="metric-value">{summary.totalHolders}</div>
          <span className="metric-subvalue">Founders, investors, pools, advisors</span>
        </article>

        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Share classes</span>
          </div>
          <div className="metric-value">{summary.shareClassBreakdown.length}</div>
          <span className="metric-subvalue">Distinct equity instruments</span>
        </article>
      </section>

      {/* Share class breakdown chart */}
      {summary.shareClassBreakdown.length > 0 ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Equity composition</span>
              <h3>Share class breakdown</h3>
            </div>
            <span className="pill">{summary.shareClassBreakdown.length} classes</span>
          </div>
          <div className="chart-list">
            {summary.shareClassBreakdown.map((sc, index) => (
              <div className="chart-row" key={sc.shareClass}>
                <div className="chart-meta">
                  <strong>{sc.shareClass}</strong>
                  <span>{formatNumber(sc.shares)} shares ({sc.pct}%)</span>
                </div>
                <div className="chart-track">
                  <div
                    className={`chart-fill ${chartFillClass(sc.shareClass, index)}`}
                    style={{ width: `${Math.max(8, (sc.shares / barMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Full cap table */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Ownership register</span>
            <h3>Full cap table</h3>
          </div>
          <span className="pill">{entries.length} entries</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Holder Name</th>
                <th>Type</th>
                <th>Share Class</th>
                <th>Shares Held</th>
                <th>Shares Vested</th>
                <th>Ownership %</th>
                <th>Exercise Price</th>
                <th>Vesting Period</th>
                <th>Agreement Ref</th>
              </tr>
            </thead>
            <tbody>
              {entries.length > 0 ? (
                entries.map((entry) => {
                  const vestingLabel =
                    entry.vestingStart && entry.vestingEnd
                      ? `${entry.vestingStart} — ${entry.vestingEnd}`
                      : entry.sharesHeld === entry.sharesVested && entry.sharesVested > 0
                        ? "Fully vested"
                        : "N/A";

                  return (
                    <tr key={entry.id}>
                      <td><strong>{entry.holderName}</strong></td>
                      <td>
                        <span className="pill subtle-pill">{entry.holderType}</span>
                      </td>
                      <td>{entry.shareClass}</td>
                      <td>{formatNumber(entry.sharesHeld)}</td>
                      <td>{formatNumber(entry.sharesVested)}</td>
                      <td>{entry.ownershipPct.toFixed(2)}%</td>
                      <td>{entry.exercisePrice}</td>
                      <td>{vestingLabel}</td>
                      <td>
                        {entry.agreementReference ? (
                          <span className="badge">{entry.agreementReference}</span>
                        ) : (
                          <span className="muted">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="muted" colSpan={9}>
                    No cap table entries have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Investors table */}
      {investors.length > 0 ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Investment history</span>
              <h3>Investors</h3>
            </div>
            <span className="pill">{investors.length} investors</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Investment Amount</th>
                  <th>Date</th>
                  <th>Share Class</th>
                  <th>Shares</th>
                  <th>Ownership %</th>
                  <th>Round</th>
                </tr>
              </thead>
              <tbody>
                {investors.map((inv) => (
                  <tr key={inv.id}>
                    <td><strong>{inv.name}</strong></td>
                    <td>
                      <span className="pill subtle-pill">{inv.investorType}</span>
                    </td>
                    <td>{inv.investmentAmount}</td>
                    <td>{inv.investmentDate}</td>
                    <td>{inv.shareClass}</td>
                    <td>{formatNumber(inv.sharesHeld)}</td>
                    <td>{inv.ownershipPct.toFixed(2)}%</td>
                    <td>
                      {inv.roundName ? (
                        <span className="badge">{inv.roundName}</span>
                      ) : (
                        <span className="muted">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Equity events timeline */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Equity events</span>
            <h3>Timeline of grants, exercises, and transfers</h3>
          </div>
          <span className="badge">{events.length} events</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Event</th>
                <th>Shares</th>
                <th>Price/Share</th>
                <th>From</th>
                <th>To</th>
                <th>Round</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {events.length > 0 ? (
                events.map((evt) => (
                  <tr key={evt.id}>
                    <td>{evt.eventDate}</td>
                    <td>
                      <span className={`pill ${
                        evt.eventType === "grant" ? "signal-pill signal-good" :
                        evt.eventType === "exercise" ? "signal-pill signal-warn" :
                        evt.eventType === "round" ? "signal-pill signal-good" :
                        "subtle-pill"
                      }`}>
                        {evt.eventType}
                      </span>
                    </td>
                    <td>{formatNumber(evt.sharesAffected)}</td>
                    <td>{evt.pricePerShare || "—"}</td>
                    <td>{evt.fromHolder || "—"}</td>
                    <td>{evt.toHolder || "—"}</td>
                    <td>
                      {evt.roundName ? (
                        <span className="badge">{evt.roundName}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">{evt.notes || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={8}>
                    No equity events recorded yet. Events are created when share grants are processed from the Legal platform.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
