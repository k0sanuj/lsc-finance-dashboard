import {
  getComplianceCosts,
  getLitigationCosts,
  getLitigationReserves,
  getLitigationSummary,
  getSubsidies
} from "@lsc/db";
import { requireRole } from "../../lib/auth";

function fmtUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function statusPillClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "active" || s === "open") return "signal-pill signal-warn";
  if (s === "settled" || s === "closed" || s === "approved" || s === "disbursed") return "signal-pill signal-good";
  if (s === "reserved" || s === "pending") return "signal-pill signal-warn";
  return "signal-pill signal-risk";
}

export default async function LitigationPage() {
  await requireRole(["super_admin", "finance_admin"]);

  const [costs, reserves, summary, compliance, subsidies] = await Promise.all([
    getLitigationCosts(),
    getLitigationReserves(),
    getLitigationSummary(),
    getComplianceCosts(),
    getSubsidies()
  ]);

  const netExposure = summary.totalExposure - summary.totalReserves - summary.totalInsurance;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Litigation finance</span>
          <h3>Litigation, compliance, and subsidies</h3>
          <p className="muted">
            Active case exposure, compliance spend, and government subsidy tracking across all entities.
          </p>
        </div>
      </section>

      {/* ---------- Section 1: Litigation Finance ---------- */}

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Active cases</span>
          </div>
          <div className="metric-value">{summary.totalCases}</div>
          <span className="metric-subvalue">Across all entities</span>
        </article>

        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Total costs to date</span>
          </div>
          <div className="metric-value">{fmtUsd(summary.totalCostsToDate)}</div>
          <span className="metric-subvalue">Legal fees and related costs</span>
        </article>

        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Total exposure</span>
          </div>
          <div className="metric-value">{fmtUsd(summary.totalExposure)}</div>
          <span className="metric-subvalue">Estimated across active reserves</span>
        </article>

        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Net exposure</span>
          </div>
          <div className="metric-value">{fmtUsd(netExposure)}</div>
          <span className="metric-subvalue">Exposure less reserves and insurance</span>
        </article>
      </section>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Reserves</span>
            <h3>Litigation reserves by case</h3>
          </div>
          <span className="pill">{reserves.length} cases</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Case name</th>
                <th>Reference</th>
                <th>Estimated exposure</th>
                <th>Reserve amount</th>
                <th>Insurance coverage</th>
                <th>Net exposure</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reserves.length > 0 ? (
                reserves.map((row) => (
                  <tr key={row.id}>
                    <td>{row.caseName}</td>
                    <td>
                      <span className="badge">{row.caseReference}</span>
                    </td>
                    <td>{row.estimatedExposure}</td>
                    <td>{row.reserveAmount}</td>
                    <td>{row.insuranceCoverage}</td>
                    <td>{row.netExposure}</td>
                    <td>
                      <span className={`pill ${statusPillClass(row.status)}`}>
                        {row.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={7}>
                    No litigation reserves have been recorded yet.
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
            <span className="section-kicker">Legal costs</span>
            <h3>Litigation costs</h3>
          </div>
          <span className="pill">{costs.length} entries</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Case name</th>
                <th>Cost type</th>
                <th>Amount</th>
                <th>Incurred date</th>
                <th>Description</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {costs.length > 0 ? (
                costs.map((row) => (
                  <tr key={row.id}>
                    <td>{row.caseName}</td>
                    <td>
                      <span className="subtle-pill">{row.costType}</span>
                    </td>
                    <td>{row.amount}</td>
                    <td>{row.incurredDate}</td>
                    <td>{row.description}</td>
                    <td>
                      <span className="badge">{row.companyCode}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={6}>
                    No litigation costs have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* ---------- Section 2: Compliance Costs ---------- */}

      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Compliance</span>
          <h3>Compliance costs</h3>
          <p className="muted">Regulatory and compliance-related expenditures by jurisdiction.</p>
        </div>
      </section>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Spend log</span>
            <h3>Compliance cost register</h3>
          </div>
          <span className="pill">{compliance.length} entries</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Jurisdiction</th>
                <th>Period</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {compliance.length > 0 ? (
                compliance.map((row) => (
                  <tr key={row.id}>
                    <td>{row.category}</td>
                    <td>{row.description}</td>
                    <td>{row.amount}</td>
                    <td>{row.jurisdiction}</td>
                    <td>
                      {row.periodStart}
                      {row.periodEnd ? ` - ${row.periodEnd}` : ""}
                    </td>
                    <td>
                      <span className="badge">{row.companyCode}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={6}>
                    No compliance costs have been recorded yet. Entries will appear here once regulatory spend is tracked.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* ---------- Section 3: Subsidies ---------- */}

      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Subsidies</span>
          <h3>Subsidy and grant tracking</h3>
          <p className="muted">Government and institutional subsidies with disbursement status.</p>
        </div>
      </section>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Grants</span>
            <h3>Subsidy register</h3>
          </div>
          <span className="pill">{subsidies.length} entries</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Granting body</th>
                <th>Approved amount</th>
                <th>Disbursed amount</th>
                <th>Remaining</th>
                <th>Status</th>
                <th>Next disbursement</th>
              </tr>
            </thead>
            <tbody>
              {subsidies.length > 0 ? (
                subsidies.map((row) => (
                  <tr key={row.id}>
                    <td>{row.subsidyName}</td>
                    <td>{row.grantingBody}</td>
                    <td>{row.approvedAmount}</td>
                    <td>{row.disbursedAmount}</td>
                    <td>{row.remaining}</td>
                    <td>
                      <span className={`pill ${statusPillClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>{row.nextDisbursement || <span className="muted">--</span>}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={7}>
                    No subsidies have been recorded yet. Entries will appear here once grant funding is tracked.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
