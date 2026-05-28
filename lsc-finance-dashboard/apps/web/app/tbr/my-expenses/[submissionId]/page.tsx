import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getExpenseSubmissionDetail,
  getExpenseSubmissionItems,
  getMyExpenseSubmissions
} from "@lsc/db";
import { requireTbrExpensePortalAccess } from "../../../../lib/auth";
import { DocumentPreviewButton } from "../../../components/inline-table-controls";
import {
  addExpenseSplitAction,
  challengeExpenseItemRejectionAction,
  createReimbursementInvoiceAction,
  generateEqualSplitsAction
} from "../../expense-management/actions";

type MyExpenseReportPageProps = {
  params: Promise<{
    submissionId: string;
  }>;
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

function reviewTone(statusKey: string) {
  if (statusKey === "approved") return "signal-good";
  if (statusKey === "rejected") return "signal-risk";
  if (statusKey === "needs_info") return "signal-warn";
  if (statusKey === "review") return "signal-warn";
  return "signal-muted";
}

export default async function MyExpenseReportPage({
  params,
  searchParams
}: MyExpenseReportPageProps) {
  const session = await requireTbrExpensePortalAccess();
  const { submissionId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const [submission, items, mySubmissions] = await Promise.all([
    getExpenseSubmissionDetail(submissionId),
    getExpenseSubmissionItems(submissionId),
    getMyExpenseSubmissions(session.id),
  ]);

  if (!submission) {
    return (
      <div className="page-grid">
        <section className="workspace-header">
          <div className="workspace-header-left">
            <span className="section-kicker">My expenses</span>
            <h3>Report not found</h3>
          </div>
          <Link className="ghost-link" href="/tbr/my-expenses">Back to my expenses</Link>
        </section>
      </div>
    );
  }

  if (
    session.role === "expense_submitter" &&
    submission.submittedByUserId !== session.id
  ) {
    redirect("/tbr/my-expenses");
  }

  const linkedReport = mySubmissions.find((report) => report.id === submission.id);
  const canGenerateInvoice = Boolean(linkedReport?.canGenerateInvoice);
  const status = resolvedSearchParams?.status ?? null;
  const message = resolvedSearchParams?.message ?? null;
  const groupedItems = new Map<string, typeof items>();
  for (const item of items) {
    const bucket = groupedItems.get(item.category) ?? [];
    bucket.push(item);
    groupedItems.set(item.category, bucket);
  }
  const rejectedItems = items.filter((item) => item.reviewStatusKey === "rejected");
  const approvedItems = items.filter((item) => item.reviewStatusKey === "approved");
  const ruleFindingCount = items.reduce(
    (total, item) => total + Number(item.openRuleFindingCount),
    0
  );
  const canEditSplits = ["submitted", "needs_clarification"].includes(submission.statusKey);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Expense report</span>
          <h3>{submission.title}</h3>
        </div>
        <div className="workspace-header-right">
          <Link className="ghost-link" href="/tbr/my-expenses">Back to my expenses</Link>
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
            <span className="metric-label">Submitted</span>
          </div>
          <div className="metric-value">{submission.submittedAmountUsd}</div>
          <span className="metric-subvalue">USD reporting value, original values preserved below.</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Approved</span>
          </div>
          <div className="metric-value">{submission.approvedAmountUsd}</div>
          <span className="metric-subvalue">{approvedItems.length} approved line item(s).</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Rejected</span>
          </div>
          <div className="metric-value">{submission.rejectedAmountUsd}</div>
          <span className="metric-subvalue">{rejectedItems.length} rejected line item(s).</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Rule findings</span>
          </div>
          <div className="metric-value">{ruleFindingCount}</div>
          <span className="metric-subvalue">{submission.openItemCount} item(s) still open.</span>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">{submission.status}</span>
            <h3>{submission.race}</h3>
          </div>
          {canGenerateInvoice ? (
            <form action={createReimbursementInvoiceAction}>
              <input name="submissionId" type="hidden" value={submission.id} />
              <input name="returnPath" type="hidden" value={`/tbr/my-expenses/${submission.id}`} />
              <button className="action-button primary" type="submit">
                Raise reimbursement invoice
              </button>
            </form>
          ) : (
            <span className="pill subtle-pill">
              {linkedReport?.linkedInvoiceNumber ?? "Invoice not ready"}
            </span>
          )}
        </div>
        <div className="mini-metric-grid">
          <div className="mini-metric">
            <span>From</span>
            <strong>{session.email}</strong>
          </div>
          <div className="mini-metric">
            <span>To</span>
            <strong>LSC / XTZ Esports Tech Ltd (Dubai)</strong>
          </div>
          <div className="mini-metric">
            <span>Submitted</span>
            <strong>{submission.submittedAt}</strong>
          </div>
          <div className="mini-metric">
            <span>Report status</span>
            <strong>{submission.status}</strong>
          </div>
        </div>
        {submission.reviewNote ? <p className="table-note">{submission.reviewNote}</p> : null}
      </section>

      {Array.from(groupedItems.entries()).map(([category, rows]) => (
        <section className="card" key={category}>
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Category</span>
              <h3>{category}</h3>
            </div>
            <span className="pill">{rows.length} item{rows.length === 1 ? "" : "s"}</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Race / tag</th>
                  <th>Original</th>
                  <th>FX</th>
                  <th>USD</th>
                  <th>Status</th>
                  <th>Receipt</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.expenseDate}</td>
                    <td>
                      <div className="stacked-table-cell">
                        <strong>{item.merchantName}</strong>
                        <span className="bill-subnote">{item.description}</span>
                      </div>
                    </td>
                    <td>
                      <div className="stacked-table-cell">
                        <span>{submission.race}</span>
                        <span className="bill-subnote">{item.tagLabels || "No tag"}</span>
                      </div>
                    </td>
                    <td>{item.originalAmount}</td>
                    <td>{item.fxRateToUsd ?? "N/A"}</td>
                    <td>{item.reportingAmountUsd}</td>
                    <td>
                      <div className="stacked-table-cell">
                        <span className={`pill signal-pill ${reviewTone(item.reviewStatusKey)}`}>
                          {item.reviewStatus}
                        </span>
                        {item.approvedAmountUsd ? (
                          <span className="bill-subnote">Approved {item.approvedAmountUsd}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <DocumentPreviewButton
                        documentName={item.sourceDocumentName}
                        previewDataUrl={item.sourcePreviewDataUrl}
                        previewMimeType={item.sourcePreviewMimeType}
                      />
                    </td>
                    <td>
                      <div className="stacked-table-cell">
                        <span>{item.ruleMessages || item.noReceiptReason || "No notes"}</span>
                        {item.reviewStatusKey === "needs_info" && item.rejectionReasonDetail ? (
                          <span className="bill-subnote">Finance question: {item.rejectionReasonDetail}</span>
                        ) : null}
                        {item.reviewStatusKey === "rejected" && item.rejectionReasonDetail ? (
                          <span className="bill-subnote">Rejected: {item.rejectionReasonDetail}</span>
                        ) : null}
                        {item.challengeReason ? (
                          <span className="bill-subnote">Challenge: {item.challengeReason}</span>
                        ) : null}
                        <details className="reject-disclosure">
                          <summary className="ghost-link">Splits</summary>
                          <div className="table-wrapper clean-table">
                            <table>
                              <thead>
                                <tr>
                                  <th>Participant</th>
                                  <th>Share</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.splits.length > 0 ? (
                                  item.splits.map((split) => (
                                    <tr key={split.id}>
                                      <td>{split.participant}</td>
                                      <td>{split.percentage}</td>
                                      <td>{split.amount}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td className="muted" colSpan={3}>No splits added.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          {canEditSplits ? (
                            <div className="stack-form">
                              <form action={generateEqualSplitsAction}>
                                <input name="itemId" type="hidden" value={item.id} />
                                <input name="submissionId" type="hidden" value={submission.id} />
                                <input
                                  name="returnPath"
                                  type="hidden"
                                  value={`/tbr/my-expenses/${submission.id}`}
                                />
                                <button className="action-button secondary" type="submit">
                                  Generate equal splits
                                </button>
                              </form>
                              <form action={addExpenseSplitAction} className="stack-form">
                                <input name="itemId" type="hidden" value={item.id} />
                                <input name="submissionId" type="hidden" value={submission.id} />
                                <input
                                  name="returnPath"
                                  type="hidden"
                                  value={`/tbr/my-expenses/${submission.id}`}
                                />
                                <label className="field">
                                  <span>Split label</span>
                                  <input name="splitLabel" placeholder="Mashael share, team ops share" required />
                                </label>
                                <div className="grid-two">
                                  <label className="field">
                                    <span>Percentage</span>
                                    <input name="splitPercentage" inputMode="decimal" placeholder="50" />
                                  </label>
                                  <label className="field">
                                    <span>Amount</span>
                                    <input name="splitAmount" inputMode="decimal" required />
                                  </label>
                                </div>
                                <button className="action-button secondary" type="submit">
                                  Add split row
                                </button>
                              </form>
                            </div>
                          ) : (
                            <p className="table-note">Splits are locked while finance is reviewing this report.</p>
                          )}
                        </details>
                      </div>
                      {item.reviewStatusKey === "rejected" ? (
                        <details className="reject-disclosure">
                          <summary className="ghost-link">Challenge rejection</summary>
                          <form action={challengeExpenseItemRejectionAction} className="stack-form">
                            <input name="itemId" type="hidden" value={item.id} />
                            <input name="submissionId" type="hidden" value={submission.id} />
                            <input
                              name="returnPath"
                              type="hidden"
                              value={`/tbr/my-expenses/${submission.id}`}
                            />
                            <label className="field">
                              <span>Reason</span>
                              <textarea
                                name="challengeReason"
                                placeholder="Explain why this item should be reconsidered."
                                required
                                rows={3}
                              />
                            </label>
                            <button className="action-button secondary" type="submit">
                              Submit challenge
                            </button>
                          </form>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
