import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "../../../lib/auth";
import { getFspPnlSummaries, getFspSports, getSportModuleCompleteness } from "@lsc/db";
import { HorizontalMetricBars, formatCompactCurrency } from "../../components/dashboard-charts";

const fallbackSports = [
  { id: "fb-1", sportCode: "basketball", displayName: "Basketball", leagueName: "FSP Basketball League", isActive: true },
  { id: "fb-2", sportCode: "bowling", displayName: "Bowling", leagueName: "World Bowling League", isActive: true },
  { id: "fb-3", sportCode: "squash", displayName: "Squash", leagueName: "FSP Squash Series", isActive: true },
  { id: "fb-4", sportCode: "world_pong", displayName: "World Pong", leagueName: "FSP World Pong Championship", isActive: false },
];

const emptyCompleteness = {
  pnlLineItems: 0,
  sponsorships: 0,
  sponsorshipsSigned: 0,
  mediaChannelsConfigured: 0,
  influencerTiers: 0,
  opexItems: 0,
  productionItems: 0,
  leagueRoles: 0,
  techRoles: 0,
  revenueShareRows: 0,
  hasEventConfig: false,
  hasAnyData: false,
};

function fmt(value: number) {
  return formatCompactCurrency(value);
}

function completenessScore(counts: Awaited<ReturnType<typeof getSportModuleCompleteness>>) {
  const modules = [
    counts.pnlLineItems > 0,
    counts.sponsorships > 0,
    counts.mediaChannelsConfigured > 0,
    counts.influencerTiers > 0,
    counts.opexItems > 0,
    counts.productionItems > 0,
    counts.leagueRoles > 0,
    counts.techRoles > 0,
    counts.revenueShareRows > 0,
    counts.hasEventConfig,
  ];
  return Math.round((modules.filter(Boolean).length / modules.length) * 100);
}

export default async function FspSportsPage(): Promise<React.ReactElement> {
  await requireRole(["super_admin", "finance_admin", "commercial_user", "viewer"]);

  const [dbSports, pnlSummaries] = await Promise.all([
    getFspSports(),
    getFspPnlSummaries("base"),
  ]);
  const sports = dbSports.length > 0 ? dbSports : fallbackSports;
  const pnlByCode = new Map(pnlSummaries.map((summary) => [summary.sportCode, summary]));
  const completeness = dbSports.length > 0
    ? await Promise.all(
        sports.map(async (sport) => ({
          sport,
          counts: await getSportModuleCompleteness(sport.id),
        }))
      )
    : sports.map((sport) => ({ sport, counts: emptyCompleteness }));

  const totalRevenue = pnlSummaries.reduce((sum, sport) => sum + sport.revenueY1, 0);
  const totalCost = pnlSummaries.reduce((sum, sport) => sum + sport.cogsY1 + sport.opexY1, 0);
  const totalEbitda = pnlSummaries.reduce((sum, sport) => sum + sport.ebitdaY1, 0);
  const activeSports = sports.filter((sport) => sport.isActive).length;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Future of Sports</span>
          <h3>Sports Asset Portfolio</h3>
          <p className="muted">Sport-level P&amp;L, sponsorship, media, production, and setup readiness.</p>
        </div>
        <div className="workspace-header-right">
          <Link className="ghost-link" href={"/fsp/consolidated" as Route}>
            Consolidated P&amp;L
          </Link>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline"><span className="metric-label">Sports</span></div>
          <div className="metric-value">{sports.length}</div>
          <span className="metric-subvalue">{activeSports} active</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline"><span className="metric-label">Y1 revenue</span></div>
          <div className="metric-value">{fmt(totalRevenue)}</div>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline"><span className="metric-label">Y1 cost</span></div>
          <div className="metric-value">{fmt(totalCost)}</div>
        </article>
        <article className={`metric-card ${totalEbitda >= 0 ? "accent-good" : "accent-risk"}`}>
          <div className="metric-topline"><span className="metric-label">Y1 EBITDA</span></div>
          <div className="metric-value">{fmt(totalEbitda)}</div>
        </article>
      </section>

      <section className="card-grid">
        {completeness.map(({ sport, counts }) => {
          const pnl = pnlByCode.get(sport.sportCode);
          const revenue = pnl?.revenueY1 ?? 0;
          const cost = (pnl?.cogsY1 ?? 0) + (pnl?.opexY1 ?? 0);
          const ebitda = pnl?.ebitdaY1 ?? 0;
          const score = completenessScore(counts);
          const openAssumptions = 100 - score;

          return (
            <Link className="card sport-asset-card" href={`/fsp/sports/${sport.sportCode}` as Route} key={sport.id}>
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">{sport.sportCode.replace(/_/g, " ")}</span>
                  <h3>{sport.displayName}</h3>
                  <span className="muted">{sport.leagueName}</span>
                </div>
                <span className={sport.isActive ? "signal-pill signal-good" : "signal-pill signal-warn"}>
                  {sport.isActive ? "Active" : "Planning"}
                </span>
              </div>

              <div className="entity-stats">
                <div><span>Revenue</span><strong>{fmt(revenue)}</strong></div>
                <div><span>Cost</span><strong>{fmt(cost)}</strong></div>
                <div><span>EBITDA</span><strong>{fmt(ebitda)}</strong></div>
              </div>

              <HorizontalMetricBars
                rows={[
                  { label: "Sponsorship pipeline", value: counts.sponsorships, displayValue: `${counts.sponsorships} records`, tone: "good" },
                  { label: "Media setup", value: counts.mediaChannelsConfigured, displayValue: `${counts.mediaChannelsConfigured} channels`, tone: "secondary" },
                  { label: "Production cost stack", value: counts.productionItems, displayValue: `${counts.productionItems} lines`, tone: "warn" },
                  { label: "Module completeness", value: score, displayValue: `${score}%`, tone: score >= 70 ? "good" : "warn" },
                ]}
              />

              <div className="inline-actions">
                <span className="pill">Open assumptions {openAssumptions}%</span>
                <span className="ghost-link">Open cockpit</span>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
