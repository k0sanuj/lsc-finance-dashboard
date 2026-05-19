import Link from "next/link";
import type { Route } from "next";
import { Bot, CircleDollarSign, Layers3, Scale } from "lucide-react";
import { requireRole } from "../../../lib/auth";
import { getAiIntakeQueue, getFspPnlSummaries, getFspSports, getSportModuleCompleteness } from "@lsc/db";
import { formatCompactCurrency } from "../../components/dashboard-charts";
import { HorizontalComparisonChart, StatusDonutChart, type ChartDatum } from "../../components/lsc-dashboard-charts";
import { MetricTile, Panel } from "../../components/lsc-blue-primitives";

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

  const [dbSports, pnlSummaries, aiDrafts] = await Promise.all([
    getFspSports(),
    getFspPnlSummaries("base"),
    getAiIntakeQueue({
      companyCode: "FSP",
      workflowContextPrefix: "fsp-sport:",
      limit: 8,
    }),
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
  const fspWithFinancials = pnlSummaries.filter(
    (sport) => sport.revenueY1 > 0 || sport.cogsY1 > 0 || sport.opexY1 > 0 || sport.ebitdaY1 !== 0
  );
  const activeSports = sports.filter((sport) => sport.isActive).length;
  const draftsNeedingReview = aiDrafts.filter((draft) => draft.status === "needs_review").length;
  const postedDrafts = aiDrafts.filter((draft) => draft.status === "posted").length;
  const mediaDrafts = aiDrafts.filter((draft) => draft.targetKind === "fsp_sport_media_kit").length;
  const sponsorshipDrafts = aiDrafts.filter((draft) => draft.targetKind === "fsp_sport_sponsorship_document").length;
  const portfolioRows: ChartDatum[] = [
    { name: "Y1 revenue", value: totalRevenue, displayValue: fmt(totalRevenue), tone: "good" },
    { name: "Y1 cost", value: totalCost, displayValue: fmt(totalCost), tone: "ruby" },
    { name: "Y1 EBITDA", value: Math.abs(totalEbitda), displayValue: fmt(totalEbitda), tone: totalEbitda >= 0 ? "good" : "ruby" },
  ];
  const sportMixRows: ChartDatum[] = pnlSummaries.slice(0, 8).map((sport) => ({
    name: sport.sportName,
    value: Math.abs(sport.ebitdaY1),
    displayValue: fmt(sport.ebitdaY1),
    sublabel: `Revenue ${fmt(sport.revenueY1)}`,
    tone: sport.ebitdaY1 >= 0 ? "good" : "ruby"
  }));
  const aiQueueRows: ChartDatum[] = [
    { name: "Needs preview", value: draftsNeedingReview, displayValue: String(draftsNeedingReview), tone: "amber" },
    { name: "Posted", value: postedDrafts, displayValue: String(postedDrafts), tone: "good" },
    { name: "Media kits", value: mediaDrafts, displayValue: String(mediaDrafts), tone: "brand" },
    { name: "Sponsorship docs", value: sponsorshipDrafts, displayValue: String(sponsorshipDrafts), tone: "iris" },
  ];

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

      <section className="analytics-kpi-grid">
        <MetricTile icon={Layers3} label="Sports" value={sports.length} helper={`${activeSports} active`} tone="brand" />
        <MetricTile icon={CircleDollarSign} label="Y1 revenue" value={fmt(totalRevenue)} helper="Scenario base case" tone="good" />
        <MetricTile icon={CircleDollarSign} label="Y1 cost" value={fmt(totalCost)} helper="COGS + opex" tone="ruby" />
        <MetricTile icon={Scale} label="Y1 EBITDA" value={fmt(totalEbitda)} helper="Portfolio scenario result" tone={totalEbitda >= 0 ? "good" : "ruby"} />
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title="Portfolio financial shape"
          subtitle="Revenue, cost, and EBITDA from FSP base scenario."
          trailing={<span className="badge">{fspWithFinancials.length} modeled</span>}
        >
          <StatusDonutChart data={portfolioRows} height={245} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="Sport asset EBITDA"
          subtitle="Ranked sport mix by Y1 EBITDA."
          trailing={<Link className="ghost-link" href={"/fsp/consolidated" as Route}>Consolidated P&L</Link>}
        >
          <HorizontalComparisonChart data={sportMixRows} height={285} />
        </Panel>
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title="Sports documents waiting for approval"
          subtitle="AI queue by intake state and source type."
          trailing={<span className="badge">{aiDrafts.length} recent drafts</span>}
        >
          <StatusDonutChart data={aiQueueRows} height={245} />
        </Panel>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Recent AI drafts</span>
              <h3>Approval queue by sport</h3>
            </div>
          </div>
          {aiDrafts.length === 0 ? (
            <p className="muted">Open a sport cockpit to upload a media kit, sponsorship deck, contract, or budget support document.</p>
          ) : (
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {aiDrafts.slice(0, 5).map((draft) => {
                    const sport = sports.find((entry) => entry.id === draft.targetEntityId);
                    const href = sport
                      ? `/fsp/sports/${sport.sportCode}?tab=overview&aiDraftId=${draft.id}`
                      : `/documents/FSP?aiDraftId=${draft.id}`;

                    return (
                      <tr key={draft.id}>
                        <td>{draft.sourceName}</td>
                        <td>{draft.targetKind.replace(/_/g, " ")}</td>
                        <td><span className="pill">{draft.status.replace(/_/g, " ")}</span></td>
                        <td>
                          <Link className="ghost-link" href={href as Route}>
                            Open preview
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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

              <HorizontalComparisonChart
                height={160}
                data={[
                  { name: "Sponsorship", value: counts.sponsorships, displayValue: `${counts.sponsorships} records`, tone: "good" },
                  { name: "Media", value: counts.mediaChannelsConfigured, displayValue: `${counts.mediaChannelsConfigured} channels`, tone: "brand" },
                  { name: "Production", value: counts.productionItems, displayValue: `${counts.productionItems} lines`, tone: "amber" },
                  { name: "Completeness", value: score, displayValue: `${score}%`, tone: score >= 70 ? "good" : "amber" },
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
