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
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Future of Sports</span>
          <h3>FSP workspace</h3>
          <p className="muted">Planning mode — no live data yet. {fsp?.status ?? "Schema ready"}.</p>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            <Link className="segment-chip" href="/commercial-goals/FSP">Commercial</Link>
            <Link className="segment-chip" href="/">Back to overview</Link>
          </div>
        </div>
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
