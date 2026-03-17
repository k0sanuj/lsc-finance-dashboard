import Link from "next/link";
import {
  getExpenseApprovalQueue,
  getExpenseFormOptions,
  getExpenseWorkflowSummary,
  getRaceBudgetRules,
  getTbrRaceCards,
  getTbrSeasonSummaries,
  getUserOptions
} from "@lsc/db";
import { requireRole } from "../../../lib/auth";
import { RaceBudgetRuleBuilder } from "../../components/race-budget-rule-builder";
import { deleteRaceBudgetRuleAction, updateExpenseSubmissionStatusAction } from "./actions";

type ExpenseManagementPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    season?: string;
    raceId?: string;
    submitterId?: string;
    submissionStatus?: string;
  }>;
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "in_review", label: "In review" },
  { value: "needs_clarification", label: "Needs clarification" },
  { value: "approved", label: "Invoice ready" },
  { value: "posted", label: "Posted" },
  { value: "rejected", label: "Rejected" }
] as const;

export default async function ExpenseManagementPage({
  searchParams
}: ExpenseManagementPageProps) {
  await requireRole(["super_admin", "finance_admin"]);

  const params = searchParams ? await searchParams : undefined;
  const selectedSeason = params?.season ? Number(params.season) : null;
  const selectedRaceId = params?.raceId ?? "";
  const selectedSubmitterId = params?.submitterId ?? "";
  const selectedStatus = params?.submissionStatus ?? "";

  const [summary, queue, formOptions, seasons, users, seasonRaceCards] = await Promise.all([
    getExpenseWorkflowSummary(),
    getExpenseApprovalQueue({
      seasonYear: Number.isFinite(selectedSeason) ? selectedSeason : null,
      raceEventId: selectedRaceId || null,
      submitterId: selectedSubmitterId || null,
      submissionStatus: selectedStatus || null
    }),
    getExpenseFormOptions(),
    getTbrSeasonSummaries(),
    getUserOptions(),
    selectedSeason && Number.isFinite(selectedSeason)
      ? getTbrRaceCards(selectedSeason)
      : Promise.resolve([])
  ]);

  const raceBudgetRules = selectedRaceId ? await getRaceBudgetRules(selectedRaceId) : [];
  const filteredRaceOptions =
    selectedSeason && Number.isFinite(selectedSeason)
      ? seasonRaceCards.map((race) => ({
          id: race.id,
          label: race.name
        }))
      : formOptions.races;

  const selectedRaceLabel =
    filteredRaceOptions.find((race) => race.id === selectedRaceId)?.label ?? "No race selected";

  const activeFilterQuery = new URLSearchParams();
  if (selectedSeason && Number.isFinite(selectedSeason)) {
    activeFilterQuery.set("season", String(selectedSeason));
  }
  if (selectedRaceId) {
    activeFilterQuery.set("raceId", selectedRaceId);
  }
  if (selectedSubmitterId) {
    activeFilterQuery.set("submitterId", selectedSubmitterId);
  }
  if (selectedStatus) {
    activeFilterQuery.set("submissionStatus", selectedStatus);
  }
  const returnPath = activeFilterQuery.toString()
    ? `/tbr/expense-management?${activeFilterQuery.toString()}`
    : "/tbr/expense-management";

  const status = params?.status ?? null;
  const message = params?.message ?? null;

  return (
    <div className="page-grid">
      <section className="hero">
        <span className="eyebrow">TBR approval dashboard</span>
        <h2>Load race budgets first, then review reports against them.</h2>
        <p>
          This is the finance-admin approval console for TBR. Pick a season and race, load the
          approved per-diems or caps for that event, then review submitted reports against those
          thresholds.
        </p>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid">
        {summary.map((item) => (
          <article className="metric-card" key={item.label}>
            <div className="metric-topline">
              <span className="metric-label">Review cycle</span>
              <span className="badge">{item.label}</span>
            </div>
            <div className="metric-value">{item.value}</div>
            <div className="metric-subvalue">{item.detail}</div>
          </article>
        ))}
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Step 1</span>
            <h3>Choose the review context</h3>
          </div>
          <Link className="ghost-link" href="/tbr/expense-management">
            Clear filters
          </Link>
        </div>
        <form action="/tbr/expense-management" className="stack-form" method="get">
          <div className="grid-two">
            <label className="field">
              <span>Season</span>
              <select defaultValue={selectedSeason ? String(selectedSeason) : ""} name="season">
                <option value="">All seasons</option>
                {seasons.map((season) => (
                  <option key={season.seasonYear} value={season.seasonYear}>
                    {season.seasonLabel}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Race</span>
              <select defaultValue={selectedRaceId} name="raceId">
                <option value="">All races</option>
                {filteredRaceOptions.map((race) => (
                  <option key={race.id} value={race.id}>
                    {race.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid-two">
            <label className="field">
              <span>Submitter</span>
              <select defaultValue={selectedSubmitterId} name="submitterId">
                <option value="">All users</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select defaultValue={selectedStatus} name="submissionStatus">
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="actions-row">
            <button className="action-button primary" type="submit">
              Apply filters
            </button>
            <span className="muted">
              Start by narrowing the queue to one season and one race so budget rules and review decisions stay grounded.
            </span>
          </div>
        </form>
      </section>

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Step 2</span>
              <h3>Load approved race budgets and per-diems</h3>
            </div>
            <span className="pill">{selectedRaceId ? selectedRaceLabel : "Choose race first"}</span>
          </div>
          {selectedRaceId ? (
            <>
              <div className="mini-metric-grid">
                <div className="mini-metric">
                  <span>Total rules</span>
                  <strong>{raceBudgetRules.length}</strong>
                </div>
                <div className="mini-metric">
                  <span>Per diems</span>
                  <strong>{raceBudgetRules.filter((rule) => rule.ruleKind === "per diem").length}</strong>
                </div>
                <div className="mini-metric">
                  <span>Budget caps</span>
                  <strong>{raceBudgetRules.filter((rule) => rule.ruleKind === "budget cap").length}</strong>
                </div>
                <div className="mini-metric">
                  <span>Approved charges</span>
                  <strong>{raceBudgetRules.filter((rule) => rule.ruleKind === "approved charge").length}</strong>
                </div>
              </div>
              <p className="table-note">
                Save the common race thresholds here: food/day, on-site travel/day, accommodation/day, visas, and any approved caps. The queue below will compare every report against these limits.
              </p>
              <RaceBudgetRuleBuilder
                categories={formOptions.categories}
                raceEventId={selectedRaceId}
                raceLabel={selectedRaceLabel}
                returnPath={returnPath}
              />
            </>
          ) : (
            <div className="process-step">
              <span className="process-step-index">Next</span>
              <strong>Select one race in the filters first</strong>
              <span className="muted">
                The budget dashboard only appears after a race is chosen, because every approved threshold is race-specific.
              </span>
            </div>
          )}
        </article>

        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Saved rules</span>
              <h3>Current budget table</h3>
            </div>
            <span className="pill">{raceBudgetRules.length} rules</span>
          </div>
          {selectedRaceId ? (
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Unit</th>
                    <th>Label</th>
                    <th>Approved amount</th>
                    <th>Close threshold</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {raceBudgetRules.length > 0 ? (
                    raceBudgetRules.map((rule) => (
                      <tr key={rule.id}>
                        <td>{rule.category}</td>
                        <td>{rule.ruleKind}</td>
                        <td>{rule.unitLabel}</td>
                        <td>{rule.ruleLabel}</td>
                        <td>{rule.approvedAmountUsd}</td>
                        <td>{rule.closeThreshold}</td>
                        <td>{rule.notes}</td>
                        <td>
                          <form action={deleteRaceBudgetRuleAction}>
                            <input name="ruleId" type="hidden" value={rule.id} />
                            <input name="returnPath" type="hidden" value={returnPath} />
                            <button className="ghost-link danger-link" type="submit">
                              Delete
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted" colSpan={8}>
                        No approved budgets have been saved for this race yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="process-step">
              <span className="process-step-index">Rules</span>
              <strong>No race chosen yet</strong>
              <span className="muted">
                Once you select a race, this table becomes the source of truth for its approved per-diems and caps.
              </span>
            </div>
          )}
        </article>
      </section>

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Step 3</span>
              <h3>Review the queue against the approved rules</h3>
            </div>
            <span className="pill">{queue.length} reports</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Season</th>
                  <th>Race</th>
                  <th>Submitter</th>
                  <th>Submitted</th>
                  <th>Total</th>
                  <th>Budget signal</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.length > 0 ? (
                  queue.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.seasonLabel}</td>
                      <td>{row.race}</td>
                      <td>{row.submitter}</td>
                      <td>{row.submittedAt}</td>
                      <td>{row.totalAmount}</td>
                      <td>
                        <div className="inline-actions">
                          <span className={`pill signal-pill signal-${row.budgetSignalTone}`}>
                            {row.budgetSignalLabel}
                          </span>
                          <span className="pill subtle-pill">{row.matchedBudgetCount} matched</span>
                        </div>
                      </td>
                      <td>
                        <span className="pill subtle-pill">{row.statusLabel}</span>
                      </td>
                      <td>
                        <div className="inline-actions">
                          <Link className="ghost-link" href={`/tbr/expense-management/${row.id}`}>
                            Open review
                          </Link>
                          {row.status === "submitted" ? (
                            <form action={updateExpenseSubmissionStatusAction}>
                              <input name="submissionId" type="hidden" value={row.id} />
                              <input name="nextStatus" type="hidden" value="in_review" />
                              <input name="returnPath" type="hidden" value={returnPath} />
                              <button className="action-button secondary" type="submit">
                                Start review
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={9}>
                      No submissions matched the current filter set.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Review loop</span>
              <h3>How finance admins should use this page</h3>
            </div>
          </div>
          <div className="info-grid">
            <div className="process-step">
              <span className="process-step-index">1</span>
              <strong>Pick the race first</strong>
              <span className="muted">
                Admins should not review TBR expense reports without the race context loaded.
              </span>
            </div>
            <div className="process-step">
              <span className="process-step-index">2</span>
              <strong>Load approved budgets and per-diems</strong>
              <span className="muted">
                Save the common thresholds for the race before you start making approval decisions.
              </span>
            </div>
            <div className="process-step">
              <span className="process-step-index">3</span>
              <strong>Use the budget signal in the queue</strong>
              <span className="muted">
                Green means below budget, yellow means close, and red means the report is over the approved rule.
              </span>
            </div>
            <div className="process-step">
              <span className="process-step-index">4</span>
              <strong>Open one report and decide</strong>
              <span className="muted">
                Then approve, reject, or request clarification with the budget context visible in the detail view.
              </span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
