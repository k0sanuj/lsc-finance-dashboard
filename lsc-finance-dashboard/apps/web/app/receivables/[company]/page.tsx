import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getReceivablesAgingDetail,
  getReceivablesAgingSummary,
  getSponsorBreakdown,
  getTrancheSummaryByCompany,
  getActionableTranches,
  getCollectionTranches,
  getTrancheScheduleCalendar,
  getTrancheAgingSummary,
  getContractTranches
} from "@lsc/db";
import type { TrancheScheduleSummaryRow, TrancheRow, CollectionTrancheRow, TrancheCalendarEntry, TrancheAgingSummary } from "@lsc/db";
import {
  activateTrancheAction,
  generateTrancheInvoiceAction,
  markTrancheCollectedAction
} from "../actions";
import { CompanyWorkspaceShell } from "../../components/company-workspace-shell";
import { requireRole } from "../../../lib/auth";
import {
  buildCompanyPath,
  isSharedCompanyCode
} from "../../lib/shared-workspace";

type ReceivablesCompanyPageProps = {
  params: Promise<{
    company: string;
  }>;
  searchParams?: Promise<{
    view?: string;
    status?: string;
    message?: string;
    contractId?: string;
  }>;
};

const workstreams = [
  {
    key: "overview",
    title: "Aging overview",
    description: "Outstanding receivables by aging bucket with tranche pipeline.",
    badge: "Step 1"
  },
  {
    key: "detail",
    title: "Invoice detail",
    description: "Full receivable invoice table with aging.",
    badge: "Step 2"
  },
  {
    key: "schedule",
    title: "Tranche schedule",
    description: "Contract payment milestones, deliverable gates, and invoicing.",
    badge: "Step 3"
  },
  {
    key: "calendar",
    title: "Tranche calendar",
    description: "Month-by-month timeline of upcoming payment milestones.",
    badge: "Step 4"
  },
  {
    key: "collection",
    title: "Collection path",
    description: "Track invoiced tranches, overdue aging, and mark collected.",
    badge: "Step 5"
  }
] as const;

function agingBucketTone(bucket: string): string {
  if (bucket === "current") return "signal-good";
  if (bucket === "1_30") return "signal-warn";
  return "signal-risk";
}

function agingChartFillClass(bucket: string): string {
  if (bucket === "current") return "chart-fill good";
  if (bucket === "1_30") return "chart-fill secondary";
  if (bucket === "31_60") return "chart-fill warn";
  return "chart-fill risk";
}

function daysLabel(daysOverdue: number, daysUntilDue: number): string {
  if (daysOverdue > 0) return `${daysOverdue}d overdue`;
  if (daysUntilDue > 0) return `Due in ${daysUntilDue}d`;
  return "Due today";
}

export default async function ReceivablesCompanyPage({ params, searchParams }: ReceivablesCompanyPageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const routeParams = await params;
  const resolvedCompany = routeParams.company?.toUpperCase();
  if (!isSharedCompanyCode(resolvedCompany)) {
    notFound();
  }

  const companyCode = resolvedCompany;
  const pageParams = searchParams ? await searchParams : undefined;
  const selectedView = workstreams.some((item) => item.key === pageParams?.view)
    ? (pageParams?.view as (typeof workstreams)[number]["key"])
    : pageParams?.view === "contract" ? "contract" as const : "overview";
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;
  const contractIdParam = pageParams?.contractId ?? null;

  if (companyCode === "FSP") {
    return (
      <div className="page-grid">
        <CompanyWorkspaceShell
          basePath="/receivables"
          companyCode={companyCode}
          description="FSP receivables workspace — no live receivables yet."
          eyebrow="FSP receivables"
          selectedView={selectedView}
          title="Future of Sports receivables workspace"
          workstreams={workstreams}
        />
        <section className="grid-two">
          <article className="card placeholder-card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Selected company</span>
                <h3>FSP receivables will appear once sponsorship invoices exist</h3>
              </div>
              <span className="badge">Placeholder</span>
            </div>
          </article>
        </section>
      </div>
    );
  }

  const [
    agingSummary, agingDetail, sponsors,
    trancheSummaries, actionableTranches, collectionTranches,
    calendarEntries, trancheAging, contractTranches
  ] = await Promise.all([
    getReceivablesAgingSummary(companyCode),
    selectedView === "detail" ? getReceivablesAgingDetail(companyCode) : Promise.resolve([]),
    getSponsorBreakdown(),
    selectedView === "schedule" ? getTrancheSummaryByCompany(companyCode) : Promise.resolve([] as TrancheScheduleSummaryRow[]),
    selectedView === "schedule" ? getActionableTranches(companyCode) : Promise.resolve([] as TrancheRow[]),
    selectedView === "collection" ? getCollectionTranches(companyCode) : Promise.resolve([] as CollectionTrancheRow[]),
    selectedView === "calendar" ? getTrancheScheduleCalendar(companyCode) : Promise.resolve([] as TrancheCalendarEntry[]),
    selectedView === "overview" ? getTrancheAgingSummary(companyCode) : Promise.resolve({ totalScheduled: 0, totalInvoiced: 0, totalCollected: 0, totalOutstanding: 0, scheduledCount: 0, activeCount: 0, invoicedCount: 0, collectedCount: 0 } as TrancheAgingSummary),
    selectedView === "contract" && contractIdParam ? getContractTranches(contractIdParam) : Promise.resolve([] as TrancheRow[])
  ]);

  const totalOutstanding = agingSummary.reduce((sum, bucket) => sum + bucket.rawTotal, 0);
  const overdueTotal = agingSummary
    .filter((bucket) => bucket.bucket !== "current")
    .reduce((sum, bucket) => sum + bucket.rawTotal, 0);
  const criticalTotal = agingSummary
    .filter((bucket) => bucket.bucket === "90_plus")
    .reduce((sum, bucket) => sum + bucket.rawTotal, 0);
  const currentTotal = agingSummary
    .filter((bucket) => bucket.bucket === "current")
    .reduce((sum, bucket) => sum + bucket.rawTotal, 0);
  const heatmapMax = Math.max(1, ...agingSummary.map((bucket) => bucket.rawTotal));

  return (
    <div className="page-grid">
      <CompanyWorkspaceShell
        basePath="/receivables"
        companyCode={companyCode}
        description="Receivables aging, sponsor collection tracking, and invoice-level detail."
        eyebrow="TBR receivables"
        selectedView={selectedView}
        title="Team Blue Rising receivables"
        workstreams={workstreams}
      />

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      {selectedView === "overview" ? (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card accent-brand">
              <div className="metric-topline">
                <span className="metric-label">Total Outstanding</span>
              </div>
              <div className="metric-value">
                ${totalOutstanding.toLocaleString("en-US")}
              </div>
              <span className="metric-subvalue">
                {agingSummary.reduce((sum, b) => sum + b.count, 0)} invoices
              </span>
            </article>
            <article className="metric-card accent-good">
              <div className="metric-topline">
                <span className="metric-label">Current</span>
              </div>
              <div className="metric-value">
                ${currentTotal.toLocaleString("en-US")}
              </div>
              <span className="metric-subvalue">Not yet due</span>
            </article>
            <article className="metric-card accent-warn">
              <div className="metric-topline">
                <span className="metric-label">Overdue</span>
              </div>
              <div className="metric-value">
                ${overdueTotal.toLocaleString("en-US")}
              </div>
              <span className="metric-subvalue">Needs attention</span>
            </article>
            <article className="metric-card accent-risk">
              <div className="metric-topline">
                <span className="metric-label">90+ Days</span>
              </div>
              <div className="metric-value">
                ${criticalTotal.toLocaleString("en-US")}
              </div>
              <span className="metric-subvalue">Critical</span>
            </article>
          </section>

          <section className="grid-two">
            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Aging heatmap</span>
                  <h3>Outstanding by aging bucket</h3>
                </div>
                <span className="pill">{companyCode}</span>
              </div>
              <div className="chart-list">
                {agingSummary.map((bucket) => (
                  <div className="chart-row" key={bucket.bucket}>
                    <div className="chart-meta">
                      <strong>{bucket.label}</strong>
                      <span>
                        {bucket.totalOutstanding} ({bucket.count} invoice{bucket.count !== 1 ? "s" : ""})
                      </span>
                    </div>
                    <div className="chart-track">
                      <div
                        className={agingChartFillClass(bucket.bucket)}
                        style={{ width: `${Math.max(4, (bucket.rawTotal / heatmapMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Sponsor breakdown</span>
                  <h3>Contract value vs collected cash</h3>
                </div>
                <span className="pill">TBR sponsors</span>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Sponsor</th>
                      <th>Contract</th>
                      <th>Recognized</th>
                      <th>Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sponsors.length > 0 ? (
                      sponsors.map((sponsor) => (
                        <tr key={sponsor.name}>
                          <td>{sponsor.name}</td>
                          <td>{sponsor.contractValue}</td>
                          <td>{sponsor.recognizedRevenue}</td>
                          <td>{sponsor.cashCollected}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="muted" colSpan={4}>
                          No sponsor data available yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          {/* Tranche pipeline summary on overview */}
          {trancheAging.scheduledCount + trancheAging.activeCount + trancheAging.invoicedCount + trancheAging.collectedCount > 0 ? (
            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Tranche pipeline</span>
                  <h3>Contract milestone receivables</h3>
                </div>
                <Link
                  className="ghost-link"
                  href={buildCompanyPath("/receivables", companyCode, { view: "schedule" }) as Route}
                >
                  View schedule
                </Link>
              </div>
              <div className="stats-grid compact-stats gap-bottom">
                <div className="metric-card compact">
                  <span className="metric-label">Scheduled</span>
                  <span className="metric-value">${trancheAging.totalScheduled.toLocaleString("en-US")}</span>
                  <span className="metric-subvalue">{trancheAging.scheduledCount + trancheAging.activeCount} tranches</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-label">Invoiced</span>
                  <span className="metric-value">${trancheAging.totalInvoiced.toLocaleString("en-US")}</span>
                  <span className="metric-subvalue">{trancheAging.invoicedCount} awaiting payment</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-label">Collected</span>
                  <span className="metric-value">${trancheAging.totalCollected.toLocaleString("en-US")}</span>
                  <span className="metric-subvalue">{trancheAging.collectedCount} complete</span>
                </div>
                <div className="metric-card compact">
                  <span className="metric-label">Outstanding</span>
                  <span className="metric-value">${trancheAging.totalOutstanding.toLocaleString("en-US")}</span>
                  <span className="metric-subvalue">Active + invoiced</span>
                </div>
              </div>
              <div className="chart-list">
                {[
                  { label: "Collected", value: trancheAging.totalCollected, tone: "good" },
                  { label: "Invoiced", value: trancheAging.totalInvoiced, tone: "warn" },
                  { label: "Scheduled", value: trancheAging.totalScheduled, tone: "secondary" }
                ].map((seg) => {
                  const pipelineMax = Math.max(1, trancheAging.totalScheduled + trancheAging.totalInvoiced + trancheAging.totalCollected);
                  return (
                    <div className="chart-row" key={seg.label}>
                      <div className="chart-meta">
                        <strong>{seg.label}</strong>
                        <span>${seg.value.toLocaleString("en-US")}</span>
                      </div>
                      <div className="chart-track">
                        <div
                          className={`chart-fill ${seg.tone}`}
                          style={{ width: `${Math.max(4, (seg.value / pipelineMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ) : null}
        </>
      ) : null}

      {selectedView === "detail" ? (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Receivable invoices</span>
                <span className="badge">Detail</span>
              </div>
              <div className="metric-value">{agingDetail.length}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Largest outstanding</span>
                <span className="badge">Exposure</span>
              </div>
              <div className="metric-value">{agingDetail[0]?.outstandingAmount ?? "$0"}</div>
              <div className="metric-subvalue">{agingDetail[0]?.counterpartyName ?? "No receivables."}</div>
            </article>
          </section>

          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Receivable detail</span>
                <h3>TBR invoice-level aging</h3>
              </div>
              <Link
                className="ghost-link"
                href={buildCompanyPath("/receivables", "TBR", { view: "overview" }) as Route}
              >
                Back to overview
              </Link>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Counterparty</th>
                    <th>Invoice</th>
                    <th>Total</th>
                    <th>Collected</th>
                    <th>Outstanding</th>
                    <th>Due date</th>
                    <th>Days</th>
                    <th>Bucket</th>
                  </tr>
                </thead>
                <tbody>
                  {agingDetail.length > 0 ? (
                    agingDetail.map((row) => (
                      <tr
                        className={
                          row.daysOverdue > 60
                            ? "row-overdue"
                            : row.daysOverdue > 0
                              ? "row-warn"
                              : ""
                        }
                        key={row.invoiceId}
                      >
                        <td>{row.counterpartyName}</td>
                        <td>{row.invoiceNumber}</td>
                        <td>{row.totalAmount}</td>
                        <td>{row.collectedAmount}</td>
                        <td>{row.outstandingAmount}</td>
                        <td>{row.dueDate}</td>
                        <td>{daysLabel(row.daysOverdue, row.daysUntilDue)}</td>
                        <td>
                          <span className={`pill signal-pill ${agingBucketTone(row.agingBucket)}`}>
                            {row.agingLabel}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted" colSpan={8}>
                        No outstanding receivables found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {selectedView === "schedule" ? (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card accent-brand">
              <div className="metric-topline">
                <span className="metric-label">Contracts with tranches</span>
              </div>
              <div className="metric-value">{trancheSummaries.length}</div>
            </article>
            <article className="metric-card accent-good">
              <div className="metric-topline">
                <span className="metric-label">Actionable</span>
              </div>
              <div className="metric-value">{actionableTranches.length}</div>
              <span className="metric-subvalue">Scheduled, active, or invoiced</span>
            </article>
            <article className="metric-card accent-warn">
              <div className="metric-topline">
                <span className="metric-label">Blocked</span>
              </div>
              <div className="metric-value">
                {trancheSummaries.filter((s) => s.hasBlockedTranche).length}
              </div>
              <span className="metric-subvalue">Deliverable gate</span>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Invoiced value</span>
              </div>
              <div className="metric-value">
                {trancheSummaries.length > 0
                  ? trancheSummaries.reduce((sum, s) => {
                      const n = Number(s.invoicedValue.replace(/[^0-9.-]/g, ""));
                      return sum + (Number.isFinite(n) ? n : 0);
                    }, 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
                  : "$0"}
              </div>
              <span className="metric-subvalue">Across all contracts</span>
            </article>
          </section>

          {/* Per-contract tranche summaries */}
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Contract tranche overview</span>
                <h3>Payment schedule by contract</h3>
              </div>
              <span className="pill">{companyCode}</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Sponsor</th>
                    <th>Contract</th>
                    <th>Value</th>
                    <th>Tranches</th>
                    <th>Invoiced</th>
                    <th>Collected</th>
                    <th>Next milestone</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {trancheSummaries.length > 0 ? (
                    trancheSummaries.map((row) => (
                      <tr key={row.contractId}>
                        <td>{row.sponsorName}</td>
                        <td>
                          <Link
                            className="ghost-link"
                            href={buildCompanyPath("/receivables", companyCode, { view: "contract", contractId: row.contractId }) as Route}
                          >
                            {row.contractName}
                          </Link>
                        </td>
                        <td>{row.fullContractValue}</td>
                        <td>{row.totalTranches}</td>
                        <td>{row.invoicedValue}</td>
                        <td>{row.collectedValue}</td>
                        <td>
                          <div>
                            <strong>{row.nextTrancheLabel}</strong>
                            <br />
                            <span className="muted">{row.nextTrancheDate}</span>
                          </div>
                        </td>
                        <td>
                          <div className="inline-actions">
                            {row.hasBlockedTranche ? (
                              <span className="pill signal-pill signal-warn">Blocked</span>
                            ) : row.invoicedCount === row.totalTranches ? (
                              <span className="pill signal-pill signal-good">All invoiced</span>
                            ) : (
                              <span className="pill subtle-pill">
                                {row.activeCount} active · {row.invoicedCount} invoiced
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted" colSpan={8}>
                        No tranche schedules found. Create tranches from the contract view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Actionable tranches with lifecycle buttons */}
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Actionable tranches</span>
                <h3>Scheduled, active, and invoiced milestones</h3>
              </div>
              <span className="badge">{actionableTranches.length} tranches</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Sponsor</th>
                    <th>Contract</th>
                    <th>Tranche</th>
                    <th>Amount</th>
                    <th>Trigger</th>
                    <th>Date</th>
                    <th>Gate</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {actionableTranches.length > 0 ? (
                    actionableTranches.map((t) => {
                      const returnPath = buildCompanyPath("/receivables", companyCode, { view: "schedule" });
                      return (
                        <tr
                          className={t.deliverableGateBlocked ? "row-warn" : ""}
                          key={t.id}
                        >
                          <td>{t.sponsorName}</td>
                          <td>{t.contractName}</td>
                          <td>{t.trancheLabel}</td>
                          <td>{t.trancheAmount}</td>
                          <td>{t.triggerType}</td>
                          <td>{t.triggerDate}</td>
                          <td>
                            {t.deliverableGateBlocked ? (
                              <span className="pill signal-pill signal-risk">Blocked</span>
                            ) : (
                              <span className="pill signal-pill signal-good">Clear</span>
                            )}
                          </td>
                          <td>
                            <span className={`pill ${
                              t.trancheStatus === "active" ? "signal-pill signal-good" :
                              t.trancheStatus === "invoiced" ? "signal-pill signal-warn" :
                              "subtle-pill"
                            }`}>
                              {t.trancheStatus}
                            </span>
                          </td>
                          <td>
                            <div className="inline-actions">
                              {t.trancheStatus === "scheduled" && !t.deliverableGateBlocked ? (
                                <form action={activateTrancheAction}>
                                  <input name="trancheId" type="hidden" value={t.id} />
                                  <input name="returnPath" type="hidden" value={returnPath} />
                                  <button className="action-button secondary" type="submit">
                                    Activate
                                  </button>
                                </form>
                              ) : null}
                              {t.trancheStatus === "active" ? (
                                <form action={generateTrancheInvoiceAction}>
                                  <input name="trancheId" type="hidden" value={t.id} />
                                  <input name="returnPath" type="hidden" value={returnPath} />
                                  <button className="action-button primary" type="submit">
                                    Generate invoice
                                  </button>
                                </form>
                              ) : null}
                              {t.trancheStatus === "invoiced" ? (
                                <form action={markTrancheCollectedAction}>
                                  <input name="trancheId" type="hidden" value={t.id} />
                                  <input name="returnPath" type="hidden" value={returnPath} />
                                  <button className="action-button primary" type="submit">
                                    Mark collected
                                  </button>
                                </form>
                              ) : null}
                              {t.trancheStatus === "scheduled" && t.deliverableGateBlocked ? (
                                <span className="muted">Gate blocked</span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="muted" colSpan={9}>
                        No actionable tranches found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {selectedView === "calendar" ? (() => {
        const monthGroups = new Map<string, TrancheCalendarEntry[]>();
        for (const entry of calendarEntries) {
          const key = entry.monthLabel;
          if (!monthGroups.has(key)) monthGroups.set(key, []);
          monthGroups.get(key)!.push(entry);
        }

        const totalCalendarValue = calendarEntries.reduce((sum, e) => {
          const n = Number(e.trancheAmount.replace(/[^0-9.-]/g, ""));
          return sum + (Number.isFinite(n) ? n : 0);
        }, 0);
        const scheduledCalendarValue = calendarEntries
          .filter((e) => e.trancheStatus === "scheduled" || e.trancheStatus === "active")
          .reduce((sum, e) => {
            const n = Number(e.trancheAmount.replace(/[^0-9.-]/g, ""));
            return sum + (Number.isFinite(n) ? n : 0);
          }, 0);

        return (
          <>
            <section className="stats-grid compact-stats">
              <article className="metric-card accent-brand">
                <div className="metric-topline">
                  <span className="metric-label">Total milestones</span>
                </div>
                <div className="metric-value">{calendarEntries.length}</div>
                <span className="metric-subvalue">Across {monthGroups.size} months</span>
              </article>
              <article className="metric-card accent-good">
                <div className="metric-topline">
                  <span className="metric-label">Pipeline value</span>
                </div>
                <div className="metric-value">
                  {totalCalendarValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                </div>
                <span className="metric-subvalue">All tranches</span>
              </article>
              <article className="metric-card accent-warn">
                <div className="metric-topline">
                  <span className="metric-label">Upcoming</span>
                </div>
                <div className="metric-value">
                  {scheduledCalendarValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                </div>
                <span className="metric-subvalue">Scheduled + active</span>
              </article>
              <article className="metric-card">
                <div className="metric-topline">
                  <span className="metric-label">Months spanned</span>
                </div>
                <div className="metric-value">{monthGroups.size}</div>
              </article>
            </section>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Tranche calendar</span>
                  <h3>Payment milestones by month</h3>
                </div>
                <Link
                  className="ghost-link"
                  href={buildCompanyPath("/receivables", companyCode, { view: "schedule" }) as Route}
                >
                  Back to schedule
                </Link>
              </div>

              {calendarEntries.length > 0 ? (
                <div>
                  {Array.from(monthGroups.entries()).map(([month, entries]) => (
                    <div className="calendar-month-group" key={month}>
                      <div className="calendar-month-label">{month}</div>
                      <div className="table-wrapper clean-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Sponsor</th>
                              <th>Contract</th>
                              <th>Tranche</th>
                              <th>Amount</th>
                              <th>Date</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map((entry) => (
                              <tr key={entry.id}>
                                <td>{entry.sponsorName}</td>
                                <td>{entry.contractName}</td>
                                <td>{entry.trancheLabel}</td>
                                <td>{entry.trancheAmount}</td>
                                <td>{entry.effectiveDate ? new Date(entry.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}</td>
                                <td>
                                  <span className={`pill ${
                                    entry.trancheStatus === "collected" ? "signal-pill signal-good" :
                                    entry.trancheStatus === "invoiced" ? "signal-pill signal-warn" :
                                    entry.trancheStatus === "active" ? "signal-pill signal-good" :
                                    "subtle-pill"
                                  }`}>
                                    {entry.trancheStatus}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No tranche milestones found.</p>
              )}
            </article>
          </>
        );
      })() : null}

      {selectedView === "contract" && contractIdParam ? (() => {
        const contractName = contractTranches[0]?.contractName ?? "Contract";
        const sponsorName = contractTranches[0]?.sponsorName ?? "";
        const totalValue = contractTranches.reduce((sum, t) => {
          const n = Number(t.trancheAmount.replace(/[^0-9.-]/g, ""));
          return sum + (Number.isFinite(n) ? n : 0);
        }, 0);
        const collectedValue = contractTranches
          .filter((t) => t.trancheStatus === "collected")
          .reduce((sum, t) => {
            const n = Number(t.trancheAmount.replace(/[^0-9.-]/g, ""));
            return sum + (Number.isFinite(n) ? n : 0);
          }, 0);

        return (
          <>
            <section className="stats-grid compact-stats">
              <article className="metric-card accent-brand">
                <div className="metric-topline">
                  <span className="metric-label">Total tranches</span>
                </div>
                <div className="metric-value">{contractTranches.length}</div>
                <span className="metric-subvalue">{contractName}</span>
              </article>
              <article className="metric-card accent-good">
                <div className="metric-topline">
                  <span className="metric-label">Contract value</span>
                </div>
                <div className="metric-value">
                  {totalValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                </div>
                <span className="metric-subvalue">{sponsorName}</span>
              </article>
              <article className="metric-card">
                <div className="metric-topline">
                  <span className="metric-label">Collected</span>
                </div>
                <div className="metric-value">
                  {collectedValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                </div>
                <span className="metric-subvalue">
                  {totalValue > 0 ? `${Math.round((collectedValue / totalValue) * 100)}%` : "0%"} of total
                </span>
              </article>
            </section>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">{sponsorName}</span>
                  <h3>{contractName} — tranche detail</h3>
                </div>
                <Link
                  className="ghost-link"
                  href={buildCompanyPath("/receivables", companyCode, { view: "schedule" }) as Route}
                >
                  Back to schedule
                </Link>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Tranche</th>
                      <th>%</th>
                      <th>Amount</th>
                      <th>Trigger</th>
                      <th>Date</th>
                      <th>Race</th>
                      <th>Gate</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractTranches.length > 0 ? (
                      contractTranches.map((t) => {
                        const returnPath = buildCompanyPath("/receivables", companyCode, { view: "contract", contractId: contractIdParam });
                        return (
                          <tr
                            className={t.deliverableGateBlocked ? "row-warn" : ""}
                            key={t.id}
                          >
                            <td>{t.trancheNumber}</td>
                            <td>{t.trancheLabel}</td>
                            <td>{t.tranchePercentage}%</td>
                            <td>{t.trancheAmount}</td>
                            <td>{t.triggerType}</td>
                            <td>{t.triggerDate}</td>
                            <td>{t.raceName || "—"}</td>
                            <td>
                              {t.deliverableGateBlocked ? (
                                <span className="pill signal-pill signal-risk">Blocked</span>
                              ) : (
                                <span className="pill signal-pill signal-good">Clear</span>
                              )}
                            </td>
                            <td>
                              <span className={`pill ${
                                t.trancheStatus === "collected" ? "signal-pill signal-good" :
                                t.trancheStatus === "active" ? "signal-pill signal-good" :
                                t.trancheStatus === "invoiced" ? "signal-pill signal-warn" :
                                "subtle-pill"
                              }`}>
                                {t.trancheStatus}
                              </span>
                            </td>
                            <td>
                              <div className="inline-actions">
                                {t.trancheStatus === "scheduled" && !t.deliverableGateBlocked ? (
                                  <form action={activateTrancheAction}>
                                    <input name="trancheId" type="hidden" value={t.id} />
                                    <input name="returnPath" type="hidden" value={returnPath} />
                                    <button className="action-button secondary" type="submit">
                                      Activate
                                    </button>
                                  </form>
                                ) : null}
                                {t.trancheStatus === "active" ? (
                                  <form action={generateTrancheInvoiceAction}>
                                    <input name="trancheId" type="hidden" value={t.id} />
                                    <input name="returnPath" type="hidden" value={returnPath} />
                                    <button className="action-button primary" type="submit">
                                      Generate invoice
                                    </button>
                                  </form>
                                ) : null}
                                {t.trancheStatus === "invoiced" ? (
                                  <form action={markTrancheCollectedAction}>
                                    <input name="trancheId" type="hidden" value={t.id} />
                                    <input name="returnPath" type="hidden" value={returnPath} />
                                    <button className="action-button primary" type="submit">
                                      Mark collected
                                    </button>
                                  </form>
                                ) : null}
                                {t.trancheStatus === "collected" ? (
                                  <span className="muted">Complete</span>
                                ) : null}
                                {t.trancheStatus === "scheduled" && t.deliverableGateBlocked ? (
                                  <span className="muted">Gate blocked</span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="muted" colSpan={10}>
                          No tranches found for this contract.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        );
      })() : null}

      {selectedView === "collection" ? (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card accent-brand">
              <div className="metric-topline">
                <span className="metric-label">Awaiting collection</span>
              </div>
              <div className="metric-value">{collectionTranches.length}</div>
              <span className="metric-subvalue">Invoiced tranches</span>
            </article>
            <article className="metric-card accent-warn">
              <div className="metric-topline">
                <span className="metric-label">Overdue</span>
              </div>
              <div className="metric-value">
                {collectionTranches.filter((t) => t.daysOverdue > 0).length}
              </div>
              <span className="metric-subvalue">Past due date</span>
            </article>
            <article className="metric-card accent-risk">
              <div className="metric-topline">
                <span className="metric-label">60+ days overdue</span>
              </div>
              <div className="metric-value">
                {collectionTranches.filter((t) => t.daysOverdue >= 60).length}
              </div>
              <span className="metric-subvalue">Escalation zone</span>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Outstanding value</span>
              </div>
              <div className="metric-value">
                {collectionTranches.length > 0
                  ? collectionTranches.reduce((sum, t) => {
                      const n = Number(t.trancheAmount.replace(/[^0-9.-]/g, ""));
                      return sum + (Number.isFinite(n) ? n : 0);
                    }, 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
                  : "$0"}
              </div>
              <span className="metric-subvalue">Invoiced, not collected</span>
            </article>
          </section>

          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Collection tracking</span>
                <h3>Invoiced tranches awaiting payment</h3>
              </div>
              <span className="pill">{companyCode}</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Sponsor</th>
                    <th>Contract</th>
                    <th>Tranche</th>
                    <th>Amount</th>
                    <th>Invoice</th>
                    <th>Invoiced</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {collectionTranches.length > 0 ? (
                    collectionTranches.map((t) => {
                      const returnPath = buildCompanyPath("/receivables", companyCode, { view: "collection" });
                      return (
                        <tr
                          className={
                            t.daysOverdue >= 60
                              ? "row-overdue"
                              : t.daysOverdue > 0
                                ? "row-warn"
                                : ""
                          }
                          key={t.id}
                        >
                          <td>{t.sponsorName}</td>
                          <td>{t.contractName}</td>
                          <td>{t.trancheLabel}</td>
                          <td>{t.trancheAmount}</td>
                          <td>{t.invoiceNumber || "—"}</td>
                          <td>{t.invoicedAt}</td>
                          <td>{t.dueDate}</td>
                          <td>
                            {t.daysOverdue >= 60 ? (
                              <span className="pill signal-pill signal-risk">
                                {t.daysOverdue}d overdue
                              </span>
                            ) : t.daysOverdue > 0 ? (
                              <span className="pill signal-pill signal-warn">
                                {t.daysOverdue}d overdue
                              </span>
                            ) : (
                              <span className="pill signal-pill signal-good">
                                Due in {t.daysUntilDue}d
                              </span>
                            )}
                          </td>
                          <td>
                            <form action={markTrancheCollectedAction}>
                              <input name="trancheId" type="hidden" value={t.id} />
                              <input name="returnPath" type="hidden" value={returnPath} />
                              <button className="action-button primary" type="submit">
                                Mark collected
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="muted" colSpan={9}>
                        No invoiced tranches awaiting collection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <section className="grid-two">
            <article className="card compact-section-card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Quick links</span>
                  <h3>Related workspaces</h3>
                </div>
              </div>
              <div className="support-grid">
                <Link
                  className="workflow-tile"
                  href={buildCompanyPath("/receivables", companyCode, { view: "schedule" }) as Route}
                >
                  <span className="process-step-index">Schedule</span>
                  <strong>Tranche schedule</strong>
                </Link>
                <Link
                  className="workflow-tile"
                  href={buildCompanyPath("/receivables", companyCode, { view: "overview" }) as Route}
                >
                  <span className="process-step-index">Aging</span>
                  <strong>Aging overview</strong>
                </Link>
                <Link className="workflow-tile" href="/commercial-goals/TBR">
                  <span className="process-step-index">Commercial</span>
                  <strong>Commercial goals</strong>
                </Link>
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
