import Link from "next/link";
import {
  AlertTriangle,
  CircleDollarSign,
  CreditCard,
  Flag,
  Layers3,
  Scale,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import { getEntityDashboard, getTbrSeasonSummaries } from "@lsc/db";
import {
  FinanceTrendChart,
  HorizontalComparisonChart,
  StatusDonutChart,
  WaterfallBridgeChart,
  type ChartDatum
} from "../components/lsc-dashboard-charts";
import { MetricTile, Panel } from "../components/lsc-blue-primitives";
import { requireSession } from "../../lib/auth";

const metricIcons = [TrendingUp, TrendingDown, Scale, CreditCard, CircleDollarSign, Layers3] as const;

function toChartData(rows: Awaited<ReturnType<typeof getEntityDashboard>>["trend"]): ChartDatum[] {
  return rows.map((row) => ({ ...row }));
}

export default async function TbrPage() {
  const session = await requireSession();
  const isAdmin = session.role === "super_admin" || session.role === "finance_admin";

  if (!isAdmin) {
    const seasons = await getTbrSeasonSummaries();
    return (
      <div className="page-grid">
        <section className="workspace-header">
          <div className="workspace-header-left">
            <span className="section-kicker">TBR user console</span>
            <h3>Submit expenses and track race reimbursements</h3>
          </div>
          <div className="workspace-header-right">
            <div className="segment-row">
              <Link className="segment-chip" href="/tbr/my-expenses">My expenses</Link>
              <Link className="segment-chip" href="/tbr/races">Races</Link>
            </div>
          </div>
        </section>

        <section className="tool-grid workflow-grid">
          <article className="tool-card primary-tool-card">
            <span className="section-kicker">Primary path</span>
            <h3>My Expenses</h3>
            <p>Track your expense reports and submission statuses.</p>
            <Link className="solid-link" href="/tbr/my-expenses">Open my expenses</Link>
          </article>

          <article className="tool-card">
            <span className="section-kicker">Race entry</span>
            <h3>Races</h3>
            <p>Browse races and submit bills or receipts.</p>
            <Link className="ghost-link" href="/tbr/races">Browse races</Link>
          </article>
        </section>

        <section className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Current seasons</span>
              <h3>Jump straight into a race</h3>
            </div>
            <Link className="ghost-link" href="/tbr/races">Open race browser</Link>
          </div>
          <div className="season-grid compact-season-grid">
            {seasons.map((season) => (
              <Link className="season-card compact-season-card" href={`/tbr/races?season=${season.seasonYear}`} key={season.seasonYear}>
                <div className="season-card-top">
                  <span className="season-tag">{season.seasonLabel}</span>
                  <span className="pill subtle-pill">{season.status}</span>
                </div>
                <div className="season-metrics">
                  <div>
                    <span>Races</span>
                    <strong>{season.raceCount}</strong>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const dashboard = await getEntityDashboard("TBR");
  const trendRows = toChartData(dashboard.trend);
  const costBridgeRows: ChartDatum[] = dashboard.trend.map((row) => ({
    name: row.name,
    value: -(row.cost ?? row.value),
    displayValue: row.sublabel ?? row.displayValue,
    tone: "ruby"
  }));

  return (
    <div className="page-grid lsc-dashboard-page">
      <section className="workspace-header command-header">
        <div className="workspace-header-left">
          <span className="section-kicker">TBR command center</span>
          <h3>{dashboard.title}</h3>
          <p className="muted">{dashboard.subtitle}</p>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            {dashboard.links.slice(0, 4).map((link) => (
              <Link className="segment-chip" href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="analytics-kpi-grid">
        {dashboard.metrics.map((metric, index) => {
          const Icon = metricIcons[index] ?? CircleDollarSign;
          return (
            <MetricTile
              helper={metric.helper}
              icon={Icon}
              key={metric.label}
              label={metric.label}
              tone={metric.tone}
              value={metric.value}
            />
          );
        })}
      </section>

      <section className="lsc-dashboard-hero-grid">
        <Panel
          className="dashboard-chart-panel dashboard-primary-chart"
          title="Season revenue, cost, and EBITDA"
          subtitle="TBR overview now uses the backend season P&L view rather than generic expense rows."
          trailing={<span className="badge">Backend cost source active</span>}
        >
          <FinanceTrendChart
            data={trendRows}
            height={305}
            series={[
              { key: "revenue", label: "Revenue", tone: "good" },
              { key: "cost", label: "Cost", tone: "ruby" },
              { key: "margin", label: "EBITDA", tone: "brand" }
            ]}
          />
        </Panel>

        <div className="lsc-dashboard-side-stack">
          {dashboard.insights.map((insight) => (
            <MetricTile
              helper={insight.summary}
              icon={insight.tone === "amber" ? AlertTriangle : insight.tone === "good" ? TrendingUp : Flag}
              key={insight.title}
              label={insight.title}
              tone={insight.tone}
              value=""
            />
          ))}
        </div>
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title="Operating baseline category mix"
          subtitle="Financial Plan control rows, including spare-parts sensitivity."
        >
          <StatusDonutChart data={dashboard.primaryMix} height={255} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="E1 ledger status"
          subtitle="Paid, due, credit, and incremental visibility from E1 accounting."
        >
          <StatusDonutChart data={dashboard.statusMix} height={255} />
        </Panel>
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title="Season cost bridge"
          subtitle="Costs are visible from TBR operating baseline and E1 variance/incremental rows."
        >
          <WaterfallBridgeChart data={costBridgeRows} height={280} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="Season cost comparison"
          subtitle={dashboard.policyNote}
        >
          <HorizontalComparisonChart data={dashboard.secondaryMix} height={280} />
        </Panel>
      </section>

      <section className="card-grid">
        {dashboard.links.map((link) => (
          <Link className="card" href={link.href} key={link.href}>
            <div className="card-title-row">
              <div>
                <span className="section-kicker">TBR module</span>
                <h3>{link.label}</h3>
              </div>
              <span className="ghost-link">Open</span>
            </div>
            <p className="muted">{link.helper}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
