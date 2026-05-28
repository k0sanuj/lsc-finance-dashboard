import type { Route } from "next";
import Link from "next/link";
import {
  getExpenseApprovalQueue,
  getExpenseFormOptions,
  getExpenseWorkspaceControls,
  getNextUpcomingTbrRace,
  getRaceBudgetRules,
  getTbrRaceCards,
  getTbrSeasonSummaries,
  getUserOptions
} from "@lsc/db";
import { requireRole } from "../../../lib/auth";
import { RaceBudgetRuleBuilder } from "../../components/race-budget-rule-builder";
import {
  deleteRaceBudgetRuleAction,
  updateExpenseSubmissionStatusAction,
  upsertExpenseTagAction,
  upsertExpenseWorkspaceRuleAction
} from "./actions";

type ExpenseManagementPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    season?: string;
    raceId?: string;
    submitterId?: string;
    submissionStatus?: string;
    budgetSignal?: string;
    focus?: string;
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

const BUDGET_SIGNAL_OPTIONS = [
  { value: "", label: "All budget signals" },
  { value: "exception", label: "Exceptions" },
  { value: "above_budget", label: "Over budget" },
  { value: "close_to_budget", label: "Close to budget" },
  { value: "no_rule", label: "No budget rule" },
  { value: "below_budget", label: "Clean" }
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
    params?.submissionStatus !== undefined ||
    params?.budgetSignal !== undefined;

  let selectedSeason = params?.season ? Number(params.season) : null;
  let selectedRaceId = params?.raceId ?? "";
  const selectedSubmitterId = params?.submitterId ?? "";
  const selectedStatus = params?.submissionStatus ?? "";
  const selectedBudgetSignal = params?.budgetSignal ?? "";
  const selectedFocus = params?.focus ?? "";

  // Auto-select the next upcoming race when no filters have been applied
  if (!hasAnyFilter) {
    const nextRace = await getNextUpcomingTbrRace();
    if (nextRace) {
      selectedSeason = nextRace.seasonYear;
      selectedRaceId = nextRace.id;
    }
  }

  const [queue, formOptions, workspaceControls, seasons, users, seasonRaceCards] = await Promise.all([
    getExpenseApprovalQueue({
      seasonYear: Number.isFinite(selectedSeason) ? selectedSeason : null,
      raceEventId: selectedRaceId || null,
      submitterId: selectedSubmitterId || null,
      submissionStatus: selectedStatus || null,
      budgetSignal: selectedBudgetSignal || null
    }),
    getExpenseFormOptions(),
    getExpenseWorkspaceControls(),
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
  if (selectedBudgetSignal) {
    activeFilterQuery.set("budgetSignal", selectedBudgetSignal);
  }
  const returnPath = activeFilterQuery.toString()
    ? `/tbr/expense-management?${activeFilterQuery.toString()}`
    : "/tbr/expense-management";

  const status = params?.status ?? null;
  const message = params?.message ?? null;
  const overBudgetCount = queue.filter((row) => row.budgetSignal === "above_budget").length;
  const closeToBudgetCount = queue.filter((row) => row.budgetSignal === "close_to_budget").length;
  const noRuleCount = queue.filter((row) => row.budgetSignal === "no_rule").length;
  const submittedCount = queue.filter((row) => row.status === "submitted").length;
  const inReviewCount = queue.filter((row) => row.status === "in_review").length;
  const clarificationCount = queue.filter((row) => row.status === "needs_clarification").length;
  const invoiceReadyCount = queue.filter((row) => row.status === "approved").length;
  const challengedCount = queue.reduce((total, row) => total + Number(row.challengedItemCount), 0);
  const missingReceiptCount = queue.reduce((total, row) => total + Number(row.missingReceiptCount), 0);
  const buildQueueHref = (overrides: { submissionStatus?: string | null; budgetSignal?: string | null }) => {
    const query = new URLSearchParams(activeFilterQuery);
    if ("submissionStatus" in overrides) {
      if (overrides.submissionStatus) {
        query.set("submissionStatus", overrides.submissionStatus);
      } else {
        query.delete("submissionStatus");
      }
    }
    if ("budgetSignal" in overrides) {
      if (overrides.budgetSignal) {
        query.set("budgetSignal", overrides.budgetSignal);
      } else {
        query.delete("budgetSignal");
      }
    }
    const qs = query.toString();
    return qs ? `/tbr/expense-management?${qs}` : "/tbr/expense-management";
  };
  const buildFocusHref = (focus: string) => {
    const query = new URLSearchParams(activeFilterQuery);
    query.set("focus", focus);
    return `/tbr/expense-management?${query.toString()}`;
  };
  const focusCards = [
    {
      key: "awaiting-review",
      label: "Awaiting review",
      value: submittedCount + inReviewCount,
      detail: "Submitted or in-review reports.",
      tone: "accent-warn",
      rows: queue.filter((row) => row.status === "submitted" || row.status === "in_review"),
      href: buildQueueHref({ submissionStatus: null, budgetSignal: null }),
    },
    {
      key: "needs-clarification",
      label: "Needs clarification",
      value: clarificationCount,
      detail: "Reports already returned to submitters.",
      tone: "accent-brand",
      rows: queue.filter((row) => row.status === "needs_clarification"),
      href: buildQueueHref({ submissionStatus: "needs_clarification", budgetSignal: null }),
    },
    {
      key: "exceptions",
      label: "Exceptions",
      value: overBudgetCount + closeToBudgetCount + noRuleCount,
      detail: "Budget signals that need a finance decision.",
      tone: "accent-risk",
      rows: queue.filter((row) => row.budgetSignal !== "below_budget"),
      href: buildQueueHref({ submissionStatus: null, budgetSignal: "exception" }),
    },
    {
      key: "receipt-gaps",
      label: "Receipt gaps",
      value: missingReceiptCount,
      detail: "Items missing receipts or explanations.",
      tone: "accent-warn",
      rows: queue.filter((row) => Number(row.missingReceiptCount) > 0),
      href: buildQueueHref({ submissionStatus: null, budgetSignal: null }),
    },
    {
      key: "challenged-lines",
      label: "Challenged lines",
      value: challengedCount,
      detail: "Rejected lines challenged by submitters.",
      tone: "accent-accent",
      rows: queue.filter((row) => Number(row.challengedItemCount) > 0),
      href: buildQueueHref({ submissionStatus: null, budgetSignal: null }),
    },
    {
      key: "invoice-ready",
      label: "Invoice ready",
      value: invoiceReadyCount,
      detail: "Approved reports ready for invoice flow.",
      tone: "accent-good",
      rows: queue.filter((row) => row.status === "approved"),
      href: buildQueueHref({ submissionStatus: "approved", budgetSignal: null }),
    },
  ];
  const activeFocus = focusCards.find((card) => card.key === selectedFocus) ?? null;

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

      <section className="stats-grid compact-stats ops-kpi-strip">
        {focusCards.map((card) => (
          <Link
            className={`metric-card ${card.tone} ops-focus-card`}
            href={buildFocusHref(card.key) as Route}
            key={card.key}
          >
            <div className="metric-topline">
              <span className="metric-label">{card.label}</span>
            </div>
            <div className="metric-value">{card.value}</div>
            <span className="metric-subvalue">{card.detail}</span>
          </Link>
        ))}
      </section>

      {activeFocus ? (
        <aside className="review-focus-drawer" aria-label={`${activeFocus.label} review drawer`}>
          <div className="review-focus-drawer-header">
            <div>
              <span className="section-kicker">Focused queue</span>
              <h3>{activeFocus.label}</h3>
            </div>
            <Link className="ghost-link" href={returnPath as Route}>
              Close
            </Link>
          </div>
          <p className="table-note">{activeFocus.detail}</p>
          <div className="review-focus-list">
            {activeFocus.rows.length > 0 ? (
              activeFocus.rows.slice(0, 12).map((row) => (
                <div className="review-focus-row" key={row.id}>
                  <div className="stacked-table-cell">
                    <strong>{row.title}</strong>
                    <span className="bill-subnote">{row.submitter} · {row.race}</span>
                  </div>
                  <div className="stacked-table-cell">
                    <span>{row.submittedAmountUsd}</span>
                    <span className="bill-subnote">
                      {row.openItemCount} open · {row.missingReceiptCount} receipt gaps · {row.challengedItemCount} challenged
                    </span>
                  </div>
                  <span className={`pill signal-pill signal-${row.budgetSignalTone}`}>
                    {row.budgetSignalLabel}
                  </span>
                  <Link className="action-button compact-action primary" href={`/tbr/expense-management/${row.id}`}>
                    Take me there
                  </Link>
                </div>
              ))
            ) : (
              <p className="muted">No reports currently match this focus queue.</p>
            )}
          </div>
          <Link className="action-button secondary" href={activeFocus.href as Route}>
            Take Me There
          </Link>
        </aside>
      ) : null}

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
          <label className="field">
            <span>Budget signal</span>
            <select defaultValue={selectedBudgetSignal} name="budgetSignal">
              {BUDGET_SIGNAL_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="actions-row">
            <button className="action-button primary" type="submit">
              Apply filters
            </button>
          </div>
        </form>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Exception-first finance review</span>
            <h3>Approval queue</h3>
          </div>
          <span className="pill">{queue.length} reports</span>
        </div>
        <div className="table-wrapper clean-table compact-review-table">
          <table>
            <thead>
              <tr>
                <th>Submission</th>
                <th>Season</th>
                <th>Race</th>
                <th>Submitter</th>
                <th>Submitted</th>
                <th>Total</th>
                <th>Items</th>
                <th>Budget signal</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {queue.length > 0 ? (
                queue.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="stacked-table-cell">
                        <strong>{row.title}</strong>
                        <span className="bill-subnote">
                          {row.challengedItemCount} challenged · {row.missingReceiptCount} receipt gaps
                        </span>
                      </div>
                    </td>
                    <td>{row.seasonLabel}</td>
                    <td>{row.race}</td>
                    <td>{row.submitter}</td>
                    <td>{row.submittedAt}</td>
                    <td>
                      <div className="stacked-table-cell">
                        <strong>{row.submittedAmountUsd}</strong>
                        <span className="bill-subnote">
                          Approved {row.approvedAmountUsd} · rejected {row.rejectedAmountUsd}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="stacked-table-cell">
                        <span>{row.approvedItemCount} approved · {row.openItemCount} open</span>
                        <span className="bill-subnote">{row.openRuleFindingCount} rule findings</span>
                      </div>
                    </td>
                    <td>
                      <span className={`pill signal-pill signal-${row.budgetSignalTone}`}>
                        {row.budgetSignalLabel}
                      </span>
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
                            <button className="action-button compact-action secondary" type="submit">
                              Start
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={10}>
                    No submissions matched the current filter set.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                    <th>Remove</th>
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

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Workspace tags</span>
              <h3>Submission tags</h3>
            </div>
            <span className="pill">{workspaceControls.tags.length} active</span>
          </div>
          <div className="inline-actions">
            {workspaceControls.tags.map((tag) => (
              <span className="pill subtle-pill" key={tag.id}>{tag.label}</span>
            ))}
          </div>
          <form action={upsertExpenseTagAction} className="stack-form">
            <input name="returnPath" type="hidden" value={returnPath} />
            <div className="grid-two">
              <label className="field">
                <span>New / updated tag</span>
                <input name="tagLabel" placeholder="Lake Como S3, transport, meal allowance" required />
              </label>
              <label className="field">
                <span>Description</span>
                <input name="tagDescription" placeholder="When submitters should use this tag" />
              </label>
            </div>
            <button className="action-button secondary" type="submit">Save tag</button>
          </form>
        </article>

        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Workspace rules</span>
              <h3>Global expense checks</h3>
            </div>
            <span className="pill">{workspaceControls.rules.filter((rule) => rule.isActive).length} active</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Severity</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {workspaceControls.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.label}</td>
                    <td>{rule.severity}</td>
                    <td>{rule.isActive ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={upsertExpenseWorkspaceRuleAction} className="stack-form">
            <input name="returnPath" type="hidden" value={returnPath} />
            <div className="grid-two">
              <label className="field">
                <span>Rule key</span>
                <select name="ruleKey" defaultValue="tag_required">
                  <option value="receipt_required">receipt_required</option>
                  <option value="receipt_explanation">receipt_explanation</option>
                  <option value="tag_required">tag_required</option>
                  <option value="category_required">category_required</option>
                  <option value="fx_required">fx_required</option>
                  <option value="duplicate_check">duplicate_check</option>
                </select>
              </label>
              <label className="field">
                <span>Severity</span>
                <select name="severity" defaultValue="warning">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="blocker">Blocker</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Rule label</span>
              <input name="ruleLabel" placeholder="Every expense requires a tag" required />
            </label>
            <label className="field field-inline">
              <input name="isActive" type="checkbox" value="true" defaultChecked />
              <span>Active</span>
            </label>
            <button className="action-button secondary" type="submit">Save rule</button>
          </form>
        </article>
      </section>

    </div>
  );
}
