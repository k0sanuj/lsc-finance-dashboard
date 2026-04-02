import type { Route } from "next";
import Link from "next/link";
import {
  getChecklistItems,
  getChecklistSections,
  getChecklistSummary
} from "@lsc/db";
import { requireRole } from "../../lib/auth";
import {
  toggleChecklistItemAction,
  updateStatusAction,
  addChecklistItemAction,
  deleteChecklistItemAction,
  updatePriorityAction
} from "./actions";

type ChecklistPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    section?: string;
  }>;
};

function priorityPill(priority: string): string {
  switch (priority) {
    case "critical": return "signal-pill signal-risk";
    case "high": return "signal-pill signal-warn";
    case "medium": return "signal-pill signal-good";
    case "low": return "subtle-pill";
    default: return "subtle-pill";
  }
}

function statusPill(status: string): string {
  switch (status) {
    case "done": return "signal-pill signal-good";
    case "in_progress": return "signal-pill signal-warn";
    case "blocked": return "signal-pill signal-risk";
    case "pending": return "subtle-pill";
    default: return "subtle-pill";
  }
}

export default async function ProjectChecklistPage({ searchParams }: ChecklistPageProps) {
  await requireRole(["super_admin", "finance_admin"]);

  const pageParams = searchParams ? await searchParams : undefined;
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;
  const filterSection = pageParams?.section ?? null;

  const [items, sections, summary] = await Promise.all([
    getChecklistItems(),
    getChecklistSections(),
    getChecklistSummary()
  ]);

  const filteredItems = filterSection
    ? items.filter((i) => i.section === filterSection)
    : items;

  // Group by section
  const groupedBySection = new Map<string, typeof items>();
  for (const item of filteredItems) {
    if (!groupedBySection.has(item.section)) groupedBySection.set(item.section, []);
    groupedBySection.get(item.section)!.push(item);
  }

  const allSections = Array.from(new Set(items.map((i) => i.section))).sort();

  return (
    <div className="page-grid">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Platform build tracker</span>
          <h3>Project Checklist</h3>
          <p className="muted">Track all finance platform features, mark progress, and manage dependencies.</p>
        </div>
        <div className="checklist-progress-block">
          <strong>{summary.pctComplete}% complete</strong>
          <div className="chart-track">
            <div
              className="chart-fill good"
              style={{ width: `${Math.max(2, summary.pctComplete)}%` }}
            />
          </div>
          <span className="muted">{summary.done}/{summary.total} items</span>
        </div>
      </header>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Error" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total items</span>
          </div>
          <div className="metric-value">{summary.total}</div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Done</span>
          </div>
          <div className="metric-value">{summary.done}</div>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">In progress</span>
          </div>
          <div className="metric-value">{summary.inProgress}</div>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Blocked</span>
          </div>
          <div className="metric-value">{summary.blocked}</div>
        </article>
      </section>

      {/* Section filter chips */}
      <div className="inline-actions">
        <Link
          className={`segment-chip ${!filterSection ? "active" : ""}`}
          href={"/project-checklist" as Route}
        >
          All
        </Link>
        {sections.map((s) => (
          <Link
            className={`segment-chip ${filterSection === s.section ? "active" : ""}`}
            href={`/project-checklist?section=${encodeURIComponent(s.section)}` as Route}
            key={s.section}
          >
            {s.section}
            <span className="muted"> ({s.done}/{s.total})</span>
          </Link>
        ))}
      </div>

      {/* Checklist items grouped by section */}
      {Array.from(groupedBySection.entries()).map(([section, sectionItems]) => (
        <article className="card" key={section}>
          <div className="card-title-row">
            <div>
              <span className="section-kicker">{section}</span>
              <h3>{sectionItems.filter((i) => i.status === "done").length}/{sectionItems.length} complete</h3>
            </div>
            <div className="chart-track" style={{ width: 120 }}>
              <div
                className="chart-fill good"
                style={{
                  width: `${Math.max(2, (sectionItems.filter((i) => i.status === "done").length / Math.max(1, sectionItems.length)) * 100)}%`
                }}
              />
            </div>
          </div>
          <div className="checklist-items">
            {sectionItems.map((item) => (
              <div
                className={`checklist-row ${item.status === "done" ? "checklist-done" : ""} ${item.status === "blocked" ? "checklist-blocked" : ""}`}
                key={item.id}
              >
                <form action={toggleChecklistItemAction} className="checklist-toggle">
                  <input name="itemId" type="hidden" value={item.id} />
                  <input name="currentStatus" type="hidden" value={item.status} />
                  <button
                    className={`checklist-checkbox ${item.status === "done" ? "checked" : ""}`}
                    type="submit"
                    aria-label={item.status === "done" ? "Mark as pending" : "Mark as done"}
                  />
                </form>

                <div className="checklist-content">
                  <div className="checklist-title-row">
                    <strong className={item.status === "done" ? "checklist-title-done" : ""}>
                      {item.route ? (
                        <Link className="ghost-link" href={item.route as Route}>{item.title}</Link>
                      ) : (
                        item.title
                      )}
                    </strong>
                    <span className={`pill ${priorityPill(item.priority)}`}>{item.priority}</span>
                    <span className={`pill ${statusPill(item.status)}`}>{item.status.replace(/_/g, " ")}</span>
                  </div>
                  {item.description ? (
                    <p className="checklist-desc muted">{item.description}</p>
                  ) : null}
                  {item.dependsOnTitle ? (
                    <span className="checklist-dep muted">Depends on: {item.dependsOnTitle}</span>
                  ) : null}
                </div>

                <div className="checklist-actions">
                  {/* Status cycle buttons */}
                  {item.status !== "in_progress" && item.status !== "done" ? (
                    <form action={updateStatusAction}>
                      <input name="itemId" type="hidden" value={item.id} />
                      <input name="newStatus" type="hidden" value="in_progress" />
                      <button className="action-button secondary" type="submit" title="Start">Start</button>
                    </form>
                  ) : null}
                  {item.status === "in_progress" ? (
                    <form action={updateStatusAction}>
                      <input name="itemId" type="hidden" value={item.id} />
                      <input name="newStatus" type="hidden" value="blocked" />
                      <button className="action-button secondary" type="submit" title="Block">Block</button>
                    </form>
                  ) : null}
                  {/* Priority cycle */}
                  <form action={updatePriorityAction}>
                    <input name="itemId" type="hidden" value={item.id} />
                    <input
                      name="newPriority"
                      type="hidden"
                      value={
                        item.priority === "low" ? "medium" :
                        item.priority === "medium" ? "high" :
                        item.priority === "high" ? "critical" : "low"
                      }
                    />
                    <button className="action-button secondary" type="submit" title="Change priority">
                      {item.priority === "low" ? "\u2191" : item.priority === "critical" ? "\u2193" : "\u2191"}
                    </button>
                  </form>
                  {/* Delete */}
                  <form action={deleteChecklistItemAction}>
                    <input name="itemId" type="hidden" value={item.id} />
                    <button className="action-button secondary" type="submit" title="Delete">\u00D7</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}

      {filteredItems.length === 0 ? (
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">No items</span>
              <h3>Checklist is empty. Add items below.</h3>
            </div>
          </div>
        </article>
      ) : null}

      {/* Add new item form */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Add new item</span>
            <h3>Create a checklist entry</h3>
          </div>
        </div>
        <form action={addChecklistItemAction} className="checklist-form">
          <div className="checklist-form-grid">
            <div className="field">
              <label htmlFor="cl-title">Title</label>
              <input id="cl-title" name="title" placeholder="Feature or task name" required type="text" />
            </div>
            <div className="field">
              <label htmlFor="cl-section">Section</label>
              <select id="cl-section" name="section" defaultValue="">
                <option value="">New section...</option>
                {allSections.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cl-priority">Priority</label>
              <select id="cl-priority" name="priority">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium" selected>Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="cl-route">Route (optional)</label>
              <input id="cl-route" name="route" placeholder="/page-path" type="text" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="cl-desc">Description (optional)</label>
            <input id="cl-desc" name="description" placeholder="Brief description of this item" type="text" />
          </div>
          <button className="action-button primary" type="submit">Add item</button>
        </form>
      </article>
    </div>
  );
}
