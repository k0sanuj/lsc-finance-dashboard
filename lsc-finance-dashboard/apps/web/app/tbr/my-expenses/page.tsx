import Link from "next/link";
import { getDocumentAnalysisQueue, getMyExpenseSubmissions } from "@lsc/db";
import { requireRole, requireSession } from "../../../lib/auth";
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

export default async function MyExpensesPage() {
  await requireRole(["super_admin", "finance_admin", "team_member"]);
  const session = await requireSession();
  const [submissions, rawQueue] = await Promise.all([
    getMyExpenseSubmissions(session.id),
    getDocumentAnalysisQueue(session.id, "tbr-race:")
  ]);
  const queue = rawQueue as RecentBillRow[];

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
