import type { Route } from "next";
import Link from "next/link";
import { getGigWorkers, getGigPayoutSummary, getGigPayouts } from "@lsc/db";
import { requireRole } from "../../lib/auth";
import {
  generatePayoutsAction,
  processPayoutAction,
  confirmPayoutAction
} from "./actions";

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

type GigWorkersPageProps = {
  searchParams?: Promise<{ view?: string; status?: string; message?: string }>;
};

export default async function GigWorkersPage({ searchParams }: GigWorkersPageProps) {
  await requireRole(["super_admin", "finance_admin"]);

  const pageParams = searchParams ? await searchParams : undefined;
  const selectedView = pageParams?.view === "payouts" ? "payouts" : "workers";
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;

  const [workers, summary, payouts] = await Promise.all([
    getGigWorkers("XTZ"),
    getGigPayoutSummary("XTZ"),
    selectedView === "payouts" ? getGigPayouts("XTZ") : Promise.resolve([])
  ]);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">XTZ India — gig worker management and payout tracking</span>
          <h3>Gig Worker Payouts</h3>
          <div className="inline-actions">
            <Link
              className={`segment-chip ${selectedView === "workers" ? "active" : ""}`}
              href={"/gig-workers" as Route}
            >
              Workers
            </Link>
            <Link
              className={`segment-chip ${selectedView === "payouts" ? "active" : ""}`}
              href={"/gig-workers?view=payouts" as Route}
            >
              Payouts
            </Link>
          </div>
        </div>
        <div>
          <form action={generatePayoutsAction}>
            <input name="companyCode" type="hidden" value="XTZ" />
            <button className="action-button primary" type="submit">
              Generate payouts
            </button>
          </form>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Error" : status === "success" ? "Done" : "Info"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total workers</span>
          </div>
          <div className="metric-value">{summary.totalWorkers}</div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Active</span>
          </div>
          <div className="metric-value">{summary.activeWorkers}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">India</span>
          </div>
          <div className="metric-value">{summary.indiaWorkers}</div>
          <span className="metric-subvalue">{"\u{1F1EE}\u{1F1F3}"}</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Kenya</span>
          </div>
          <div className="metric-value">{summary.kenyaWorkers}</div>
          <span className="metric-subvalue">{"\u{1F1F0}\u{1F1EA}"}</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Pending</span>
          </div>
          <div className="metric-value">{summary.pendingPayouts}</div>
          <span className="metric-subvalue">{fmtCurrency(summary.pendingAmount)}</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">MTD paid</span>
          </div>
          <div className="metric-value">{fmtCurrency(summary.mtdPaid)}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">YTD paid</span>
          </div>
          <div className="metric-value">{fmtCurrency(summary.ytdPaid)}</div>
        </article>
      </section>

      {selectedView === "workers" ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Worker roster</span>
              <h3>All gig workers</h3>
            </div>
            <span className="badge">{workers.length} workers</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Country</th>
                  <th>Role</th>
                  <th>Payment</th>
                  <th>Frequency</th>
                  <th>Rate</th>
                  <th>Tax</th>
                  <th>Status</th>
                  <th>MTD</th>
                  <th>YTD</th>
                </tr>
              </thead>
              <tbody>
                {workers.length > 0 ? (
                  workers.map((w) => (
                    <tr key={w.id}>
                      <td><strong>{w.name}</strong></td>
                      <td>{w.location}</td>
                      <td>{countryFlag(w.countryCode)} {w.countryCode}</td>
                      <td><span className="pill subtle-pill">{w.roleType}</span></td>
                      <td>{w.paymentMethod}</td>
                      <td>{w.paymentFrequency}</td>
                      <td>{w.rateAmount} <span className="muted">{w.rateCurrency}</span></td>
                      <td>{(w.taxWithholdingRate * 100).toFixed(0)}%</td>
                      <td>
                        {w.isActive ? (
                          <span className="pill signal-pill signal-good">Active</span>
                        ) : (
                          <span className="pill subtle-pill">Inactive</span>
                        )}
                      </td>
                      <td>{w.mtdPaid}</td>
                      <td>{w.ytdPaid}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={11}>No gig workers found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedView === "payouts" ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Payout processing</span>
              <h3>Payout records</h3>
            </div>
            <span className="badge">{payouts.length} payouts</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Period</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Net</th>
                  <th>Currency</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.length > 0 ? (
                  payouts.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.workerName}</strong></td>
                      <td>{p.periodStart} — {p.periodEnd}</td>
                      <td>{p.grossAmount}</td>
                      <td>{p.deductions}</td>
                      <td><strong>{p.netAmount}</strong></td>
                      <td>{p.currency}</td>
                      <td>{p.paymentMethod}</td>
                      <td>
                        <span className={`pill ${
                          p.status === "paid" ? "signal-pill signal-good" :
                          p.status === "processing" ? "signal-pill signal-warn" :
                          p.status === "failed" ? "signal-pill signal-risk" :
                          "subtle-pill"
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td>{p.paidAt !== "TBD" ? p.paidAt : "—"}</td>
                      <td>
                        <div className="inline-actions">
                          {p.status === "pending" ? (
                            <form action={processPayoutAction}>
                              <input name="payoutId" type="hidden" value={p.id} />
                              <button className="action-button secondary" type="submit">
                                Process
                              </button>
                            </form>
                          ) : null}
                          {p.status === "pending" || p.status === "processing" ? (
                            <form action={confirmPayoutAction}>
                              <input name="payoutId" type="hidden" value={p.id} />
                              <button className="action-button primary" type="submit">
                                Confirm paid
                              </button>
                            </form>
                          ) : null}
                          {p.status === "paid" ? (
                            <span className="muted">Complete</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={10}>
                      No payouts found. Use "Generate payouts" to create payout records for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
