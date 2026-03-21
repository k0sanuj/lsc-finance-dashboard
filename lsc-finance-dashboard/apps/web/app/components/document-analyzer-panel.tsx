"use client";

import { useState } from "react";
import { analyzeDocumentAction } from "../documents/actions";
import { FormButton } from "../documents/form-button";

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

type AnalysisResult = {
  success: boolean;
  message: string;
  documentName?: string;
  fields?: Array<{ label: string; value: string; confidence?: number }>;
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
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPhase("analyzing");
    setError(null);

    try {
      // Call the server action — it will redirect on success
      // We catch the redirect and parse the result from the URL
      await analyzeDocumentAction(formData);
    } catch (err) {
      // Server actions that redirect throw a NEXT_REDIRECT error
      // which is expected behavior — the action succeeded
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("NEXT_REDIRECT")) {
        // Action succeeded and tried to redirect
        setResult({
          success: true,
          message: "Document analyzed successfully. Review the extracted fields below.",
          documentName: (formData.get("document") as File)?.name ?? "document",
        });
        setPhase("review");
      } else {
        setError(message);
        setPhase("upload");
      }
    }
  }

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

      {error && (
        <div className="notice error">
          <strong>Error</strong>
          <span>{error}</span>
        </div>
      )}

      {phase === "upload" && (
        <form action={handleSubmit} className="stack-form compact-form">
          <input name="companyCode" type="hidden" value={companyCode} />
          <input name="redirectPath" type="hidden" value={redirectPath} />
          <input name="workflowContext" type="hidden" value={workflowContext ?? redirectPath} />
          <input name="workflowGroup" type="hidden" value="vendor-invoices" />
          <input name="intakeCategory" type="hidden" value="vendor_invoice" />

          {/* Upload */}
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

          <div className="actions-row">
            <FormButton label="Upload & analyze with AI" pendingLabel="Analyzing..." />
          </div>
        </form>
      )}

      {phase === "analyzing" && (
        <section className="intake-section">
          <div className="loading-block">
            <div className="loading-spinner lg" />
            <span>AI is analyzing your document...</span>
            <span className="muted">Extracting vendor, amount, dates, and other fields</span>
          </div>
        </section>
      )}

      {phase === "review" && result && (
        <>
          <section className="notice success">
            <strong>Analyzed</strong>
            <span>{result.message}</span>
          </section>

          <section className="intake-section">
            <div className="card-title-row compact-card-title-row">
              <div>
                <span className="process-step-index">Result</span>
                <h4>Document: {result.documentName}</h4>
              </div>
            </div>
            <div className="process-step compact-process-step">
              <span className="process-step-index">Note</span>
              <strong>The document has been saved and analyzed</strong>
              <span className="muted">
                Go to the Invoice Hub page to review the extracted fields, approve or reject the intake.
                The document is stored in S3 and linked to the analysis run.
              </span>
            </div>
          </section>

          <div className="actions-row">
            <a className="action-button primary" href={redirectPath}>
              Review extracted fields
            </a>
            <button
              className="action-button secondary"
              onClick={() => { setPhase("upload"); setResult(null); }}
              type="button"
            >
              Upload another
            </button>
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
