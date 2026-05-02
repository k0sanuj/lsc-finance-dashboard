import type { Route } from "next";
import Link from "next/link";
import { getAiIntakeQueue, getDocumentAnalysisQueue, getMyExpenseSubmissions } from "@lsc/db";
import { requireRole } from "../../../lib/auth";
import { AIIntakePanel } from "../../components/ai-intake-panel";
import { AIIntakeReviewPanel } from "../../components/ai-intake-review-panel";
import { createReimbursementInvoiceAction } from "../expense-management/actions";

type RecentBillRow = {
  id?: string;
  createdAt?: string;
  documentName: string;
  expenseDate?: string;
  originalAmount?: string;
  convertedUsdAmount?: string;
  status: string;
};

type MyExpensesPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    aiDraftId?: string;
  }>;
};

export default async function MyExpensesPage({ searchParams }: MyExpensesPageProps) {
  const session = await requireRole(["super_admin", "finance_admin", "team_member"]);
  const params = searchParams ? await searchParams : undefined;
  const status = params?.status ?? null;
  const message = params?.message ?? null;
  const aiDraftId = params?.aiDraftId ?? null;

  const [submissions, rawQueue, receiptDrafts, reimbursementDrafts] = await Promise.all([
    getMyExpenseSubmissions(session.id),
    getDocumentAnalysisQueue(session.id, "tbr-race:"),
    getAiIntakeQueue({
      appUserId: session.id,
      companyCode: "TBR",
      targetKind: "expense_receipt",
      limit: 10,
    }),
    getAiIntakeQueue({
      appUserId: session.id,
      companyCode: "TBR",
      targetKind: "reimbursement_bundle",
      limit: 10,
    })
  ]);
  const queue = rawQueue as RecentBillRow[];
  const aiDrafts = [...receiptDrafts, ...reimbursementDrafts].slice(0, 10);
  const draftsNeedingReview = aiDrafts.filter((draft) => draft.status === "needs_review").length;
  const postedDrafts = aiDrafts.filter((draft) => draft.status === "posted").length;
  const closedDrafts = aiDrafts.filter((draft) => draft.status === "rejected" || draft.status === "discarded").length;
  const invoiceReadyReports = submissions.filter((submission) => submission.canGenerateInvoice).length;
  const activeReceiptCards = aiDrafts.slice(0, 4);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">My expenses</span>
          <h3>Expense submissions and analyzed receipts</h3>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            <Link className="segment-chip" href="/tbr/races">Races</Link>
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
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Drafts needing preview</span>
          </div>
          <div className="metric-value">{draftsNeedingReview}</div>
          <span className="metric-subvalue">AI extracted receipts waiting on your approval.</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Posted from AI</span>
          </div>
          <div className="metric-value">{postedDrafts}</div>
          <span className="metric-subvalue">Approved drafts already posted into finance review.</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Invoice ready</span>
          </div>
          <div className="metric-value">{invoiceReadyReports}</div>
          <span className="metric-subvalue">Approved reports ready for reimbursement invoice.</span>
        </article>
        <article className="metric-card accent-accent">
          <div className="metric-topline">
            <span className="metric-label">Rejected / discarded</span>
          </div>
          <div className="metric-value">{closedDrafts}</div>
          <span className="metric-subvalue">Closed AI drafts that did not mutate finance records.</span>
        </article>
      </section>

      <AIIntakePanel
        companyCode="TBR"
        defaultTargetKind="expense_receipt"
        description="Upload a receipt or paste reimbursement details. AI extracts the fields into an editable preview before anything enters the finance queue."
        notePlaceholder="Example: paid by team member for race travel, food, hotel, logistics, or reimbursement bundle."
        redirectPath="/tbr/my-expenses"
        targetOptions={[
          { value: "expense_receipt", label: "Expense receipt" },
          { value: "reimbursement_bundle", label: "Reimbursement bundle" },
        ]}
        title="AI receipt intake"
        workflowContext="tbr-my-expenses"
      />

      <AIIntakeReviewPanel
        draftId={aiDraftId}
        redirectPath="/tbr/my-expenses"
        restrictToUserId={session.id}
        title="Expense preview"
      />

      {activeReceiptCards.length > 0 ? (
        <section className="stats-grid compact-stats">
          {activeReceiptCards.map((draft) => (
            <article className="card compact-section-card" key={draft.id}>
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">{draft.status.replace(/_/g, " ")}</span>
                  <h3>{draft.sourceName}</h3>
                </div>
                <span className="pill">{Math.round(Number(draft.confidence) * 100)}%</span>
              </div>
              <div className="mini-metric-grid">
                <div className="mini-metric">
                  <span>Target</span>
                  <strong>{draft.targetKind.replace(/_/g, " ")}</strong>
                </div>
                <div className="mini-metric">
                  <span>Document type</span>
                  <strong>{draft.detectedDocumentType}</strong>
                </div>
              </div>
              <p className="table-note">{draft.financeInterpretation || draft.proposedTarget}</p>
              <Link className="ghost-link" href={`/tbr/my-expenses?aiDraftId=${draft.id}` as Route}>
                Open preview
              </Link>
            </article>
          ))}
        </section>
      ) : null}

      <section className="grid-two">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Expense submissions</span>
              <h3>My report-level submissions</h3>
            </div>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Race</th>
                  <th>Season</th>
                  <th>Submitted</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {submissions.length > 0 ? (
                  submissions.map((submission) => (
                    <tr key={submission.id}>
                      <td>{submission.title}</td>
                      <td>{submission.race}</td>
                      <td>{submission.seasonLabel}</td>
                      <td>{submission.submittedAt}</td>
                      <td>{submission.totalAmount}</td>
                      <td>
                        <span className="pill subtle-pill">{submission.status}</span>
                      </td>
                      <td>
                        {submission.linkedInvoiceId ? (
                          <div className="stacked-table-cell">
                            <span className="pill subtle-pill">
                              {submission.linkedInvoiceStatus?.replace(/_/g, " ") ?? "submitted"}
                            </span>
                            <span className="bill-subnote">
                              {submission.linkedInvoiceNumber ?? "Invoice request"}
                            </span>
                          </div>
                        ) : submission.canGenerateInvoice ? (
                          <form action={createReimbursementInvoiceAction}>
                            <input name="submissionId" type="hidden" value={submission.id} />
                            <input name="returnPath" type="hidden" value="/tbr/my-expenses" />
                            <button className="action-button secondary" type="submit">
                              Create invoice
                            </button>
                          </form>
                        ) : (
                          <span className="muted">Not ready</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={7}>
                      No expense reports submitted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Preview first</span>
              <h3>Recent AI drafts</h3>
            </div>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {aiDrafts.length > 0 ? (
                  aiDrafts.map((draft) => (
                    <tr key={draft.id}>
                      <td>{draft.sourceName}</td>
                      <td>{draft.targetKind.replace(/_/g, " ")}</td>
                      <td><span className="pill subtle-pill">{draft.status.replace(/_/g, " ")}</span></td>
                      <td>{Math.round(Number(draft.confidence) * 100)}%</td>
                      <td>
                        <Link className="ghost-link" href={`/tbr/my-expenses?aiDraftId=${draft.id}` as Route}>
                          Open preview
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={5}>
                      No AI expense drafts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Analyzed support</span>
              <h3>Recent bills and receipts</h3>
            </div>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Date</th>
                  <th>Original amount</th>
                  <th>USD amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.length > 0 ? (
                  queue.map((row) => (
                    <tr key={`${row.id ?? row.documentName}-${row.createdAt ?? "recent"}`}>
                      <td>{row.documentName}</td>
                      <td>{row.expenseDate ?? "Unknown"}</td>
                      <td>{row.originalAmount ?? "$0.00"}</td>
                      <td>{row.convertedUsdAmount ?? "$0.00"}</td>
                      <td>
                        <span className="pill subtle-pill">{row.status.replace(/_/g, " ")}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={5}>
                      No analyzed bills or receipts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
