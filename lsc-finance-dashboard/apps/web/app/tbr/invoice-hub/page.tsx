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
import { requireRole, requireSession } from "../../../lib/auth";
import {
  approveAndPostInvoiceIntakeAction,
  createInvoiceIntakeAction,
  updateInvoiceIntakeStatusAction
} from "./actions";
import { DocumentAnalyzerPanel } from "../../components/document-analyzer-panel";
import { DocumentAnalysisSummary } from "../../components/document-analysis-summary";
import { ModalLauncher } from "../../components/modal-launcher";
import { RowHighlight } from "../../components/row-highlight";
import {
  formatDocumentWorkflowForSelection
} from "../../lib/shared-workspace";

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
  sourceDocumentId?: string;
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
  previewAvailable?: boolean;
  previewDataUrl?: string | null;
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
    getDocumentAnalysisQueue(session.id),
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

  const pendingReview = intakeQueue.filter((r) => r.status === "submitted" || r.status === "in_review");
  const totalPending = pendingReview.reduce((s, r) => s + parseCurrency(r.totalAmount), 0);

  return (
    <div className="page-grid">
      <RowHighlight />
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">TBR invoice hub</span>
          <h3>Upload, scan, and approve payable invoices</h3>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            <Link className="segment-chip" href="/payments/TBR">Payments</Link>
            <Link className="segment-chip" href="/tbr">Back to TBR</Link>
          </div>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        {workflowSummary.map((item, i) => {
          const accent = i === 0 ? "accent-warn" : i === 1 ? "accent-good" : "accent-brand";
          return (
          <article className={`metric-card ${accent}`} key={item.label}>
            <div className="metric-topline">
              <span className="metric-label">{item.label}</span>
            </div>
            <div className="metric-value">{item.value}</div>
            <span className="metric-subvalue">{item.detail}</span>
          </article>
          );
        })}
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Pending review</span>
          </div>
          <div className="metric-value">{pendingReview.length}</div>
          <div className="metric-subvalue">
            ${totalPending.toLocaleString()} total pending
          </div>
        </article>
      </section>

      {/* Upload Section — single unified entry point */}
      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Upload invoices</span>
            <h3>Add payables — single or bulk</h3>
          </div>
          <div className="inline-actions">
            <ModalLauncher
              triggerLabel="Upload invoices"
              title="Upload invoice documents"
              description="Upload one or multiple invoice files. AI will scan each document, extract vendor, amount, dates, and create draft payable records for your review."
              eyebrow="AI-powered intake"
            >
              <DocumentAnalyzerPanel
                title="Upload invoices"
                description="Drop single or multiple invoice files. Each will be scanned by AI and staged as a draft payable for review. Toggle 'Reimbursement' if an employee paid and needs to be reimbursed."
                redirectPath="/tbr/invoice-hub"
                notePlaceholder="E.g.: E1 Lagos catering invoices. Mark any that are reimbursements."
                workflowTag="Invoice intake"
                workflowContext="invoice-hub"
                allowMultiple
                showSubmissionMode
                variant="plain"
              />
            </ModalLauncher>
            <ModalLauncher
              triggerLabel="Manual entry"
              title="Create payable manually"
              description="Enter invoice details directly when you already know the vendor, amount, and context."
              eyebrow="Manual intake"
            >
              <form action={createInvoiceIntakeAction} className="stack-form">
                <div className="grid-two">
                  <label className="field">
                    <span>Vendor</span>
                    <input name="vendorName" placeholder="Vendor or supplier name" required />
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
                      <option value="">Select race (optional)</option>
                      {formOptions.races.map((race) => (
                        <option key={race.id} value={race.id}>
                          {race.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Category</span>
                    <select name="categoryHint" defaultValue="">
                      <option value="">Select category (optional)</option>
                      {formOptions.categories.map((category) => (
                        <option key={category.id} value={category.label}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid-two">
                  <label className="field">
                    <span>Payment type</span>
                    <select name="paymentType" defaultValue="direct">
                      <option value="direct">Direct payable — TBR pays vendor</option>
                      <option value="reimbursement">Reimbursement — employee paid, TBR reimburses</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Paid by (if reimbursement)</span>
                    <select name="paidByUserId" defaultValue="">
                      <option value="">Select team member</option>
                      {formOptions.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Notes</span>
                  <textarea
                    name="operatorNote"
                    rows={2}
                    placeholder="Context for finance review."
                  />
                </label>
                <button className="action-button primary" type="submit">
                  Create invoice intake
                </button>
              </form>
            </ModalLauncher>
          </div>
        </div>
        <p>Upload documents for AI scanning or enter details manually — drafts appear in the queue below.</p>
      </section>

      {/* Scanned documents — AI results */}
      {sourceRuns.length > 0 && (
        <section className="grid-two">
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">AI scan results</span>
                <h3>Scanned documents</h3>
              </div>
              <span className="pill">{sourceRuns.length} documents</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Country / Currency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRuns.map((row) => (
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
                      <td>{row.intakeCategory ?? row.documentType}</td>
                      <td>
                        {row.originCountry ?? "—"} / {row.currencyCode ?? "—"}
                      </td>
                      <td>
                        <span className={`pill ${row.intakeStatus === "posted" || row.status === "approved" ? "signal-pill signal-good" : "subtle-pill"}`}>
                          {formatStatusLabel(row.intakeStatus ?? row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          {selectedAnalysisRunId ? (
            <DocumentAnalysisSummary
              detail={documentDetail}
              fields={documentFields}
              postingEvents={postingEvents}
              title="Document detail"
            />
          ) : (
            <section className="card compact-section-card">
              <div className="process-step">
                <span className="process-step-index">Tip</span>
                <strong>Click a document name to view extracted fields</strong>
                <span className="muted">
                  The AI extraction shows vendor, amount, dates, and other fields pulled from the document.
                </span>
              </div>
            </section>
          )}
        </section>
      )}

      {/* Payable intake queue — review and approve */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Review &amp; approve</span>
            <h3>Payable intake queue</h3>
          </div>
          <span className="pill">{intakeQueue.length} invoices</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Invoice #</th>
                <th>Race</th>
                <th>Due</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {intakeQueue.length > 0 ? (
                intakeQueue.map((row) => (
                  <tr key={row.id} data-row-id={row.id}>
                    <td>
                      <div className="stacked-table-cell">
                        <span>{row.vendor}</span>
                        {row.sourceLabel ? <span className="bill-subnote">{row.sourceLabel}</span> : null}
                      </div>
                    </td>
                    <td>{row.invoiceNumber || "—"}</td>
                    <td>{row.race}</td>
                    <td>{row.dueDate}</td>
                    <td><strong>{row.totalAmount}</strong></td>
                    <td>
                      <span className={`pill ${
                        row.status === "posted" ? "signal-pill signal-good" :
                        row.status === "rejected" ? "signal-pill signal-risk" :
                        row.status === "in_review" ? "signal-pill signal-warn" :
                        "subtle-pill"
                      }`}>
                        {formatStatusLabel(row.status)}
                      </span>
                    </td>
                    <td>
                      <div className="inline-actions">
                        {row.status === "submitted" && (
                          <>
                            <form action={approveAndPostInvoiceIntakeAction}>
                              <input name="intakeId" type="hidden" value={row.id} />
                              <button className="action-button primary" type="submit">
                                Approve
                              </button>
                            </form>
                            <form action={updateInvoiceIntakeStatusAction}>
                              <input name="intakeId" type="hidden" value={row.id} />
                              <input name="nextStatus" type="hidden" value="in_review" />
                              <button className="action-button secondary" type="submit">
                                Review
                              </button>
                            </form>
                            <form action={updateInvoiceIntakeStatusAction}>
                              <input name="intakeId" type="hidden" value={row.id} />
                              <input name="nextStatus" type="hidden" value="rejected" />
                              <button className="danger-link" type="submit">
                                Reject
                              </button>
                            </form>
                          </>
                        )}
                        {row.status === "in_review" && (
                          <form action={approveAndPostInvoiceIntakeAction}>
                            <input name="intakeId" type="hidden" value={row.id} />
                            <button className="action-button primary" type="submit">
                              Approve &amp; post
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={7}>
                    No invoices in the queue. Upload documents or create a manual entry above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
