import Link from "next/link";
import { getAiInsights } from "@lsc/db";
import { requireRole } from "../../lib/auth";

type AiAnalysisPageProps = {
  searchParams?: Promise<{
    scope?: string;
  }>;
};

const scopes = [
  {
    key: "portfolio",
    title: "Portfolio brief",
    description: "Use this lens when reading LSC as the holding-company layer.",
    badge: "Step 1"
  },
  {
    key: "tbr",
    title: "TBR operating brief",
    description: "Use this lens when the question is about race operations, expenses, payables, or TBR pacing.",
    badge: "Step 2"
  },
  {
    key: "commercial",
    title: "Commercial brief",
    description: "Use this lens when the question is target pace, sponsorship closure, or prize-linked revenue.",
    badge: "Step 3"
  }
] as const;

function matchesScope(type: string, summary: string, scope: string) {
  const haystack = `${type} ${summary}`.toLowerCase();

  if (scope === "tbr") {
    return (
      haystack.includes("tbr") ||
      haystack.includes("race") ||
      haystack.includes("expense") ||
      haystack.includes("payment") ||
      haystack.includes("invoice")
    );
  }

  if (scope === "commercial") {
    return (
      haystack.includes("commercial") ||
      haystack.includes("sponsor") ||
      haystack.includes("revenue") ||
      haystack.includes("target") ||
      haystack.includes("prize")
    );
  }

  return (
    haystack.includes("lsc") ||
    haystack.includes("portfolio") ||
    haystack.includes("margin") ||
    haystack.includes("cash") ||
    haystack.includes("consolidated")
  );
}

export default async function AiAnalysisPage({ searchParams }: AiAnalysisPageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const params = searchParams ? await searchParams : undefined;
  const selectedScope = scopes.some((scope) => scope.key === params?.scope)
    ? (params?.scope as (typeof scopes)[number]["key"])
    : "portfolio";

  const aiInsights = await getAiInsights();
  const filteredInsights = aiInsights.filter((item) =>
    matchesScope(item.type, `${item.title} ${item.summary}`, selectedScope)
  );
  const visibleInsights = filteredInsights.length > 0 ? filteredInsights : aiInsights;
  const selectedScopeMeta = scopes.find((scope) => scope.key === selectedScope) ?? scopes[0];

  return (
    <div className="page-grid">
      <section className="hero portfolio-hero">
        <div className="hero-copy">
          <span className="eyebrow">Narrative layer</span>
          <h2>Pick the analysis lens before reading the brief.</h2>
          <p>
            This page should behave like a finance brief, not a raw list of AI cards. Start with
            the scope you are asking about, then read only the insights that belong to that layer.
          </p>
        </div>
      </section>

      <section className="tool-grid workflow-grid">
        {scopes.map((scope) => (
          <article className={`tool-card ${scope.key === selectedScope ? "primary-tool-card" : ""}`} key={scope.key}>
            <span className="section-kicker">{scope.badge}</span>
            <h3>{scope.title}</h3>
            <p>{scope.description}</p>
            <Link className={scope.key === selectedScope ? "solid-link" : "ghost-link"} href={`/ai-analysis?scope=${scope.key}`}>
              {scope.key === selectedScope ? "Current lens" : "Open brief"}
            </Link>
          </article>
        ))}
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Selected lens</span>
            <h3>{selectedScopeMeta.title}</h3>
          </div>
          <span className="pill">{visibleInsights.length} insights</span>
        </div>
        <div className="process-step compact-process-step">
          <span className="process-step-index">Rule</span>
          <strong>{selectedScopeMeta.description}</strong>
          <span className="muted">Keep the brief scoped. Move back into the operational tabs if you need the underlying table, queue, or source-backed detail.</span>
        </div>
      </section>

      <section className="card-grid">
        {visibleInsights.map((item) => (
          <article className="insight-card" key={item.title}>
            <span className="badge">{item.type}</span>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
