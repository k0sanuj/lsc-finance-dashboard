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

  return (
    <div className="page-grid">
      <section className="hero">
        <span className="eyebrow">TBR approval dashboard</span>
        <h2>Review expense submissions against approved race budgets.</h2>
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

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <h3>Race budgets and per-diems</h3>
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
              <RaceBudgetRuleBuilder
                categories={formOptions.categories}
                raceEventId={selectedRaceId}
                raceLabel={selectedRaceLabel}
                returnPath={returnPath}
              />
            </>
          ) : (
            <p className="muted">Select a race to manage its budget rules.</p>
          )}
        </article>

        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
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
            <p className="muted">Select a race to view its budget rules.</p>
          )}
        </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
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
