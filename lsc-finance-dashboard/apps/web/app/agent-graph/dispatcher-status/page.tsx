import { AGENT_GRAPH, AGENT_SKILLS, type AgentId } from "@lsc/agents/agent-graph";
import { listRegisteredSkills, getUnregisteredSkills } from "@lsc/skills/dispatcher";
import { requireRole } from "../../../lib/auth";

export default async function DispatcherStatusPage() {
  await requireRole(["super_admin", "finance_admin"]);

  const registered = listRegisteredSkills();
  const unregistered = getUnregisteredSkills();

  const byAgent: Record<string, { total: number; registered: number; missing: string[] }> = {};
  for (const [agentIdStr, skills] of Object.entries(AGENT_SKILLS)) {
    const infraSkills = ["ontology-query", "cascade-update", "audit-log"];
    const realSkills = skills.filter((s) => !infraSkills.includes(s));
    byAgent[agentIdStr] = {
      total: realSkills.length,
      registered: realSkills.filter((s) => registered.includes(`${agentIdStr}:${s}`)).length,
      missing: realSkills.filter((s) => !registered.includes(`${agentIdStr}:${s}`)),
    };
  }

  const totalDeclared = Object.values(byAgent).reduce((a, b) => a + b.total, 0);
  const totalRegistered = registered.length;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Engine status</span>
          <h3>Skill dispatcher registry — what's wired vs what's declared</h3>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Registered handlers</span>
          </div>
          <div className="metric-value">{totalRegistered}</div>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Declared skills (excl. infra)</span>
          </div>
          <div className="metric-value">{totalDeclared}</div>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Unregistered</span>
          </div>
          <div className="metric-value">{unregistered.length}</div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Coverage</span>
          </div>
          <div className="metric-value">
            {totalDeclared > 0 ? Math.round((totalRegistered / totalDeclared) * 100) : 0}%
          </div>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">By agent</span>
            <h3>Dispatcher coverage</h3>
          </div>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Kind</th>
                <th>Tier</th>
                <th>Registered</th>
                <th>Declared</th>
                <th>Missing skills</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byAgent).map(([agentId, stats]) => {
                const node = AGENT_GRAPH[agentId as AgentId];
                const pct = stats.total > 0 ? Math.round((stats.registered / stats.total) * 100) : 0;
                return (
                  <tr key={agentId}>
                    <td>{node?.name ?? agentId}</td>
                    <td>
                      <span className="subtle-pill">{node?.kind ?? "?"}</span>
                    </td>
                    <td>{node?.tier ?? "?"}</td>
                    <td>
                      <strong>{stats.registered}</strong>
                      <span className="muted"> ({pct}%)</span>
                    </td>
                    <td>{stats.total}</td>
                    <td style={{ fontSize: "0.78rem" }}>
                      {stats.missing.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        stats.missing.join(", ")
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Registered handlers</span>
            <h3>All {registered.length} skills currently dispatchable</h3>
          </div>
        </div>
        <div style={{ fontSize: "0.8rem", fontFamily: "monospace", lineHeight: "1.8" }}>
          {registered.map((key) => (
            <div key={key}>{key}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
