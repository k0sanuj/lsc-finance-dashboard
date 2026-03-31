import { getGigWorkers, getGigPayoutSummary } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(n);
}

function countryFlag(code: string): string {
  return code === "IN" ? "\u{1F1EE}\u{1F1F3}" : code === "KE" ? "\u{1F1F0}\u{1F1EA}" : "\u{1F3F3}";
}

export default async function GigWorkersPage() {
  await requireRole(["super_admin", "finance_admin"]);

  const [workers, summary] = await Promise.all([
    getGigWorkers("XTZ"),
    getGigPayoutSummary("XTZ")
  ]);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">XTZ India — gig worker management and payout tracking</span>
          <h3>Gig Worker Payouts</h3>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total workers</span>
          </div>
          <div className="metric-value">{summary.totalWorkers}</div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Active workers</span>
          </div>
          <div className="metric-value">{summary.activeWorkers}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">India-based</span>
          </div>
          <div className="metric-value">{summary.indiaWorkers}</div>
          <span className="metric-subvalue">{"\u{1F1EE}\u{1F1F3}"} IN</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Kenya-based</span>
          </div>
          <div className="metric-value">{summary.kenyaWorkers}</div>
          <span className="metric-subvalue">{"\u{1F1F0}\u{1F1EA}"} KE</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Pending payouts</span>
          </div>
          <div className="metric-value">{summary.pendingPayouts}</div>
          <span className="metric-subvalue">{fmtCurrency(summary.pendingAmount)} pending</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">MTD paid</span>
          </div>
          <div className="metric-value">{fmtCurrency(summary.mtdPaid)}</div>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">YTD paid</span>
          </div>
          <div className="metric-value">{fmtCurrency(summary.ytdPaid)}</div>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Worker roster</span>
            <h3>All gig workers</h3>
          </div>
          <span className="pill">{workers.length} workers</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Country</th>
                <th>Role</th>
                <th>Payment method</th>
                <th>Frequency</th>
                <th>Rate</th>
                <th>Tax rate</th>
                <th>Status</th>
                <th>MTD paid</th>
                <th>YTD paid</th>
              </tr>
            </thead>
            <tbody>
              {workers.length > 0 ? (
                workers.map((w) => (
                  <tr key={w.id}>
                    <td><strong>{w.name}</strong></td>
                    <td>{w.location}</td>
                    <td>{countryFlag(w.countryCode)} {w.countryCode}</td>
                    <td><span className="subtle-pill">{w.roleType}</span></td>
                    <td>{w.paymentMethod}</td>
                    <td>{w.paymentFrequency}</td>
                    <td>{w.rateAmount} <span className="muted">{w.rateCurrency}</span></td>
                    <td>{w.taxWithholdingRate}%</td>
                    <td>
                      {w.isActive ? (
                        <span className="signal-pill signal-good">Active</span>
                      ) : (
                        <span className="pill">Inactive</span>
                      )}
                    </td>
                    <td>{w.mtdPaid}</td>
                    <td>{w.ytdPaid}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={11}>
                    No gig workers found for XTZ.
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
