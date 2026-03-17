import { getWorkflowGraph } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function formatOwner(owner: string) {
  return owner === "UI Engineer" ? "Frontend Experience Agent" : owner;
}

export default async function WorkflowGraphPage() {
  await requireRole(["super_admin", "finance_admin"]);
  const { stages: workflowStages, branches: workflowBranches } = await getWorkflowGraph();

  return (
    <div className="page-grid">
      <section className="hero">
        <span className="eyebrow">Process view</span>
        <h2>Workflow Graph</h2>
        <p>
          This page shows how finance work moves through the platform. It is separate from the
          agent graph on purpose: this is the operating path, from planning through posting and
          review.
        </p>
      </section>

      <article className="card workflow-stage-rail">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Primary rail</span>
            <h3>Master workflow</h3>
          </div>
          <span className="pill">Ordered left to right</span>
        </div>
        <div className="workflow-row">
          {workflowStages.map((stage: (typeof workflowStages)[number], index: number) => (
            <div className="workflow-row" key={stage.id}>
              <div className="workflow-stage-card">
                <span className="section-kicker">Stage {index + 1}</span>
                <strong>{stage.name}</strong>
                <p className="muted">{formatOwner(stage.owner)}</p>
              </div>
              {index < workflowStages.length - 1 ? (
                <div className="workflow-connector">→</div>
              ) : null}
            </div>
          ))}
        </div>
      </article>

      <section className="support-grid">
        {workflowBranches.map((branch: (typeof workflowBranches)[number]) => (
          <article className="card" key={branch.name}>
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Operational branch</span>
                <h3>{branch.name}</h3>
              </div>
            </div>
            <div className="info-grid">
              {branch.steps.map((step: string, index: number) => (
                <div className="process-step" key={step}>
                  <span className="process-step-index">Step {index + 1}</span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="support-grid">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Reading guide</span>
              <h3>How to use this page</h3>
            </div>
          </div>
          <ul className="list compact">
            <li>Use the top rail to understand the universal finance operating sequence.</li>
            <li>Use branch cards to inspect the workflow logic for expenses, revenue, and payments.</li>
            <li>If a branch is unclear, the issue should be solved here before adding more UI.</li>
          </ul>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Frontend expectation</span>
              <h3>What operators should feel</h3>
            </div>
          </div>
          <div className="mini-metric-grid">
            <div className="mini-metric">
              <span>Clarity</span>
              <strong>One obvious next action</strong>
            </div>
            <div className="mini-metric">
              <span>Trust</span>
              <strong>Every number traceable</strong>
            </div>
            <div className="mini-metric">
              <span>Control</span>
              <strong>Approval before posting</strong>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
