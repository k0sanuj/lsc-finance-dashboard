import type { Route } from "next";
import Link from "next/link";
import { getEntitySnapshots } from "@lsc/db";

const fspWorkspaceCards = [
  {
    href: "/commercial-goals/FSP",
    title: "Commercial planning",
    description: "Open subscriber, partnership, and launch-goal planning once the company context is set.",
    badge: "Step 1"
  },
  {
    href: "/documents/FSP?view=commercial-docs",
    title: "Source documents",
    description: "Keep contracts, partner documents, and launch support files organized in the FSP branch.",
    badge: "Step 2"
  },
  {
    href: "/payments/FSP?view=overview",
    title: "Payments",
    description: "Hold the payable structure for platform bills and launch costs without forcing density before live data exists.",
    badge: "Step 3"
  },
  {
    href: "/costs/FSP?view=overview",
    title: "Costs",
    description: "Use the same company-first cost route shape as TBR, with a quieter placeholder state for now.",
    badge: "Step 4"
  }
];
type WorkspaceCard = {
  href: string;
  title: string;
  description: string;
  badge: string;
};

const fspRoadmap = [
  {
    label: "Season 1 · Launch prep",
    status: "Planning",
    detail: "Define subscriber, partner, and platform-cost structures before opening detailed dashboards."
  },
  {
    label: "Season 2 · Go live",
    status: "Placeholder",
    detail: "Bring live documents, vendor bills, and commercial targets into the same workflow pattern used by TBR."
  }
];

export default async function FspPage() {
  const entitySnapshots = await getEntitySnapshots();
  const fsp = entitySnapshots.find((entity) => entity.code === "FSP");

  return (
    <div className="page-grid">
      <section className="hero portfolio-hero">
        <div className="hero-copy">
          <span className="eyebrow">Future of Sports</span>
          <h2>Choose the FSP workspace you want to open.</h2>
          <p>
            FSP should behave like a clean company branch inside LSC: overview first, then one
            focused workspace at a time. Keep the route shape ready without pretending the
            operating density already matches TBR.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="solid-link" href="/commercial-goals/FSP">
            Open commercial planning
          </Link>
          <Link className="ghost-link" href="/">
            Back to overview
          </Link>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">FSP</span>
            <span className="badge">Revenue</span>
          </div>
          <div className="metric-value">{fsp?.revenue ?? "$0"}</div>
          <div className="metric-subvalue">Keep live revenue zero-backed until contracts or subscriber records are posted.</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">FSP</span>
            <span className="badge">Cost</span>
          </div>
          <div className="metric-value">{fsp?.cost ?? "$0"}</div>
          <div className="metric-subvalue">Platform, tooling, and operating costs will land here once intake starts.</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">FSP</span>
            <span className="badge">Status</span>
          </div>
          <div className="metric-value">{fsp?.status ?? "Schema ready"}</div>
          <div className="metric-subvalue">The entity stays structured in the portfolio even while the operating layer is still light.</div>
        </article>
      </section>

      <section className="tool-grid workflow-grid">
        {(fspWorkspaceCards as readonly WorkspaceCard[]).map((card) => (
          <article className="tool-card" key={card.href}>
            <span className="section-kicker">{card.badge}</span>
            <h3>{card.title}</h3>
            <p>{card.description}</p>
            <Link className="ghost-link" href={card.href as Route}>
              Open workspace
            </Link>
          </article>
        ))}
      </section>

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Roadmap</span>
              <h3>How FSP should grow into the product</h3>
            </div>
          </div>
          <div className="info-grid">
            {fspRoadmap.map((stage) => (
              <div className="process-step" key={stage.label}>
                <span className="process-step-index">{stage.status}</span>
                <strong>{stage.label}</strong>
                <span className="muted">{stage.detail}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Operating rule</span>
              <h3>Keep FSP sequenced the same way as TBR</h3>
            </div>
          </div>
          <div className="info-grid">
            <div className="process-step">
              <span className="process-step-index">1</span>
              <strong>Pick the company branch</strong>
              <span className="muted">FSP should never be mixed into TBR operational pages.</span>
            </div>
            <div className="process-step">
              <span className="process-step-index">2</span>
              <strong>Open one workspace</strong>
              <span className="muted">Commercial, documents, payments, and costs should stay separate.</span>
            </div>
            <div className="process-step">
              <span className="process-step-index">3</span>
              <strong>Only then open detail</strong>
              <span className="muted">Tables, documents, and AI comments should remain context-bound.</span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
