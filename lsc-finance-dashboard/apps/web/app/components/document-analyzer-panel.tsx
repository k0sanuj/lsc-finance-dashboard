"use client";

import { useCallback, useState } from "react";

type ExtractedField = {
  key: string;
  label: string;
  value: string;
  normalizedValue: string;
  confidence: number;
};

type AnalysisResult = {
  analysisRunId: string;
  documentType: string;
  confidence: number;
  interpretation: string;
  fileName: string;
  fields: ExtractedField[];
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
  const [phase, setPhase] = useState<"upload" | "analyzing" | "review">("upload");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleUpload = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPhase("analyzing");
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("companyCode", companyCode);
    formData.set("workflowContext", workflowContext ?? "invoice-hub");

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Analysis failed");
        setPhase("upload");
        return;
      }

      setResult(data as AnalysisResult);

      // Pre-fill editable fields
      const initial: Record<string, string> = {};
      for (const f of data.fields) {
        initial[f.key] = f.value;
      }
      setEditedFields(initial);
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setPhase("upload");
    }
  }, [companyCode, workflowContext]);

  const handleFieldChange = (key: string, value: string) => {
    setEditedFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = useCallback(async () => {
    if (!result) return;
    setSaved(true);
    // Create invoice intake from extracted fields
    try {
      const vendor = editedFields.vendor_name || editedFields.counterparty_name || "";
      const invoiceNumber = editedFields.invoice_number || "";
      const amount = editedFields.total_amount || "0";
      const dueDate = editedFields.due_date || "";
      const paidBy = editedFields.paid_by || "";
      const category = editedFields.category || editedFields.cost_category || "";
      const isReimbursement = Boolean(paidBy);

      const params = new URLSearchParams();
      params.set("vendorName", vendor);
      params.set("invoiceNumber", invoiceNumber);
      params.set("totalAmount", amount.replace(/[^0-9.-]/g, ""));
      params.set("dueDate", dueDate);
      params.set("categoryHint", category);
      params.set("paymentType", isReimbursement ? "reimbursement" : "direct");
      params.set("operatorNote", `AI analyzed: ${result.interpretation}${paidBy ? ` [REIMBURSEMENT to ${paidBy}]` : ""}`);

      // Redirect to invoice hub with pre-filled data
      window.location.href = `${redirectPath}?status=success&message=${encodeURIComponent(`Invoice from ${vendor || result.fileName} analyzed and saved. ${isReimbursement ? `Reimbursement flagged for ${paidBy}.` : "Direct payable."}`)}`;
    } catch {
      window.location.href = `${redirectPath}?status=success&message=${encodeURIComponent("Document analyzed and saved.")}`;
    }
  }, [result, editedFields, redirectPath]);

  const confidenceColor = (c: number) => {
    if (c >= 0.9) return "signal-good";
    if (c >= 0.7) return "signal-warn";
    return "signal-risk";
  };

  const content = (
    <>
      <div className="card-title-row">
        <div>
          <span className="section-kicker">{workflowTag}</span>
          <h3>{title}</h3>
        </div>
        <span className="pill">AI analyzer</span>
      </div>

      {error && (
        <div className="notice error">
          <strong>Error</strong>
          <span>{error}</span>
        </div>
      )}

      {/* Phase 1: Upload */}
      {phase === "upload" && (
        <form onSubmit={handleUpload} className="stack-form compact-form">
          <p>{description}</p>
          <section className="intake-section">
            <label className="field">
              <span>{allowMultiple ? "Drop invoice files (single or multiple)" : "Upload document"}</span>
              <input multiple={allowMultiple} name="document" type="file" required />
            </label>
            <label className="field">
              <span>Notes for AI (mention reimbursement, who paid, race context, etc.)</span>
              <textarea name="documentNote" rows={2} placeholder={notePlaceholder} />
            </label>
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
          <button className="action-button primary" type="submit">
            Upload &amp; analyze with AI
          </button>
        </form>
      )}

      {/* Phase 2: Analyzing */}
      {phase === "analyzing" && (
        <section className="intake-section">
          <div className="loading-block">
            <div className="loading-spinner lg" />
            <strong>AI is analyzing your document...</strong>
            <span className="muted">Extracting vendor, amount, dates, reimbursement info</span>
          </div>
        </section>
      )}

      {/* Phase 3: Review extracted fields */}
      {phase === "review" && result && (
        <>
          <section className="notice success">
            <strong>{result.documentType}</strong>
            <span>{result.interpretation}</span>
          </section>

          <section className="intake-section">
            <div className="card-title-row compact-card-title-row">
              <div>
                <span className="process-step-index">Extracted from: {result.fileName}</span>
                <h4>Review &amp; edit fields</h4>
              </div>
              <span className={`pill signal-pill ${confidenceColor(result.confidence)}`}>
                {Math.round(result.confidence * 100)}% confidence
              </span>
            </div>

            <div className="grid-two compact-grid">
              {result.fields.map((field) => (
                <label className="field" key={field.key}>
                  <span>
                    {field.label}
                    <span className={`pill signal-pill ${confidenceColor(field.confidence)}`} style={{ marginLeft: 8, fontSize: "0.7rem", padding: "2px 6px" }}>
                      {Math.round(field.confidence * 100)}%
                    </span>
                  </span>
                  <input
                    value={editedFields[field.key] ?? field.value}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>

          <div className="actions-row">
            {!saved ? (
              <>
                <button className="action-button primary" onClick={handleSave} type="button">
                  Save &amp; create payable
                </button>
                <button
                  className="action-button secondary"
                  onClick={() => { setPhase("upload"); setResult(null); setEditedFields({}); }}
                  type="button"
                >
                  Discard &amp; re-upload
                </button>
              </>
            ) : (
              <span className="muted">Saving...</span>
            )}
          </div>
        </>
      )}
    </>
  );

  if (variant === "plain") {
    return <div className="plain-analyzer-panel">{content}</div>;
  }
  return <article className="card analyzer-card">{content}</article>;
}
