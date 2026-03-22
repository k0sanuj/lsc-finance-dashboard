import type { Route } from "next";
import Link from "next/link";
import { getEntitySnapshots } from "@lsc/db";

const fspWorkspaceCards = [
  {
    href: "/commercial-goals/FSP",
    title: "Commercial planning",
    description: "Subscriber, partnership, and launch-goal planning.",
    badge: "Step 1"
  },
  {
    href: "/documents/FSP?view=commercial-docs",
    title: "Source documents",
    description: "Contracts, partner docs, and launch support files.",
    badge: "Step 2"
  },
  {
    href: "/payments/FSP?view=overview",
    title: "Payments",
    description: "Platform bills and launch cost payables.",
    badge: "Step 3"
  },
  {
    href: "/costs/FSP?view=overview",
    title: "Costs",
    description: "Operating cost tracking for FSP.",
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
    detail: "Define subscriber, partner, and platform-cost structures."
  },
  {
    label: "Season 2 · Go live",
    status: "Placeholder",
    detail: "Bring live documents, vendor bills, and commercial targets online."
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
        <article className="metric-card" style={{ gridColumn: "1 / -1" }}>
          <div className="metric-topline">
            <span className="metric-label">FSP</span>
            <span className="badge">Status: {fsp?.status ?? "Schema ready"}</span>
          </div>
          <div className="metric-value">Planning mode</div>
          <div className="metric-subvalue">FSP is in planning mode — no live data yet.</div>
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

      <article className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Roadmap</span>
            <h3>FSP rollout</h3>
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
    </div>
  );
}
