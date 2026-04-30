import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCostInsights,
  getDocumentAnalysisDetail,
  getDocumentAnalysisQueue,
  getDocumentExtractedFields,
  getDocumentPostingEvents,
  getEntitySnapshots,
  getTbrRaceCards,
  getTbrSeasonCostCategories,
  getTbrSeasonSummaries
} from "@lsc/db";
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

  const costInsightCompany = companyCode === "FSP" ? "FSP" : "TBR";
  const [entitySnapshots, costInsights, seasons] = await Promise.all([
    getEntitySnapshots(),
    getCostInsights(costInsightCompany),
    companyCode === "TBR" ? getTbrSeasonSummaries() : Promise.resolve([])
  ]);

  const selectedSeason =
    Number(pageParams?.season) || seasons.at(-1)?.seasonYear || seasons[0]?.seasonYear || 2025;
  const selectedSeasonSummary =
    seasons.find((season) => season.seasonYear === selectedSeason) ?? seasons.at(-1) ?? null;

  if (companyCode !== "TBR") {
    return (
      <div className="page-grid">
        <CompanyWorkspaceShell
          basePath="/costs"
          companyCode={companyCode}
          description={`${formatSharedCompanyName(companyCode)} cost workspace.`}
          eyebrow={`${companyCode} costs`}
          selectedView={selectedView}
          title={`${formatSharedCompanyName(companyCode)} cost workspace`}
          workstreams={workstreams}
        />

        <section className="grid-two">
          <article className="card placeholder-card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Selected company</span>
                <h3>{formatSharedCompanyName(companyCode)} cost records will appear once canonical costs exist</h3>
              </div>
              <span className="badge">Placeholder</span>
            </div>
          </article>
          {costInsights.length > 0 ? (
            <article className="card compact-section-card">
              <div className="card-title-row">
                <div>
                  <strong>{costInsights[0].title}</strong>
                </div>
              </div>
              <span className="muted">{costInsights[0].summary}</span>
            </article>
          ) : null}
        </section>
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
  const chartCategories = categoryRows.slice(0, 6);
  const chartRaces = raceRows.slice(0, 6);
  const categoryMax = Math.max(1, ...chartCategories.map((row) => parseCurrency(row.amount)));
  const raceMax = Math.max(1, ...chartRaces.map((row) => parseCurrency(row.totalCost)));
  const reimbursementTotal = raceRows.reduce((sum, row) => sum + parseCurrency(row.reimbursements), 0);
  const eventInvoiceTotal = raceRows.reduce((sum, row) => sum + parseCurrency(row.eventInvoices), 0);
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
          <section className="stats-grid compact-stats">
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">{selectedSeasonSummary?.seasonLabel ?? `Season ${selectedSeason}`}</span>
                <span className="badge">Season cost</span>
              </div>
              <div className="metric-value">{selectedSeasonSummary?.cost ?? "$0"}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Season revenue</span>
                <span className="badge">Recognized</span>
              </div>
              <div className="metric-value">{selectedSeasonSummary?.revenue ?? "$0"}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Open payables</span>
                <span className="badge">Season due</span>
              </div>
              <div className="metric-value">{selectedSeasonSummary?.openPayables ?? "$0"}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Race count</span>
                <span className="badge">Season scope</span>
              </div>
              <div className="metric-value">{selectedSeasonSummary?.raceCount ?? "0"}</div>
            </article>
          </section>

          <section className="grid-two">
            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Cost charts</span>
                  <h3>Category concentration</h3>
                </div>
                <span className="pill">Top categories</span>
              </div>
              <div className="chart-list">
                {chartCategories.map((row) => (
                  <div className="chart-row" key={row.name}>
                    <div className="chart-meta">
                      <strong>{row.name}</strong>
                      <span>{row.amount}</span>
                    </div>
                    <div className="chart-track">
                      <div
                        className="chart-fill"
                        style={{ width: `${Math.max(8, (parseCurrency(row.amount) / categoryMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Race chart</span>
                  <h3>Highest race-cost events</h3>
                </div>
                <span className="pill">Race totals</span>
              </div>
              <div className="chart-list">
                {chartRaces.map((row) => (
                  <div className="chart-row" key={row.id}>
                    <div className="chart-meta">
                      <strong>{row.name}</strong>
                      <span>{row.totalCost}</span>
                    </div>
                    <div className="chart-track">
                      <div
                        className="chart-fill secondary"
                        style={{ width: `${Math.max(8, (parseCurrency(row.totalCost) / raceMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="card">
            <div className="card-title-row">
              <div>
                <strong>{seasonInsight.title}</strong>
              </div>
              <span className="pill">Context aware</span>
            </div>
            <span className="muted">{seasonInsight.summary}</span>
          </section>
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
