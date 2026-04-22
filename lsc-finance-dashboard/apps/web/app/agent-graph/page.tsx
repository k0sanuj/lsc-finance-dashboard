/**
 * Agent Graph — live visualization of the real 21-agent topology
 * defined in agents/agent-graph.ts AGENT_GRAPH.
 *
 * Layout strategy:
 *   - Orchestrator is center (single core agent)
 *   - HITL analyzers + true agents arc around the left/top (7 HITL + 2 other agents)
 *   - Workflow agents arc around the right/bottom (14 workflows)
 *   - Edges drawn for orchestrator ↔ child, and workflow ↔ its peers
 *   - Each node tagged with kind (agent/hitl/workflow) and tier (T0-T3) badge
 */

import { AGENT_GRAPH, AgentId, type AgentNode } from "@lsc/agents/agent-graph";
import { requireRole } from "../../lib/auth";

type LaidOutNode = AgentNode & { x: number; y: number };

// Board dimensions
const BOARD_W = 960;
const BOARD_H = 640;
const CENTER_X = BOARD_W / 2;
const CENTER_Y = BOARD_H / 2;

function layoutNodes(): { nodes: LaidOutNode[]; nodesById: Record<string, LaidOutNode> } {
  const all = Object.values(AGENT_GRAPH);
  const orchestrator = all.find((n) => n.id === AgentId.Orchestrator);
  if (!orchestrator) {
    return { nodes: [], nodesById: {} };
  }

  const hitl = all.filter((n) => n.kind === "hitl");
  const otherAgents = all.filter((n) => n.kind === "agent" && n.id !== AgentId.Orchestrator);
  const workflows = all.filter((n) => n.kind === "workflow");

  const laid: LaidOutNode[] = [{ ...orchestrator, x: CENTER_X, y: CENTER_Y }];

  // Agents (non-orchestrator): top arc
  const topRadius = 220;
  for (let i = 0; i < otherAgents.length; i++) {
    const frac = otherAgents.length === 1 ? 0.5 : i / (otherAgents.length - 1);
    const angle = Math.PI * (1.15 + 0.7 * frac); // ~205° → ~331° (top arc)
    laid.push({
      ...otherAgents[i],
      x: CENTER_X + topRadius * Math.cos(angle),
      y: CENTER_Y + topRadius * Math.sin(angle),
    });
  }

  // HITL: upper-left arc (radius 260, angle 150°–230°)
  const hitlRadius = 270;
  for (let i = 0; i < hitl.length; i++) {
    const frac = hitl.length === 1 ? 0.5 : i / (hitl.length - 1);
    const angle = Math.PI * (0.80 + 0.55 * frac); // ~144° → ~243°
    laid.push({
      ...hitl[i],
      x: CENTER_X + hitlRadius * Math.cos(angle),
      y: CENTER_Y + hitlRadius * Math.sin(angle),
    });
  }

  // Workflows: lower/right arc (radius 300)
  const wfRadius = 290;
  for (let i = 0; i < workflows.length; i++) {
    const frac = workflows.length === 1 ? 0.5 : i / (workflows.length - 1);
    // 300° → 60° sweeping clockwise across the right side (angles in [5π/3, 2π] ∪ [0, π/3])
    const angle = Math.PI * (1.68 + 0.86 * frac);
    laid.push({
      ...workflows[i],
      x: CENTER_X + wfRadius * Math.cos(angle),
      y: CENTER_Y + wfRadius * Math.sin(angle),
    });
  }

  const nodesById = Object.fromEntries(laid.map((n) => [n.id, n]));
  return { nodes: laid, nodesById };
}

function lineStyle(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    left: `${from.x}px`,
    top: `${from.y}px`,
    width: `${length}px`,
    transform: `rotate(${angle}deg)`,
  };
}

function tierColor(tier: string): string {
  if (tier === "T0") return "tier-t0";
  if (tier === "T1") return "tier-t1";
  if (tier === "T2") return "tier-t2";
  if (tier === "T3") return "tier-t3";
  return "tier-t0";
}

function kindColor(kind: string): string {
  if (kind === "agent") return "kind-agent";
  if (kind === "hitl") return "kind-hitl";
  return "kind-workflow";
}

export default async function AgentGraphPage() {
  await requireRole(["super_admin", "finance_admin"]);

  const { nodes, nodesById } = layoutNodes();

  const agentCount = nodes.filter((n) => n.kind === "agent").length;
  const hitlCount = nodes.filter((n) => n.kind === "hitl").length;
  const workflowCount = nodes.filter((n) => n.kind === "workflow").length;

  // Build edges from canTalkTo — dedup (A→B === B→A visually) and hide orchestrator↔all
  // redundancy where both sides declare each other.
  const edgeKeySeen = new Set<string>();
  type Edge = { id: string; from: string; to: string; kind: "agent" | "hitl" | "workflow" };
  const edges: Edge[] = [];
  for (const node of nodes) {
    for (const toId of node.canTalkTo) {
      const a = node.id < toId ? node.id : toId;
      const b = node.id < toId ? toId : node.id;
      const key = `${a}|${b}`;
      if (edgeKeySeen.has(key)) continue;
      edgeKeySeen.add(key);
      const target = nodesById[toId];
      if (!target) continue;
      // Color the line by the "less central" endpoint so it reflects the non-orchestrator kind
      const coloringNode = node.id === AgentId.Orchestrator ? target : node;
      edges.push({
        id: `${node.id}__${toId}`,
        from: node.id,
        to: toId,
        kind: coloringNode.kind,
      });
    }
  }

  // Direct-connection list (what the orchestrator can route to)
  const orchestratorEdges = nodes.filter((n) => n.id !== AgentId.Orchestrator);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">System view</span>
          <h3>Agent Graph — 21 agents across 3 kinds</h3>
          <p className="muted">
            Live topology built from <code>agents/agent-graph.ts</code>. The orchestrator (Claude
            Haiku, T1) receives user intent and routes it. Workflows are deterministic code (T0,
            no LLM). HITL analyzers reason but wait for human confirmation before side effects.
          </p>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Agents</span>
          </div>
          <div className="metric-value">{agentCount + 1}</div>
          <span className="metric-subvalue">Autonomous, can write</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">HITL analyzers</span>
          </div>
          <div className="metric-value">{hitlCount}</div>
          <span className="metric-subvalue">Human confirms write</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Workflows</span>
          </div>
          <div className="metric-value">{workflowCount}</div>
          <span className="metric-subvalue">Deterministic, no LLM</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Edges</span>
          </div>
          <div className="metric-value">{edges.length}</div>
          <span className="metric-subvalue">Topology connections</span>
        </article>
      </section>

      <section className="graph-board agent-graph-board">
        {edges.map((edge) => {
          const from = nodesById[edge.from];
          const to = nodesById[edge.to];
          if (!from || !to) return null;
          return (
            <div
              className={`network-line edge-${edge.kind}`}
              key={edge.id}
              style={lineStyle(from, to)}
            />
          );
        })}

        {nodes.map((node) => (
          <article
            className={`graph-node agent-graph-node ${kindColor(node.kind)} ${
              node.id === AgentId.Orchestrator ? "core" : ""
            }`}
            key={node.id}
            style={{ left: node.x - 88, top: node.y - 48 }}
          >
            <div className="node-name">{node.name}</div>
            <div className="node-meta">{node.role}</div>
            <div className="node-badges">
              <span className={`badge ${tierColor(node.tier)}`}>{node.tier}</span>
              <span className={`badge ${kindColor(node.kind)}`}>{node.kind}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="support-grid">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Legend</span>
              <h3>How to read this graph</h3>
            </div>
          </div>
          <div className="legend-grid">
            <div className="mini-metric">
              <span className="badge kind-agent">agent</span>
              <strong>Autonomous — can commit writes</strong>
            </div>
            <div className="mini-metric">
              <span className="badge kind-hitl">hitl</span>
              <strong>Reasons; waits for confirm</strong>
            </div>
            <div className="mini-metric">
              <span className="badge kind-workflow">workflow</span>
              <strong>Pure code, no LLM</strong>
            </div>
            <div className="mini-metric">
              <span className="badge tier-t0">T0</span>
              <strong>SQL/math only</strong>
            </div>
            <div className="mini-metric">
              <span className="badge tier-t1">T1</span>
              <strong>Claude Haiku</strong>
            </div>
            <div className="mini-metric">
              <span className="badge tier-t2">T2</span>
              <strong>Claude Sonnet / Gemini Flash</strong>
            </div>
            <div className="mini-metric">
              <span className="badge tier-t3">T3</span>
              <strong>Claude Opus</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Orchestrator routing</span>
              <h3>What the orchestrator can dispatch to</h3>
            </div>
            <span className="pill">{orchestratorEdges.length} targets</span>
          </div>
          <div className="key-value-list">
            {orchestratorEdges.map((node) => (
              <div className="key-value-row" key={node.id}>
                <span>{node.name}</span>
                <span className="flex-row-gap-sm">
                  <span className={`badge ${kindColor(node.kind)}`}>{node.kind}</span>
                  <span className={`badge ${tierColor(node.tier)}`}>{node.tier}</span>
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
