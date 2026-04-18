import { getAuditLog, getAuditLogSummary } from "@lsc/db";
import { requireRole } from "../../lib/auth";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; trigger?: string; agent?: string }>;
}) {
  await requireRole(["super_admin", "finance_admin"]);
  const { entity, trigger, agent } = await searchParams;

  const [summary, entries] = await Promise.all([
    getAuditLogSummary(),
    getAuditLog({
      entityType: entity,
      trigger,
      agentId: agent,
      limit: 200,
    }),
  ]);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Audit log</span>
          <h3>Every mutation across the platform — cascade results + before/after state</h3>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total entries</span>
          </div>
          <div className="metric-value">{summary.totalEntries.toLocaleString()}</div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Last 24 hours</span>
          </div>
          <div className="metric-value">{summary.entriesLast24h.toLocaleString()}</div>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Last 7 days</span>
          </div>
          <div className="metric-value">{summary.entriesLast7d.toLocaleString()}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Active filter</span>
          </div>
          <div className="metric-value" style={{ fontSize: "1.1rem" }}>
            {entity || trigger || agent || "All"}
          </div>
        </article>
      </section>

      {summary.totalEntries === 0 ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">No entries yet</span>
              <h3>Audit log is empty</h3>
            </div>
          </div>
          <span className="muted">
            Mutations wired through the cascade engine will appear here. Once we wire the first
            server action (invoice intake approval) to <code>cascadeUpdate()</code>, entries will
            start flowing in.
          </span>
        </section>
      ) : (
        <>
          <section className="stats-grid">
            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">By trigger</span>
                  <h3>Top triggers</h3>
                </div>
              </div>
              <div className="key-value-list">
                {summary.byTrigger.slice(0, 10).map((t) => (
                  <div className="key-value-row" key={t.trigger}>
                    <span>{t.trigger}</span>
                    <strong>{t.count.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">By agent</span>
                  <h3>Most active agents</h3>
                </div>
              </div>
              <div className="key-value-list">
                {summary.byAgent.length === 0 ? (
                  <span className="muted">No agent-tagged entries yet</span>
                ) : (
                  summary.byAgent.slice(0, 10).map((a) => (
                    <div className="key-value-row" key={a.agentId}>
                      <span>{a.agentId}</span>
                      <strong>{a.count.toLocaleString()}</strong>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">By entity</span>
                  <h3>Most mutated entity types</h3>
                </div>
              </div>
              <div className="key-value-list">
                {summary.byEntityType.slice(0, 10).map((e) => (
                  <div className="key-value-row" key={e.entityType}>
                    <span>{e.entityType}</span>
                    <strong>{e.count.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Recent mutations</span>
                <h3>Latest entries</h3>
              </div>
              <span className="badge">{entries.length} shown</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Entity</th>
                    <th>Entity ID</th>
                    <th>Trigger</th>
                    <th>Action</th>
                    <th>Agent</th>
                    <th>Performed by</th>
                    <th>Cascade actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <span className="badge">{e.entityType}</span>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
                        {e.entityId.length > 12 ? e.entityId.slice(0, 8) + "…" : e.entityId}
                      </td>
                      <td>
                        <span className="subtle-pill">{e.trigger}</span>
                      </td>
                      <td>{e.action}</td>
                      <td>
                        {e.agentId ? (
                          <span className="subtle-pill">{e.agentId}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{e.performedBy ?? <span className="muted">system</span>}</td>
                      <td style={{ fontSize: "0.78rem" }}>
                        {e.cascadeResult && e.cascadeResult.actions.length > 0 ? (
                          <span>
                            {e.cascadeResult.actions.slice(0, 2).join(", ")}
                            {e.cascadeResult.actions.length > 2
                              ? ` +${e.cascadeResult.actions.length - 2}`
                              : ""}
                          </span>
                        ) : (
                          <span className="muted">none</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
