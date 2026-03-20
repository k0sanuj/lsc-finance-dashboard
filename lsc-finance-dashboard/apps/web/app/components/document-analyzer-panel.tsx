"use client";

import { useMemo, useState } from "react";
import { analyzeDocumentAction } from "../documents/actions";
import { FormButton } from "../documents/form-button";

type IntakeFieldConfig = {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "date" | "number";
};

type IntakeCategoryConfig = {
  key: string;
  label: string;
  description: string;
  fields: IntakeFieldConfig[];
  platformUpdates: Array<{ area: string; effect: string }>;
};

type DocumentAnalyzerPanelProps = {
  title: string;
  description: string;
  companyCode?: "TBR" | "FSP" | "LSC";
  redirectPath: string;
  notePlaceholder: string;
  workflowTag: string;
  workflowContext?: string;
  allowMultiple?: boolean;
  showSubmissionMode?: boolean;
  variant?: "card" | "plain";
};

const vendorInvoiceFields: IntakeFieldConfig[] = [
  { key: "counterpartyName", label: "Vendor", placeholder: "AI will extract — or override here" },
  { key: "invoiceNumber", label: "Invoice number", placeholder: "AI will extract" },
  { key: "documentDate", label: "Issue date", placeholder: "", type: "date" },
  { key: "dueDate", label: "Due date", placeholder: "", type: "date" },
  { key: "originalAmount", label: "Amount", placeholder: "AI will extract", type: "number" },
  { key: "originalCurrency", label: "Currency", placeholder: "USD" },
  { key: "costCategoryHint", label: "Category hint", placeholder: "Licensing, catering, travel..." }
];

const expenseReceiptFields: IntakeFieldConfig[] = [
  { key: "merchantName", label: "Merchant", placeholder: "AI will extract from receipt" },
  { key: "documentDate", label: "Expense date", placeholder: "", type: "date" },
  { key: "originalAmount", label: "Amount", placeholder: "AI will extract", type: "number" },
  { key: "originalCurrency", label: "Currency", placeholder: "AED" },
  { key: "costCategoryHint", label: "Category", placeholder: "Travel, catering, equipment..." },
  { key: "documentDescription", label: "Description", placeholder: "Optional context" }
];

const commercialFields: IntakeFieldConfig[] = [
  { key: "counterpartyName", label: "Counterparty", placeholder: "AI will extract" },
  { key: "documentDate", label: "Effective date", placeholder: "", type: "date" },
  { key: "dueDate", label: "End date", placeholder: "", type: "date" },
  { key: "originalAmount", label: "Amount", placeholder: "AI will extract", type: "number" },
  { key: "originalCurrency", label: "Currency", placeholder: "USD" },
  { key: "documentDescription", label: "Note", placeholder: "Sponsorship term, prize basis..." }
];

const workflowCategoryConfigs: Record<string, IntakeCategoryConfig[]> = {
  "expense-support": [
    {
      key: "expense_receipt", label: "Expense receipt",
      description: "Single bill or receipt for the expense workflow.",
      fields: expenseReceiptFields,
      platformUpdates: [
        { area: "TBR / My Expenses", effect: "adds bill to expense pipeline" },
        { area: "Costs / TBR", effect: "supports cost review" }
      ]
    },
    {
      key: "reimbursement_bundle", label: "Reimbursement bundle",
      description: "Grouped reimbursement report with multiple receipts.",
      fields: expenseReceiptFields,
      platformUpdates: [
        { area: "TBR / Expense Review", effect: "moves into approval workflow" },
        { area: "Costs / TBR", effect: "supports race-level cost review" }
      ]
    },
    {
      key: "vendor_invoice", label: "Vendor invoice",
      description: "Cost-side payable document.",
      fields: vendorInvoiceFields,
      platformUpdates: [
        { area: "TBR / Invoice Hub", effect: "creates payable intake" },
        { area: "Payments / TBR", effect: "feeds due tracking" }
      ]
    }
  ],
  "vendor-invoices": [
    {
      key: "vendor_invoice", label: "Vendor invoice",
      description: "Standard payable invoice from a vendor.",
      fields: vendorInvoiceFields,
      platformUpdates: [
        { area: "TBR / Invoice Hub", effect: "creates payable intake" },
        { area: "Payments / TBR", effect: "feeds due tracker after posting" }
      ]
    },
    {
      key: "e1_invoice", label: "E1 invoice",
      description: "Series invoice (licensing, catering, VIP, race billing).",
      fields: vendorInvoiceFields,
      platformUpdates: [
        { area: "TBR / Invoice Hub", effect: "maps into E1 payable review" },
        { area: "Costs / TBR", effect: "feeds race-level invoice totals" }
      ]
    },
    {
      key: "reimbursement_invoice", label: "Reimbursement invoice",
      description: "Reimbursement invoice after admin approval.",
      fields: vendorInvoiceFields,
      platformUpdates: [
        { area: "TBR / My Expenses", effect: "links to approved report" },
        { area: "Payments / TBR", effect: "feeds payable tracking" }
      ]
    }
  ],
  "commercial-docs": [
    {
      key: "sponsorship_contract", label: "Sponsorship contract",
      description: "Commercial contract for sponsor and revenue records.",
      fields: commercialFields,
      platformUpdates: [
        { area: "Commercial Goals / TBR", effect: "feeds target tracking" },
        { area: "LSC overview", effect: "rolls into consolidated revenue" }
      ]
    },
    {
      key: "prize_statement", label: "Prize statement",
      description: "Prize confirmation or award statement.",
      fields: commercialFields,
      platformUpdates: [
        { area: "TBR / Overview", effect: "updates prize-money revenue" },
        { area: "LSC overview", effect: "rolls into consolidated revenue" }
      ]
    }
  ]
};

function getWorkflowGroup(workflowContext: string | undefined) {
  const workflow = String(workflowContext ?? "").toLowerCase();
  if (workflow.includes("commercial") || workflow.includes("contract")) return "commercial-docs";
  if (workflow.includes("invoice")) return "vendor-invoices";
  return "expense-support";
}

export function DocumentAnalyzerPanel({
  title,
  description,
  companyCode = "TBR",
  redirectPath,
  notePlaceholder,
  workflowTag,
  workflowContext,
  allowMultiple = false,
  showSubmissionMode = false,
  variant = "card"
}: DocumentAnalyzerPanelProps) {
  const workflowGroup = getWorkflowGroup(workflowContext);
  const categories = workflowCategoryConfigs[workflowGroup];
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.key ?? "vendor_invoice");
  const [showOverrides, setShowOverrides] = useState(false);

  const selectedConfig = useMemo(
    () => categories.find((c) => c.key === selectedCategory) ?? categories[0],
    [categories, selectedCategory]
  );

  const content = (
    <>
      <div className="card-title-row">
        <div>
          <span className="section-kicker">{workflowTag}</span>
          <h3>{title}</h3>
        </div>
        <span className="pill">AI analyzer</span>
      </div>
      <p>{description}</p>

      <form action={analyzeDocumentAction} className="stack-form compact-form">
        <input name="companyCode" type="hidden" value={companyCode} />
        <input name="redirectPath" type="hidden" value={redirectPath} />
        <input name="workflowContext" type="hidden" value={workflowContext ?? redirectPath} />
        <input name="workflowGroup" type="hidden" value={workflowGroup} />

        {/* Step 1: Upload first */}
        <section className="intake-section">
          <div className="card-title-row compact-card-title-row">
            <div>
              <span className="process-step-index">Step 1</span>
              <h4>Upload documents</h4>
            </div>
          </div>
          <label className="field">
            <span>{allowMultiple ? "Drop invoice files (single or multiple)" : "Upload document"}</span>
            <input multiple={allowMultiple} name="document" type="file" required />
          </label>
          <label className="field">
            <span>Notes for AI</span>
            <textarea name="documentNote" rows={2} placeholder={notePlaceholder} />
          </label>
        </section>

        {/* Step 2: Category + submission mode */}
        <section className="intake-section">
          <div className="card-title-row compact-card-title-row">
            <div>
              <span className="process-step-index">Step 2</span>
              <h4>Document type</h4>
            </div>
          </div>
          <label className="field">
            <span>Category</span>
            <select
              name="intakeCategory"
              onChange={(e) => setSelectedCategory(e.target.value)}
              value={selectedCategory}
            >
              {categories.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
          <span className="muted">{selectedConfig.description}</span>

          {showSubmissionMode && (
            <label className="field">
              <span>Submission mode</span>
              <select defaultValue="individual_bills" name="submissionMode">
                <option value="individual_bills">Individual bills</option>
                <option value="report_bundle">Expense report bundle</option>
              </select>
            </label>
          )}
        </section>

        {/* Step 3: Optional field overrides — collapsed by default */}
        <section className="intake-section">
          <button
            className="nav-company-toggle"
            onClick={(e) => { e.preventDefault(); setShowOverrides(!showOverrides); }}
            type="button"
            style={{ background: "rgba(15, 53, 84, 0.03)", color: "var(--ink)", borderColor: "var(--line)" }}
          >
            <span style={{ fontSize: "0.82rem", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--ink-soft)" }}>
              Optional: Override AI fields
            </span>
            <span>{showOverrides ? "▾" : "▸"}</span>
          </button>

          {showOverrides && (
            <div className="grid-two compact-grid" style={{ paddingTop: 8 }}>
              {selectedConfig.fields.map((field) => (
                <label className="field" key={field.key}>
                  <span>{field.label}</span>
                  <input
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    name={field.key}
                    placeholder={field.placeholder}
                    step={field.type === "number" ? "0.01" : undefined}
                    type={field.type ?? "text"}
                  />
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="actions-row">
          <FormButton label="Upload & analyze" pendingLabel="Analyzing with AI..." />
          <span className="muted">
            AI will extract all fields automatically. Override fields only if you want to correct or pre-fill.
          </span>
        </div>
      </form>
    </>
  );

  if (variant === "plain") {
    return <div className="plain-analyzer-panel">{content}</div>;
  }

  return <article className="card analyzer-card">{content}</article>;
}
