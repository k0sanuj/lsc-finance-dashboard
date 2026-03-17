import type { Route } from "next";
import Link from "next/link";
import {
  getDocumentAnalysisDetail,
  getDocumentAnalysisQueue,
  getDocumentExtractedFields,
  getDocumentPostingEvents,
  getExpenseFormOptions,
  getInvoiceApprovalQueue,
  getInvoiceWorkflowSummary
} from "@lsc/db";
import { requireRole } from "../../../lib/auth";
import {
  approveAndPostInvoiceIntakeAction,
  createInvoiceIntakeAction,
  updateInvoiceIntakeStatusAction
} from "./actions";
import { DocumentAnalyzerPanel } from "../../components/document-analyzer-panel";
import { DocumentAnalysisSummary } from "../../components/document-analysis-summary";
import { ModalLauncher } from "../../components/modal-launcher";
import {
  formatDocumentWorkflowForSelection
} from "../../lib/shared-workspace";
import { formatWorkflowContextLabel } from "../../lib/workflow-labels";

type InvoiceHubPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    analysisRunId?: string;
  }>;
};

type WorkflowMetric = {
  label: string;
  value: string;
  detail: string;
};

type QueueRow = {
  id: string;
  vendor: string;
  invoiceNumber: string;
  race: string;
  dueDate: string;
  totalAmount: string;
  status: string;
  sourceLabel?: string | null;
};

type SourceQueueRow = {
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
  originCountry?: string;
  currencyCode?: string;
};

function parseCurrency(value: string) {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

function formatStatusLabel(value: string) {
  return value.replace(/_/g, " ");
}

export default async function InvoiceHubPage({ searchParams }: InvoiceHubPageProps) {
  const session = await requireRole(["super_admin", "finance_admin"]);
  const params = searchParams ? await searchParams : undefined;
  const selectedAnalysisRunId = params?.analysisRunId ?? undefined;
  const [summary, queue, formOptions, sourceQueue, documentDetail, documentFields, postingEvents] = await Promise.all([
    getInvoiceWorkflowSummary(),
    getInvoiceApprovalQueue(),
    getExpenseFormOptions(),
    getDocumentAnalysisQueue(),
    selectedAnalysisRunId ? getDocumentAnalysisDetail(selectedAnalysisRunId, session.id) : Promise.resolve(null),
    selectedAnalysisRunId ? getDocumentExtractedFields(selectedAnalysisRunId) : Promise.resolve([]),
    selectedAnalysisRunId ? getDocumentPostingEvents(selectedAnalysisRunId) : Promise.resolve([])
  ]);
  const status = params?.status ?? null;
  const message = params?.message ?? null;

  const workflowSummary = summary as WorkflowMetric[];
  const intakeQueue = queue as QueueRow[];
  const sourceRuns = (sourceQueue as SourceQueueRow[]).filter((item) => {
    const workflow = String(item.workflowContext ?? "").toLowerCase();
    return (
      workflow === "invoice-hub" ||
      workflow.includes("invoice") ||
      workflow.includes("payments:tbr:vendor-invoices") ||
      formatDocumentWorkflowForSelection(item.workflowContext, item.proposedTarget, item.documentType) ===
        "vendor-invoices"
    );
  });
  const highestPayable = [...intakeQueue].sort(
    (left, right) => parseCurrency(right.totalAmount) - parseCurrency(left.totalAmount)
  )[0] ?? null;
  const inReviewCount = intakeQueue.filter((row) => row.status === "in_review").length;
  const submittedCount = intakeQueue.filter((row) => row.status === "submitted").length;
  const postedCount = intakeQueue.filter((row) => row.status === "posted").length;
  const workflowInsights = [
    {
      title: highestPayable
        ? `${highestPayable.vendor} is the largest currently staged payable`
        : "No staged payable is standing out yet",
      summary: highestPayable
        ? `${highestPayable.totalAmount} is the largest currently visible line in the intake queue.`
        : "As invoice intake grows, this card should call out the vendor with the biggest current payable exposure."
    },
    {
      title: `${submittedCount} intakes are still waiting for first review`,
      summary:
        "Those rows should move into review only after vendor, amount, due date, and race context look complete."
    },
    {
      title: `${inReviewCount} are in review and ${postedCount} are already posted`,
      summary:
        "Keep intake, review, and posting separate so the due tracker remains traceable back to source documents."
    }
  ];

  return (
    <div className="page-grid">
      <section className="hero">
        <span className="eyebrow">TBR admin</span>
        <h2>Invoice Hub</h2>
        <p>
          Use this page to stage payable invoices, review them, and post them into the canonical payable
          ledger that feeds Payments and the TBR operating view.
        </p>
        <div className="hero-actions">
          <Link className="ghost-link" href="/payments/TBR">
            Open payments
          </Link>
          <Link className="ghost-link" href={"/documents/TBR?view=vendor-invoices" as Route}>
            Open source documents
          </Link>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        {workflowSummary.map((item) => (
          <article className="metric-card" key={item.label}>
            <div className="metric-topline">
              <span className="metric-label">Invoice workflow</span>
              <span className="badge">{item.label}</span>
            </div>
            <div className="metric-value">{item.value}</div>
            <div className="metric-subvalue">{item.detail}</div>
          </article>
        ))}
      </section>

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Step 1</span>
              <h3>Choose how you want to add the payable</h3>
            </div>
            <span className="pill">Actions</span>
          </div>
          <div className="support-grid">
            <ModalLauncher
              triggerLabel="Create intake"
              title="Create payable intake"
              description="Enter the core payable fields directly when you already know the vendor, amount, and race context."
              eyebrow="Manual intake"
            >
              <form action={createInvoiceIntakeAction} className="stack-form">
                <div className="grid-two">
                  <label className="field">
                    <span>Vendor</span>
                    <input name="vendorName" placeholder="E1 or vendor name" required />
                  </label>
                  <label className="field">
                    <span>Invoice number</span>
                    <input name="invoiceNumber" placeholder="INV-001" />
                  </label>
                </div>
                <div className="grid-two">
                  <label className="field">
                    <span>Due date</span>
                    <input name="dueDate" type="date" />
                  </label>
                  <label className="field">
                    <span>Total amount (USD)</span>
                    <input name="totalAmount" inputMode="decimal" placeholder="12500" required />
                  </label>
                </div>
                <div className="grid-two">
                  <label className="field">
                    <span>Race</span>
                    <select name="raceEventId" defaultValue="">
                      <option value="">Select race</option>
                      {formOptions.races.map((race) => (
                        <option key={race.id} value={race.id}>
                          {race.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Category hint</span>
                    <select name="categoryHint" defaultValue="">
                      <option value="">Select category hint</option>
                      {formOptions.categories.map((category) => (
                        <option key={category.id} value={category.label}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Operator note</span>
                  <textarea
                    name="operatorNote"
                    rows={3}
                    placeholder="Context for finance review or payment planning."
                  />
                </label>
                <div className="process-step compact-process-step">
                  <span className="process-step-index">Updates</span>
                  <strong>This creates a staged invoice intake row first</strong>
                  <span className="muted">
                    After approval, the payable invoice posts into canonical invoices and then appears in the
                    Payments workflow.
                  </span>
                </div>
                <button className="action-button primary" type="submit">
                  Create invoice intake
                </button>
              </form>
            </ModalLauncher>

            <ModalLauncher
              triggerLabel="Analyze document"
              title="Analyze invoice document"
              description="Upload an E1 invoice, vendor bill, or reimbursement invoice and keep the source mapping attached."
              eyebrow="Source-backed intake"
            >
              <DocumentAnalyzerPanel
                title="Analyze invoice document"
                description="Upload an E1 invoice, vendor bill, or Drive-exported payable source here. The analyzer should classify it and prefill the finance review path."
                redirectPath="/tbr/invoice-hub"
                notePlaceholder="Example: E1 Lagos catering invoice, payable, due this month."
                workflowTag="Invoice analyzer"
                workflowContext="invoice-hub"
                variant="plain"
              />
            </ModalLauncher>
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">AI comments</span>
              <h3>What the payable workflow is saying</h3>
            </div>
            <span className="pill">Context aware</span>
          </div>
          <div className="info-grid">
            {workflowInsights.map((insight) => (
              <div className="process-step" key={insight.title}>
                <span className="process-step-index">AI</span>
                <strong>{insight.title}</strong>
                <span className="muted">{insight.summary}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid-two">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Step 2</span>
              <h3>Review source-backed invoice runs</h3>
            </div>
            <span className="pill">{sourceRuns.length} runs</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Category</th>
                  <th>Workflow</th>
                  <th>When</th>
                  <th>Country / currency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sourceRuns.length > 0 ? (
                  sourceRuns.map((row) => (
                    <tr key={row.intakeEventId ?? row.id}>
                      <td>
                        {row.id ? (
                          <Link href={`/tbr/invoice-hub?analysisRunId=${row.id}`}>
                            {row.documentName}
                          </Link>
                        ) : (
                          row.documentName
                        )}
                      </td>
                      <td>{row.intakeCategory ?? "Unmapped"}</td>
                      <td>{formatWorkflowContextLabel(row.workflowContext)}</td>
                      <td>{row.createdAt ?? "Unknown"}</td>
                      <td>
                        {row.originCountry ?? "Unknown"} / {row.currencyCode ?? "Unknown"}
                      </td>
                      <td>
                        <div className="inline-actions">
                          <span className="pill">{row.intakeStatus ?? row.status}</span>
                          {row.updateSummary ? <span className="pill subtle-pill">mapped</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={6}>
                      No source-backed invoice runs yet. Use document analysis above when you want the intake to stay attached to the uploaded file.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        {selectedAnalysisRunId ? (
          <DocumentAnalysisSummary
            detail={documentDetail}
            fields={documentFields}
            postingEvents={postingEvents}
            title="Selected invoice source run"
          />
        ) : (
          <section className="card compact-section-card">
            <div className="process-step">
              <span className="process-step-index">Selected detail</span>
              <strong>Open one source run only when you need the extracted invoice detail</strong>
              <span className="muted">
                Keep the document preview, extracted fields, and posting history quiet until a specific source-backed invoice run is intentionally opened.
              </span>
            </div>
          </section>
        )}
      </section>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Step 3</span>
            <h3>Review the payable intake queue</h3>
          </div>
          <span className="pill">{intakeQueue.length} rows</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Invoice</th>
                <th>Race</th>
                <th>Due</th>
                <th>Total</th>
                <th>Status / action</th>
              </tr>
            </thead>
            <tbody>
              {intakeQueue.length > 0 ? (
                intakeQueue.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="stacked-table-cell">
                        <span>{row.vendor}</span>
                        {row.sourceLabel ? <span className="bill-subnote">{row.sourceLabel}</span> : null}
                      </div>
                    </td>
                    <td>{row.invoiceNumber}</td>
                    <td>{row.race}</td>
                    <td>{row.dueDate}</td>
                    <td>{row.totalAmount}</td>
                    <td>
                      <div className="inline-actions">
                        <span className="pill">{formatStatusLabel(row.status)}</span>
                        {row.status === "submitted" ? (
                          <>
                            <form action={updateInvoiceIntakeStatusAction}>
                              <input name="intakeId" type="hidden" value={row.id} />
                              <input name="nextStatus" type="hidden" value="in_review" />
                              <button className="action-button secondary" type="submit">
                                Start review
                              </button>
                            </form>
                            <form action={approveAndPostInvoiceIntakeAction}>
                              <input name="intakeId" type="hidden" value={row.id} />
                              <button className="action-button primary" type="submit">
                                Approve and post
                              </button>
                            </form>
                            <form action={updateInvoiceIntakeStatusAction}>
                              <input name="intakeId" type="hidden" value={row.id} />
                              <input name="nextStatus" type="hidden" value="rejected" />
                              <button className="action-button secondary" type="submit">
                                Reject
                              </button>
                            </form>
                          </>
                        ) : null}
                        {row.status === "in_review" ? (
                          <form action={approveAndPostInvoiceIntakeAction}>
                            <input name="intakeId" type="hidden" value={row.id} />
                            <button className="action-button primary" type="submit">
                              Post now
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={6}>
                    No invoice intakes yet. Start with a manual intake or document analysis above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <section className="card compact-section-card">
        <div className="process-step">
          <span className="process-step-index">Step 4</span>
          <strong>Post only after both the payable queue and the source run make sense together</strong>
          <span className="muted">
            The clean sequence here is: intake the source, review the extracted invoice facts, stage the payable row, then post into canonical invoices.
          </span>
        </div>
      </section>
    </div>
  );
}
