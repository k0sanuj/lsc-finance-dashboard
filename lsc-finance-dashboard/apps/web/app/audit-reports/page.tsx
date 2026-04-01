import { getAuditReports, getAuditSummaryStats } from "@lsc/db";
import { requireRole } from "../../lib/auth";

export default async function AuditReportsPage() {
  await requireRole(["super_admin", "finance_admin"]);
  const [reports, stats] = await Promise.all([
    getAuditReports(),
    getAuditSummaryStats()
  ]);

  const reportsWithDiscrepancies = reports.filter(
    (report) => report.discrepancies.length > 0
  );

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Audit reports</span>
          <h3>Monthly financial audits — reconciliation, verification, and discrepancy detection</h3>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total audits</span>
          </div>
          <div className="metric-value">{stats.totalAudits}</div>
        </article>

        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Last audit date</span>
          </div>
          <div className="metric-value">{stats.lastAuditDate}</div>
        </article>

        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Average pass rate</span>
          </div>
          <div className="metric-value">{stats.averagePassRate}%</div>
        </article>

        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Total discrepancies found</span>
          </div>
          <div className="metric-value">{stats.totalDiscrepancies}</div>
        </article>
      </section>

      {reports.length === 0 ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">No data</span>
              <h3>No audit reports generated yet</h3>
            </div>
          </div>
          <span className="muted">
            The monthly audit agent runs at the start of each month.
          </span>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Report history</span>
                <h3>All audit runs</h3>
              </div>
              <span className="badge">{reports.length} reports</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Entity</th>
                    <th>Status</th>
                    <th>Total Checks</th>
                    <th>Passed</th>
                    <th>Failed</th>
                    <th>Pass Rate</th>
                    <th>Completed At</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id}>
                      <td>
                        {report.periodStart} — {report.periodEnd}
                      </td>
                      <td>{report.companyCode}</td>
                      <td>
                        <span
                          className={`pill signal-pill ${
                            report.status === "completed"
                              ? "signal-good"
                              : report.status === "running"
                                ? "signal-warn"
                                : "signal-risk"
                          }`}
                        >
                          {report.status}
                        </span>
                      </td>
                      <td>{report.totalChecks}</td>
                      <td>{report.passedChecks}</td>
                      <td>{report.failedChecks}</td>
                      <td>{report.passRate}%</td>
                      <td>{report.completedAt}</td>
                      <td>{report.summary || <span className="muted">No summary</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {reportsWithDiscrepancies.length > 0 ? (
            <section className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Discrepancy details</span>
                  <h3>Issues found during audit runs</h3>
                </div>
                <span className="badge">{reportsWithDiscrepancies.length} reports with issues</span>
              </div>

              {reportsWithDiscrepancies.map((report) => (
                <div key={report.id} style={{ marginBottom: "1.5rem" }}>
                  <div className="card-title-row">
                    <div>
                      <strong>
                        Discrepancies — {report.periodStart} — {report.periodEnd}
                      </strong>
                    </div>
                    <span className="pill">{report.companyCode}</span>
                  </div>
                  <div className="table-wrapper clean-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Area</th>
                          <th>Description</th>
                          <th>Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.discrepancies.map((disc, idx) => (
                          <tr key={`${report.id}-disc-${idx}`}>
                            <td>
                              <span className="badge">{disc.area}</span>
                            </td>
                            <td>{disc.description}</td>
                            <td>
                              <span
                                className={`pill ${
                                  disc.severity === "high"
                                    ? "signal-pill signal-risk"
                                    : disc.severity === "medium"
                                      ? "signal-pill signal-warn"
                                      : "subtle-pill"
                                }`}
                              >
                                {disc.severity}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
