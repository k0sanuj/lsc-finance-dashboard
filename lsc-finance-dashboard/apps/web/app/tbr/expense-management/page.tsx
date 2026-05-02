import Link from "next/link";
import {
  getExpenseApprovalQueue,
  getExpenseFormOptions,
  getExpenseWorkflowSummary,
  getNextUpcomingTbrRace,
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
  const hasAnyFilter =
    params?.season !== undefined ||
    params?.raceId !== undefined ||
    params?.submitterId !== undefined ||
    params?.submissionStatus !== undefined;

  let selectedSeason = params?.season ? Number(params.season) : null;
  let selectedRaceId = params?.raceId ?? "";
  const selectedSubmitterId = params?.submitterId ?? "";
  const selectedStatus = params?.submissionStatus ?? "";

  // Auto-select the next upcoming race when no filters have been applied
  if (!hasAnyFilter) {
    const nextRace = await getNextUpcomingTbrRace();
    if (nextRace) {
      selectedSeason = nextRace.seasonYear;
      selectedRaceId = nextRace.id;
    }
  }

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
  const overBudgetCount = queue.filter((row) => row.budgetSignal === "above_budget").length;
  const closeToBudgetCount = queue.filter((row) => row.budgetSignal === "close_to_budget").length;
  const noRuleCount = queue.filter((row) => row.budgetSignal === "no_rule").length;
  const cleanCount = queue.filter((row) => row.budgetSignal === "below_budget").length;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Expense Management</span>
          <h3>Expense review and budget management</h3>
        </div>
        <div className="workspace-header-right">
          <Link className="ghost-link" href="/tbr">Back to TBR</Link>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        {summary.map((item, i) => {
          const accent = i === 0 ? "accent-warn" : i === 1 ? "accent-brand" : "accent-good";
          return (
            <article className={`metric-card ${accent}`} key={item.label}>
              <div className="metric-topline">
                <span className="metric-label">{item.label}</span>
              </div>
              <div className="metric-value">{item.value}</div>
              <span className="metric-subvalue">{item.detail}</span>
            </article>
          );
        })}
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Over budget</span>
          </div>
          <div className="metric-value">{overBudgetCount}</div>
          <span className="metric-subvalue">Open reports requiring override or clarification.</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Close to budget</span>
          </div>
          <div className="metric-value">{closeToBudgetCount}</div>
          <span className="metric-subvalue">Reports finance should inspect before approval.</span>
        </article>
        <article className="metric-card accent-accent">
          <div className="metric-topline">
            <span className="metric-label">No budget rule</span>
          </div>
          <div className="metric-value">{noRuleCount}</div>
          <span className="metric-subvalue">Reports missing a race/category budget match.</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Clean</span>
          </div>
          <div className="metric-value">{cleanCount}</div>
          <span className="metric-subvalue">Reports currently below matched budget thresholds.</span>
        </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <h3>Filters</h3>
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
          </div>
        </form>
      </section>

      {selectedRaceId ? (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card accent-brand">
              <div className="metric-topline">
                <span className="metric-label">Total rules</span>
              </div>
              <div className="metric-value">{raceBudgetRules.length}</div>
              <span className="metric-subvalue">{selectedRaceLabel}</span>
            </article>
            <article className="metric-card accent-accent">
              <div className="metric-topline">
                <span className="metric-label">Per diems</span>
              </div>
              <div className="metric-value">{raceBudgetRules.filter((rule) => rule.ruleKind === "per diem").length}</div>
            </article>
            <article className="metric-card accent-warn">
              <div className="metric-topline">
                <span className="metric-label">Budget caps</span>
              </div>
              <div className="metric-value">{raceBudgetRules.filter((rule) => rule.ruleKind === "budget cap").length}</div>
            </article>
            <article className="metric-card accent-good">
              <div className="metric-topline">
                <span className="metric-label">Approved charges</span>
              </div>
              <div className="metric-value">{raceBudgetRules.filter((rule) => rule.ruleKind === "approved charge").length}</div>
            </article>
          </section>

          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Budget rules</span>
                <h3>Current budget table for {selectedRaceLabel}</h3>
              </div>
              <span className="pill">{raceBudgetRules.length} rules</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Unit</th>
                    <th>Label</th>
                    <th>Approved (USD)</th>
                    <th>Threshold</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {raceBudgetRules.length > 0 ? (
                    raceBudgetRules.map((rule) => (
                      <tr key={rule.id}>
                        <td>{rule.category}</td>
                        <td><span className="pill subtle-pill">{rule.ruleKind}</span></td>
                        <td>{rule.unitLabel}</td>
                        <td>{rule.ruleLabel}</td>
                        <td>{rule.approvedAmountUsd}</td>
                        <td>{rule.closeThreshold}</td>
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
                      <td className="muted" colSpan={7}>
                        No approved budgets for this race yet. Add rules below.
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
                <span className="section-kicker">Add rules</span>
                <h3>Budget rule builder</h3>
              </div>
            </div>
            <RaceBudgetRuleBuilder
              categories={formOptions.categories}
              raceEventId={selectedRaceId}
              raceLabel={selectedRaceLabel}
              returnPath={returnPath}
            />
          </article>
        </>
      ) : (
        <article className="card">
          <p className="muted">Select a race in the filters above to manage budget rules and view the approval queue.</p>
        </article>
      )}

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Exception-first finance review</span>
            <h3>Approval queue</h3>
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
      </section>
    </div>
  );
}
