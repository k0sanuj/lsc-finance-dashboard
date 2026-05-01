import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAiIntakeQueue
} from "@lsc/db";
import { requireRole } from "../../../lib/auth";
import { CompanyWorkspaceShell } from "../../components/company-workspace-shell";
import {
  AIIntakePanel,
  type AiIntakeTargetKind,
  type AiIntakeTargetOption
} from "../../components/ai-intake-panel";
import { AIIntakeReviewPanel } from "../../components/ai-intake-review-panel";
import { ModalLauncher } from "../../components/modal-launcher";
import {
  buildCompanyPath,
  formatDocumentWorkflowForSelection,
  formatSharedCompanyName,
  isSharedCompanyCode
} from "../../lib/shared-workspace";
import { formatWorkflowContextLabel } from "../../lib/workflow-labels";
import type { VisibleEntityCode } from "../../lib/entities";

type DocumentsCompanyPageProps = {
  params: Promise<{
    company: string;
  }>;
  searchParams?: Promise<{
    view?: string;
    status?: string;
    message?: string;
    aiDraftId?: string;
  }>;
};

type QueueRow = {
  id: string;
  sourceName: string;
  detectedDocumentType: string;
  status: string;
  confidence: string;
  proposedTarget: string;
  createdAt: string;
  workflowContext: string | null;
  targetKind: string;
  previewAvailable?: boolean;
};

const workstreamsByCompany: Record<VisibleEntityCode, readonly {
  key: "expense-support" | "vendor-invoices" | "commercial-docs";
  title: string;
  description: string;
  badge: string;
}[]> = {
  LSC: [
    {
      key: "vendor-invoices",
      title: "Vendor invoices",
      description: "Dubai entity payables and shared operating bills.",
      badge: "Step 1"
    },
    {
      key: "commercial-docs",
      title: "Commercial documents",
      description: "Holding company contracts, source documents, and approvals.",
      badge: "Step 2"
    },
    {
      key: "expense-support",
      title: "Expense support",
      description: "Shared expense receipts and reimbursement support.",
      badge: "Step 3"
    }
  ],
  TBR: [
    {
      key: "expense-support",
      title: "Expense support",
      description: "Bills, receipts, and reimbursement bundles.",
      badge: "Step 1"
    },
    {
      key: "vendor-invoices",
      title: "Vendor invoices",
      description: "E1 and vendor invoice intake.",
      badge: "Step 2"
    },
    {
      key: "commercial-docs",
      title: "Commercial documents",
      description: "Contracts, prize statements, and revenue-side documents.",
      badge: "Step 3"
    }
  ],
  FSP: [
    {
      key: "commercial-docs",
      title: "Commercial documents",
      description: "Subscriber, contract, and partner documents.",
      badge: "Step 1"
    },
    {
      key: "vendor-invoices",
      title: "Platform bills",
      description: "Hosting, software, and product-operating payables.",
      badge: "Step 2"
    },
    {
      key: "expense-support",
      title: "Operations support",
      description: "Operational expense documents.",
      badge: "Step 3"
    }
  ],
  XTZ: [
    {
      key: "vendor-invoices",
      title: "Vendor invoices",
      description: "XTZ India payroll, contractor, and vendor support.",
      badge: "Step 1"
    },
    {
      key: "expense-support",
      title: "Expense support",
      description: "Receipts, reimbursements, and payout evidence.",
      badge: "Step 2"
    },
    {
      key: "commercial-docs",
      title: "Commercial documents",
      description: "India entity source documents and service agreements.",
      badge: "Step 3"
    }
  ]
};

function getAnalyzerConfig(company: VisibleEntityCode, view: string) {
  const companyName = formatSharedCompanyName(company);
  if (company === "TBR" && view === "expense-support") {
    return {
      title: "Analyze TBR expense support",
      description: "Upload bills, receipts, or reimbursement bundles in the TBR expense-support workflow.",
      notePlaceholder: "Example: Dubai meal receipt, AED, race bills, or grouped reimbursement bundle."
    };
  }

  if (view === "vendor-invoices") {
    return {
      title: `Analyze ${companyName} vendor invoice`,
      description: "Upload a vendor or payable invoice and keep it inside the invoice-support workflow.",
      notePlaceholder: "Example: E1 payable invoice, platform vendor bill, or support invoice with due date."
    };
  }

  return {
    title: `Analyze ${companyName} commercial document`,
    description: "Upload a contract, prize statement, or other revenue-supporting finance document.",
    notePlaceholder: "Example: sponsorship contract, prize confirmation, or commercial term sheet."
  };
}

function getAiIntakeTargets(company: VisibleEntityCode, view: string): {
  defaultTargetKind: AiIntakeTargetKind;
  targetOptions: AiIntakeTargetOption[];
} {
  if (company === "XTZ" && view === "vendor-invoices") {
    return {
      defaultTargetKind: "xtz_payroll_vendor_invoice_support",
      targetOptions: [
        { value: "xtz_payroll_vendor_invoice_support", label: "XTZ payroll/vendor support" },
        { value: "vendor_invoice", label: "Vendor invoice" },
      ],
    };
  }

  if (view === "expense-support") {
    return {
      defaultTargetKind: "expense_receipt",
      targetOptions: [
        { value: "expense_receipt", label: "Expense receipt" },
        { value: "reimbursement_bundle", label: "Reimbursement bundle" },
      ],
    };
  }

  if (view === "commercial-docs") {
    return {
      defaultTargetKind: "sponsorship_commercial_document",
      targetOptions: [
        { value: "sponsorship_commercial_document", label: "Sponsorship / commercial document" },
      ],
    };
  }

  return {
    defaultTargetKind: "vendor_invoice",
    targetOptions: [{ value: "vendor_invoice", label: "Vendor invoice" }],
  };
}

function formatWorkflowHeading(company: VisibleEntityCode, view: string) {
  if (company === "TBR" && view === "expense-support") {
    return "Expense support for TBR operations";
  }

  if (view === "vendor-invoices") {
    return company === "TBR" ? "Vendor and E1 invoice support" : `${formatSharedCompanyName(company)} invoice support`;
  }

  return company === "TBR" ? "Commercial source support" : `${formatSharedCompanyName(company)} source support`;
}

export default async function DocumentsCompanyPage({
  params,
  searchParams
}: DocumentsCompanyPageProps) {
  await requireRole(["super_admin", "finance_admin"]);
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
  const selectedAiDraftId = pageParams?.aiDraftId ?? undefined;
  const analyzerConfig = getAnalyzerConfig(companyCode, selectedView);
  const targetConfig = getAiIntakeTargets(companyCode, selectedView);
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;

  const queue = await getAiIntakeQueue({
    companyCode,
    workflowContextPrefix: `documents:${companyCode.toLowerCase()}:${selectedView}`,
    limit: 20
  });

  const filteredQueue = (queue as QueueRow[]).filter((item) => {
    if (companyCode === "FSP") {
      return String(item.workflowContext ?? "").toLowerCase().includes("fsp");
    }

    return (
      formatDocumentWorkflowForSelection(item.workflowContext, item.proposedTarget, item.detectedDocumentType) ===
      selectedView
    );
  });
  const analyzedCount = filteredQueue.filter((item) =>
    ["needs_review", "approved", "posted"].includes(String(item.status))
  ).length;
  const pendingReviewCount = filteredQueue.filter(
    (item) => String(item.status) === "needs_review"
  ).length;
  const previewCount = filteredQueue.filter((item) => item.previewAvailable).length;
  const workflowInsight = {
    title: `${filteredQueue.length} document runs currently sit in this workflow`,
    summary: `${pendingReviewCount} pending review, ${analyzedCount} analyzed, ${previewCount} with inline preview.`
  };

  return (
    <div className="page-grid">
      <CompanyWorkspaceShell
        basePath="/documents"
        companyCode={companyCode}
        description={`${formatSharedCompanyName(companyCode)} document workspace across workflow categories.`}
        eyebrow={`${companyCode} documents`}
        selectedView={selectedView}
        title={`${formatSharedCompanyName(companyCode)} document workspace`}
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
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Pending review</span>
            <span className="badge">Approval</span>
          </div>
          <div className="metric-value">{pendingReviewCount}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Inline preview</span>
            <span className="badge">Image support</span>
          </div>
          <div className="metric-value">{previewCount}</div>
        </article>
      </section>

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Document intake</span>
              <h3>{companyWorkstreams.find((item) => item.key === selectedView)?.title}</h3>
            </div>
            <span className="pill">Add</span>
          </div>
          <div className="hero-actions">
            <ModalLauncher
              description={analyzerConfig.description}
              eyebrow="Document intake"
              title={analyzerConfig.title}
              triggerLabel="Add document"
            >
              <AIIntakePanel
                companyCode={companyCode}
                description={analyzerConfig.description}
                defaultTargetKind={targetConfig.defaultTargetKind}
                notePlaceholder={analyzerConfig.notePlaceholder}
                redirectPath={buildCompanyPath("/documents", companyCode, { view: selectedView })}
                targetOptions={targetConfig.targetOptions}
                title={analyzerConfig.title}
                workflowContext={`documents:${companyCode.toLowerCase()}:${selectedView}`}
                variant="plain"
              />
            </ModalLauncher>
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <strong>{workflowInsight.title}</strong>
            </div>
            <span className="pill">Context aware</span>
          </div>
          <span className="muted">{workflowInsight.summary}</span>
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
                <th>Target</th>
                <th>When</th>
                <th>Confidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredQueue.length > 0 ? (
                filteredQueue.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        href={buildCompanyPath("/documents", companyCode, {
                          view: selectedView,
                          aiDraftId: item.id
                        }) as Route}
                      >
                        {item.sourceName}
                      </Link>
                    </td>
                    <td>{item.targetKind.replace(/_/g, " ")}</td>
                    <td>{item.detectedDocumentType}</td>
                    <td>{item.proposedTarget || formatWorkflowContextLabel(item.workflowContext)}</td>
                    <td>{item.createdAt}</td>
                    <td>{Math.round(Number(item.confidence) * 100)}%</td>
                    <td>
                      <div className="inline-actions">
                        <span className="pill">{item.status.replace(/_/g, " ")}</span>
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

      <AIIntakeReviewPanel
        draftId={selectedAiDraftId}
        redirectPath={buildCompanyPath("/documents", companyCode, {
          view: selectedView,
          aiDraftId: selectedAiDraftId
        })}
        title="Selected AI intake draft"
      />
    </div>
  );
}
