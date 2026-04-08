import { requireRole } from "../../lib/auth";
import { getTreasuryProjections, getTreasurySummary } from "@lsc/db";
import { addProjectionAction } from "./actions";

type TreasuryPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default async function TreasuryPage({ searchParams }: TreasuryPageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const params = searchParams ? await searchParams : undefined;
  const status = params?.status ?? null;
  const message = params?.message ?? null;

  const [summary, projections] = await Promise.all([
    getTreasurySummary(),
    getTreasuryProjections()
  ]);

  function netTone(value: number): string {
    if (value > 0) return "accent-good";
    if (value < 0) return "accent-risk";
    return "";
  }

  return (
    <div className="page-grid">
      {/* Header */}
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Forward projection</span>
          <h3>Treasury &amp; Cash Flow</h3>
          <p className="muted">30/60/90-day cash position forecasting</p>
        </div>
      </section>

      {/* Status banner */}
      {status && message && (
        <div className={`notice ${status === "error" ? "notice-risk" : "notice-good"}`}>
          {decodeURIComponent(message)}
        </div>
      )}

      {/* Stats */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline"><span className="metric-label">Current balance</span></div>
          <div className="metric-value">{summary.currentBalance}</div>
          <span className="metric-subvalue">Latest projection</span>
        </article>
        <article className={`metric-card ${netTone(summary.rawNet30d)}`}>
          <div className="metric-topline"><span className="metric-label">30-day net</span></div>
          <div className="metric-value">{summary.projectedNet30d}</div>
          <span className="metric-subvalue">Next 30 days</span>
        </article>
        <article className={`metric-card ${netTone(summary.rawNet60d)}`}>
          <div className="metric-topline"><span className="metric-label">60-day net</span></div>
          <div className="metric-value">{summary.projectedNet60d}</div>
          <span className="metric-subvalue">Next 60 days</span>
        </article>
        <article className={`metric-card ${netTone(summary.rawNet90d)}`}>
          <div className="metric-topline"><span className="metric-label">90-day net</span></div>
          <div className="metric-value">{summary.projectedNet90d}</div>
          <span className="metric-subvalue">Next 90 days</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline"><span className="metric-label">30d outflows</span></div>
          <div className="metric-value">{summary.next30dOutflows}</div>
          <span className="metric-subvalue">Committed</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline"><span className="metric-label">30d inflows</span></div>
          <div className="metric-value">{summary.next30dInflows}</div>
          <span className="metric-subvalue">Expected</span>
        </article>
      </section>

      {/* Projection table */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Cash position</span>
            <h3>Projection timeline</h3>
          </div>
          <span className="badge">{projections.length} projection{projections.length !== 1 ? "s" : ""}</span>
        </div>

        {projections.length === 0 ? (
          <p className="muted">No projections yet. Use the form below to add a cash flow projection.</p>
        ) : (
          <div className="table-wrapper">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Projected Balance</th>
                  <th>Outflows</th>
                  <th>Inflows</th>
                  <th>Net Position</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {projections.map((row) => (
                  <tr key={row.id}>
                    <td>{row.projectionDate}</td>
                    <td>{row.projectedBalance}</td>
                    <td>{row.committedOutflows}</td>
                    <td>{row.expectedInflows}</td>
                    <td>{row.netPosition}</td>
                    <td><span className="pill">{row.projectionType}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {/* Add projection form */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">New entry</span>
            <h3>Add projection</h3>
          </div>
        </div>
        <form action={addProjectionAction}>
          <div className="form-grid">
            <label className="field">
              <span>Projection date</span>
              <input type="date" name="projectionDate" required />
            </label>
            <label className="field">
              <span>Projected balance ($)</span>
              <input type="number" name="projectedBalance" step="0.01" placeholder="0.00" />
            </label>
            <label className="field">
              <span>Committed outflows ($)</span>
              <input type="number" name="committedOutflows" step="0.01" placeholder="0.00" />
            </label>
            <label className="field">
              <span>Expected inflows ($)</span>
              <input type="number" name="expectedInflows" step="0.01" placeholder="0.00" />
            </label>
            <label className="field">
              <span>Type</span>
              <select name="projectionType">
                <option value="30_day">30 day</option>
                <option value="60_day">60 day</option>
                <option value="90_day">90 day</option>
              </select>
            </label>
            <label className="field">
              <span>Currency</span>
              <input type="text" name="currency" defaultValue="USD" maxLength={3} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="action-button">Add projection</button>
          </div>
        </form>
      </article>
    </div>
  );
}
