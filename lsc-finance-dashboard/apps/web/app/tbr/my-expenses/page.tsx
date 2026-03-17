import Link from "next/link";
import { getDocumentAnalysisQueue, getMyExpenseSubmissions, getTbrRaceCards, getTbrSeasonSummaries } from "@lsc/db";
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
  const seasons = await getTbrSeasonSummaries();
  const activeSeason = seasons.at(-1) ?? null;
  const [submissions, queue, raceCards] = (await Promise.all([
    getMyExpenseSubmissions(session.id),
    getDocumentAnalysisQueue(session.id, "tbr-race:"),
    activeSeason ? getTbrRaceCards(activeSeason.seasonYear) : Promise.resolve([])
  ])) as [
    Awaited<ReturnType<typeof getMyExpenseSubmissions>>,
    RecentBillRow[],
    Awaited<ReturnType<typeof getTbrRaceCards>>
  ];

  return (
    <div className="page-grid">
      <section className="hero portfolio-hero tbr-hero">
        <div className="hero-copy">
          <span className="eyebrow">My expenses</span>
          <h2>Track your submissions. Then jump into the right race.</h2>
          <p>
            This is your personal TBR expense workspace: your report-level submissions, your recent
            bills and receipts, and a direct path into the race you are working on.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="solid-link" href="/tbr/races">
            Open races
          </Link>
          <Link className="ghost-link" href="/tbr">
            Back to TBR
          </Link>
        </div>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Races</span>
            <h3>{activeSeason?.seasonLabel ?? "Current season"} race entry</h3>
          </div>
          <Link className="ghost-link" href="/tbr/races">
            Browse all races
          </Link>
        </div>
        <div className="race-grid compact-race-grid">
          {raceCards.length > 0 ? (
            raceCards.map((race) => (
              <Link className="race-card compact-race-card" href={`/tbr/races/${race.id}`} key={race.id}>
                <div className="race-card-top">
                  <div>
                    <span className="section-kicker">Race</span>
                    <h3>{race.name}</h3>
                  </div>
                  <span className="flag-pill">
                    <span>{race.countryFlag}</span>
                    <span>{race.countryName}</span>
                  </span>
                </div>
                <p>{race.location}</p>
                <div className="race-metrics compact-race-metrics">
                  <div>
                    <span>Date</span>
                    <strong>{race.eventDate}</strong>
                  </div>
                  <div>
                    <span>Action</span>
                    <strong>Open race</strong>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="empty-note">No race cards are available for the current season yet.</div>
          )}
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
