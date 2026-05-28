import type { Route } from "next";
import Link from "next/link";
import {
  getAiIntakeQueue,
  getDocumentAnalysisQueue,
  getExpenseFormOptions,
  getExpenseWorkspaceControls,
  getMyExpenseSubmissions
} from "@lsc/db";
import { requireTbrExpensePortalAccess } from "../../../lib/auth";
import { AIIntakePanel } from "../../components/ai-intake-panel";
import { AIIntakeReviewPanel } from "../../components/ai-intake-review-panel";
import {
  createExpenseReportFromBillsAction,
  createExpenseSubmissionAction,
  createReimbursementInvoiceAction
} from "../expense-management/actions";

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

function fieldValue(fields: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = fields[key];
    if (value) return value;
  }
  return "";
}

function reportStep(statusKey: string) {
  if (statusKey === "needs_clarification" || statusKey === "rejected") return 1;
  if (statusKey === "submitted" || statusKey === "in_review") return 2;
  if (statusKey === "approved") return 3;
  if (statusKey === "posted") return 4;
  return 1;
}

export default async function MyExpensesPage({ searchParams }: MyExpensesPageProps) {
  const session = await requireTbrExpensePortalAccess();
  const params = searchParams ? await searchParams : undefined;
  const status = params?.status ?? null;
  const message = params?.message ?? null;
  const aiDraftId = params?.aiDraftId ?? null;

  const [
    submissions,
    rawQueue,
    receiptDrafts,
    reimbursementDrafts,
    formOptions,
    workspaceControls
  ] = await Promise.all([
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
    }),
    getExpenseFormOptions(),
    getExpenseWorkspaceControls()
  ]);
  const queue = rawQueue as RecentBillRow[];
  const aiDrafts = [...receiptDrafts, ...reimbursementDrafts].slice(0, 10);
  const draftsNeedingReview = aiDrafts.filter((draft) => draft.status === "needs_review").length;
  const postedDrafts = aiDrafts.filter((draft) => draft.status === "posted").length;
  const closedDrafts = aiDrafts.filter((draft) => draft.status === "rejected" || draft.status === "discarded").length;
  const invoiceReadyReports = submissions.filter((submission) => submission.canGenerateInvoice).length;
  const financeReviewReports = submissions.filter((submission) =>
    ["submitted", "in_review"].includes(submission.statusKey)
  ).length;
  const clarificationReports = submissions.filter((submission) =>
    ["needs_clarification", "rejected"].includes(submission.statusKey)
  ).length;
  const reimbursedReports = submissions.filter((submission) => submission.linkedInvoiceId || submission.statusKey === "posted").length;
  const activeReceiptCards = aiDrafts.slice(0, 4);
  const latestReports = submissions.slice(0, 4);
  const approvedAiDrafts = aiDrafts.filter((draft) => draft.status === "approved");
  const manualRaceId =
    formOptions.races.find((race) => /lake como/i.test(race.label))?.id ??
    formOptions.races[0]?.id ??
    "";
  const manualTeamId =
    formOptions.teams.find((team) => /blue rising|tbr|racing/i.test(team.label))?.id ??
    formOptions.teams[0]?.id ??
    "";
  const manualCategoryId =
    formOptions.categories.find((category) => /other/i.test(category.label))?.id ??
    formOptions.categories[0]?.id ??
    "";
  const manualTagId =
    workspaceControls.tags.find((tag) => /lake|travel|transport/i.test(tag.label))?.id ??
    workspaceControls.tags[0]?.id ??
    "";

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">My expenses</span>
          <h3>Expense submissions and analyzed receipts</h3>
        </div>
        <div className="workspace-header-right">
          {session.role === "expense_submitter" ? (
            <span className="pill subtle-pill">TBR expense portal only</span>
          ) : (
            <div className="segment-row">
              <Link className="segment-chip" href="/tbr/races">Races</Link>
              <Link className="segment-chip" href="/tbr">Back to TBR</Link>
            </div>
          )}
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

      <section className="expense-flow-grid">
        <article className="card expense-flow-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Expense flow</span>
              <h3>Receipt to reimbursement</h3>
            </div>
            <span className="pill">{submissions.length} reports</span>
          </div>
          <div className="expense-flow-steps" aria-label="Expense workflow stages">
            {[
              { label: "Capture", value: draftsNeedingReview + postedDrafts, detail: "receipts" },
              { label: "Preview", value: draftsNeedingReview, detail: "open" },
              { label: "Fixes", value: clarificationReports, detail: "returned" },
              { label: "Finance", value: financeReviewReports, detail: "review" },
              { label: "Invoice", value: invoiceReadyReports, detail: "ready" },
              { label: "Closed", value: reimbursedReports, detail: "linked" },
            ].map((step, index) => (
              <div className="expense-flow-step" key={step.label}>
                <span className="expense-flow-index">{index + 1}</span>
                <strong>{step.label}</strong>
                <span>{step.value} {step.detail}</span>
              </div>
            ))}
          </div>
        </article>

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
          uploadAccept="image/*,application/pdf"
          uploadCapture="environment"
          workflowContext="tbr-my-expenses"
        />
      </section>

      <section className="grid-two">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Manual entry</span>
              <h3>Add a no-receipt expense</h3>
            </div>
            <span className="pill subtle-pill">Reason required</span>
          </div>
          <form action={createExpenseSubmissionAction} className="stack-form">
            <input name="returnPath" type="hidden" value="/tbr/my-expenses" />
            <label className="field">
              <span>Report title</span>
              <input
                name="submissionTitle"
                placeholder="Expense Report 2026-05-24"
                required
              />
            </label>
            <div className="grid-two">
              <label className="field">
                <span>Race</span>
                <select name="raceEventId" defaultValue={manualRaceId} required>
                  {formOptions.races.map((race) => (
                    <option key={race.id} value={race.id}>{race.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Team</span>
                <select name="teamId" defaultValue={manualTeamId}>
                  <option value="">No team</option>
                  {formOptions.teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid-two">
              <label className="field">
                <span>Category</span>
                <select name="costCategoryId" defaultValue={manualCategoryId} required>
                  {formOptions.categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tag</span>
                <select name="expenseTagId" defaultValue={manualTagId} required>
                  {workspaceControls.tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid-two">
              <label className="field">
                <span>Merchant / payee</span>
                <input name="merchantName" placeholder="Uber, hotel, allowance, bonus" required />
              </label>
              <label className="field">
                <span>Date</span>
                <input name="expenseDate" type="date" required />
              </label>
            </div>
            <div className="grid-two">
              <label className="field">
                <span>Currency</span>
                <input name="currencyCode" defaultValue="EUR" maxLength={3} required />
              </label>
              <label className="field">
                <span>Original amount</span>
                <input name="amount" inputMode="decimal" placeholder="35.00" required />
              </label>
              <label className="field">
                <span>FX to USD</span>
                <input name="fxRateToUsd" inputMode="decimal" placeholder="1.1642" />
              </label>
            </div>
            <label className="field">
              <span>Description</span>
              <input name="description" placeholder="Travel day food allowance, taxi, race support, etc." />
            </label>
            <label className="field">
              <span>No-receipt reason</span>
              <textarea
                name="noReceiptReason"
                placeholder="Explain why a receipt is unavailable. Finance sees this as the receipt note."
                required
                rows={3}
              />
            </label>
            <div className="grid-two">
              <label className="field">
                <span>Split method</span>
                <select name="splitMethod" defaultValue="solo">
                  <option value="solo">Solo</option>
                  <option value="equal">Equal split</option>
                  <option value="custom">Custom split after submission</option>
                </select>
              </label>
              <label className="field">
                <span>Split count</span>
                <input name="splitCount" inputMode="numeric" min="1" defaultValue="1" />
              </label>
            </div>
            <button className="action-button primary" type="submit">
              Submit manual expense
            </button>
          </form>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Workspace rules</span>
              <h3>Current checks on your report</h3>
            </div>
            <span className="pill">{workspaceControls.rules.filter((rule) => rule.isActive).length} active</span>
          </div>
          <div className="inline-actions">
            {workspaceControls.rules.length > 0 ? workspaceControls.rules.map((rule) => (
              <span className={`pill signal-pill signal-${rule.severity === "blocker" ? "risk" : rule.severity === "warning" ? "warn" : "good"}`} key={rule.id}>
                {rule.label}
              </span>
            )) : (
              <p className="muted">Finance has not configured workspace rules yet.</p>
            )}
          </div>
          <p className="table-note">
            Uploads and manual items stay in preview until approved. Finance decides line-by-line; rejected items can be challenged with a reason.
          </p>
        </article>
      </section>

      <AIIntakeReviewPanel
        draftId={aiDraftId}
        redirectPath="/tbr/my-expenses"
        restrictToUserId={session.id}
        title="Expense preview"
      />

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Race report</span>
            <h3>Create report from approved AI receipts</h3>
          </div>
          <span className="pill">{approvedAiDrafts.length} approved draft{approvedAiDrafts.length === 1 ? "" : "s"}</span>
        </div>
        <form action={createExpenseReportFromBillsAction} className="stack-form">
          <input
            name="intakeEventIds"
            type="hidden"
            value={approvedAiDrafts.map((draft) => `ai:${draft.id}`).join(",")}
          />
          <input name="returnPath" type="hidden" value="/tbr/my-expenses" />
          <div className="grid-two">
            <label className="field">
              <span>Report title</span>
              <input
                name="submissionTitle"
                placeholder="Lake Como S3 reimbursement report"
                required
              />
            </label>
            <label className="field">
              <span>Race</span>
              <select name="raceEventId" defaultValue={manualRaceId} required>
                {formOptions.races.map((race) => (
                  <option key={race.id} value={race.id}>{race.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Report note</span>
            <input name="operatorNote" placeholder="Travel, transport, meal allowance, or reimbursement context" />
          </label>
          <button className="action-button primary" disabled={approvedAiDrafts.length === 0} type="submit">
            Add approved AI receipts to report
          </button>
        </form>
      </section>

      {activeReceiptCards.length > 0 ? (
        <section className="receipt-wallet-grid">
          {activeReceiptCards.map((draft) => (
            <article className="receipt-card" key={draft.id}>
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">{draft.status.replace(/_/g, " ")}</span>
                  <h3>{draft.sourceName}</h3>
                </div>
                <span className="pill">{Math.round(Number(draft.confidence) * 100)}%</span>
              </div>
              <div className="receipt-card-fields">
                <div className="mini-metric">
                  <span>Merchant</span>
                  <strong>{fieldValue(draft.previewFields, "merchant_name", "vendor_name", "counterparty_name") || "Review"}</strong>
                </div>
                <div className="mini-metric">
                  <span>Amount</span>
                  <strong>{fieldValue(draft.previewFields, "usd_amount", "total_amount", "amount", "original_amount") || "Review"}</strong>
                </div>
                <div className="mini-metric">
                  <span>Date</span>
                  <strong>{fieldValue(draft.previewFields, "expense_date", "transaction_date", "document_date", "date") || "Review"}</strong>
                </div>
                <div className="mini-metric">
                  <span>Category</span>
                  <strong>{fieldValue(draft.previewFields, "category", "cost_category") || draft.targetKind.replace(/_/g, " ")}</strong>
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

      {latestReports.length > 0 ? (
        <section className="report-tracker-grid">
          {latestReports.map((submission) => {
            const currentStep = reportStep(submission.statusKey);
            return (
              <article className="card compact-section-card report-tracker-card" key={submission.id}>
                <div className="card-title-row">
                  <div>
                    <span className="section-kicker">{submission.status}</span>
                    <h3>{submission.title}</h3>
                  </div>
                  <span className="pill">{submission.totalAmount}</span>
                </div>
                <div className="report-progress" aria-label={`${submission.title} progress`}>
                  {[1, 2, 3, 4].map((step) => (
                    <span
                      className={step <= currentStep ? "report-progress-dot active" : "report-progress-dot"}
                      key={step}
                    />
                  ))}
                </div>
                <div className="mini-metric-grid">
                  <div className="mini-metric">
                    <span>Race</span>
                    <strong>{submission.race}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>Invoice</span>
                    <strong>
                      {submission.linkedInvoiceId
                        ? submission.linkedInvoiceStatus?.replace(/_/g, " ") ?? "Linked"
                        : submission.canGenerateInvoice
                          ? "Ready"
                          : "Pending"}
                    </strong>
                  </div>
                </div>
              </article>
            );
          })}
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
	                      <td>
                          <Link className="ghost-link" href={`/tbr/my-expenses/${submission.id}` as Route}>
                            {submission.title}
                          </Link>
                        </td>
	                      <td>{submission.race}</td>
	                      <td>{submission.seasonLabel}</td>
	                      <td>{submission.submittedAt}</td>
	                      <td>
                          <div className="stacked-table-cell">
                            <strong>{submission.submittedAmountUsd}</strong>
                            <span className="bill-subnote">
                              Approved {submission.approvedAmountUsd} · rejected {submission.rejectedAmountUsd}
                            </span>
                          </div>
                        </td>
	                      <td>
	                        <div className="stacked-table-cell">
                            <span className="pill subtle-pill">{submission.status}</span>
                            <span className="bill-subnote">
                              {submission.openItemCount} open · {submission.challengedItemCount} challenged
                            </span>
                          </div>
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
                  <th>Preview</th>
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
