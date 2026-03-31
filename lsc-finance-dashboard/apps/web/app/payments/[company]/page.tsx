import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDocumentAnalysisDetail,
  getDocumentAnalysisQueue,
  getDocumentExtractedFields,
  getDocumentPostingEvents,
  getEntitySnapshots,
  getEnhancedPayables,
  getUpcomingPayments
} from "@lsc/db";
import { CompanyWorkspaceShell } from "../../components/company-workspace-shell";
import { DocumentAnalysisSummary } from "../../components/document-analysis-summary";
import { DocumentAnalyzerPanel } from "../../components/document-analyzer-panel";
import { ModalLauncher } from "../../components/modal-launcher";
import { requireRole } from "../../../lib/auth";
import {
  buildCompanyPath,
  formatDocumentWorkflowForSelection,
  isSharedCompanyCode,
  summarizePaymentContext
} from "../../lib/shared-workspace";
import { formatWorkflowContextLabel } from "../../lib/workflow-labels";

type PaymentsCompanyPageProps = {
  params: Promise<{
    company: string;
  }>;
  searchParams?: Promise<{
    view?: string;
    status?: string;
    message?: string;
    analysisRunId?: string;
  }>;
};

type QueueRow = {
  id?: string;
  intakeEventId?: string;
  documentName: string;
  documentType: string;
  status: string;
  proposedTarget: string;
  createdAt?: string;
  workflowContext?: string;
  intakeStatus?: string;
  intakeCategory?: string;
  updateSummary?: string;
};

const workstreams = [
  {
    key: "overview",
    title: "Payment overview",
    description: "Volume, open amount, and payment posture.",
    badge: "Step 1"
  },
  {
    key: "tracker",
    title: "Due tracker",
    description: "Invoice-by-invoice payable queue.",
    badge: "Step 2"
  },
  {
    key: "intake",
    title: "Invoice intake",
    description: "Add payable source documents.",
    badge: "Step 3"
  },
  {
    key: "settlement",
    title: "Settlement path",
    description: "Payment execution and reconciliation.",
    badge: "Step 4"
  }
] as const;

function parseCurrency(value: string) {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

export default async function PaymentsCompanyPage({ params, searchParams }: PaymentsCompanyPageProps) {
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
  const selectedAnalysisRunId = pageParams?.analysisRunId ?? undefined;
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;

  const [entitySnapshots, queue, detail, fields, postingEvents] = await Promise.all([
    getEntitySnapshots(),
    getDocumentAnalysisQueue(),
    selectedAnalysisRunId ? getDocumentAnalysisDetail(selectedAnalysisRunId) : Promise.resolve(null),
    selectedAnalysisRunId ? getDocumentExtractedFields(selectedAnalysisRunId) : Promise.resolve([]),
    selectedAnalysisRunId ? getDocumentPostingEvents(selectedAnalysisRunId) : Promise.resolve([])
  ]);
  const selectedEntity = entitySnapshots.find((entity) => entity.code === companyCode);

  if (companyCode === "FSP") {
    return (
      <div className="page-grid">
        <CompanyWorkspaceShell
          basePath="/payments"
          companyCode={companyCode}
          description="FSP payment workspace — no live payables yet."
          eyebrow="FSP payments"
          selectedView={selectedView}
          title="Future of Sports payment workspace"
          workstreams={workstreams}
        />
        <section className="grid-two">
          <article className="card placeholder-card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Selected company</span>
                <h3>FSP payables will appear once platform bills exist</h3>
              </div>
              <span className="badge">Placeholder</span>
            </div>
          </article>
        </section>
      </div>
    );
  }

  const [upcomingPayments, enhancedPayables] = await Promise.all([
    getUpcomingPayments(),
    getEnhancedPayables(companyCode)
  ]);
  const payableRows = enhancedPayables.length > 0 ? enhancedPayables : upcomingPayments.map((row) => ({
    invoiceNumber: row.vendor,
    dueDate: row.dueDate,
    totalAmount: row.amount,
    status: row.status,
    raceName: row.race,
    description: row.category,
    daysOverdue: 0,
    daysUntilDue: 0,
    agingBucket: "current",
    agingLabel: "Current"
  }));
  const paymentQueue = (queue as QueueRow[]).filter((item) => {
    const workflow = String(item.workflowContext ?? "").toLowerCase();
    return (
      workflow.includes(`payments:${companyCode.toLowerCase()}`) ||
      formatDocumentWorkflowForSelection(item.workflowContext, item.proposedTarget, item.documentType) ===
        "vendor-invoices"
    );
  });
  const openAmount = payableRows.reduce((sum, row) => sum + parseCurrency(row.totalAmount), 0);
  const partiallyPaidCount = payableRows.filter((row) => row.status === "partially_paid").length;
  const issuedCount = payableRows.filter((row) => row.status === "issued").length;
  const overdueCount = payableRows.filter((row) => row.daysOverdue > 0).length;
  const topPayables = [...payableRows]
    .sort((left, right) => parseCurrency(right.totalAmount) - parseCurrency(left.totalAmount))
    .slice(0, 6);
  const payableMax = Math.max(1, ...topPayables.map((row) => parseCurrency(row.totalAmount)));
  const paymentInsight = {
    title:
      topPayables[0] != null
        ? `${topPayables[0].invoiceNumber} is the largest currently surfaced payable`
        : "The payable queue is still light",
    summary:
      topPayables[0] != null
        ? `${topPayables[0].totalAmount} is the highest open line in the current queue.${topPayables[0].daysOverdue > 0 ? ` ${topPayables[0].daysOverdue} days overdue.` : ""}`
        : "As invoice intake grows, this section should call out the largest vendor exposure."
  };

  return (
    <div className="page-grid">
      <CompanyWorkspaceShell
        basePath="/payments"
        companyCode={companyCode}
        description="TBR payment workspace across overview, tracking, intake, and settlement."
        eyebrow="TBR payments"
        selectedView={selectedView}
        title="Team Blue Rising payment workspace"
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
                <span className="metric-label">Open payables</span>
              </div>
              <div className="metric-value">{payableRows.length}</div>
              <span className="metric-subvalue">{selectedEntity?.name ?? "TBR"}</span>
            </article>
            <article className="metric-card accent-accent">
              <div className="metric-topline">
                <span className="metric-label">Open amount</span>
              </div>
              <div className="metric-value">${openAmount.toLocaleString("en-US")}</div>
            </article>
            <article className="metric-card accent-risk">
              <div className="metric-topline">
                <span className="metric-label">Overdue</span>
              </div>
              <div className="metric-value">{overdueCount}</div>
              <span className="metric-subvalue">{overdueCount > 0 ? "Action needed" : "All current"}</span>
            </article>
            <article className="metric-card accent-warn">
              <div className="metric-topline">
                <span className="metric-label">Partially paid</span>
              </div>
              <div className="metric-value">{partiallyPaidCount}</div>
            </article>
          </section>

          <section className="grid-two">
            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Largest payables</span>
                  <h3>What needs the most attention first</h3>
                </div>
                <span className="pill">Priority</span>
              </div>
              <div className="chart-list">
                {topPayables.map((row) => (
                  <div className="chart-row" key={`${row.invoiceNumber}-${row.totalAmount}-${row.raceName}`}>
                    <div className="chart-meta">
                      <strong>{row.invoiceNumber}</strong>
                      <span>
                        {row.totalAmount} · {row.raceName}
                        {row.daysOverdue > 0
                          ? ` · ${row.daysOverdue}d overdue`
                          : row.daysUntilDue > 0
                            ? ` · Due in ${row.daysUntilDue}d`
                            : ""}
                      </span>
                    </div>
                    <div className="chart-track">
                      <div
                        className={row.daysOverdue > 60 ? "chart-fill risk" : row.daysOverdue > 0 ? "chart-fill warn" : "chart-fill secondary"}
                        style={{ width: `${Math.max(8, (parseCurrency(row.totalAmount) / payableMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <strong>{paymentInsight.title}</strong>
                </div>
                <span className="pill">Context aware</span>
              </div>
              <span className="muted">{paymentInsight.summary}</span>
            </article>
          </section>
        </>
      ) : null}

      {selectedView === "tracker" ? (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Queue rows</span>
                <span className="badge">Tracker</span>
              </div>
              <div className="metric-value">{payableRows.length}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Largest line</span>
                <span className="badge">Exposure</span>
              </div>
              <div className="metric-value">{topPayables[0]?.totalAmount ?? "$0"}</div>
              <div className="metric-subvalue">{topPayables[0]?.invoiceNumber ?? "No current payable rows."}</div>
            </article>
          </section>

          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Due tracker</span>
                <h3>TBR payable queue</h3>
              </div>
              <Link className="ghost-link" href="/tbr/invoice-hub">
                Open invoice hub
              </Link>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Race</th>
                    <th>Due</th>
                    <th>Amount</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Source note</th>
                  </tr>
                </thead>
                <tbody>
                  {payableRows.map((row) => (
                    <tr
                      className={row.daysOverdue > 60 ? "row-overdue" : row.daysOverdue > 0 ? "row-warn" : ""}
                      key={`${row.invoiceNumber}-${row.raceName}-${row.totalAmount}`}
                    >
                      <td>{row.invoiceNumber}</td>
                      <td>{row.raceName}</td>
                      <td>{row.dueDate}</td>
                      <td>{row.totalAmount}</td>
                      <td>
                        <span className={`pill signal-pill ${row.daysOverdue > 60 ? "signal-risk" : row.daysOverdue > 0 ? "signal-warn" : "signal-good"}`}>
                          {row.daysOverdue > 0
                            ? `${row.daysOverdue}d late`
                            : row.daysUntilDue > 0
                              ? `in ${row.daysUntilDue}d`
                              : "today"}
                        </span>
                      </td>
                      <td>
                        <span className="pill subtle-pill">{row.status.replace(/_/g, " ")}</span>
                      </td>
                      <td>{summarizePaymentContext(row.description)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {selectedView === "intake" ? (
        <>
          <section className="grid-two">
            <article className="card compact-section-card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Invoice intake</span>
                  <h3>Add payable document</h3>
                </div>
                <span className="pill">Popup</span>
              </div>
              <div className="hero-actions">
                <ModalLauncher
                  description="Upload an invoice, classify it properly, and keep the saved mapping visible in this payments workspace."
                  eyebrow="Payment intake"
                  title="Add payable document"
                  triggerLabel="Add invoice"
                >
                  <DocumentAnalyzerPanel
                    companyCode="TBR"
                    description="Upload a payable document and keep it inside the TBR payments workflow."
                    notePlaceholder="Example: E1 payable invoice, reimbursement invoice, or vendor bill with due date."
                    redirectPath={buildCompanyPath("/payments", "TBR", { view: "intake" })}
                    title="Analyze TBR payable document"
                    workflowContext="payments:tbr:vendor-invoices"
                    workflowTag="Categorized intake"
                    variant="plain"
                  />
                </ModalLauncher>
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Queue</span>
                  <h3>Payable support runs</h3>
                </div>
                <span className="pill">{paymentQueue.length} runs</span>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Category</th>
                      <th>Updates</th>
                      <th>When</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentQueue.length > 0 ? (
                      paymentQueue.map((item) => (
                        <tr key={item.intakeEventId ?? item.id}>
                          <td>
                            <Link
                              href={buildCompanyPath("/payments", "TBR", {
                                view: "intake",
                                analysisRunId: item.id
                              }) as Route}
                            >
                              {item.documentName}
                            </Link>
                          </td>
                          <td>{item.intakeCategory ?? "Unmapped"}</td>
                          <td>{item.updateSummary ?? formatWorkflowContextLabel(item.workflowContext)}</td>
                          <td>{item.createdAt}</td>
                          <td>
                            <span className="pill subtle-pill">{item.intakeStatus ?? item.status}</span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="muted" colSpan={5}>
                          No payable documents have been added in this workflow yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          {selectedAnalysisRunId ? (
            <DocumentAnalysisSummary
              detail={detail}
              fields={fields}
              postingEvents={postingEvents}
              title="Selected payable analysis run"
            />
          ) : null}
        </>
      ) : null}

      {selectedView === "settlement" ? (
        <section className="grid-two">
          <article className="card compact-section-card">
            <div className="support-grid">
              <Link className="workflow-tile" href="/tbr/invoice-hub">
                <span className="process-step-index">Capture</span>
                <strong>Go to invoice hub</strong>
              </Link>
              <Link className="workflow-tile" href={buildCompanyPath("/payments", "TBR", { view: "tracker" }) as Route}>
                <span className="process-step-index">Track</span>
                <strong>Return to due tracker</strong>
              </Link>
              <Link className="workflow-tile" href={buildCompanyPath("/payments", "TBR", { view: "intake" }) as Route}>
                <span className="process-step-index">Source</span>
                <strong>Return to payable intake</strong>
              </Link>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
