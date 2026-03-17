import {
  formatOriginSourceLabel,
  formatTargetLabel,
  formatWorkflowContextLabel
} from "../lib/workflow-labels";

type DocumentDetail = {
  analysisRunId: string;
  documentName: string;
  documentType: string;
  status: string;
  confidence: string;
  proposedTarget: string;
  financeInterpretation: string;
  createdAt: string;
  uploaderName: string;
  workflowContext: string;
  previewDataUrl: string | null;
  previewMimeType: string | null;
  originSource: string;
  originCountry: string;
  currencyCode: string;
  issuerCountry: string;
  intakeCategory: string;
  intakeFields: Array<{
    label: string;
    value: string;
  }>;
  platformUpdates: Array<{
    area: string;
    effect: string;
  }>;
};

type DocumentField = {
  field: string;
  proposedValue: string;
  confidence: string;
  approval: string;
};

type DocumentPosting = {
  target: string;
  status: string;
  summary: string;
};

type DocumentAnalysisSummaryProps = {
  detail: DocumentDetail | null;
  fields: DocumentField[];
  postingEvents?: DocumentPosting[];
  title?: string;
};

export function DocumentAnalysisSummary({
  detail,
  fields,
  postingEvents = [],
  title = "Selected analysis"
}: DocumentAnalysisSummaryProps) {
  if (!detail) {
    return (
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Analysis detail</span>
            <h3>{title}</h3>
          </div>
        </div>
        <div className="process-step">
          <span className="process-step-index">Awaiting selection</span>
          <strong>No document selected yet</strong>
          <span className="muted">
            Upload a receipt or choose one of your recent analysis runs to see the preview, extracted fields, and posting trail here.
          </span>
        </div>
      </article>
    );
  }

  const extractedFieldCount = fields.length;
  const postingEventCount = postingEvents.length;

  return (
    <article className="card analysis-summary-card">
      <div className="card-title-row">
        <div>
          <span className="section-kicker">Analysis detail</span>
          <h3>{title}</h3>
        </div>
        <span className="pill">{detail.status}</span>
      </div>

      <div className="analysis-summary-grid">
        <div className="analysis-preview">
          {detail.previewDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={detail.documentName} src={detail.previewDataUrl} />
          ) : (
            <div className="analysis-preview-placeholder">
              <strong>No inline preview</strong>
              <span className="muted">
                Previewable receipt images render here after upload or from private storage.
              </span>
            </div>
          )}
        </div>

        <div className="analysis-meta">
          <div className="mini-metric-grid">
            <div className="mini-metric">
              <span>Type</span>
              <strong>{detail.documentType}</strong>
            </div>
            <div className="mini-metric">
              <span>Confidence</span>
              <strong>{detail.confidence}</strong>
            </div>
            <div className="mini-metric">
              <span>Workflow</span>
              <strong>{formatWorkflowContextLabel(detail.workflowContext)}</strong>
            </div>
            <div className="mini-metric">
              <span>Target</span>
              <strong>{formatTargetLabel(detail.proposedTarget)}</strong>
            </div>
            <div className="mini-metric">
              <span>Intake category</span>
              <strong>{detail.intakeCategory}</strong>
            </div>
          </div>

          <div className="key-value-list">
            <div className="key-value-row">
              <span>Document</span>
              <strong className="detail-value-break">{detail.documentName}</strong>
            </div>
            <div className="key-value-row">
              <span>Uploaded by</span>
              <strong>{detail.uploaderName}</strong>
            </div>
            <div className="key-value-row">
              <span>Uploaded on</span>
              <strong>{detail.createdAt}</strong>
            </div>
            <div className="key-value-row">
              <span>Origin source</span>
              <strong>{formatOriginSourceLabel(detail.originSource)}</strong>
            </div>
            <div className="key-value-row">
              <span>Origin country</span>
              <strong>{detail.originCountry}</strong>
            </div>
            <div className="key-value-row">
              <span>Issuer country</span>
              <strong>{detail.issuerCountry}</strong>
            </div>
            <div className="key-value-row">
              <span>Currency</span>
              <strong>{detail.currencyCode}</strong>
            </div>
            <div className="key-value-row">
              <span>Proposed target</span>
              <strong>{formatTargetLabel(detail.proposedTarget)}</strong>
            </div>
          </div>

          <div className="process-step compact-process-step">
            <span className="process-step-index">Finance interpretation</span>
            <strong>{detail.financeInterpretation}</strong>
          </div>
        </div>
      </div>

      <div className="mini-metric-grid detail-summary-grid">
        <div className="mini-metric">
          <span>Saved intake fields</span>
          <strong>{detail.intakeFields.length}</strong>
        </div>
        <div className="mini-metric">
          <span>Platform updates</span>
          <strong>{detail.platformUpdates.length}</strong>
        </div>
        <div className="mini-metric">
          <span>Extracted fields</span>
          <strong>{extractedFieldCount}</strong>
        </div>
        <div className="mini-metric">
          <span>Posting events</span>
          <strong>{postingEventCount}</strong>
        </div>
      </div>

      <div className="analysis-disclosure-grid">
        <details className="detail-disclosure" open>
          <summary>
            <span>Saved intake fields</span>
            <strong>{detail.intakeFields.length}</strong>
          </summary>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Saved intake field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {detail.intakeFields.length > 0 ? (
                  detail.intakeFields.map((field) => (
                    <tr key={`${field.label}-${field.value}`}>
                      <td>{field.label}</td>
                      <td>{field.value}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={2}>
                      No operator-supplied intake fields were saved for this run.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>

        <details className="detail-disclosure">
          <summary>
            <span>Platform updates</span>
            <strong>{detail.platformUpdates.length}</strong>
          </summary>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Platform area</th>
                  <th>Update path</th>
                </tr>
              </thead>
              <tbody>
                {detail.platformUpdates.length > 0 ? (
                  detail.platformUpdates.map((update) => (
                    <tr key={`${update.area}-${update.effect}`}>
                      <td>{update.area}</td>
                      <td>{update.effect}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={2}>
                      No platform-update mapping was saved for this run.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>

        <details className="detail-disclosure">
          <summary>
            <span>Extracted fields</span>
            <strong>{extractedFieldCount}</strong>
          </summary>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                  <th>Confidence</th>
                  <th>Approval</th>
                </tr>
              </thead>
              <tbody>
                {fields.length > 0 ? (
                  fields.map((field) => (
                    <tr key={`${field.field}-${field.proposedValue}`}>
                      <td>{field.field}</td>
                      <td>{field.proposedValue}</td>
                      <td>{field.confidence}</td>
                      <td>{field.approval}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={4}>
                      No extracted fields yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>

        <details className="detail-disclosure">
          <summary>
            <span>Posting history</span>
            <strong>{postingEventCount}</strong>
          </summary>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Posting target</th>
                  <th>Status</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {postingEvents.length > 0 ? (
                  postingEvents.map((event) => (
                    <tr key={`${event.target}-${event.summary}`}>
                      <td>{event.target}</td>
                      <td>{event.status}</td>
                      <td>{event.summary}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={3}>
                      No posting events yet for this analysis run.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </article>
  );
}
