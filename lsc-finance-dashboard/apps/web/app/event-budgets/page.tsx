import {
  getFspEvents,
  getEventBudgetItems,
  getEventChecklist,
  getEventBudgetSummary,
  formatCurrency
} from "@lsc/db";
import { requireRole } from "../../lib/auth";
import {
  createEventAction,
  addBudgetItemAction,
  addChecklistItemAction,
  updateChecklistStatusAction
} from "./actions";

const BUDGET_CATEGORIES = [
  "Fabrication", "AV", "Print", "Staffing", "Permissions & Insurance",
  "Multimedia", "Fees", "DJ Booth", "F&B", "Venue", "Transport", "Miscellaneous"
];

const CHECKLIST_CATEGORIES = [
  "Sport Infrastructure", "Site Blueprint", "Permits", "Insurance", "Power",
  "Safety", "F&B", "Seating", "Entry Access", "Sponsor Deliverables",
  "Ticketing", "Hospitality", "Athlete Services", "VVIP", "Trophy",
  "Afterparty", "Communications", "Lighting", "Temperature"
];

const SPORT_CODES = [
  { code: "paddle", label: "Paddle" },
  { code: "pickleball", label: "Pickleball" },
  { code: "teqball", label: "Teqball" },
  { code: "drone_racing", label: "Drone Racing" },
  { code: "e_sports", label: "E-Sports" }
];

function varianceAccent(variance: string): string {
  const num = Number(String(variance).replace(/[^0-9.-]/g, ""));
  if (num > 0) return "signal-good";
  if (num < 0) return "signal-risk";
  return "";
}

function statusAccent(status: string): string {
  switch (status) {
    case "completed": return "signal-good";
    case "in_progress": return "signal-warn";
    case "pending": return "signal-risk";
    default: return "";
  }
}

type EventBudgetsPageProps = {
  searchParams?: Promise<{
    eventId?: string;
    status?: string;
    message?: string;
    sport?: string;
  }>;
};

export default async function EventBudgetsPage({ searchParams }: EventBudgetsPageProps) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const pageParams = searchParams ? await searchParams : undefined;
  const eventId = pageParams?.eventId ?? null;
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;
  const sportFilter = pageParams?.sport ?? null;

  const [events, summary] = await Promise.all([
    getFspEvents(sportFilter ?? undefined),
    getEventBudgetSummary()
  ]);

  const selectedEvent = eventId ? events.find((e) => e.id === eventId) : null;

  const [budgetItems, checklist] = eventId
    ? await Promise.all([getEventBudgetItems(eventId), getEventChecklist(eventId)])
    : [[], []];

  const checklistTotal = checklist.length;
  const checklistDone = checklist.filter((c) => c.status === "completed").length;
  const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Events &amp; production</span>
          <h3>Event Budgets</h3>
          <p className="muted">
            Per-event financial tracking with audit-ready checklists
          </p>
        </div>
        {eventId ? (
          <a className="ghost-link" href="/event-budgets">
            &larr; All events
          </a>
        ) : null}
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Error" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      {/* ─── Stats ──────────────────────────────────────── */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total events</span>
          </div>
          <div className="metric-value">{summary.eventCount}</div>
          <span className="metric-subvalue">Across all sports</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Total budget</span>
          </div>
          <div className="metric-value">{summary.totalBudget}</div>
          <span className="metric-subvalue">Planned spend</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Total actual</span>
          </div>
          <div className="metric-value">{summary.totalActual}</div>
          <span className="metric-subvalue">Confirmed spend</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Variance</span>
          </div>
          <div className="metric-value">{summary.variance}</div>
          <span className="metric-subvalue">Budget minus actual</span>
        </article>
      </section>

      {/* ─── Event Detail ───────────────────────────────── */}
      {eventId && selectedEvent ? (
        <>
          {/* Budget Items */}
          <section className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">{selectedEvent.eventName} &middot; {selectedEvent.sportName}</span>
                <h3>Budget items</h3>
              </div>
              <span className="pill">{budgetItems.length} items</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Item</th>
                    <th>Description</th>
                    <th>Vendor</th>
                    <th>Budget</th>
                    <th>Actual</th>
                    <th>Status</th>
                    <th>Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetItems.length > 0 ? (
                    budgetItems.map((item) => (
                      <tr key={item.id}>
                        <td><span className="pill">{item.category}</span></td>
                        <td><strong>{item.subCategory}</strong></td>
                        <td className="muted">{item.description || "\u2014"}</td>
                        <td>{item.vendorName || "\u2014"}</td>
                        <td>{item.budgetAmount}</td>
                        <td>{item.actualAmount}</td>
                        <td>
                          <span className={`pill signal-pill ${statusAccent(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>{item.isVerified ? <span className="badge">verified</span> : <span className="muted">no</span>}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted" colSpan={8}>
                        No budget items yet. Use the form below to add items.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: "1px solid var(--line)", marginTop: "1.5rem", paddingTop: "1.5rem" }}>
              <h4 style={{ marginBottom: "0.75rem" }}>Add budget item</h4>
              <form action={addBudgetItemAction}>
                <input name="eventId" type="hidden" value={eventId} />
                <div className="form-grid">
                  <label className="field">
                    <span>Category</span>
                    <select name="category" required>
                      <option value="">Select category</option>
                      {BUDGET_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Item name</span>
                    <input name="subCategory" placeholder="e.g. LED screens" required type="text" />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <input name="description" placeholder="Optional" type="text" />
                  </label>
                  <label className="field">
                    <span>Vendor</span>
                    <input name="vendorName" placeholder="Optional" type="text" />
                  </label>
                  <label className="field">
                    <span>Budget amount</span>
                    <input name="budgetAmount" placeholder="0" step="0.01" type="number" />
                  </label>
                </div>
                <div className="form-actions">
                  <button className="action-button primary" type="submit">Add item</button>
                </div>
              </form>
            </div>
          </section>

          {/* Production Checklist */}
          <section className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Audit-ready</span>
                <h3>Production checklist</h3>
              </div>
              <span className="pill">{checklistDone}/{checklistTotal} completed</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Requirement</th>
                    <th>What to Check</th>
                    <th>Verification</th>
                    <th>Owner</th>
                    <th>Due Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checklist.length > 0 ? (
                    checklist.map((item) => (
                      <tr key={item.id} className={item.status === "completed" ? "checklist-done" : ""}>
                        <td><span className="pill">{item.category}</span></td>
                        <td><strong>{item.requirement}</strong></td>
                        <td className="muted">{item.whatToCheck || "\u2014"}</td>
                        <td className="muted">{item.verificationProof || "\u2014"}</td>
                        <td>{item.owner || "\u2014"}</td>
                        <td>{item.dueDate}</td>
                        <td>
                          <div className="inline-actions">
                            <form action={updateChecklistStatusAction}>
                              <input name="eventId" type="hidden" value={eventId} />
                              <input name="itemId" type="hidden" value={item.id} />
                              <input name="currentStatus" type="hidden" value={item.status} />
                              <button
                                className={`pill signal-pill ${statusAccent(item.status)}`}
                                style={{ cursor: "pointer", border: "none" }}
                                title={`Click to advance status`}
                                type="submit"
                              >
                                {item.status.replace(/_/g, " ")}
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted" colSpan={7}>
                        No checklist items yet. Use the form below to add items.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: "1px solid var(--line)", marginTop: "1.5rem", paddingTop: "1.5rem" }}>
              <h4 style={{ marginBottom: "0.75rem" }}>Add checklist item</h4>
              <form action={addChecklistItemAction}>
                <input name="eventId" type="hidden" value={eventId} />
                <div className="form-grid">
                  <label className="field">
                    <span>Category</span>
                    <select name="category" required>
                      <option value="">Select category</option>
                      {CHECKLIST_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Requirement</span>
                    <input name="requirement" placeholder="e.g. Fire exits inspected" required type="text" />
                  </label>
                  <label className="field">
                    <span>What to check</span>
                    <input name="whatToCheck" placeholder="Optional" type="text" />
                  </label>
                  <label className="field">
                    <span>Verification proof</span>
                    <input name="verificationProof" placeholder="Optional" type="text" />
                  </label>
                  <label className="field">
                    <span>Owner</span>
                    <input name="owner" placeholder="e.g. Ops Lead" type="text" />
                  </label>
                  <label className="field">
                    <span>Due date</span>
                    <input name="dueDate" type="date" />
                  </label>
                </div>
                <div className="form-actions">
                  <button className="action-button primary" type="submit">Add checklist item</button>
                </div>
              </form>
            </div>
          </section>

          {/* Budget Summary Cards */}
          <section className="stats-grid compact-stats">
            <article className="metric-card accent-brand">
              <div className="metric-topline">
                <span className="metric-label">Event budget</span>
              </div>
              <div className="metric-value">{selectedEvent.totalBudget}</div>
              <span className="metric-subvalue">{selectedEvent.eventName}</span>
            </article>
            <article className="metric-card accent-warn">
              <div className="metric-topline">
                <span className="metric-label">Event actual</span>
              </div>
              <div className="metric-value">{selectedEvent.totalActual}</div>
              <span className="metric-subvalue">Confirmed to date</span>
            </article>
            <article className="metric-card accent-good">
              <div className="metric-topline">
                <span className="metric-label">Variance</span>
              </div>
              <div className="metric-value">{selectedEvent.variance}</div>
              <span className="metric-subvalue">Remaining headroom</span>
            </article>
            <article className="metric-card accent-risk">
              <div className="metric-topline">
                <span className="metric-label">Checklist</span>
              </div>
              <div className="metric-value">{checklistPct}%</div>
              <span className="metric-subvalue">{checklistDone} of {checklistTotal} items complete</span>
            </article>
          </section>
        </>
      ) : (
        <>
          {/* ─── Events List ────────────────────────────── */}
          <section className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">All events</span>
                <h3>FSP event register</h3>
              </div>
              <span className="pill">{events.length} events</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Sport</th>
                    <th>City</th>
                    <th>Date</th>
                    <th>Budget</th>
                    <th>Actual</th>
                    <th>Variance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length > 0 ? (
                    events.map((ev) => (
                      <tr key={ev.id}>
                        <td>
                          <a href={`/event-budgets?eventId=${ev.id}`}>
                            <strong>{ev.eventName}</strong>
                          </a>
                          {ev.venueName ? <span className="muted" style={{ display: "block", fontSize: "0.85em" }}>{ev.venueName}</span> : null}
                        </td>
                        <td><span className="pill">{ev.sportName}</span></td>
                        <td>{ev.city}</td>
                        <td>{ev.eventDate}</td>
                        <td>{ev.totalBudget}</td>
                        <td>{ev.totalActual}</td>
                        <td>
                          <span className={`pill signal-pill ${varianceAccent(ev.variance)}`}>
                            {ev.variance}
                          </span>
                        </td>
                        <td>
                          <span className={`pill signal-pill ${ev.status === "completed" ? "signal-good" : ev.status === "in_progress" ? "signal-warn" : ""}`}>
                            {ev.status.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted" colSpan={8}>
                        No events found. Use the form below to create one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ─── Create Event Form ──────────────────────── */}
          <section className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">New event</span>
                <h3>Create event</h3>
              </div>
            </div>
            <form action={createEventAction}>
              <div className="form-grid">
                <label className="field">
                  <span>Sport</span>
                  <select name="sportCode" required>
                    <option value="">Select sport</option>
                    {SPORT_CODES.map((s) => (
                      <option key={s.code} value={s.code}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Event name</span>
                  <input name="eventName" placeholder="e.g. Jeddah Open" required type="text" />
                </label>
                <label className="field">
                  <span>City</span>
                  <input name="city" placeholder="e.g. Jeddah" required type="text" />
                </label>
                <label className="field">
                  <span>Venue</span>
                  <input name="venueName" placeholder="Optional" type="text" />
                </label>
                <label className="field">
                  <span>Event date</span>
                  <input name="eventDate" type="date" />
                </label>
                <label className="field">
                  <span>Total budget</span>
                  <input name="totalBudget" placeholder="0" step="0.01" type="number" />
                </label>
              </div>
              <div className="form-actions">
                <button className="action-button primary" type="submit">Create event</button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
