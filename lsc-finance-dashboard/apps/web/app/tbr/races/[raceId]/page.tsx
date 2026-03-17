import Link from "next/link";
import {
  getDocumentAnalysisQueue,
  getMyExpenseSubmissions,
  getTbrRaceCardById
} from "@lsc/db";
import { requireRole, requireSession } from "../../../../lib/auth";
import { DocumentAnalyzerPanel } from "../../../components/document-analyzer-panel";
import { ModalLauncher } from "../../../components/modal-launcher";
import { RaceExpenseReportBuilder } from "../../../components/race-expense-report-builder";

type RaceBillRow = {
  id?: string;
  intakeEventId?: string;
  documentName: string;
  expenseDate?: string;
  originalAmount?: string;
  originalCurrency?: string;
  convertedUsdAmount?: string;
  status: string;
  previewDataUrl?: string | null;
  linkedSubmissionTitle?: string | null;
};

type RaceDetailPageProps = {
  params: Promise<{
    raceId: string;
  }>;
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default async function TbrRaceDetailPage({ params, searchParams }: RaceDetailPageProps) {
  await requireRole(["super_admin", "finance_admin", "team_member"]);
  const session = await requireSession();
  const { raceId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const workflowContextPrefix = `tbr-race:${raceId}`;
  const race = await getTbrRaceCardById(raceId);

  if (!race) {
    return (
      <div className="page-grid">
        <section className="card">
          <div className="process-step">
            <span className="process-step-index">Race not found</span>
            <strong>This race could not be loaded.</strong>
            <span className="muted">Go back to the race browser and choose another event.</span>
          </div>
        </section>
      </div>
    );
  }

  const [billQueue, mySubmissions] = (await Promise.all([
    getDocumentAnalysisQueue(session.id, workflowContextPrefix),
    getMyExpenseSubmissions(session.id, raceId)
  ])) as [RaceBillRow[], Awaited<ReturnType<typeof getMyExpenseSubmissions>>];

  return (
    <div className="page-grid">
      <section className="hero portfolio-hero tbr-hero">
        <div className="hero-copy">
          <span className="eyebrow">TBR race workflow</span>
          <h2>
            {race.countryFlag} {race.name}
          </h2>
          <p>
            This race page is only for your own bill and receipt submissions. Upload expense
            evidence in context, then track the minimal extracted output here.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="solid-link" href="/tbr/races">
            Back to races
          </Link>
          <Link className="ghost-link" href="/tbr/my-expenses">
            My expenses
          </Link>
        </div>
      </section>

      {query?.message ? (
        <section className={`notice ${query.status ?? "info"}`}>
          <strong>{query.status === "error" ? "Action failed" : "Update"}</strong>
          <span>{query.message}</span>
        </section>
      ) : null}

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Race context</span>
            <h3>
              {race.countryFlag} {race.name}
            </h3>
          </div>
          <ModalLauncher
            description="Upload one or many files. AI should keep the result clean: expense date, original amount, original currency, USD amount, and status."
            title={`Add expense evidence for ${race.name}`}
            triggerLabel="Add expense"
          >
            <DocumentAnalyzerPanel
              title="Submit bills and receipts"
              description="Use individual bills for separate receipts, or upload one report bundle when the files already belong together."
              redirectPath={`/tbr/races/${raceId}`}
              notePlaceholder="Example: Jeddah meals and transport, Dubai merchant, reimbursable."
              workflowTag="Race intake"
              workflowContext={`${workflowContextPrefix}:expense-bills`}
              allowMultiple
              showSubmissionMode
              variant="plain"
            />
          </ModalLauncher>
        </div>
        <div className="mini-metric-grid race-context-grid">
          <div className="mini-metric">
            <span>Season</span>
            <strong>{race.seasonYear}</strong>
          </div>
          <div className="mini-metric">
            <span>Date</span>
            <strong>{race.eventDate}</strong>
          </div>
          <div className="mini-metric">
            <span>Location</span>
            <strong>{race.location}</strong>
          </div>
          <div className="mini-metric">
            <span>Country</span>
            <strong>{race.countryName}</strong>
          </div>
        </div>
      </section>

      <RaceExpenseReportBuilder raceId={raceId} raceName={race.name} rows={billQueue} />

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Expense reports</span>
            <h3>My submissions for {race.name}</h3>
          </div>
          <span className="pill">{mySubmissions.length} reports</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Submission</th>
                <th>Submitted</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mySubmissions.length > 0 ? (
                mySubmissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>{submission.title}</td>
                    <td>{submission.submittedAt}</td>
                    <td>{submission.itemCount}</td>
                    <td>{submission.totalAmount}</td>
                    <td>
                      <span className="pill subtle-pill">{submission.status}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={5}>
                    No expense submissions have been created for this race yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
