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
import {
  addExpenseSplitAction,
  approveExpenseSubmissionAction,
  generateEqualSplitsAction,
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
  "approve-invoice-ready": { label: "Approved · invoice ready", tone: "good" },
  reject: { label: "Rejected", tone: "risk" },
  "regenerate-equal-splits": { label: "Splits regenerated", tone: "default" },
  "add-split": { label: "Split added", tone: "default" },
};

function timelineLabel(action: string): { label: string; tone: "good" | "risk" | "accent" | "default" } {
  return TIMELINE_ACTION_META[action] ?? { label: action, tone: "default" };
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
          getAuditLog({ entityType: "expense_item_split", entityId: it.id, limit: 25 })
        )
      )).flat()
    : [];

  const auditEntries = [...submissionAudit, ...itemAudit].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Merge QB journal entries into the timeline. They sort by createdAt
  // alongside audit rows; we render them with a separate "QuickBooks" label
  // so they visually stand out from user-driven actions.
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

  return (
    <div className="page-grid">
      <section className="hero">
        <span className="eyebrow">Expense detail</span>
        <h2>{submission.title}</h2>
        <div className="hero-actions">
          <Link className="ghost-link" href="/tbr/expense-management">
            Back to expense queue
          </Link>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="support-grid">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Submission summary</span>
            </div>
            <span className="pill">{submission.status}</span>
          </div>
          <div className="mini-metric-grid">
            <div className="mini-metric">
              <span>Race</span>
              <strong>{submission.race}</strong>
            </div>
            <div className="mini-metric">
              <span>Submitter</span>
              <strong>{submission.submitter}</strong>
            </div>
            <div className="mini-metric">
              <span>Submitted</span>
              <strong>{submission.submittedAt}</strong>
            </div>
            <div className="mini-metric">
              <span>Total</span>
              <strong>{submission.totalAmount}</strong>
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
        </article>

        <article className="card">
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

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Review decision</span>
            </div>
            <span className="pill subtle-pill">{submission.status}</span>
          </div>
          {(() => {
            const aboveBudgetCount = items.filter(
              (it) => it.budgetStatusKey === "above_budget"
            ).length;
            return (
              <form action={approveExpenseSubmissionAction} className="stack-form">
                <input name="submissionId" type="hidden" value={submission.id} />
                <input
                  name="returnPath"
                  type="hidden"
                  value={`/tbr/expense-management/${submission.id}`}
                />
                {aboveBudgetCount > 0 ? (
                  <div className="notice warning" role="alert">
                    <strong>
                      {aboveBudgetCount} item
                      {aboveBudgetCount === 1 ? "" : "s"} over approved race
                      budget
                    </strong>
                    <span>
                      Tick the override below and add a finance review note to
                      approve anyway. The override is recorded in the audit log.
                    </span>
                  </div>
                ) : null}
                <label className="field">
                  <span>
                    Finance review note
                    {aboveBudgetCount > 0 ? " (required for override)" : ""}
                  </span>
                  <textarea
                    name="reviewNote"
                    placeholder="What finance approved, rejected, or needs clarified."
                    rows={3}
                  />
                </label>
                {aboveBudgetCount > 0 ? (
                  <label className="field field-inline">
                    <input
                      name="budgetOverride"
                      type="checkbox"
                      value="true"
                    />
                    <span>
                      Override race-budget limit and approve{" "}
                      {aboveBudgetCount} over-budget item
                      {aboveBudgetCount === 1 ? "" : "s"}
                    </span>
                  </label>
                ) : null}
                <div className="actions-row">
                  {submission.statusKey === "submitted" ? (
                    <button
                      className="action-button secondary"
                      formAction={updateExpenseSubmissionStatusAction}
                      name="nextStatus"
                      type="submit"
                      value="in_review"
                    >
                      Start review
                    </button>
                  ) : null}
                  <button className="action-button primary" type="submit">
                    Approve as invoice ready
                  </button>
                  <button
                    className="action-button secondary"
                    formAction={updateExpenseSubmissionStatusAction}
                    name="nextStatus"
                    type="submit"
                    value="needs_clarification"
                  >
                    Request clarification
                  </button>
                </div>
              </form>
            );
          })()}

          <details className="reject-disclosure">
            <summary className="action-button secondary">Reject with reason…</summary>
            <form action={updateExpenseSubmissionStatusAction} className="stack-form">
              <input name="submissionId" type="hidden" value={submission.id} />
              <input name="nextStatus" type="hidden" value="rejected" />
              <input
                name="returnPath"
                type="hidden"
                value={`/tbr/expense-management/${submission.id}`}
              />
              <label className="field">
                <span>Rejection reason (required)</span>
                <select name="rejectReasonCode" defaultValue="" required>
                  <option value="" disabled>
                    Pick a reason…
                  </option>
                  <option value="missing_receipts">Missing receipts</option>
                  <option value="over_budget">Over budget</option>
                  <option value="policy_violation">Policy violation</option>
                  <option value="needs_team_split">Needs team split</option>
                  <option value="duplicate">Duplicate submission</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="field">
                <span>Explanation for submitter (required)</span>
                <textarea
                  name="rejectReasonDetail"
                  placeholder="Tell the submitter exactly what to fix before resubmitting."
                  rows={3}
                  required
                />
              </label>
              <div className="actions-row">
                <button className="action-button risk" type="submit">
                  Reject submission
                </button>
              </div>
            </form>
          </details>
        </article>
      </section>

      <section>
        <article className="card">
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
            <p className="muted">
              No recorded events yet. Status transitions, split changes, and
              QuickBooks postings will appear here.
            </p>
          ) : (
            <div className="audit-timeline">
              {/* Merge audit + QB entries by createdAt */}
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
                      ? (entry.afterState as Record<string, unknown>)["reviewNote"]
                      : null;
                    const note = typeof rawNote === "string" ? rawNote : null;
                    const override = entry.afterState
                      ? (entry.afterState as Record<string, unknown>)[
                          "budgetOverride"
                        ] === true
                      : false;
                    return (
                      <div className="audit-timeline-entry" key={`a:${entry.id}`}>
                        <div className={`audit-timeline-dot ${meta.tone}`} />
                        <div className="audit-timeline-body">
                          <strong>
                            {meta.label}
                            {override ? " (budget override)" : ""}
                          </strong>
                          <span className="audit-timeline-meta">
                            {actor} · {formatTimestamp(entry.createdAt)}
                          </span>
                          {note ? (
                            <span className="audit-timeline-note">{note}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  }
                  // QB journal entry row
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
                          {je.totalAmountUsd > 0
                            ? ` · $${je.totalAmountUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                            : ""}
                        </span>
                        {je.errorMessage ? (
                          <span className="audit-timeline-note">
                            {je.errorMessage}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </article>
      </section>

      <section className="page-grid">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Expense item</span>
                <h3>{item.merchantName}</h3>
              </div>
              <span className="pill">{item.amount}</span>
            </div>
            <div className="mini-metric-grid">
              <div className="mini-metric">
                <span>Category</span>
                <strong>{item.category}</strong>
              </div>
              <div className="mini-metric">
                <span>Team</span>
                <strong>{item.team}</strong>
              </div>
              <div className="mini-metric">
                <span>Split method</span>
                <strong>{item.splitMethod}</strong>
              </div>
              <div className="mini-metric">
                <span>Split count</span>
                <strong>{item.splitCount}</strong>
              </div>
            </div>
            {item.description ? <p className="table-note">{item.description}</p> : null}

            <p className="table-note">
              Budget:{" "}
              <span className={`pill signal-pill signal-${item.budgetStatusTone}`}>
                {item.budgetStatusLabel}
              </span>{" "}
              {item.budgetApprovedAmount ?? "No rule"} — {item.budgetVariance ?? "N/A"}
            </p>

            <section className="grid-two">
              <article className="card">
                <div className="card-title-row">
                  <div>
                    <span className="section-kicker">Split rows</span>
                  </div>
                  <form action={generateEqualSplitsAction}>
                    <input name="itemId" type="hidden" value={item.id} />
                    <input name="submissionId" type="hidden" value={submission.id} />
                    <input
                      name="returnPath"
                      type="hidden"
                      value={`/tbr/expense-management/${submission.id}`}
                    />
                    <button className="action-button secondary" type="submit">
                      Generate equal splits
                    </button>
                  </form>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>Percentage</th>
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
                          <td className="muted" colSpan={3}>
                            No split rows yet.
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
                    <span className="section-kicker">Add split row</span>
                  </div>
                </div>
                <form action={addExpenseSplitAction} className="stack-form">
                  <input name="itemId" type="hidden" value={item.id} />
                  <input name="submissionId" type="hidden" value={submission.id} />
                  <input
                    name="returnPath"
                    type="hidden"
                    value={`/tbr/expense-management/${submission.id}`}
                  />
                  <label className="field">
                    <span>Existing user</span>
                    <select name="participantId" defaultValue="">
                      <option value="">No linked user</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Label</span>
                    <input name="splitLabel" placeholder="Driver share or Team ops share" />
                  </label>
                  <div className="grid-two">
                    <label className="field">
                      <span>Percentage</span>
                      <input name="splitPercentage" inputMode="decimal" placeholder="50" />
                    </label>
                    <label className="field">
                      <span>Amount</span>
                      <input name="splitAmount" inputMode="decimal" placeholder="210" required />
                    </label>
                  </div>
                  <button className="action-button primary" type="submit">
                    Add split row
                  </button>
                </form>
              </article>
            </section>
          </article>
        ))}
      </section>
    </div>
  );
}
