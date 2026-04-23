import { getIngestionQueue, getIngestionSummary } from "@lsc/db";
import { requireRole } from "../../lib/auth";
import { submitIngestionAction } from "./actions";

const TARGET_MODULES = [
  { value: "pnl_line_item", label: "P&L Line Item" },
  { value: "sponsorship", label: "Sponsorship" },
  { value: "expense", label: "Expense" },
  { value: "payroll", label: "Payroll" },
  { value: "deal_pipeline", label: "Deal Pipeline" },
  { value: "event_budget", label: "Event Budget" },
  { value: "production_cost", label: "Production Cost" },
  { value: "opex_item", label: "OPEX" }
] as const;

const TARGET_SPORTS = [
  { value: "squash", label: "Squash" },
  { value: "bowling", label: "Bowling" },
  { value: "basketball", label: "Basketball" },
  { value: "world_pong", label: "World Pong" },
  { value: "foundation", label: "Foundation" }
] as const;

function statusAccent(status: string): string {
  switch (status) {
    case "completed":
      return "signal-good";
    case "processing":
      return "signal-warn";
    case "queued":
      return "signal-brand";
    case "failed":
      return "signal-risk";
    default:
      return "";
  }
}

function formatModuleLabel(value: string): string {
  const found = TARGET_MODULES.find((m) => m.value === value);
  if (found) return found.label;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type AiIngestPageProps = {
  searchParams?: Promise<{ status?: string; message?: string }>;
};

export default async function AiIngestPage({ searchParams }: AiIngestPageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const pageParams = searchParams ? await searchParams : undefined;
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;

  const [queue, summary] = await Promise.all([
    getIngestionQueue(),
    getIngestionSummary()
  ]);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Intelligence layer</span>
          <h3>AI Data Ingestion</h3>
          <p className="muted">
            Feed data via text, documents, or structured input — AI routes to the right module.
          </p>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Error" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total ingested</span>
          </div>
          <div className="metric-value">{summary.total}</div>
          <span className="metric-subvalue">All time</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Queued</span>
          </div>
          <div className="metric-value">{summary.queued}</div>
          <span className="metric-subvalue">Awaiting processing</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Processing</span>
          </div>
          <div className="metric-value">{summary.processing}</div>
          <span className="metric-subvalue">In progress</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Completed</span>
          </div>
          <div className="metric-value">{summary.completed}</div>
          <span className="metric-subvalue">Successfully classified</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Failed</span>
          </div>
          <div className="metric-value">{summary.failed}</div>
          <span className="metric-subvalue">Needs review</span>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">New ingestion</span>
            <h3>Submit content for AI classification</h3>
          </div>
        </div>
        <form action={submitIngestionAction}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="targetModule">Target module</label>
              <select id="targetModule" name="targetModule" required>
                {TARGET_MODULES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="targetSport">Sport (optional)</label>
              <select id="targetSport" name="targetSport">
                <option value="">-- None --</option>
                {TARGET_SPORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="rawContent">Content</label>
              <textarea
                id="rawContent"
                name="rawContent"
                rows={6}
                placeholder="Paste or type financial data here. For example: 'Sponsor XYZ agreed to $50,000 for the Jeddah race, payable in two tranches — 50% on signing, 50% post-event.'"
                required
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="action-button primary" type="submit">
              Process with AI
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">History</span>
            <h3>Ingestion queue</h3>
          </div>
          <span className="badge">{queue.length} records</span>
        </div>

        {queue.length === 0 ? (
          <p className="muted" style={{ padding: "1.5rem 0" }}>
            No ingestion records yet. Submit content above to get started.
          </p>
        ) : (
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Source type</th>
                  <th>Name</th>
                  <th>Target module</th>
                  <th>Status</th>
                  <th>Records</th>
                  <th>Submitted</th>
                  <th>Processed</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="pill">{row.sourceType}</span>
                    </td>
                    <td>{row.sourceName}</td>
                    <td>{formatModuleLabel(row.targetModule)}</td>
                    <td>
                      <span className={`signal-pill ${statusAccent(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>{row.recordsCreated}</td>
                    <td className="muted">{row.submittedAt}</td>
                    <td className="muted">{row.processedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
