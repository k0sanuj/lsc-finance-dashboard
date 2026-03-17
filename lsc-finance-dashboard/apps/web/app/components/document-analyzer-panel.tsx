"use client";

import { useMemo, useState } from "react";
import { analyzeDocumentAction } from "../documents/actions";
import { FormButton } from "../documents/form-button";

type IntakeFieldConfig = {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "date" | "number";
  required?: boolean;
};

type IntakeCategoryConfig = {
  key: string;
  label: string;
  description: string;
  fields: IntakeFieldConfig[];
  platformUpdates: Array<{
    area: string;
    effect: string;
  }>;
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

const expenseReceiptFields: IntakeFieldConfig[] = [
  { key: "merchantName", label: "Merchant", placeholder: "Merchant or vendor name", required: true },
  { key: "documentDate", label: "Expense date", placeholder: "", type: "date", required: true },
  { key: "originalAmount", label: "Original amount", placeholder: "240.01", type: "number", required: true },
  { key: "originalCurrency", label: "Original currency", placeholder: "AED", required: true },
  { key: "costCategoryHint", label: "Cost category", placeholder: "Travel, catering, equipment..." },
  { key: "documentDescription", label: "Description", placeholder: "What was this bill for?" }
];

const vendorInvoiceFields: IntakeFieldConfig[] = [
  { key: "counterpartyName", label: "Vendor", placeholder: "Vendor or E1 entity name", required: true },
  { key: "invoiceNumber", label: "Invoice number", placeholder: "INV-001" },
  { key: "documentDate", label: "Issue date", placeholder: "", type: "date", required: true },
  { key: "dueDate", label: "Due date", placeholder: "", type: "date" },
  { key: "originalAmount", label: "Original amount", placeholder: "12500", type: "number", required: true },
  { key: "originalCurrency", label: "Original currency", placeholder: "USD", required: true },
  { key: "costCategoryHint", label: "Category hint", placeholder: "Licensing fee, catering, travel..." }
];

const commercialFields: IntakeFieldConfig[] = [
  { key: "counterpartyName", label: "Counterparty", placeholder: "Sponsor, partner, or prize counterparty", required: true },
  { key: "documentDate", label: "Effective date", placeholder: "", type: "date" },
  { key: "dueDate", label: "End or due date", placeholder: "", type: "date" },
  { key: "originalAmount", label: "Contract or award amount", placeholder: "100000", type: "number" },
  { key: "originalCurrency", label: "Original currency", placeholder: "USD" },
  { key: "documentDescription", label: "Commercial note", placeholder: "Sponsorship term, prize basis, or summary" }
];

const workflowCategoryConfigs: Record<string, IntakeCategoryConfig[]> = {
  "expense-support": [
    {
      key: "expense_receipt",
      label: "Expense receipt",
      description: "Single bill or receipt that should feed the expense workflow.",
      fields: expenseReceiptFields,
      platformUpdates: [
        { area: "TBR / My Expenses", effect: "adds a bill row that can be grouped into an expense report" },
        { area: "TBR / Races", effect: "shows up in the selected race bill table" },
        { area: "Costs / TBR", effect: "supports cost-side evidence and category review" },
        { area: "LSC overview", effect: "affects consolidated cost once approved and posted" }
      ]
    },
    {
      key: "reimbursement_bundle",
      label: "Reimbursement bundle",
      description: "Grouped reimbursement report with one or many cost documents inside it.",
      fields: expenseReceiptFields,
      platformUpdates: [
        { area: "TBR / My Expenses", effect: "creates a grouped reimbursement intake path" },
        { area: "TBR admin / Review Console", effect: "moves into approval and clarification workflow" },
        { area: "Costs / TBR", effect: "supports race-level and category-level cost review" }
      ]
    },
    {
      key: "vendor_invoice",
      label: "Vendor invoice",
      description: "Cost-side payable document that may also need invoice-hub handling.",
      fields: vendorInvoiceFields,
      platformUpdates: [
        { area: "TBR / Invoice Hub", effect: "can feed payable intake and approval" },
        { area: "Payments / TBR", effect: "moves into due tracking after posting" },
        { area: "Costs / TBR", effect: "supports vendor-side cost breakdown and review" }
      ]
    }
  ],
  "vendor-invoices": [
    {
      key: "vendor_invoice",
      label: "Vendor invoice",
      description: "Standard payable invoice from a vendor or operating partner.",
      fields: vendorInvoiceFields,
      platformUpdates: [
        { area: "TBR / Invoice Hub", effect: "creates or supports a payable intake record" },
        { area: "Payments / TBR", effect: "feeds the due tracker once approved and posted" },
        { area: "LSC overview", effect: "affects consolidated cost after posting" }
      ]
    },
    {
      key: "e1_invoice",
      label: "E1 invoice",
      description: "Series invoice such as licensing, catering, VIP, or event-side race billing.",
      fields: vendorInvoiceFields,
      platformUpdates: [
        { area: "TBR / Invoice Hub", effect: "maps into E1 payable review" },
        { area: "Payments / TBR", effect: "appears in the due tracker after approval" },
        { area: "Costs / TBR", effect: "feeds race-level event invoice totals" }
      ]
    },
    {
      key: "reimbursement_invoice",
      label: "Reimbursement invoice",
      description: "Operator-side reimbursement invoice generated after admin approval.",
      fields: vendorInvoiceFields,
      platformUpdates: [
        { area: "TBR / My Expenses", effect: "links to an approved report as invoice output" },
        { area: "TBR / Invoice Hub", effect: "creates a reimbursement invoice intake" },
        { area: "Payments / TBR", effect: "feeds payable tracking if finance must settle it" }
      ]
    }
  ],
  "commercial-docs": [
    {
      key: "sponsorship_contract",
      label: "Sponsorship contract",
      description: "Commercial contract that should feed sponsor and revenue records.",
      fields: commercialFields,
      platformUpdates: [
        { area: "TBR / Overview", effect: "updates recognized sponsorship revenue after approval" },
        { area: "Commercial Goals / TBR", effect: "feeds target-vs-actual tracking" },
        { area: "LSC overview", effect: "rolls into consolidated revenue and margin" }
      ]
    },
    {
      key: "prize_statement",
      label: "Prize statement",
      description: "Prize confirmation or award statement for recognized competition revenue.",
      fields: commercialFields,
      platformUpdates: [
        { area: "TBR / Overview", effect: "updates prize-money revenue after approval" },
        { area: "Commercial Goals / TBR", effect: "contributes to actual closed value where relevant" },
        { area: "LSC overview", effect: "rolls into consolidated revenue and margin" }
      ]
    },
    {
      key: "commercial_term_sheet",
      label: "Commercial term sheet",
      description: "Commercial source document that may still need manual review before posting.",
      fields: commercialFields,
      platformUpdates: [
        { area: "Documents / Commercial", effect: "stays in review until the canonical mapper is clear" },
        { area: "Commercial Goals / TBR", effect: "can support pacing commentary even before posting" }
      ]
    }
  ]
};

function getWorkflowGroup(workflowContext: string | undefined) {
  const workflow = String(workflowContext ?? "").toLowerCase();

  if (workflow.includes("commercial") || workflow.includes("contract")) {
    return "commercial-docs";
  }

  if (workflow.includes("invoice")) {
    return "vendor-invoices";
  }

  if (workflow.includes("expense") || workflow.includes("cost") || workflow.startsWith("tbr-race:")) {
    return "expense-support";
  }

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
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.key ?? "expense_receipt");

  const selectedConfig = useMemo(
    () => categories.find((category) => category.key === selectedCategory) ?? categories[0],
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
        {showSubmissionMode ? (
          <label className="field">
            <span>Submission mode</span>
            <select defaultValue="individual_bills" name="submissionMode">
              <option value="individual_bills">Individual bills</option>
              <option value="report_bundle">Expense report bundle</option>
            </select>
          </label>
        ) : null}

        <section className="intake-section">
          <div className="card-title-row compact-card-title-row">
            <div>
              <span className="section-kicker">Category</span>
              <h4>What are you adding?</h4>
            </div>
          </div>
          <label className="field">
            <span>Intake category</span>
            <select
              name="intakeCategory"
              onChange={(event) => setSelectedCategory(event.target.value)}
              value={selectedCategory}
            >
              {categories.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <div className="process-step compact-process-step">
            <span className="process-step-index">Mapped flow</span>
            <strong>{selectedConfig.label}</strong>
            <span className="muted">{selectedConfig.description}</span>
          </div>
        </section>

        <section className="intake-section">
          <div className="card-title-row compact-card-title-row">
            <div>
              <span className="section-kicker">Fields</span>
              <h4>Required intake fields</h4>
            </div>
          </div>
          <div className="grid-two compact-grid">
            {selectedConfig.fields.map((field) => (
              <label className="field" key={field.key}>
                <span>{field.label}</span>
                <input
                  inputMode={field.type === "number" ? "decimal" : undefined}
                  name={field.key}
                  placeholder={field.placeholder}
                  required={field.required}
                  step={field.type === "number" ? "0.01" : undefined}
                  type={field.type ?? "text"}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="intake-section">
          <div className="card-title-row compact-card-title-row">
            <div>
              <span className="section-kicker">Files</span>
              <h4>Upload source support</h4>
            </div>
          </div>
          <label className="field">
            <span>{allowMultiple ? "Upload bill or receipt files" : "Upload source document"}</span>
            <input multiple={allowMultiple} name="document" type="file" required />
          </label>
          <label className="field">
            <span>Operator note</span>
            <textarea name="documentNote" rows={3} placeholder={notePlaceholder} />
          </label>
        </section>

        <section className="intake-section">
          <div className="card-title-row compact-card-title-row">
            <div>
              <span className="section-kicker">Platform impact</span>
              <h4>What this will update</h4>
            </div>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Update</th>
                </tr>
              </thead>
              <tbody>
                {selectedConfig.platformUpdates.map((update) => (
                  <tr key={`${selectedConfig.key}-${update.area}`}>
                    <td>{update.area}</td>
                    <td>{update.effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="actions-row">
          <FormButton label="AI Analyze" pendingLabel="Analyzing..." />
          <span className="muted">
            The intake fields are saved with the analysis run so the queue and approval detail stay mapped.
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
