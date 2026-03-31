import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getReceivablesAgingDetail,
  getReceivablesAgingSummary,
  getSponsorBreakdown
} from "@lsc/db";
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
  }>;
};

const workstreams = [
  {
    key: "overview",
    title: "Aging overview",
    description: "Outstanding receivables by aging bucket.",
    badge: "Step 1"
  },
  {
    key: "detail",
    title: "Invoice detail",
    description: "Full receivable invoice table with aging.",
    badge: "Step 2"
  },
  {
    key: "collection",
    title: "Collection path",
    description: "Future: reminders, escalation, deliverable gates.",
    badge: "Step 3"
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
    : "overview";
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;

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

  const [agingSummary, agingDetail, sponsors] = await Promise.all([
    getReceivablesAgingSummary(companyCode),
    selectedView === "detail" ? getReceivablesAgingDetail(companyCode) : Promise.resolve([]),
    getSponsorBreakdown()
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

      {selectedView === "collection" ? (
        <section className="grid-two">
          <article className="card compact-section-card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Collection workflow</span>
                <h3>Coming soon</h3>
              </div>
              <span className="badge">Planned</span>
            </div>
            <p className="muted">
              Auto-reminders at 7d, 3d, 1d before due. Escalation at 60 days. Deliverable-gated
              invoice sending. This workspace will be activated once tranche payment support is built.
            </p>
            <div className="support-grid">
              <Link
                className="workflow-tile"
                href={buildCompanyPath("/receivables", "TBR", { view: "overview" }) as Route}
              >
                <span className="process-step-index">Review</span>
                <strong>Return to aging overview</strong>
              </Link>
              <Link
                className="workflow-tile"
                href={buildCompanyPath("/receivables", "TBR", { view: "detail" }) as Route}
              >
                <span className="process-step-index">Detail</span>
                <strong>View invoice detail</strong>
              </Link>
              <Link className="workflow-tile" href="/commercial-goals/TBR">
                <span className="process-step-index">Commercial</span>
                <strong>Open commercial goals</strong>
              </Link>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
