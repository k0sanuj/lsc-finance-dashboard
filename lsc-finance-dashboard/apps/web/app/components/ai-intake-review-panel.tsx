import { getAiIntakeDraftDetail } from "@lsc/db";
import { reviewAiIntakeDraftAction } from "../ai-intake/actions";

type AIIntakeReviewPanelProps = {
  draftId?: string | null;
  redirectPath: string;
  title?: string;
  restrictToUserId?: string | null;
};

function confidenceTone(value: string) {
  const confidence = Number(value);
  if (confidence >= 0.9) return "signal-good";
  if (confidence >= 0.7) return "signal-warn";
  return "signal-risk";
}

function targetLabel(value: string) {
  return value.replace(/_/g, " ");
}

function approveButtonLabel(targetKind: string, workflowContext: string | null) {
  if (
    workflowContext?.startsWith("tbr-race:") &&
    (targetKind === "expense_receipt" || targetKind === "reimbursement_bundle")
  ) {
    return "Approve for report";
  }
  return "Approve and post";
}

export async function AIIntakeReviewPanel({
  draftId,
  redirectPath,
  title = "AI intake preview",
  restrictToUserId,
}: AIIntakeReviewPanelProps) {
  if (!draftId) return null;

  const detail = await getAiIntakeDraftDetail(draftId, restrictToUserId ?? null);
  if (!detail) {
    return (
      <section className="notice error">
        <strong>AI draft unavailable</strong>
        <span>The selected intake draft could not be loaded.</span>
      </section>
    );
  }

  const canReview = ["needs_review", "failed"].includes(detail.status);
  const confidencePct = `${Math.round(Number(detail.confidence) * 100)}%`;
  const approvalLabel = approveButtonLabel(detail.targetKind, detail.workflowContext);

  return (
    <section className="card">
      <div className="card-title-row">
        <div>
          <span className="section-kicker">Preview & approval</span>
          <h3>{title}</h3>
        </div>
        <div className="inline-actions">
          <span className={`pill signal-pill ${confidenceTone(detail.confidence)}`}>{confidencePct}</span>
          <span className="pill">{detail.status.replace(/_/g, " ")}</span>
        </div>
      </div>

      <div className="grid-two">
        <article className="compact-section-card">
          <span className="section-kicker">Source</span>
          <h4>{detail.sourceName}</h4>
          <p className="muted">{detail.detectedDocumentType} · {targetLabel(detail.targetKind)}</p>
          {detail.financeInterpretation ? <p>{detail.financeInterpretation}</p> : null}
          {detail.errorMessage ? (
            <p className="muted">Analyzer note: {detail.errorMessage}</p>
          ) : null}
          {detail.previewDataUrl && detail.previewMimeType?.startsWith("image/") ? (
            <img
              alt="AI intake source preview"
              src={detail.previewDataUrl}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                display: "block",
                marginTop: 12,
                maxHeight: 320,
                maxWidth: "100%",
                objectFit: "contain",
              }}
            />
          ) : detail.inputText ? (
            <pre className="code-block">{detail.inputText.slice(0, 1200)}</pre>
          ) : null}
        </article>

        <article className="compact-section-card">
          <span className="section-kicker">Lineage</span>
          <div className="table-wrapper clean-table">
            <table>
              <tbody>
                <tr>
                  <th>Company</th>
                  <td>{detail.companyCode}</td>
                </tr>
                <tr>
                  <th>Workflow</th>
                  <td>{detail.workflowContext ?? "ai-intake"}</td>
                </tr>
                <tr>
                  <th>Submitted by</th>
                  <td>{detail.submittedBy}</td>
                </tr>
                <tr>
                  <th>Source document</th>
                  <td>{detail.sourceDocumentId ?? "typed source"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <form action={reviewAiIntakeDraftAction} className="stack-form compact-form">
        <input name="draftId" type="hidden" value={detail.id} />
        <input name="redirectPath" type="hidden" value={redirectPath} />

        <section className="intake-section">
          <div className="card-title-row compact-card-title-row">
            <div>
              <span className="section-kicker">Mapped fields</span>
              <h4>Editable preview</h4>
            </div>
            <span className="pill">{detail.fields.length} fields</span>
          </div>

          {detail.fields.length > 0 ? (
            <div className="form-grid">
              {detail.fields.map((field) => (
                <label className="field" key={field.id}>
                  <span>
                    {field.fieldLabel}
                    <span
                      className={`pill signal-pill ${confidenceTone(field.confidence)}`}
                      style={{ marginLeft: 8 }}
                    >
                      {Math.round(Number(field.confidence) * 100)}%
                    </span>
                  </span>
                  {field.previewValue.length > 90 ? (
                    <textarea
                      defaultValue={field.previewValue}
                      disabled={!canReview}
                      name={`field:${field.id}`}
                      rows={3}
                    />
                  ) : (
                    <input
                      defaultValue={field.previewValue}
                      disabled={!canReview}
                      name={`field:${field.id}`}
                      type="text"
                    />
                  )}
                  <span className="muted text-xs">
                    {field.canonicalTargetTable || "canonical target"} · {field.canonicalTargetColumn || "field"}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="muted">No extracted fields are available for this draft.</p>
          )}

          <label className="field">
            <span>Reviewer notes</span>
            <textarea disabled={!canReview} name="reviewerNotes" rows={2} />
          </label>
        </section>

        {canReview ? (
          <div className="form-actions">
            <button className="action-button secondary" name="intent" type="submit" value="save">
              Save preview
            </button>
            <button className="action-button primary" name="intent" type="submit" value="approve">
              {approvalLabel}
            </button>
            <button className="action-button secondary" name="intent" type="submit" value="reject">
              Reject
            </button>
            <button className="action-button secondary" name="intent" type="submit" value="discard">
              Discard
            </button>
          </div>
        ) : (
          <span className="muted">This draft has moved past active review.</span>
        )}
      </form>

      {detail.postingEvents.length > 0 ? (
        <section className="intake-section">
          <div className="card-title-row compact-card-title-row">
            <div>
              <span className="section-kicker">Posting trail</span>
              <h4>Canonical updates</h4>
            </div>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Summary</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {detail.postingEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{event.targetTable}</td>
                    <td><span className="pill">{event.status}</span></td>
                    <td>{event.summary || event.error}</td>
                    <td>{event.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}
