import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCommercialGoals,
  getDocumentAnalysisDetail,
  getDocumentAnalysisQueue,
  getDocumentExtractedFields,
  getDocumentPostingEvents,
  getPartnerPerformance
} from "@lsc/db";
import { CompanyWorkspaceShell } from "../../components/company-workspace-shell";
import { DocumentAnalysisSummary } from "../../components/document-analysis-summary";
import { DocumentAnalyzerPanel } from "../../components/document-analyzer-panel";
import { ModalLauncher } from "../../components/modal-launcher";
import { requireRole } from "../../../lib/auth";
import {
  buildCompanyPath,
  formatDocumentWorkflowForSelection,
  isSharedCompanyCode
} from "../../lib/shared-workspace";
import { formatWorkflowContextLabel } from "../../lib/workflow-labels";

type CommercialGoalsCompanyPageProps = {
  params: Promise<{
    company: string;
  }>;
  searchParams?: Promise<{
    view?: string;
    status?: string;
    message?: string;
    analysisRunId?: string;
  }>;
};

type QueueRow = {
  id?: string;
  intakeEventId?: string;
  documentName: string;
  documentType: string;
  status: string;
  proposedTarget: string;
  createdAt?: string;
  workflowContext?: string;
  intakeStatus?: string;
  intakeCategory?: string;
  updateSummary?: string;
};

const workstreams = [
  {
    key: "snapshot",
    title: "Snapshot",
    description: "Company pace and commercial gap.",
    badge: "Step 1"
  },
  {
    key: "targets",
    title: "Target path",
    description: "Monthly target table.",
    badge: "Step 2"
  },
  {
    key: "owners",
    title: "Owner accountability",
    description: "Owner performance against the plan.",
    badge: "Step 3"
  },
  {
    key: "source-docs",
    title: "Source documents",
    description: "Sponsorship and prize document intake.",
    badge: "Step 4"
  }
] as const;

function parseCurrency(value: string) {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

export default async function CommercialGoalsCompanyPage({
  params,
  searchParams
}: CommercialGoalsCompanyPageProps) {
  await requireRole(["super_admin", "finance_admin", "commercial_user"]);
  const routeParams = await params;
  const resolvedCompany = routeParams.company?.toUpperCase();
  if (!isSharedCompanyCode(resolvedCompany)) {
    notFound();
  }

  const companyCode = resolvedCompany;
  const pageParams = searchParams ? await searchParams : undefined;
  const selectedView = workstreams.some((item) => item.key === pageParams?.view)
    ? (pageParams?.view as (typeof workstreams)[number]["key"])
    : "snapshot";
  const selectedAnalysisRunId = pageParams?.analysisRunId ?? undefined;
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;

  if (companyCode === "FSP") {
    return (
      <div className="page-grid">
        <CompanyWorkspaceShell
          basePath="/commercial-goals"
          companyCode={companyCode}
          description="FSP commercial workspace — no live targets yet."
          eyebrow="FSP commercial"
          selectedView={selectedView}
          title="Future of Sports commercial workspace"
          workstreams={workstreams}
        />
        <section className="grid-two">
          <article className="card placeholder-card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Selected company</span>
                <h3>FSP commercial targets will appear once launch planning is active</h3>
              </div>
              <span className="badge">Placeholder</span>
            </div>
          </article>
        </section>
      </div>
    );
  }

  const [commercialGoals, partnerPerformance, queue, detail, fields, postingEvents] = await Promise.all([
    getCommercialGoals(),
    getPartnerPerformance(),
    getDocumentAnalysisQueue(),
    selectedAnalysisRunId ? getDocumentAnalysisDetail(selectedAnalysisRunId) : Promise.resolve(null),
    selectedAnalysisRunId ? getDocumentExtractedFields(selectedAnalysisRunId) : Promise.resolve([]),
    selectedAnalysisRunId ? getDocumentPostingEvents(selectedAnalysisRunId) : Promise.resolve([])
  ]);
  const commercialQueue = (queue as QueueRow[]).filter((item) => {
    const workflow = String(item.workflowContext ?? "").toLowerCase();
    return (
      workflow.includes(`commercial-goals:${companyCode.toLowerCase()}`) ||
      workflow.includes(`documents:${companyCode.toLowerCase()}:commercial-docs`) ||
      formatDocumentWorkflowForSelection(item.workflowContext, item.proposedTarget, item.documentType) ===
        "commercial-docs"
    );
  });

  const totalTarget = commercialGoals.reduce(
    (sum, row) => sum + parseCurrency(row.target),
    0
  );
  const totalActual = commercialGoals.reduce(
    (sum, row) => sum + parseCurrency(row.actual),
    0
  );
  const totalGap = totalTarget - totalActual;
  const targetRows = commercialGoals.map((row) => ({
    ...row,
    targetValue: parseCurrency(row.target),
    actualValue: parseCurrency(row.actual),
    gapValue: parseCurrency(row.gap)
  }));
  const targetMax = Math.max(
    1,
    ...targetRows.flatMap((row) => [row.targetValue, row.actualValue])
  );
  const strongestOwner = [...partnerPerformance].sort(
    (left, right) =>
      parseCurrency(right.closedRevenue) - parseCurrency(left.closedRevenue)
  )[0] ?? null;
  const strongestMonth = [...targetRows].sort((left, right) => right.actualValue - left.actualValue)[0] ?? null;
  const commercialInsight = {
    title: strongestMonth
      ? `${strongestMonth.month} is currently the strongest closing month`
      : "No closed commercial month is leading yet",
    summary: strongestMonth
      ? `${strongestMonth.actual} is currently the best closed month against the plan.`
      : "As target rows fill in, this section should call out the strongest pacing period."
  };

  return (
    <div className="page-grid">
      <CompanyWorkspaceShell
        basePath="/commercial-goals"
        companyCode={companyCode}
        description="TBR commercial workspace across targets, owners, and source documents."
        eyebrow="TBR commercial"
        selectedView={selectedView}
        title="Team Blue Rising commercial workspace"
        workstreams={workstreams}
      />

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      {selectedView === "snapshot" ? (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Annual target</span>
                <span className="badge">TBR</span>
              </div>
              <div className="metric-value">${totalTarget.toLocaleString("en-US")}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Closed value</span>
                <span className="badge">Actual</span>
              </div>
              <div className="metric-value">${totalActual.toLocaleString("en-US")}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Remaining gap</span>
                <span className="badge">To close</span>
              </div>
              <div className="metric-value">${totalGap.toLocaleString("en-US")}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Lead owner</span>
                <span className="badge">Accountability</span>
              </div>
              <div className="metric-value">{strongestOwner?.owner ?? "TBD"}</div>
              <div className="metric-subvalue">{strongestOwner?.closedRevenue ?? "$0"} currently leads the board.</div>
            </article>
          </section>

          <section className="grid-two">
            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Commercial chart</span>
                  <h3>Target versus actual by month</h3>
                </div>
                <span className="pill">Pace</span>
              </div>
              <div className="chart-list">
                {targetRows.map((row) => (
                  <div className="chart-row" key={row.month}>
                    <div className="chart-meta">
                      <strong>{row.month}</strong>
                      <span>
                        {row.actual} actual / {row.target} target
                      </span>
                    </div>
                    <div className="chart-track">
                      <div
                        className="chart-fill"
                        style={{ width: `${Math.max(8, (row.actualValue / targetMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <strong>{commercialInsight.title}</strong>
                </div>
                <span className="pill">Context aware</span>
              </div>
              <span className="muted">{commercialInsight.summary}</span>
            </article>
          </section>
        </>
      ) : null}

      {selectedView === "targets" ? (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Tracked months</span>
                <span className="badge">Target path</span>
              </div>
              <div className="metric-value">{commercialGoals.length}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Best month</span>
                <span className="badge">Actual</span>
              </div>
              <div className="metric-value">{strongestMonth?.month ?? "TBD"}</div>
              <div className="metric-subvalue">{strongestMonth?.actual ?? "$0"} currently leads the pace.</div>
            </article>
          </section>

          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Target path</span>
                <h3>TBR monthly target table</h3>
              </div>
              <span className="pill">Targets</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Target</th>
                    <th>Actual</th>
                    <th>Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {commercialGoals.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{row.target}</td>
                      <td>{row.actual}</td>
                      <td>{row.gap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {selectedView === "owners" ? (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Tracked owners</span>
                <span className="badge">Accountability</span>
              </div>
              <div className="metric-value">{partnerPerformance.length}</div>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Leader</span>
                <span className="badge">Closed value</span>
              </div>
              <div className="metric-value">{strongestOwner?.owner ?? "TBD"}</div>
              <div className="metric-subvalue">{strongestOwner?.closedRevenue ?? "$0"} currently leads.</div>
            </article>
          </section>

          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Owner accountability</span>
                <h3>TBR partner performance</h3>
              </div>
              <span className="pill">Owners</span>
            </div>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Target revenue</th>
                    <th>Closed revenue</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerPerformance.map((row) => (
                    <tr key={row.owner}>
                      <td>{row.owner}</td>
                      <td>{row.targetRevenue}</td>
                      <td>{row.closedRevenue}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {selectedView === "source-docs" ? (
        <>
          <section className="grid-two">
            <article className="card compact-section-card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Commercial intake</span>
                  <h3>Add commercial source document</h3>
                </div>
                <span className="pill">Popup</span>
              </div>
              <div className="hero-actions">
                <ModalLauncher
                  description="Upload a sponsorship contract, prize statement, or other TBR commercial support file."
                  eyebrow="Commercial intake"
                  title="Add commercial source document"
                  triggerLabel="Add source document"
                >
                  <DocumentAnalyzerPanel
                    companyCode="TBR"
                    description="Upload a TBR commercial document and keep it inside the commercial-goals workflow."
                    notePlaceholder="Example: sponsorship contract, prize confirmation, or commercial term sheet."
                    redirectPath={buildCompanyPath("/commercial-goals", "TBR", { view: "source-docs" })}
                    title="Analyze TBR commercial source"
                    workflowContext="commercial-goals:tbr:commercial-docs"
                    workflowTag="Categorized intake"
                    variant="plain"
                  />
                </ModalLauncher>
              </div>
            </article>

            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Queue</span>
                  <h3>Commercial source runs</h3>
                </div>
                <span className="pill">{commercialQueue.length} runs</span>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Category</th>
                      <th>Updates</th>
                      <th>When</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercialQueue.length > 0 ? (
                      commercialQueue.map((item) => (
                        <tr key={item.intakeEventId ?? item.id}>
                          <td>
                            <Link
                              href={buildCompanyPath("/commercial-goals", "TBR", {
                                view: "source-docs",
                                analysisRunId: item.id
                              }) as Route}
                            >
                              {item.documentName}
                            </Link>
                          </td>
                          <td>{item.intakeCategory ?? "Unmapped"}</td>
                          <td>{item.updateSummary ?? formatWorkflowContextLabel(item.workflowContext)}</td>
                          <td>{item.createdAt}</td>
                          <td>
                            <span className="pill subtle-pill">{item.intakeStatus ?? item.status}</span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="muted" colSpan={5}>
                          No commercial source documents have been added in this workspace yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          {selectedAnalysisRunId ? (
            <DocumentAnalysisSummary
              detail={detail}
              fields={fields}
              postingEvents={postingEvents}
              title="Selected commercial analysis run"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
