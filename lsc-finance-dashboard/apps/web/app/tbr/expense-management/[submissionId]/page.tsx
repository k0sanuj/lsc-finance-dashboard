import Link from "next/link";
import {
  getAuditLog,
  getExpenseSubmissionDetail,
  getExpenseSubmissionItems,
  getQbJournalEntriesForSource,
  getRaceBudgetRules,
  getUserOptions,
  type QbJournalEntryLogRow,
} from "@lsc/db";
import { requireRole } from "../../../../lib/auth";
import { DocumentPreviewButton } from "../../../components/inline-table-controls";
import {
  approveExpenseSubmissionAction,
  updateExpenseItemReviewAction,
  updateExpenseSubmissionStatusAction
} from "../actions";

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TIMELINE_ACTION_META: Record<
  string,
  { label: string; tone: "good" | "risk" | "accent" | "default" }
> = {
  create: { label: "Submitted", tone: "default" },
  "set-in_review": { label: "Moved into review", tone: "accent" },
  "set-needs_clarification": { label: "Clarification requested", tone: "accent" },
  "approve-invoice-ready": { label: "Approved, invoice ready", tone: "good" },
  reject: { label: "Rejected", tone: "risk" },
  "set-approved": { label: "Line approved", tone: "good" },
  "set-rejected": { label: "Line rejected", tone: "risk" },
  "set-review": { label: "Line flagged for review", tone: "accent" },
  "set-needs_info": { label: "Line needs info", tone: "accent" },
  "challenge-rejection": { label: "Rejection challenged", tone: "accent" },
};

function timelineLabel(action: string): { label: string; tone: "good" | "risk" | "accent" | "default" } {
  return TIMELINE_ACTION_META[action] ?? { label: action, tone: "default" };
}

function reviewTone(statusKey: string) {
  if (statusKey === "approved") return "signal-good";
  if (statusKey === "rejected") return "signal-risk";
  if (statusKey === "needs_info") return "signal-warn";
  if (statusKey === "review") return "signal-warn";
  return "signal-muted";
}

type ExpenseSubmissionDetailPageProps = {
  params: Promise<{
    submissionId: string;
  }>;
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default async function ExpenseSubmissionDetailPage({
  params,
  searchParams
}: ExpenseSubmissionDetailPageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const { submissionId } = await params;
  const [submission, items, users, submissionAudit, qbJournalLog] = await Promise.all([
    getExpenseSubmissionDetail(submissionId),
    getExpenseSubmissionItems(submissionId),
    getUserOptions(),
    getAuditLog({ entityType: "expense_submission", entityId: submissionId, limit: 50 }),
    getQbJournalEntriesForSource("expense_submission", submissionId),
  ]);

  const raceBudgetRules = submission?.raceEventId
    ? await getRaceBudgetRules(submission.raceEventId)
    : [];

  const itemAudit = items.length > 0
    ? (await Promise.all(
        items.map((it) =>
          getAuditLog({ entityType: "expense_submission_item", entityId: it.id, limit: 25 })
        )
      )).flat()
    : [];

  const auditEntries = [...submissionAudit, ...itemAudit].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  type QbTimelineEntry = QbJournalEntryLogRow & { kind: "qb-je" };
  const qbEntries: QbTimelineEntry[] = qbJournalLog.map((row) => ({
    ...row,
    kind: "qb-je",
  }));
  qbEntries.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const userNameById = new Map(users.map((u) => [u.id, u.name]));
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const status = resolvedSearchParams?.status ?? null;
  const message = resolvedSearchParams?.message ?? null;

  if (!submission) {
    return (
      <div className="page-grid">
        <section className="page-header">
          <h2>Expense submission not found</h2>
          <p>The requested submission does not exist.</p>
        </section>
      </div>
    );
  }

  const overBudgetItemCount = items.filter((item) => item.budgetStatusKey === "above_budget").length;
  const openItemCount = items.filter((item) => ["pending", "review", "needs_info"].includes(item.reviewStatusKey)).length;
  const rejectedItemCount = items.filter((item) => item.reviewStatusKey === "rejected").length;
  const challengedItemCount = items.filter((item) => item.challengeStatus === "challenged").length;
  const approvedItemCount = items.filter((item) => item.reviewStatusKey === "approved").length;
  const returnPath = `/tbr/expense-management/${submission.id}`;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Expense detail</span>
          <h3>{submission.title}</h3>
        </div>
        <div className="workspace-header-right">
          <a
            className="action-button secondary"
            href={`/api/tbr/expense-submissions/${submission.id}/csv`}
          >
            Export CSV
          </a>
          <Link className="ghost-link" href="/tbr/expense-management">
            Back to queue
          </Link>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats ops-kpi-strip">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Items</span>
          </div>
          <div className="metric-value">{items.length}</div>
          <span className="metric-subvalue">{approvedItemCount} approved, {openItemCount} open.</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Over budget</span>
          </div>
          <div className="metric-value">{overBudgetItemCount}</div>
          <span className="metric-subvalue">Needs finance decision.</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Rejected</span>
          </div>
          <div className="metric-value">{rejectedItemCount}</div>
          <span className="metric-subvalue">{challengedItemCount} challenged.</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Total</span>
          </div>
          <div className="metric-value">{submission.totalAmount}</div>
          <span className="metric-subvalue">Approved {submission.approvedAmountUsd}.</span>
        </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">{submission.status}</span>
            <h3>{submission.race}</h3>
          </div>
          <div className="inline-actions">
            <span className="pill subtle-pill">{submission.submitter}</span>
            <span className="pill subtle-pill">{submission.submittedAt}</span>
          </div>
        </div>
        <div className="mini-metric-grid compact-mini-metrics">
          <div className="mini-metric">
            <span>Submitted</span>
            <strong>{submission.submittedAmountUsd}</strong>
          </div>
          <div className="mini-metric">
            <span>Approved</span>
            <strong>{submission.approvedAmountUsd}</strong>
          </div>
          <div className="mini-metric">
            <span>Rejected</span>
            <strong>{submission.rejectedAmountUsd}</strong>
          </div>
          <div className="mini-metric">
            <span>Budget signal</span>
            <strong>
              <span className={`pill signal-pill signal-${submission.budgetSignalTone}`}>
                {submission.budgetSignalLabel}
              </span>
            </strong>
          </div>
        </div>
        {submission.operatorNote ? <p className="table-note">{submission.operatorNote}</p> : null}
        {submission.reviewNote ? <p className="table-note">{submission.reviewNote}</p> : null}
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Line review</span>
            <h3>Approve, reject, or ask clarification per item</h3>
          </div>
          <span className="pill">{items.length} rows</span>
        </div>
        <div className="table-wrapper clean-table compact-review-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant / item</th>
                <th>Category / tag</th>
                <th>Race</th>
                <th>Original</th>
                <th>USD</th>
                <th>Receipt</th>
                <th>Rules</th>
                <th>Status</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.expenseDate}</td>
                    <td>
                      <details className="row-evidence-details">
                        <summary>
                          <strong>{item.merchantName}</strong>
                          <span>{item.description}</span>
                        </summary>
                        <div className="row-evidence-panel">
                          <div>
                            <span className="section-kicker">Source evidence</span>
                            <p>
                              <DocumentPreviewButton
                                documentName={item.sourceDocumentName}
                                previewDataUrl={item.sourcePreviewDataUrl}
                                previewMimeType={item.sourcePreviewMimeType}
                              />
                            </p>
                            {item.sourcePreviewDataUrl && item.sourcePreviewMimeType?.startsWith("image/") ? (
                              <img
                                alt={`Receipt preview for ${item.merchantName}`}
                                className="expense-evidence-preview compact"
                                src={item.sourcePreviewDataUrl}
                              />
                            ) : (
                              <p className="table-note">
                                {item.aiIntakeDraftId
                                  ? `AI draft ${item.aiIntakeDraftId} supplied this item.`
                                  : "No receipt preview is attached to this item."}
                              </p>
                            )}
                          </div>
                          <div>
                            <span className="section-kicker">Splits submitted by operator</span>
                            {item.splits.length > 0 ? (
                              <table className="embedded-table">
                                <thead>
                                  <tr>
                                    <th>Participant</th>
                                    <th>Share</th>
                                    <th>Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.splits.map((split) => (
                                    <tr key={split.id}>
                                      <td>{split.participant}</td>
                                      <td>{split.percentage}</td>
                                      <td>{split.amount}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="table-note">No split rows submitted. Ask clarification if splits are required.</p>
                            )}
                            {item.budgetNotes ? <p className="table-note">{item.budgetNotes}</p> : null}
                            {item.challengeReason ? <p className="table-note">Challenge: {item.challengeReason}</p> : null}
                          </div>
                        </div>
                      </details>
                    </td>
                    <td>
                      <div className="stacked-table-cell">
                        <span>{item.category}</span>
                        <span className="bill-subnote">{item.tagLabels || "No tag"}</span>
                      </div>
                    </td>
                    <td>{submission.race}</td>
                    <td>{item.originalAmount}</td>
                    <td>
                      <div className="stacked-table-cell">
                        <strong>{item.reportingAmountUsd}</strong>
                        <span className="bill-subnote">FX {item.fxRateToUsd ?? "N/A"}</span>
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
                        <span className={`pill signal-pill signal-${item.budgetStatusTone}`}>
                          {item.budgetStatusLabel}
                        </span>
                        <span className="bill-subnote">{item.ruleMessages || item.budgetVariance || "No open finding"}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`pill signal-pill ${reviewTone(item.reviewStatusKey)}`}>
                        {item.reviewStatus}
                      </span>
                    </td>
                    <td>
                      <div className="inline-review-actions">
                        <form action={updateExpenseItemReviewAction}>
                          <input name="itemId" type="hidden" value={item.id} />
                          <input name="submissionId" type="hidden" value={submission.id} />
                          <input name="returnPath" type="hidden" value={returnPath} />
                          <input name="reviewStatus" type="hidden" value="approved" />
                          <input name="approvedAmountUsd" type="hidden" value={item.approvedAmountUsd} />
                          <button className="action-button compact-action success" type="submit">
                            Approve
                          </button>
                        </form>
                        <details className="inline-action-details">
                          <summary className="action-button compact-action risk">Reject</summary>
                          <form action={updateExpenseItemReviewAction} className="inline-action-form">
                            <input name="itemId" type="hidden" value={item.id} />
                            <input name="submissionId" type="hidden" value={submission.id} />
                            <input name="returnPath" type="hidden" value={returnPath} />
                            <input name="reviewStatus" type="hidden" value="rejected" />
                            <input name="approvedAmountUsd" type="hidden" value={item.approvedAmountUsd} />
                            <select name="rejectionReasonCode" defaultValue="" required>
                              <option value="" disabled>Reason</option>
                              <option value="missing_receipts">Missing receipts</option>
                              <option value="over_budget">Over budget</option>
                              <option value="policy_violation">Policy violation</option>
                              <option value="duplicate">Duplicate</option>
                              <option value="other">Other</option>
                            </select>
                            <textarea
                              name="rejectionReasonDetail"
                              placeholder="Explain the rejection"
                              required
                              rows={2}
                            />
                            <button className="action-button compact-action risk" type="submit">
                              Save reject
                            </button>
                          </form>
                        </details>
                        <details className="inline-action-details">
                          <summary className="action-button compact-action secondary">Ask clarification</summary>
                          <form action={updateExpenseItemReviewAction} className="inline-action-form">
                            <input name="itemId" type="hidden" value={item.id} />
                            <input name="submissionId" type="hidden" value={submission.id} />
                            <input name="returnPath" type="hidden" value={returnPath} />
                            <input name="reviewStatus" type="hidden" value="needs_info" />
                            <input name="approvedAmountUsd" type="hidden" value={item.approvedAmountUsd} />
                            <textarea
                              name="rejectionReasonDetail"
                              placeholder="What should the submitter clarify or fix?"
                              required
                              rows={2}
                            />
                            <button className="action-button compact-action secondary" type="submit">
                              Send question
                            </button>
                          </form>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={10}>
                    No expense items are linked to this submission.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="support-grid">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Report decision</span>
              <h3>Finalize after line review</h3>
            </div>
            <span className="pill subtle-pill">{submission.status}</span>
          </div>
          {(() => {
            const aboveBudgetCount = items.filter(
              (it) => it.budgetStatusKey === "above_budget"
            ).length;
            return (
              <div className="stack-form">
                <form action={approveExpenseSubmissionAction} className="stack-form">
                  <input name="submissionId" type="hidden" value={submission.id} />
                  <input name="returnPath" type="hidden" value={returnPath} />
                  {aboveBudgetCount > 0 ? (
                    <div className="notice warning" role="alert">
                      <strong>{aboveBudgetCount} over-budget line{aboveBudgetCount === 1 ? "" : "s"}</strong>
                      <span>Add a finance note and tick override to approve anyway.</span>
                    </div>
                  ) : null}
                  <label className="field">
                    <span>Finance note</span>
                    <textarea
                      name="reviewNote"
                      placeholder="Report-level decision note."
                      rows={3}
                    />
                  </label>
                  {aboveBudgetCount > 0 ? (
                    <label className="field field-inline">
                      <input name="budgetOverride" type="checkbox" value="true" />
                      <span>Override race-budget limit</span>
                    </label>
                  ) : null}
                  <button className="action-button primary" type="submit">
                    Mark invoice ready
                  </button>
                </form>
                <div className="actions-row">
                  {submission.statusKey === "submitted" ? (
                    <form action={updateExpenseSubmissionStatusAction}>
                      <input name="submissionId" type="hidden" value={submission.id} />
                      <input name="nextStatus" type="hidden" value="in_review" />
                      <input name="returnPath" type="hidden" value={returnPath} />
                      <button className="action-button secondary" type="submit">
                        Start review
                      </button>
                    </form>
                  ) : null}
                  <details className="inline-action-details">
                    <summary className="action-button secondary">Return report</summary>
                    <form action={updateExpenseSubmissionStatusAction} className="inline-action-form">
                      <input name="submissionId" type="hidden" value={submission.id} />
                      <input name="nextStatus" type="hidden" value="needs_clarification" />
                      <input name="returnPath" type="hidden" value={returnPath} />
                      <textarea
                        name="rejectReasonDetail"
                        placeholder="What should the submitter fix?"
                        required
                        rows={3}
                      />
                      <button className="action-button compact-action secondary" type="submit">
                        Send clarification
                      </button>
                    </form>
                  </details>
                </div>
              </div>
            );
          })()}
        </article>

        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Race budget</span>
              <h3>{submission.race}</h3>
            </div>
            <span className="pill">{raceBudgetRules.length} rules</span>
          </div>
          {raceBudgetRules.length > 0 ? (
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Approved amount</th>
                    <th>Close threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {raceBudgetRules.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.category}</td>
                      <td>{rule.approvedAmountUsd}</td>
                      <td>{rule.closeThreshold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No approved budget rules loaded for this race yet.</p>
          )}
        </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">History</span>
            <h3>Audit trail</h3>
          </div>
          <span className="pill subtle-pill">
            {auditEntries.length + qbEntries.length} event
            {auditEntries.length + qbEntries.length === 1 ? "" : "s"}
          </span>
        </div>
        {auditEntries.length === 0 && qbEntries.length === 0 ? (
          <p className="muted">No recorded events yet.</p>
        ) : (
          <div className="audit-timeline">
            {[
              ...auditEntries.map((e) => ({
                kind: "audit" as const,
                createdAt: e.createdAt,
                payload: e,
              })),
              ...qbEntries.map((e) => ({
                kind: "qb" as const,
                createdAt: e.createdAt,
                payload: e,
              })),
            ]
              .sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() -
                  new Date(b.createdAt).getTime()
              )
              .map((row) => {
                if (row.kind === "audit") {
                  const entry = row.payload;
                  const meta = timelineLabel(entry.action);
                  const actor = entry.performedBy
                    ? userNameById.get(entry.performedBy) ?? "Unknown user"
                    : entry.agentId ?? "System";
                  const rawNote = entry.afterState
                    ? (entry.afterState as Record<string, unknown>)["reviewNote"] ??
                      (entry.afterState as Record<string, unknown>)["rejectionReasonDetail"]
                    : null;
                  const note = typeof rawNote === "string" ? rawNote : null;
                  return (
                    <div className="audit-timeline-entry" key={`a:${entry.id}`}>
                      <div className={`audit-timeline-dot ${meta.tone}`} />
                      <div className="audit-timeline-body">
                        <strong>{meta.label}</strong>
                        <span className="audit-timeline-meta">
                          {actor} · {formatTimestamp(entry.createdAt)}
                        </span>
                        {note ? <span className="audit-timeline-note">{note}</span> : null}
                      </div>
                    </div>
                  );
                }

                const je = row.payload;
                const tone =
                  je.status === "posted"
                    ? "good"
                    : je.status === "failed"
                      ? "risk"
                      : "accent";
                const label =
                  je.status === "posted"
                    ? `QuickBooks JE posted (${je.qbJournalEntryId ?? "id?"})`
                    : je.status === "failed"
                      ? "QuickBooks JE failed"
                      : "QuickBooks JE skipped";
                const actor = je.initiatedByUserId
                  ? userNameById.get(je.initiatedByUserId) ?? "Unknown user"
                  : "System";
                return (
                  <div className="audit-timeline-entry" key={`q:${je.id}`}>
                    <div className={`audit-timeline-dot ${tone}`} />
                    <div className="audit-timeline-body">
                      <strong>{label}</strong>
                      <span className="audit-timeline-meta">
                        {actor} · {formatTimestamp(je.createdAt)}
                      </span>
                      {je.errorMessage ? (
                        <span className="audit-timeline-note">{je.errorMessage}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
