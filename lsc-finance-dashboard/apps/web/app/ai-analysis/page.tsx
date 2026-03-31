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
    description: "LSC holding-company layer.",
    badge: "Step 1"
  },
  {
    key: "tbr",
    title: "TBR operating brief",
    description: "Race operations, expenses, payables, and pacing.",
    badge: "Step 2"
  },
  {
    key: "commercial",
    title: "Commercial brief",
    description: "Target pace, sponsorship, and prize-linked revenue.",
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

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">AI analysis</span>
          <h3>Pick an analysis lens, then read the brief</h3>
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

      <section className="card-grid">
        {visibleInsights.map((item) => (
          <article className="insight-card" key={item.title}>
            <span className="pill subtle-pill">{item.type}</span>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
