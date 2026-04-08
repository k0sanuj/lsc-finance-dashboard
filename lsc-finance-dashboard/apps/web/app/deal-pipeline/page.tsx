import { getDeals, getDealPipelineSummary, formatCurrency } from "@lsc/db";
import { requireRole } from "../../lib/auth";
import { addDealAction, updateDealStageAction, updateDealRiskAction } from "./actions";

const DEPARTMENTS = [
  "All",
  "Finance",
  "Growth",
  "Legal",
  "Sports & Events",
  "Arena",
  "Ads",
  "Brand",
  "Crowd Ops",
  "App",
] as const;

const STAGES = [
  "All",
  "lead",
  "intro",
  "discovery",
  "proposal",
  "negotiation",
  "closing",
  "won",
  "lost",
] as const;

const DEAL_TYPES = [
  "Sponsorship",
  "Investment",
  "Media Rights",
  "Arena Partnership",
  "Vendor Contract",
  "Franchise",
  "Content Deal",
  "Agency Partnership",
  "Tech Partnership",
  "Other",
] as const;

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

function stagePillClass(stage: string): string {
  switch (stage) {
    case "lead":
    case "intro":
    case "discovery":
      return "subtle-pill";
    case "proposal":
    case "negotiation":
      return "signal-pill signal-warn";
    case "closing":
    case "won":
      return "signal-pill signal-good";
    case "lost":
      return "signal-pill signal-risk";
    default:
      return "subtle-pill";
  }
}

function riskPillClass(risk: string): string {
  switch (risk) {
    case "low":
      return "signal-pill signal-good";
    case "medium":
      return "signal-pill signal-warn";
    case "high":
    case "critical":
      return "signal-pill signal-risk";
    default:
      return "subtle-pill";
  }
}

function deptBadgeClass(dept: string): string {
  switch (dept) {
    case "Finance":
      return "badge";
    case "Growth":
      return "badge accent-good";
    case "Legal":
      return "badge accent-warn";
    case "Arena":
      return "badge accent-brand";
    case "Ads":
      return "badge accent-risk";
    default:
      return "badge";
  }
}

type DealPipelinePageProps = {
  searchParams?: Promise<{
    department?: string;
    stage?: string;
    status?: string;
    message?: string;
  }>;
};

export default async function DealPipelinePage({ searchParams }: DealPipelinePageProps) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const params = searchParams ? await searchParams : undefined;

  const department = params?.department ?? "All";
  const stage = params?.stage ?? "All";
  const status = params?.status ?? null;
  const message = params?.message ?? null;

  const filters: { department?: string; stage?: string } = {};
  if (department !== "All") filters.department = department;
  if (stage !== "All") filters.stage = stage;

  const [deals, summary] = await Promise.all([
    getDeals(filters),
    getDealPipelineSummary(),
  ]);

  const avgDealValue =
    summary.dealCount > 0 ? summary.rawTotalValue / summary.dealCount : 0;

  const maxDeptValue = Math.max(
    ...summary.byDepartment.map((d) => d.rawValue),
    1
  );

  return (
    <div className="page-grid">
      {/* Flash banner */}
      {status && message && (
        <div className={`flash-banner flash-${status}`}>{message}</div>
      )}

      {/* Header */}
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Cross-department</span>
          <h3>Deal Pipeline</h3>
          <p className="muted">
            Unified deal tracking from lead to close across all departments
          </p>
        </div>
        <div className="workspace-header-right">
          <span className="pill">{summary.dealCount} deals</span>
        </div>
      </section>

      {/* Stats */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total pipeline value</span>
            <span className="badge">All stages</span>
          </div>
          <div className="metric-value">{summary.totalValue}</div>
          <span className="metric-subvalue">Combined deal value</span>
        </article>

        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Active deals</span>
            <span className="badge">Pipeline</span>
          </div>
          <div className="metric-value">{summary.dealCount}</div>
          <span className="metric-subvalue">Across all departments</span>
        </article>

        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Won deals</span>
            <span className="badge">Closed</span>
          </div>
          <div className="metric-value">{summary.wonCount}</div>
          <span className="metric-subvalue">Successfully closed</span>
        </article>

        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">At-risk deals</span>
            <span className="badge">Alert</span>
          </div>
          <div className="metric-value">{summary.atRiskCount}</div>
          <span className="metric-subvalue">Require attention</span>
        </article>

        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Avg deal value</span>
            <span className="badge">Mean</span>
          </div>
          <div className="metric-value">{formatCurrency(avgDealValue)}</div>
          <span className="metric-subvalue">Per deal average</span>
        </article>
      </section>

      {/* Department filter */}
      <nav className="inline-actions">
        {DEPARTMENTS.map((dept) => {
          const href =
            dept === "All"
              ? stage !== "All"
                ? `/deal-pipeline?stage=${encodeURIComponent(stage)}`
                : "/deal-pipeline"
              : stage !== "All"
                ? `/deal-pipeline?department=${encodeURIComponent(dept)}&stage=${encodeURIComponent(stage)}`
                : `/deal-pipeline?department=${encodeURIComponent(dept)}`;
          return (
            <a
              key={dept}
              href={href}
              className={`segment-chip${dept === department ? " active" : ""}`}
            >
              {dept}
            </a>
          );
        })}
      </nav>

      {/* Stage filter */}
      <nav className="inline-actions">
        {STAGES.map((s) => {
          const label = s === "All" ? "All Stages" : s.charAt(0).toUpperCase() + s.slice(1);
          const href =
            s === "All"
              ? department !== "All"
                ? `/deal-pipeline?department=${encodeURIComponent(department)}`
                : "/deal-pipeline"
              : department !== "All"
                ? `/deal-pipeline?department=${encodeURIComponent(department)}&stage=${encodeURIComponent(s)}`
                : `/deal-pipeline?stage=${encodeURIComponent(s)}`;
          return (
            <a
              key={s}
              href={href}
              className={`segment-chip${s === stage ? " active" : ""}`}
            >
              {label}
            </a>
          );
        })}
      </nav>

      {/* Deals table */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Pipeline</span>
            <h3>All Deals</h3>
          </div>
          <span className="pill">{deals.length} deals</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Deal Name</th>
                <th>Type</th>
                <th>Department</th>
                <th>Owner</th>
                <th>Value</th>
                <th>Stage</th>
                <th>Risk</th>
                <th>Expected Close</th>
                <th>Next Action</th>
                <th>Change Stage</th>
                <th>Change Risk</th>
              </tr>
            </thead>
            <tbody>
              {deals.length > 0 ? (
                deals.map((deal) => (
                  <tr key={deal.id}>
                    <td>
                      <strong>{deal.dealName}</strong>
                      {deal.sportVertical && (
                        <span className="muted" style={{ display: "block", fontSize: "0.8em" }}>
                          {deal.sportVertical}
                        </span>
                      )}
                    </td>
                    <td>{deal.dealType}</td>
                    <td>
                      <span className={deptBadgeClass(deal.department)}>
                        {deal.department}
                      </span>
                    </td>
                    <td>{deal.dealOwner}</td>
                    <td><strong>{deal.dealValue}</strong></td>
                    <td>
                      <span className={`pill ${stagePillClass(deal.stage)}`}>
                        {deal.stage}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${riskPillClass(deal.riskLevel)}`}>
                        {deal.riskLevel}
                      </span>
                    </td>
                    <td>{deal.expectedCloseDate}</td>
                    <td>{deal.nextAction || <span className="muted">None</span>}</td>
                    <td>
                      <form action={updateDealStageAction} style={{ display: "inline" }}>
                        <input type="hidden" name="dealId" value={deal.id} />
                        <select name="newStage" defaultValue={deal.stage} className="inline-select">
                          {STAGES.filter((s) => s !== "All").map((s) => (
                            <option key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn-inline">Update</button>
                      </form>
                    </td>
                    <td>
                      <form action={updateDealRiskAction} style={{ display: "inline" }}>
                        <input type="hidden" name="dealId" value={deal.id} />
                        <select name="riskLevel" defaultValue={deal.riskLevel} className="inline-select">
                          {RISK_LEVELS.map((r) => (
                            <option key={r} value={r}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn-inline">Update</button>
                      </form>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={11}>
                    No deals match the current filters. Add a deal below or adjust filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pipeline value by department (chart-list bars) */}
      {summary.byDepartment.length > 0 && (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Distribution</span>
              <h3>Pipeline Value by Department</h3>
            </div>
          </div>
          <div className="chart-list">
            {summary.byDepartment.map((dept) => {
              const pct = maxDeptValue > 0 ? (dept.rawValue / maxDeptValue) * 100 : 0;
              return (
                <div key={dept.dept} className="chart-list-item">
                  <div className="chart-list-label">
                    <span>{dept.dept}</span>
                    <span className="muted">{dept.count} deals</span>
                  </div>
                  <div className="chart-list-bar-track">
                    <div
                      className="chart-list-bar"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="chart-list-value">{dept.value}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Add deal form */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">New deal</span>
            <h3>Add Deal</h3>
          </div>
        </div>
        <form action={addDealAction}>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Deal name</span>
              <input type="text" name="dealName" required placeholder="e.g. Season 4 Title Sponsor" />
            </label>

            <label className="field">
              <span className="field-label">Deal type</span>
              <select name="dealType" required>
                <option value="">Select type</option>
                {DEAL_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Department</span>
              <select name="department" required>
                <option value="">Select department</option>
                {DEPARTMENTS.filter((d) => d !== "All").map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Deal owner</span>
              <input type="text" name="dealOwner" required placeholder="Full name" />
            </label>

            <label className="field">
              <span className="field-label">Deal value (USD)</span>
              <input type="number" name="dealValue" min="0" step="1" placeholder="500000" />
            </label>

            <label className="field">
              <span className="field-label">Revenue type</span>
              <select name="revenueType">
                <option value="">Select type</option>
                <option value="recurring">Recurring</option>
                <option value="one_time">One-time</option>
                <option value="milestone">Milestone-based</option>
              </select>
            </label>

            <label className="field">
              <span className="field-label">Stage</span>
              <select name="stage" defaultValue="lead">
                {STAGES.filter((s) => s !== "All").map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Expected close date</span>
              <input type="date" name="expectedCloseDate" />
            </label>

            <label className="field">
              <span className="field-label">Risk level</span>
              <select name="riskLevel" defaultValue="low">
                {RISK_LEVELS.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Sport vertical</span>
              <input type="text" name="sportVertical" placeholder="e.g. Racing, Cricket" />
            </label>

            <label className="field">
              <span className="field-label">Next action</span>
              <input type="text" name="nextAction" placeholder="e.g. Send proposal deck" />
            </label>

            <label className="field">
              <span className="field-label">Action owner</span>
              <input type="text" name="actionOwner" placeholder="Person responsible" />
            </label>

            <label className="field full-width">
              <span className="field-label">Notes</span>
              <textarea name="notes" rows={3} placeholder="Additional context or comments" />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Add Deal</button>
          </div>
        </form>
      </section>
    </div>
  );
}
