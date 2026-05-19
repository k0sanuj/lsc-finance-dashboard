import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CircleDollarSign,
  CreditCard,
  FileStack,
  Scale,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import {
  getDocumentAnalysisDetail,
  getDocumentAnalysisQueue,
  getDocumentExtractedFields,
  getDocumentPostingEvents,
  getEntityDashboard,
  getTbrRaceCards,
  getTbrSeasonCostCategories,
  getTbrSeasonSummaries
} from "@lsc/db";
import { HorizontalComparisonChart, StatusDonutChart, type ChartDatum } from "../../components/lsc-dashboard-charts";
import { MetricTile, Panel } from "../../components/lsc-blue-primitives";
import { CompanyWorkspaceShell } from "../../components/company-workspace-shell";
import { DocumentAnalyzerPanel } from "../../components/document-analyzer-panel";
import { DocumentAnalysisSummary } from "../../components/document-analysis-summary";
import { ModalLauncher } from "../../components/modal-launcher";
import { requireRole } from "../../../lib/auth";
import { buildCompanyPath, formatSharedCompanyName, isSharedCompanyCode } from "../../lib/shared-workspace";
import { formatWorkflowContextLabel } from "../../lib/workflow-labels";

type CostCompanyPageProps = {
  params: Promise<{
    company: string;
  }>;
  searchParams?: Promise<{
    view?: string;
    season?: string;
    race?: string;
    status?: string;
    message?: string;
    analysisRunId?: string;
  }>;
};

type CostQueueRow = {
  id?: string;
  intakeEventId?: string;
  documentName: string;
  documentType: string;
  status: string;
  createdAt?: string;
  workflowContext?: string;
  intakeStatus?: string;
  intakeCategory?: string;
  updateSummary?: string;
};

const workstreams = [
  {
    key: "overview",
    title: "Cost overview",
    description: "Total spend, concentration, and top cost drivers.",
    badge: "Step 1"
  },
  {
    key: "breakdown",
    title: "Detailed breakdown",
    description: "Category and race cost tables.",
    badge: "Step 2"
  },
  {
    key: "analysis",
    title: "Cost analyzer",
    description: "Source-backed documents and extracted fields.",
    badge: "Step 3"
  }
] as const;

function parseCurrency(value: string) {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

function isCostSupportWorkflow(workflowContext?: string) {
  const workflow = String(workflowContext ?? "").toLowerCase();
  return workflow === "costs" || workflow.startsWith("tbr-race:") || workflow.includes("expense");
}

export default async function CostCompanyPage({ params, searchParams }: CostCompanyPageProps) {
  const session = await requireRole(["super_admin", "finance_admin", "viewer"]);
  const routeParams = await params;
  const resolvedCompany = routeParams.company?.toUpperCase();
  if (!isSharedCompanyCode(resolvedCompany)) {
    notFound();
  }

  const companyCode = resolvedCompany;
  const pageParams = searchParams ? await searchParams : undefined;
  const selectedView = workstreams.some((item) => item.key === pageParams?.view)
    ? (pageParams?.view as (typeof workstreams)[number]["key"])
    : "overview";
  const selectedAnalysisRunId = pageParams?.analysisRunId ?? undefined;
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;

  const [entityDashboard, seasons] = await Promise.all([
    getEntityDashboard(companyCode),
    companyCode === "TBR" ? getTbrSeasonSummaries() : Promise.resolve([])
  ]);

  const selectedSeason =
    Number(pageParams?.season) || seasons.at(-1)?.seasonYear || seasons[0]?.seasonYear || 2025;
  const selectedSeasonSummary =
    seasons.find((season) => season.seasonYear === selectedSeason) ?? seasons.at(-1) ?? null;

  if (companyCode !== "TBR") {
    const metricIcons = [CircleDollarSign, TrendingDown, Scale, CreditCard, FileStack, AlertTriangle] as const;
    const costMetricRows = entityDashboard.metrics.filter((metric) =>
      /cost|invoice|committed|paid|upcoming|payout|scenario|worker|active/i.test(metric.label)
    );
    const metrics = costMetricRows.length >= 3 ? costMetricRows : entityDashboard.metrics;
    const exposureRows: ChartDatum[] = entityDashboard.primaryMix.map((row) => ({ ...row }));
    const statusRows: ChartDatum[] = entityDashboard.statusMix.map((row) => ({ ...row }));
    const secondaryRows: ChartDatum[] = entityDashboard.secondaryMix.map((row) => ({ ...row }));

    return (
      <div className="page-grid lsc-dashboard-page">
        <CompanyWorkspaceShell
          basePath="/costs"
          companyCode={companyCode}
          description={`${formatSharedCompanyName(companyCode)} cost workspace.`}
          eyebrow={`${companyCode} costs`}
          selectedView={selectedView}
          title={`${formatSharedCompanyName(companyCode)} cost workspace`}
          workstreams={workstreams}
        />

        {selectedView === "overview" ? (
          <>
            <section className="analytics-kpi-grid">
              {metrics.slice(0, 6).map((metric, index) => {
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

            <section className="lsc-dashboard-two-one-grid">
              <Panel
                className="dashboard-chart-panel"
                title={`${formatSharedCompanyName(companyCode)} cost exposure`}
                subtitle={entityDashboard.policyNote}
                trailing={<span className="badge">Backend-derived</span>}
              >
                <HorizontalComparisonChart data={exposureRows} height={300} />
              </Panel>

              <Panel
                className="dashboard-chart-panel"
                title="Cost and invoice status mix"
                subtitle="Committed, paid, scenario, or support state depending on entity policy."
              >
                <StatusDonutChart data={statusRows} height={255} />
              </Panel>
            </section>

            <section className="lsc-dashboard-two-one-grid">
              <Panel
                className="dashboard-chart-panel"
                title="Operating context"
                subtitle="Cost dashboard now mirrors the entity command center with backend-routed sources."
              >
                <HorizontalComparisonChart data={secondaryRows} height={285} />
              </Panel>

              <Panel
                className="dashboard-chart-panel"
                title="Cost insights"
                subtitle="Entity-specific guidance from approved services."
              >
                <div className="dashboard-signal-list">
                  {entityDashboard.insights.map((insight) => (
                    <div className="process-step" key={insight.title}>
                      <span className={`process-step-index tone-${insight.tone}`}>{insight.tone}</span>
                      <strong>{insight.title}</strong>
                      <span className="muted">{insight.summary}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </>
        ) : null}

        {selectedView === "breakdown" ? (
          <section className="grid-two">
            <article className="card compact-section-card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Cost / exposure rows</span>
                  <h3>{formatSharedCompanyName(companyCode)} breakdown</h3>
                </div>
                <span className="pill">{exposureRows.length} rows</span>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Amount</th>
                      <th>Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exposureRows.map((row) => (
                      <tr key={row.name}>
                        <td><strong>{row.name}</strong></td>
                        <td>{row.displayValue}</td>
                        <td>{row.sublabel ?? entityDashboard.policyNote}</td>
                      </tr>
                    ))}
                    {exposureRows.length === 0 ? (
                      <tr>
                        <td className="muted" colSpan={3}>No backend-derived cost rows are available for this entity yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card compact-section-card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Linked modules</span>
                  <h3>Open source workspaces</h3>
                </div>
              </div>
              <div className="card-grid">
                {entityDashboard.links.map((link) => (
                  <Link className="card" href={link.href} key={link.href}>
                    <strong>{link.label}</strong>
                    <span className="muted">{link.helper}</span>
                  </Link>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {selectedView === "analysis" ? (
          <section className="card compact-section-card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Source-backed analysis</span>
                <h3>{formatSharedCompanyName(companyCode)} cost support</h3>
              </div>
              <Link className="ghost-link" href={`/documents/${companyCode}?view=expense-support` as Route}>
                Open documents
              </Link>
            </div>
            <p className="muted">
              Cost support should enter through the shared document and AI intake workflow, then post into canonical tables or entity-specific control views.
            </p>
          </section>
        ) : null}
      </div>
    );
  }

  const [costCategories, seasonRaceCards, queue, documentDetail, documentFields, postingEvents] =
    (await Promise.all([
      getTbrSeasonCostCategories(selectedSeason),
      getTbrRaceCards(selectedSeason),
      getDocumentAnalysisQueue(session.id),
      selectedAnalysisRunId ? getDocumentAnalysisDetail(selectedAnalysisRunId, session.id) : Promise.resolve(null),
      selectedAnalysisRunId ? getDocumentExtractedFields(selectedAnalysisRunId) : Promise.resolve([]),
      selectedAnalysisRunId ? getDocumentPostingEvents(selectedAnalysisRunId) : Promise.resolve([])
    ])) as [
      Awaited<ReturnType<typeof getTbrSeasonCostCategories>>,
      Awaited<ReturnType<typeof getTbrRaceCards>>,
      CostQueueRow[],
      Awaited<ReturnType<typeof getDocumentAnalysisDetail>>,
      Awaited<ReturnType<typeof getDocumentExtractedFields>>,
      Awaited<ReturnType<typeof getDocumentPostingEvents>>
    ];

  const categoryRows = [...costCategories].sort((left, right) => parseCurrency(right.amount) - parseCurrency(left.amount));
  const raceRows = [...seasonRaceCards].sort(
    (left, right) => parseCurrency(right.totalCost) - parseCurrency(left.totalCost)
  );
  const requestedRaceId = pageParams?.race ?? null;
  const selectedRaceId =
    requestedRaceId && seasonRaceCards.some((race) => race.id === requestedRaceId)
      ? requestedRaceId
      : seasonRaceCards[0]?.id ?? null;
  const selectedRace = selectedRaceId
    ? seasonRaceCards.find((race) => race.id === selectedRaceId) ?? null
    : null;
  const categoryChartRows: ChartDatum[] = categoryRows.slice(0, 8).map((row) => ({
    name: row.name,
    value: parseCurrency(row.amount),
    displayValue: row.amount,
    sublabel: row.description,
    tone: row.name.toLowerCase().includes("spare") ? "ruby" : "brand"
  }));
  const raceChartRows: ChartDatum[] = raceRows.slice(0, 8).map((row) => ({
    name: row.name,
    value: parseCurrency(row.totalCost),
    displayValue: row.totalCost,
    sublabel: `${row.eventInvoices} invoices · ${row.reimbursements} reimbursements`,
    tone: parseCurrency(row.totalCost) > 0 ? "good" : "slate"
  }));
  const tbrMetricIcons = [CircleDollarSign, TrendingDown, Scale, CreditCard, FileStack, AlertTriangle] as const;
  const seasonWideQueue = queue.filter((item) => {
    const workflow = String(item.workflowContext ?? "").toLowerCase();
    return isCostSupportWorkflow(item.workflowContext) && workflow === "costs";
  });
  const selectedRaceQueue = selectedRaceId
    ? queue.filter((item) =>
        String(item.workflowContext ?? "")
          .toLowerCase()
          .includes(selectedRaceId.toLowerCase())
      )
    : [];
  const topCategory = categoryRows[0] ?? null;
  const topRace = raceRows[0] ?? null;
  const seasonInsight = {
    title: topCategory
      ? `${topCategory.name} is the biggest cost bucket in ${selectedSeasonSummary?.seasonLabel ?? `Season ${selectedSeason}`}`
      : `No approved reimbursement categories are active in ${selectedSeasonSummary?.seasonLabel ?? `Season ${selectedSeason}`}`,
    summary: topCategory
      ? `${topCategory.amount} is currently the strongest category signal inside the selected season.`
      : "Once season-linked reimbursement rows are approved, this section should call out the dominant bucket."
  };

  return (
    <div className="page-grid">
      <CompanyWorkspaceShell
        basePath="/costs"
        companyCode={companyCode}
        description="TBR cost workspace across seasons and races."
        eyebrow="TBR costs"
        selectedView={selectedView}
        title="Team Blue Rising cost workspace"
        workstreams={workstreams}
        preservedParams={{
          season: String(selectedSeason),
          race: selectedRaceId ?? undefined
        }}
      />

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="section">
        <div className="section-headline">
          <div>
            <span className="section-kicker">Season switcher</span>
            <h3>Pick the TBR season first</h3>
          </div>
          <span className="pill">
            {selectedSeasonSummary?.seasonLabel ?? `Season ${selectedSeason}`} · {selectedSeasonSummary?.status ?? "In progress"}
          </span>
        </div>
        <div className="segment-row">
          {seasons.map((season) => (
            <Link
              className={`segment-chip ${season.seasonYear === selectedSeason ? "active" : ""}`}
              href={buildCompanyPath("/costs", "TBR", {
                view: selectedView,
                season: String(season.seasonYear)
              }) as Route}
              key={season.seasonYear}
            >
              {season.seasonLabel}
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-headline">
          <div>
            <span className="section-kicker">Race drilldown</span>
            <h3>Choose one race inside the selected season</h3>
          </div>
          <span className="pill">
            {selectedRace ? `${selectedRace.name} · ${selectedRace.countryName}` : "No race selected"}
          </span>
        </div>
        <div className="segment-row">
          {seasonRaceCards.map((race) => (
            <Link
              className={`segment-chip ${race.id === selectedRaceId ? "active" : ""}`}
              href={buildCompanyPath("/costs", "TBR", {
                view: selectedView,
                season: String(selectedSeason),
                race: race.id
              }) as Route}
              key={race.id}
            >
              {race.countryFlag} {race.name}
            </Link>
          ))}
        </div>
      </section>

      {selectedView === "overview" ? (
        <>
          <section className="analytics-kpi-grid">
            {entityDashboard.metrics.slice(0, 6).map((metric, index) => {
              const Icon = tbrMetricIcons[index] ?? CircleDollarSign;
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

          <section className="lsc-dashboard-two-one-grid">
            <Panel
              className="dashboard-chart-panel"
              title="Category concentration"
              subtitle="Approved expenses plus E1 cost-module lines inside the selected season."
              trailing={<span className="pill">{selectedSeasonSummary?.seasonLabel ?? `Season ${selectedSeason}`}</span>}
            >
              <StatusDonutChart data={categoryChartRows} height={255} />
            </Panel>

            <Panel
              className="dashboard-chart-panel"
              title="Race and event cost view"
              subtitle="Race-linked cost rows stay below the season-level operating baseline."
            >
              <HorizontalComparisonChart data={raceChartRows} height={285} />
            </Panel>
          </section>

          <Panel
            className="dashboard-chart-panel"
            title={seasonInsight.title}
            subtitle={seasonInsight.summary}
            trailing={<span className="pill">Context aware</span>}
          >
            <HorizontalComparisonChart data={entityDashboard.secondaryMix} height={250} />
          </Panel>
        </>
      ) : null}

      {selectedView === "breakdown" ? (
        <>
          <section className="grid-two">
            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Race breakdown</span>
                  <h3>{selectedSeasonSummary?.seasonLabel ?? `Season ${selectedSeason}`} race cards</h3>
                </div>
                <span className="pill">{selectedRace ? `Selected: ${selectedRace.name}` : "Pick one race"}</span>
              </div>
              <div className="race-grid">
                {seasonRaceCards.map((race) => (
                  <Link
                    className={`race-card ${race.id === selectedRaceId ? "active" : ""}`}
                    href={buildCompanyPath("/costs", "TBR", {
                      view: "breakdown",
                      season: String(selectedSeason),
                      race: race.id
                    }) as Route}
                    key={race.id}
                  >
                    <div className="race-card-top">
                      <div>
                        <span className="section-kicker">Race</span>
                        <h3>{race.name}</h3>
                      </div>
                      <span className="flag-pill">
                        <span>{race.countryFlag}</span>
                        <span>{race.countryName}</span>
                      </span>
                    </div>
                    <p>{race.location}</p>
                    <div className="race-metrics compact-race-metrics">
                      <div>
                        <span>Event invoices</span>
                        <strong>{race.eventInvoices}</strong>
                      </div>
                      <div>
                        <span>Reimbursements</span>
                        <strong>{race.reimbursements}</strong>
                      </div>
                      <div>
                        <span>Total cost</span>
                        <strong>{race.totalCost}</strong>
                      </div>
                      <div>
                        <span>Open payables</span>
                        <strong>{race.openPayables}</strong>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {selectedRace ? (
                <div className="card compact-section-card">
                  <div className="card-title-row">
                    <div>
                      <span className="section-kicker">Selected race</span>
                      <h3>{selectedRace.name}</h3>
                    </div>
                    <span className="flag-pill">
                      <span>{selectedRace.countryFlag}</span>
                      <span>{selectedRace.countryName}</span>
                    </span>
                  </div>
                  <div className="mini-metric-grid">
                    <div className="mini-metric">
                      <span>Total cost</span>
                      <strong>{selectedRace.totalCost}</strong>
                    </div>
                    <div className="mini-metric">
                      <span>Event invoices</span>
                      <strong>{selectedRace.eventInvoices}</strong>
                    </div>
                    <div className="mini-metric">
                      <span>Reimbursements</span>
                      <strong>{selectedRace.reimbursements}</strong>
                    </div>
                    <div className="mini-metric">
                      <span>Open payables</span>
                      <strong>{selectedRace.openPayables}</strong>
                    </div>
                    <div className="mini-metric">
                      <span>Recognized revenue</span>
                      <strong>{selectedRace.recognizedRevenue}</strong>
                    </div>
                    <div className="mini-metric">
                      <span>Pending support</span>
                      <strong>{selectedRace.pendingReceipts}</strong>
                    </div>
                  </div>
                  <div className="inline-actions">
                    <Link className="ghost-link" href={`/tbr/races/${selectedRace.id}` as Route}>
                      Open race workflow
                    </Link>
                  </div>
                </div>
              ) : null}
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Category breakdown</span>
                  <h3>Approved reimbursement categories in the selected season</h3>
                </div>
                <span className="pill">Season categories</span>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Total</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.length > 0 ? (
                      categoryRows.map((category) => (
                        <tr key={category.name}>
                          <td>{category.name}</td>
                          <td>{category.amount}</td>
                          <td>{category.description}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="muted" colSpan={3}>
                          No season-linked reimbursement categories are approved yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="card compact-section-card">
            <div className="card-title-row">
              <div>
                <strong>{seasonInsight.title}</strong>
              </div>
            </div>
            <span className="muted">{seasonInsight.summary}</span>
          </section>
        </>
      ) : null}

      {selectedView === "analysis" ? (
        <>
          <section className="grid-two">
            <article className="card compact-section-card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Cost analyzer</span>
                  <h3>Analyze TBR cost support</h3>
                </div>
                <span className="pill">Source-backed</span>
              </div>
              <div className="inline-actions">
                <ModalLauncher
                  triggerLabel="Open analyzer"
                  title="Analyze TBR cost support"
                  description="Upload cost-side support and keep the run inside the TBR cost-analysis workspace."
                  eyebrow="Cost analyzer"
                >
                  <DocumentAnalyzerPanel
                    companyCode="TBR"
                    description={
                      selectedRace
                        ? `Upload cost-side support for ${selectedRace.name} and keep the run inside the selected race cost workflow.`
                        : "Upload cost-side support and keep the run inside the TBR cost workspace."
                    }
                    notePlaceholder="Example: Monaco reimbursement bundle or vendor bill for race operations."
                    redirectPath={buildCompanyPath("/costs", "TBR", {
                      view: "analysis",
                      season: String(selectedSeason),
                      race: selectedRaceId ?? undefined
                    })}
                    title={selectedRace ? `Analyze ${selectedRace.name} cost support` : "Analyze TBR cost support"}
                    workflowContext={
                      selectedRace ? `tbr-race:${selectedRace.id}:expense-bills` : "costs"
                    }
                    workflowTag="Source-backed intake"
                    variant="plain"
                  />
                </ModalLauncher>
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Queue</span>
                  <h3>
                    {selectedRace ? `${selectedRace.name} cost-support documents` : "TBR cost-support documents"}
                  </h3>
                </div>
                <span className="pill">
                  {selectedRace ? selectedRaceQueue.length : seasonWideQueue.length} runs
                </span>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th>Updates</th>
                      <th>When</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRace ? selectedRaceQueue : seasonWideQueue).length > 0 ? (
                      (selectedRace ? selectedRaceQueue : seasonWideQueue).map((item) => (
                        <tr key={item.intakeEventId ?? item.id}>
                          <td>
                            <Link
                              href={buildCompanyPath("/costs", "TBR", {
                                view: "analysis",
                                season: String(selectedSeason),
                                race: selectedRaceId ?? undefined,
                                analysisRunId: item.id
                              }) as Route}
                            >
                              {item.documentName}
                            </Link>
                          </td>
                          <td>{item.intakeCategory ?? "Unmapped"}</td>
                          <td>{item.documentType}</td>
                          <td>{item.updateSummary ?? formatWorkflowContextLabel(item.workflowContext)}</td>
                          <td>{item.createdAt}</td>
                          <td>
                            <span className="pill subtle-pill">{item.intakeStatus ?? item.status}</span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="muted" colSpan={6}>
                          {selectedRace
                            ? `No ${selectedRace.name} cost-support documents have been analyzed yet.`
                            : "No TBR cost-support documents have been analyzed yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          {selectedRace && seasonWideQueue.length > 0 ? (
            <section className="card compact-section-card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Season-wide support</span>
                  <h3>General cost runs for {selectedSeasonSummary?.seasonLabel ?? `Season ${selectedSeason}`}</h3>
                </div>
                <span className="pill">{seasonWideQueue.length} runs</span>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th>Updates</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonWideQueue.map((item) => (
                      <tr key={item.intakeEventId ?? item.id}>
                        <td>{item.documentName}</td>
                        <td>{item.intakeCategory ?? "Unmapped"}</td>
                        <td>{item.documentType}</td>
                        <td>{item.updateSummary ?? formatWorkflowContextLabel(item.workflowContext)}</td>
                        <td>{item.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {selectedAnalysisRunId ? (
            <DocumentAnalysisSummary
              detail={documentDetail}
              fields={documentFields}
              postingEvents={postingEvents}
              title={selectedRace ? `Selected ${selectedRace.name} cost analysis` : "Selected cost analysis run"}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
