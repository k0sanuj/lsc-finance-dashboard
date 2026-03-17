import { getAgentGraph } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function connectionStyle(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return {
    left: `${from.x}px`,
    top: `${from.y}px`,
    width: `${length}px`,
    transform: `rotate(${angle}deg)`
  };
}

function formatAgentName(name: string, id: string) {
  return id === "ui-engineer" ? "Frontend Experience Agent" : name;
}

function formatAgentRole(role: string, id: string) {
  return id === "ui-engineer" ? "Design Systems + Workflow UX" : role;
}

export default async function AgentGraphPage() {
  await requireRole(["super_admin", "finance_admin"]);
  const { nodes: agentNodes, edges: agentEdges }: Awaited<ReturnType<typeof getAgentGraph>> =
    await getAgentGraph();
  const nodesById = Object.fromEntries(
    agentNodes.map((node: (typeof agentNodes)[number]) => [node.id, node])
  );
  const directReports = agentNodes.filter(
    (node: (typeof agentNodes)[number]) => node.parentId === "finance-overlord"
  );
  const specialistCount = agentNodes.filter(
    (node: (typeof agentNodes)[number]) => node.tier === "specialist"
  ).length;
  const activeCount = agentNodes.filter(
    (node: (typeof agentNodes)[number]) => node.status === "active"
  ).length;

  return (
    <div className="page-grid">
      <section className="hero">
        <span className="eyebrow">System view</span>
        <h2>Agent Graph</h2>
        <p>
          The Finance Overlord is the coordinator. It routes work to finance, ontology, schema,
          import, application, and frontend specialists so the platform stays consistent instead of
          letting one generalist improvise finance logic.
        </p>
      </section>

      <section className="support-grid">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Control summary</span>
              <h3>Current system posture</h3>
            </div>
          </div>
          <div className="mini-metric-grid">
            <div className="mini-metric">
              <span>Coordinator</span>
              <strong>1</strong>
            </div>
            <div className="mini-metric">
              <span>Specialists</span>
              <strong>{specialistCount}</strong>
            </div>
            <div className="mini-metric">
              <span>Active nodes</span>
              <strong>{activeCount}</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Design principle</span>
              <h3>How to read this view</h3>
            </div>
          </div>
          <div className="legend-grid">
            <div className="mini-metric">
              <span>Core</span>
              <strong>Owns orchestration</strong>
            </div>
            <div className="mini-metric">
              <span>Specialist</span>
              <strong>Owns one bounded domain</strong>
            </div>
            <div className="mini-metric">
              <span>Sub-agent</span>
              <strong>Supports a specialist path</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="graph-board">
        {agentEdges.map((edge: (typeof agentEdges)[number]) => {
          const from = nodesById[edge.from];
          const to = nodesById[edge.to];

          if (!from || !to) {
            return null;
          }

          return <div className="network-line" key={edge.id} style={connectionStyle(from, to)} />;
        })}

        {agentNodes.map((node: (typeof agentNodes)[number]) => (
          <article
            className={`graph-node${node.tier === "core" ? " core" : ""}`}
            key={node.id}
            style={{ left: node.x - 76, top: node.y - 48 }}
          >
            <div className="node-name">{formatAgentName(node.name, node.id)}</div>
            <div className="node-meta">{formatAgentRole(node.role, node.id)}</div>
            <span
              className={`badge ${
                node.status === "active"
                  ? "status-active"
                  : node.status === "blocked"
                    ? "status-blocked"
                    : "status-idle"
              }`}
            >
              {node.status}
            </span>
          </article>
        ))}
      </section>

      <section className="support-grid">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Direct reports</span>
              <h3>Overlord handoff map</h3>
            </div>
            <span className="pill">Primary branches</span>
          </div>
          <div className="key-value-list">
            {directReports.map((node: (typeof agentNodes)[number]) => (
              <div className="key-value-row" key={node.id}>
                <span>{formatAgentName(node.name, node.id)}</span>
                <strong>{formatAgentRole(node.role, node.id)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Interaction rules</span>
              <h3>What each line means</h3>
            </div>
          </div>
          <ul className="list compact">
            <li>`routes_to` means the Overlord assigns the workstream.</li>
            <li>`depends_on` means downstream work cannot move until the upstream system is ready.</li>
            <li>`validates` means one specialist is checking the integrity of another layer.</li>
            <li>`reports_to` means findings return to the coordinator before they affect the platform.</li>
          </ul>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Frontend lane</span>
              <h3>Frontend Experience Agent</h3>
            </div>
          </div>
          <div className="info-grid">
            <div className="process-step">
              <span className="process-step-index">Owns</span>
              <strong>Navigation, spacing, drill-down, workflow clarity</strong>
              <span className="muted">
                This agent should translate finance logic into calm, legible operating surfaces.
              </span>
            </div>
            <div className="process-step">
              <span className="process-step-index">Depends on</span>
              <strong>App and schema layers being correct first</strong>
              <span className="muted">
                The UI should not invent its own finance math or bypass canonical models.
              </span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
