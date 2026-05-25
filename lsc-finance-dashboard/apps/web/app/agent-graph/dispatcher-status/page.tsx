import { AGENT_GRAPH, AGENT_SKILLS, type AgentId } from "@lsc/agents/agent-graph";
import { getRecentAgentActivity } from "@lsc/agents/observability";
import { listRegisteredSkills, getUnregisteredSkills } from "@lsc/skills/dispatcher";
import { getLlmProviderHealth } from "@lsc/skills/shared/llm";
import { queryRowsAdmin } from "@lsc/db";
import { requireRole } from "../../../lib/auth";

type CascadeStatusRow = {
  execution_status: string;
  count: number;
};

type NotificationStatusRow = {
  status: string;
  count: number;
};

async function loadRuntimeHealth() {
  try {
    const [recentActivity, cascadeStatuses, notificationStatuses] = await Promise.all([
      getRecentAgentActivity(12),
      queryRowsAdmin<CascadeStatusRow>(
        `select execution_status, count(*)::int as count
         from cascade_action_events
         group by execution_status
         order by execution_status`
      ),
      queryRowsAdmin<NotificationStatusRow>(
        `select status, count(*)::int as count
         from outbound_notifications
         group by status
         order by status`
      ),
    ]);

    return {
      available: true,
      recentActivity,
      cascadeStatuses,
      notificationStatuses,
    };
  } catch {
    return {
      available: false,
      recentActivity: [],
      cascadeStatuses: [],
      notificationStatuses: [],
    };
  }
}

function sumCounts(rows: Array<{ count: number }>) {
  return rows.reduce((total, row) => total + Number(row.count ?? 0), 0);
}

export default async function DispatcherStatusPage() {
  await requireRole(["super_admin", "finance_admin"]);

  const registered = listRegisteredSkills();
  const unregistered = getUnregisteredSkills();
  const providerHealth = getLlmProviderHealth();
  const runtime = await loadRuntimeHealth();

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
  const failedActivities = runtime.recentActivity.filter((row) =>
    row.action.includes("error") || row.action.includes("degraded")
  ).length;
  const runtimeState = !runtime.available
    ? "unavailable"
    : runtime.recentActivity.length === 0
      ? "wired but idle"
      : failedActivities > 0
        ? "degraded"
        : "running";
  const queuedNotifications = runtime.notificationStatuses
    .filter((row) => row.status === "queued")
    .reduce((total, row) => total + Number(row.count ?? 0), 0);

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
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Runtime state</span>
          </div>
          <div className="metric-value agent-status-value">{runtimeState}</div>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Queued notifications</span>
          </div>
          <div className="metric-value">{queuedNotifications}</div>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Runtime health</span>
            <h3>Provider, cascade, and agent activity</h3>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          {providerHealth.map((provider) => (
            <article
              className={`metric-card ${provider.configured ? "accent-good" : "accent-risk"}`}
              key={provider.provider}
            >
              <div className="metric-topline">
                <span className="metric-label">{provider.provider}</span>
              </div>
              <div className="metric-value agent-status-value">{provider.status}</div>
              <p className="muted text-xs">{provider.requiredEnv}</p>
            </article>
          ))}
          <article className="metric-card accent-brand">
            <div className="metric-topline">
              <span className="metric-label">Cascade events</span>
            </div>
            <div className="metric-value">{sumCounts(runtime.cascadeStatuses)}</div>
          </article>
          <article className="metric-card accent-warn">
            <div className="metric-topline">
              <span className="metric-label">Recent agent events</span>
            </div>
            <div className="metric-value">{runtime.recentActivity.length}</div>
          </article>
        </div>
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
                    <td className="text-xs">
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
            <span className="section-kicker">Live execution</span>
            <h3>Recent agent activity</h3>
          </div>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Agent</th>
                <th>Event</th>
                <th>Status / detail</th>
              </tr>
            </thead>
            <tbody>
              {runtime.recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No runtime activity has been recorded yet.
                  </td>
                </tr>
              ) : (
                runtime.recentActivity.map((row) => (
                  <tr key={row.id}>
                    <td className="text-xs">{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.agent_id}</td>
                    <td>
                      <span className="subtle-pill">{row.action}</span>
                    </td>
                    <td className="text-xs">
                      {typeof row.details?.intent === "string" ? row.details.intent : null}
                      {typeof row.details?.skill === "string" ? row.details.skill : null}
                      {typeof row.details?.fallbackReason === "string" && row.details.fallbackReason
                        ? ` — ${row.details.fallbackReason}`
                        : null}
                    </td>
                  </tr>
                ))
              )}
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
        <div className="handler-list">
          {registered.map((key) => (
            <div key={key}>{key}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
