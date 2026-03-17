import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDocumentAnalysisDetail,
  getDocumentAnalysisQueue,
  getDocumentExtractedFields,
  getDocumentPostingEvents,
  getEntitySnapshots,
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
    description: "Start with volume, open amount, and the current payment posture for the chosen company.",
    badge: "Step 1"
  },
  {
    key: "tracker",
    title: "Due tracker",
    description: "Move into the invoice-by-invoice payable queue once the high-level posture is clear.",
    badge: "Step 2"
  },
  {
    key: "intake",
    title: "Invoice intake",
    description: "Add payable source documents in a categorized popup, then review their queue mapping and downstream impact.",
    badge: "Step 3"
  },
  {
    key: "settlement",
    title: "Settlement path",
    description: "Keep settlement as its own phase instead of mixing it with source capture.",
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
          description="FSP payment operations should stay light until real platform bills and settlement flows exist."
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
                <h3>Keep the payable structure ready for launch</h3>
              </div>
              <span className="badge">Placeholder</span>
            </div>
            <div className="info-grid">
              <div className="process-step">
                <span className="process-step-index">Invoices</span>
                <strong>Platform vendor bills</strong>
                <span className="muted">Hosting, tooling, and product vendors will enter here once FSP is live.</span>
              </div>
              <div className="process-step">
                <span className="process-step-index">Settlement</span>
                <strong>Execution stays downstream</strong>
                <span className="muted">Keep payment timing and settlement controls separate from intake.</span>
              </div>
            </div>
          </article>
        </section>
      </div>
    );
  }

  const upcomingPayments = await getUpcomingPayments();
  const paymentQueue = (queue as QueueRow[]).filter((item) => {
    const workflow = String(item.workflowContext ?? "").toLowerCase();
    return (
      workflow.includes(`payments:${companyCode.toLowerCase()}`) ||
      formatDocumentWorkflowForSelection(item.workflowContext, item.proposedTarget, item.documentType) ===
        "vendor-invoices"
    );
  });
  const openAmount = upcomingPayments.reduce((sum, row) => sum + parseCurrency(row.amount), 0);
  const partiallyPaidCount = upcomingPayments.filter((row) => row.status === "partially_paid").length;
  const issuedCount = upcomingPayments.filter((row) => row.status === "issued").length;
  const topPayables = [...upcomingPayments]
    .sort((left, right) => parseCurrency(right.amount) - parseCurrency(left.amount))
    .slice(0, 6);
  const payableMax = Math.max(1, ...topPayables.map((row) => parseCurrency(row.amount)));
  const paymentInsights = [
    {
      title:
        topPayables[0] != null
          ? `${topPayables[0].vendor} is the largest currently surfaced payable`
          : "The payable queue is still light",
      summary:
        topPayables[0] != null
          ? `${topPayables[0].amount} is the highest open line in the current queue.`
          : "As invoice intake grows, this section should call out the largest vendor exposure."
    },
    {
      title: `${issuedCount} invoices are issued and ${partiallyPaidCount} are already in motion`,
      summary:
        "Use this to separate invoices that still need first action from invoices already part-way through settlement."
    },
    {
      title: "Keep settlement downstream from intake",
      summary:
        "The operator path should still be intake first, then queue tracking, then explicit settlement and reconciliation."
    }
  ];

  return (
    <div className="page-grid">
      <CompanyWorkspaceShell
        basePath="/payments"
        companyCode={companyCode}
        description="Now that the company is fixed, move through the payment overview, due tracker, invoice intake, and settlement path in order."
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
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">{selectedEntity?.name ?? "TBR"}</span>
                <span className="badge">Open payables</span>
              </div>
              <div className="metric-value">{upcomingPayments.length}</div>
              <div className="metric-subvalue">Invoices currently sitting in the live due tracker.</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Open amount</span>
                <span className="badge">USD</span>
              </div>
              <div className="metric-value">${openAmount.toLocaleString("en-US")}</div>
              <div className="metric-subvalue">Total payable amount currently surfaced in the queue.</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Partially paid</span>
                <span className="badge">Attention</span>
              </div>
              <div className="metric-value">{partiallyPaidCount}</div>
              <div className="metric-subvalue">Invoices already in motion but not yet fully settled.</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Issued only</span>
                <span className="badge">Waiting action</span>
              </div>
              <div className="metric-value">{issuedCount}</div>
              <div className="metric-subvalue">Invoices that still need first operational movement.</div>
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
                  <div className="chart-row" key={`${row.vendor}-${row.amount}-${row.race}`}>
                    <div className="chart-meta">
                      <strong>{row.vendor}</strong>
                      <span>
                        {row.amount} · {row.race}
                      </span>
                    </div>
                    <div className="chart-track">
                      <div
                        className="chart-fill secondary"
                        style={{ width: `${Math.max(8, (parseCurrency(row.amount) / payableMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">AI comments</span>
                  <h3>Payment posture for the chosen company</h3>
                </div>
                <span className="pill">Context aware</span>
              </div>
              <div className="info-grid">
                {paymentInsights.map((insight) => (
                  <div className="process-step" key={insight.title}>
                    <span className="process-step-index">AI</span>
                    <strong>{insight.title}</strong>
                    <span className="muted">{insight.summary}</span>
                  </div>
                ))}
              </div>
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
              <div className="metric-value">{upcomingPayments.length}</div>
              <div className="metric-subvalue">Invoices currently visible in the due tracker.</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Largest line</span>
                <span className="badge">Exposure</span>
              </div>
              <div className="metric-value">{topPayables[0]?.amount ?? "$0"}</div>
              <div className="metric-subvalue">{topPayables[0]?.vendor ?? "No current payable rows."}</div>
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
                    <th>Status</th>
                    <th>Source note</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingPayments.map((row) => (
                    <tr key={`${row.vendor}-${row.race}-${row.amount}`}>
                      <td>{row.vendor}</td>
                      <td>{row.race}</td>
                      <td>{row.dueDate}</td>
                      <td>{row.amount}</td>
                      <td>
                        <span className="pill subtle-pill">{row.status.replace(/_/g, " ")}</span>
                      </td>
                      <td>{summarizePaymentContext(row.category)}</td>
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
                  <span className="section-kicker">Step 3</span>
                  <h3>Add one payable document into the TBR invoice intake flow</h3>
                </div>
                <span className="pill">Popup</span>
              </div>
              <div className="process-step">
                <span className="process-step-index">Categorized intake</span>
                <strong>Use vendor and reimbursement invoice categories instead of a generic upload</strong>
                <span className="muted">
                  The popup should save intake fields, show the platform areas affected, and then place the
                  result back into this payable queue.
                </span>
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
          ) : (
            <section className="card compact-section-card">
              <div className="process-step">
                <span className="process-step-index">Step 4</span>
                <strong>Select one payable run only when you need the detail</strong>
                <span className="muted">
                  The selected detail should show the saved intake fields, extracted values, and platform
                  areas affected by that payable document.
                </span>
              </div>
            </section>
          )}
        </>
      ) : null}

      {selectedView === "settlement" ? (
        <section className="grid-two">
          <article className="card compact-section-card">
            <div className="process-step">
              <span className="process-step-index">Step 4</span>
              <strong>Settlement should remain its own execution layer</strong>
              <span className="muted">
                Capture and approve invoices first. Keep final payment execution and reconciliation downstream from intake.
              </span>
            </div>
          </article>
          <article className="card compact-section-card">
            <div className="support-grid">
              <Link className="workflow-tile" href="/tbr/invoice-hub">
                <span className="process-step-index">Capture</span>
                <strong>Go to invoice hub</strong>
                <span className="muted">Return to source capture if the payable queue is missing context or approval state.</span>
              </Link>
              <Link className="workflow-tile" href={buildCompanyPath("/payments", "TBR", { view: "tracker" }) as Route}>
                <span className="process-step-index">Track</span>
                <strong>Return to due tracker</strong>
                <span className="muted">Stay on the queue until explicit settlement controls are implemented.</span>
              </Link>
              <Link className="workflow-tile" href={buildCompanyPath("/payments", "TBR", { view: "intake" }) as Route}>
                <span className="process-step-index">Source</span>
                <strong>Return to payable intake</strong>
                <span className="muted">Add or inspect the supporting invoice runs if settlement is missing source context.</span>
              </Link>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
