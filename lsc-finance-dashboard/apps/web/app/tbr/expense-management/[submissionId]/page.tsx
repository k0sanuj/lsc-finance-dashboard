import Link from "next/link";
import {
  getExpenseSubmissionDetail,
  getExpenseSubmissionItems,
  getRaceBudgetRules,
  getUserOptions
} from "@lsc/db";
import { requireRole } from "../../../../lib/auth";
import {
  addExpenseSplitAction,
  approveExpenseSubmissionAction,
  generateEqualSplitsAction,
  updateExpenseSubmissionStatusAction
} from "../actions";

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
  const [submission, items, users] = await Promise.all([
    getExpenseSubmissionDetail(submissionId),
    getExpenseSubmissionItems(submissionId),
    getUserOptions()
  ]);
  const raceBudgetRules = submission?.raceEventId
    ? await getRaceBudgetRules(submission.raceEventId)
    : [];
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
          <form action={approveExpenseSubmissionAction} className="stack-form">
            <input name="submissionId" type="hidden" value={submission.id} />
            <input
              name="returnPath"
              type="hidden"
              value={`/tbr/expense-management/${submission.id}`}
            />
            <label className="field">
              <span>Finance review note</span>
              <textarea
                name="reviewNote"
                placeholder="What finance approved, rejected, or needs clarified."
                rows={3}
              />
            </label>
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
              <button
                className="action-button secondary"
                formAction={updateExpenseSubmissionStatusAction}
                name="nextStatus"
                type="submit"
                value="rejected"
              >
                Reject
              </button>
            </div>
          </form>
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
