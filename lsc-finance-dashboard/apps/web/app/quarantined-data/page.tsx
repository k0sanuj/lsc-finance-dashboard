import { getFinanceRecognitionByEntity, getReportingExclusionSummary, getReportingExclusions } from "@lsc/db";
import { requireRole } from "../../lib/auth";

export default async function QuarantinedDataPage() {
  await requireRole(["super_admin", "finance_admin"]);

  const [summary, rows, recognition] = await Promise.all([
    getReportingExclusionSummary(),
    getReportingExclusions(250),
    getFinanceRecognitionByEntity(),
  ]);

  const totalExcluded = summary.reduce((sum, row) => sum + row.rowCount, 0);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">System control</span>
          <h3>Quarantined reporting data</h3>
          <p className="muted">
            QA and test artifacts are preserved for audit but excluded from finance reporting views.
          </p>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Excluded rows</span>
          </div>
          <div className="metric-value">{totalExcluded.toLocaleString()}</div>
          <span className="metric-subvalue">Quarantined, not deleted</span>
        </article>
        {recognition.map((row) => (
          <article className="metric-card" key={row.companyCode}>
            <div className="metric-topline">
              <span className="metric-label">{row.companyCode}</span>
            </div>
            <div className="metric-value">{row.actualMargin}</div>
            <span className="metric-subvalue">{row.recognitionPolicy.replace(/_/g, " ")}</span>
          </article>
        ))}
      </section>

      <section className="grid-two">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Summary</span>
              <h3>Rows by source and reason</h3>
            </div>
          </div>
          <div className="table-wrapper clean-table compact-ledger-table">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Rows</th>
                  <th>Latest</th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">No quarantined reporting rows.</td>
                  </tr>
                ) : (
                  summary.map((row) => (
                    <tr key={`${row.sourceTable}-${row.reason}`}>
                      <td><strong>{row.sourceTable}</strong></td>
                      <td>{row.reason.replace(/_/g, " ")}</td>
                      <td><span className="badge">{row.excludedFromReporting ? "Excluded" : "Tracked"}</span></td>
                      <td>{row.rowCount.toLocaleString()}</td>
                      <td>{row.latestQuarantineAt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Recognition policy</span>
              <h3>Reporting contract</h3>
            </div>
          </div>
          <div className="key-value-list">
            {recognition.map((row) => (
              <div className="key-value-row" key={row.companyCode}>
                <span>{row.companyName}</span>
                <strong>{row.recognitionPolicy.replace(/_/g, " ")}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Latest quarantines</span>
            <h3>Audit-preserved exclusions</h3>
          </div>
          <span className="badge">{rows.length} shown</span>
        </div>
        <div className="table-wrapper clean-table compact-ledger-table">
          <table>
            <thead>
              <tr>
                <th>Source table</th>
                <th>Source ID</th>
                <th>Reason</th>
                <th>Status</th>
                <th>By</th>
                <th>At</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">No exclusion records found.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.sourceTable}</strong></td>
                    <td className="muted" style={{ fontFamily: "monospace" }}>
                      {row.sourceId.slice(0, 12)}
                    </td>
                    <td>{row.reason.replace(/_/g, " ")}</td>
                    <td><span className="badge">{row.excludedFromReporting ? "Excluded" : "Tracked"}</span></td>
                    <td>{row.quarantinedBy ?? "system"}</td>
                    <td>{row.quarantinedAt}</td>
                    <td>{row.notes ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
