import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDocumentAnalysisDetail,
  getDocumentAnalysisQueue,
  getDocumentExtractedFields,
  getDocumentPostingEvents,
  getEntitySnapshots
} from "@lsc/db";
import { requireRole } from "../../../lib/auth";
import { approveDocumentAnalysisAction } from "../actions";
import { CompanyWorkspaceShell } from "../../components/company-workspace-shell";
import { DocumentAnalyzerPanel } from "../../components/document-analyzer-panel";
import { ModalLauncher } from "../../components/modal-launcher";
import { FormButton } from "../form-button";
import { DocumentAnalysisSummary } from "../../components/document-analysis-summary";
import {
  buildCompanyPath,
  formatDocumentWorkflowForSelection,
  isSharedCompanyCode
} from "../../lib/shared-workspace";
import { formatWorkflowContextLabel } from "../../lib/workflow-labels";

type DocumentsCompanyPageProps = {
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
  confidence: string;
  proposedTarget: string;
  createdAt?: string;
  workflowContext?: string;
  intakeStatus?: string;
  originCountry?: string;
  currencyCode?: string;
  previewAvailable?: boolean;
  intakeCategory?: string;
  updateSummary?: string;
};

const workstreamsByCompany = {
  TBR: [
    {
      key: "expense-support",
      title: "Expense support",
      description: "Bills, receipts, and reimbursement bundles tied to TBR cost workflows.",
      badge: "Step 1"
    },
    {
      key: "vendor-invoices",
      title: "Vendor invoices",
      description: "E1 and vendor invoice intake that should feed payable control.",
      badge: "Step 2"
    },
    {
      key: "commercial-docs",
      title: "Commercial documents",
      description: "Contracts, prize statements, and revenue-side source documents for TBR.",
      badge: "Step 3"
    }
  ],
  FSP: [
    {
      key: "commercial-docs",
      title: "Commercial documents",
      description: "Subscriber, contract, and partner documents for the FSP launch layer.",
      badge: "Step 1"
    },
    {
      key: "vendor-invoices",
      title: "Platform bills",
      description: "Hosting, software, and product-operating payables once FSP goes live.",
      badge: "Step 2"
    },
    {
      key: "expense-support",
      title: "Operations support",
      description: "Keep the FSP document structure ready without faking density.",
      badge: "Step 3"
    }
  ]
} as const;

function getAnalyzerConfig(company: "TBR" | "FSP", view: string) {
  if (company === "TBR" && view === "expense-support") {
    return {
      title: "Analyze TBR expense support",
      description: "Upload bills, receipts, or reimbursement bundles in the TBR expense-support workflow.",
      notePlaceholder: "Example: Dubai meal receipt, AED, race bills, or grouped reimbursement bundle."
    };
  }

  if (view === "vendor-invoices") {
    return {
      title: `Analyze ${company} vendor invoice`,
      description: "Upload a vendor or payable invoice and keep it inside the invoice-support workflow.",
      notePlaceholder: "Example: E1 payable invoice, platform vendor bill, or support invoice with due date."
    };
  }

  return {
    title: `Analyze ${company} commercial document`,
    description: "Upload a contract, prize statement, or other revenue-supporting finance document.",
    notePlaceholder: "Example: sponsorship contract, prize confirmation, or commercial term sheet."
  };
}

function formatWorkflowHeading(company: "TBR" | "FSP", view: string) {
  if (company === "TBR" && view === "expense-support") {
    return "Expense support for TBR operations";
  }

  if (view === "vendor-invoices") {
    return company === "TBR" ? "Vendor and E1 invoice support" : "Platform bill and invoice support";
  }

  return company === "TBR" ? "Commercial source support" : "Commercial launch support";
}

export default async function DocumentsCompanyPage({
  params,
  searchParams
}: DocumentsCompanyPageProps) {
  const session = await requireRole(["super_admin", "finance_admin"]);
  const routeParams = await params;
  const resolvedCompany = routeParams.company?.toUpperCase();
  if (!isSharedCompanyCode(resolvedCompany)) {
    notFound();
  }

  const companyCode = resolvedCompany;
  const pageParams = searchParams ? await searchParams : undefined;
  const companyWorkstreams = workstreamsByCompany[companyCode];
  const selectedView = companyWorkstreams.some((item) => item.key === pageParams?.view)
    ? pageParams?.view ?? companyWorkstreams[0].key
    : companyWorkstreams[0].key;
  const selectedAnalysisRunId = pageParams?.analysisRunId ?? undefined;
  const analyzerConfig = getAnalyzerConfig(companyCode, selectedView);
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;

  const [entitySnapshots, queue, detail, fields, postingEvents] = await Promise.all([
    getEntitySnapshots(),
    getDocumentAnalysisQueue(session.id),
    selectedAnalysisRunId ? getDocumentAnalysisDetail(selectedAnalysisRunId, session.id) : Promise.resolve(null),
    selectedAnalysisRunId ? getDocumentExtractedFields(selectedAnalysisRunId) : Promise.resolve([]),
    selectedAnalysisRunId ? getDocumentPostingEvents(selectedAnalysisRunId) : Promise.resolve([])
  ]);

  const filteredQueue = (queue as QueueRow[]).filter((item) => {
    if (companyCode === "FSP") {
      return String(item.workflowContext ?? "").toLowerCase().includes("fsp");
    }

    return (
      formatDocumentWorkflowForSelection(item.workflowContext, item.proposedTarget, item.documentType) ===
      selectedView
    );
  });
  const analyzedCount = filteredQueue.filter((item) =>
    ["analyzed", "reused"].includes(String(item.intakeStatus ?? item.status))
  ).length;
  const pendingReviewCount = filteredQueue.filter(
    (item) => String(item.intakeStatus ?? item.status) === "pending_review"
  ).length;
  const previewCount = filteredQueue.filter((item) => item.previewAvailable).length;
  const workflowSummary = [
    {
      title: `${filteredQueue.length} document runs currently sit in this workflow`,
      summary:
        "This workspace should stay narrow so expense support, invoices, and commercial documents do not blur together."
    },
    {
      title: `${pendingReviewCount} runs are still waiting for review`,
      summary:
        "Finance should only approve or post after the workflow context and saved intake fields look correct."
    },
    {
      title: `${previewCount} runs have inline preview support`,
      summary:
        "Image-backed receipts or scans should be visually reviewable before anyone trusts the extracted fields."
    }
  ];

  return (
    <div className="page-grid">
      <CompanyWorkspaceShell
        basePath="/documents"
        companyCode={companyCode}
        description="Now that the company is fixed, choose the exact document workflow before opening queues or extracted fields."
        eyebrow={`${companyCode} documents`}
        selectedView={selectedView}
        title={`${companyCode === "TBR" ? "Team Blue Rising" : "Future of Sports"} document workspace`}
        workstreams={companyWorkstreams}
      />

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Workflow queue</span>
            <span className="badge">{companyCode}</span>
          </div>
          <div className="metric-value">{filteredQueue.length}</div>
          <div className="metric-subvalue">{formatWorkflowHeading(companyCode, selectedView)}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Analyzed</span>
            <span className="badge">Ready to inspect</span>
          </div>
          <div className="metric-value">{analyzedCount}</div>
          <div className="metric-subvalue">Runs that already have extracted fields and saved intake mapping.</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Pending review</span>
            <span className="badge">Approval</span>
          </div>
          <div className="metric-value">{pendingReviewCount}</div>
          <div className="metric-subvalue">Runs still waiting on finance approval or posting.</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Inline preview</span>
            <span className="badge">Image support</span>
          </div>
          <div className="metric-value">{previewCount}</div>
          <div className="metric-subvalue">Runs that can be visually checked on-platform.</div>
        </article>
      </section>

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Step 3</span>
              <h3>Open the intake for this workflow only when you are ready to add one document</h3>
            </div>
            <span className="pill">Add</span>
          </div>
          <div className="process-step">
            <span className="process-step-index">Workflow</span>
            <strong>{companyWorkstreams.find((item) => item.key === selectedView)?.title}</strong>
            <span className="muted">
              Keep upload and analysis behind a popup. The queue and selected detail should stay visible on
              the page, but the intake itself should only open when intentionally triggered.
            </span>
          </div>
          <div className="hero-actions">
            <ModalLauncher
              description={analyzerConfig.description}
              eyebrow="Document intake"
              title={analyzerConfig.title}
              triggerLabel="Add document"
            >
              <DocumentAnalyzerPanel
                companyCode={companyCode}
                description={analyzerConfig.description}
                notePlaceholder={analyzerConfig.notePlaceholder}
                redirectPath={buildCompanyPath("/documents", companyCode, { view: selectedView })}
                title={analyzerConfig.title}
                workflowContext={`documents:${companyCode.toLowerCase()}:${selectedView}`}
                workflowTag="Categorized intake"
                variant="plain"
              />
            </ModalLauncher>
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">AI comments</span>
              <h3>What this workflow is telling us</h3>
            </div>
            <span className="pill">Context aware</span>
          </div>
          <div className="info-grid">
            {workflowSummary.map((insight) => (
              <div className="process-step" key={insight.title}>
                <span className="process-step-index">AI</span>
                <strong>{insight.title}</strong>
                <span className="muted">{insight.summary}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Queue</span>
            <h3>{companyWorkstreams.find((item) => item.key === selectedView)?.title}</h3>
          </div>
          <span className="pill">{companyCode}</span>
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
                <th>Country / currency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredQueue.length > 0 ? (
                filteredQueue.map((item) => (
                  <tr key={item.intakeEventId ?? item.id}>
                    <td>
                      <Link
                        href={buildCompanyPath("/documents", companyCode, {
                          view: selectedView,
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
                      {item.originCountry} / {item.currencyCode}
                    </td>
                    <td>
                      <div className="inline-actions">
                        <span className="pill">{item.intakeStatus}</span>
                        {item.previewAvailable ? <span className="pill">preview</span> : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={7}>
                    No uploads are sitting in this company workspace yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedAnalysisRunId ? (
        <>
          <DocumentAnalysisSummary
            detail={detail}
            fields={fields}
            postingEvents={postingEvents}
            title="Selected analysis run"
          />

          <section className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Approval</span>
                <h3>Approve the selected run</h3>
              </div>
            </div>
            {detail ? (
              <div className="hero-actions">
                {detail.status === "pending_review" ? (
                  <form action={approveDocumentAnalysisAction}>
                    <input name="analysisRunId" type="hidden" value={detail.analysisRunId} />
                    <input
                      name="redirectPath"
                      type="hidden"
                      value={buildCompanyPath("/documents", companyCode, {
                        view: selectedView,
                        analysisRunId: detail.analysisRunId
                      })}
                    />
                    <FormButton label="Approve and post" pendingLabel="Posting..." />
                  </form>
                ) : (
                  <span className="muted">This document has already moved past the approval step.</span>
                )}
              </div>
            ) : (
              <span className="muted">Select one run from the queue to approve it.</span>
            )}
          </section>
        </>
      ) : (
        <section className="card compact-section-card">
          <div className="process-step">
            <span className="process-step-index">Step 4</span>
            <strong>Open one document run only when you need the detail</strong>
            <span className="muted">
              The detailed extracted fields, preview, and posting history should stay quiet until you open a specific run.
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
