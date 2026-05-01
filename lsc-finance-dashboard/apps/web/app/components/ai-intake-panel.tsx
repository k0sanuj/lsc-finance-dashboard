import { createAiIntakeDraftAction } from "../ai-intake/actions";
import type { VisibleEntityCode } from "../lib/entities";

export type AiIntakeTargetKind =
  | "vendor_invoice"
  | "expense_receipt"
  | "reimbursement_bundle"
  | "sponsorship_commercial_document"
  | "fsp_sport_media_kit"
  | "fsp_sport_sponsorship_document"
  | "xtz_payroll_vendor_invoice_support";

export type AiIntakeTargetOption = {
  value: AiIntakeTargetKind;
  label: string;
};

export const AI_INTAKE_TARGET_OPTIONS: AiIntakeTargetOption[] = [
  { value: "vendor_invoice", label: "Vendor invoice" },
  { value: "expense_receipt", label: "Expense receipt" },
  { value: "reimbursement_bundle", label: "Reimbursement bundle" },
  { value: "sponsorship_commercial_document", label: "Sponsorship / commercial document" },
  { value: "fsp_sport_media_kit", label: "FSP sport media kit" },
  { value: "fsp_sport_sponsorship_document", label: "FSP sport sponsorship document" },
  { value: "xtz_payroll_vendor_invoice_support", label: "XTZ payroll/vendor support" },
];

type AIIntakePanelProps = {
  title: string;
  description?: string;
  companyCode: VisibleEntityCode;
  redirectPath: string;
  workflowContext: string;
  defaultTargetKind: AiIntakeTargetKind;
  targetOptions?: AiIntakeTargetOption[];
  targetEntityType?: string;
  targetEntityId?: string;
  notePlaceholder?: string;
  textPlaceholder?: string;
  variant?: "card" | "plain";
};

export function AIIntakePanel({
  title,
  description,
  companyCode,
  redirectPath,
  workflowContext,
  defaultTargetKind,
  targetOptions,
  targetEntityType,
  targetEntityId,
  notePlaceholder = "Add context for entity, race, period, payee, or assumptions.",
  textPlaceholder = "Paste invoice text, contract terms, receipt details, or payroll/vendor support notes.",
  variant = "card",
}: AIIntakePanelProps) {
  const options = targetOptions?.length ? targetOptions : [{ value: defaultTargetKind, label: "Selected intake" }];
  const content = (
    <>
      <div className="card-title-row">
        <div>
          <span className="section-kicker">AI intake</span>
          <h3>{title}</h3>
        </div>
        <span className="pill">Preview first</span>
      </div>
      {description ? <p className="muted">{description}</p> : null}
      <form action={createAiIntakeDraftAction} className="stack-form compact-form">
        <input name="companyCode" type="hidden" value={companyCode} />
        <input name="redirectPath" type="hidden" value={redirectPath} />
        <input name="workflowContext" type="hidden" value={workflowContext} />
        {targetEntityType ? <input name="targetEntityType" type="hidden" value={targetEntityType} /> : null}
        {targetEntityId ? <input name="targetEntityId" type="hidden" value={targetEntityId} /> : null}

        <section className="intake-section">
          {options.length > 1 ? (
            <label className="field">
              <span>Target</span>
              <select defaultValue={defaultTargetKind} name="targetKind">
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input name="targetKind" type="hidden" value={defaultTargetKind} />
          )}

          <label className="field">
            <span>Upload</span>
            <input name="document" type="file" />
          </label>

          <label className="field">
            <span>Type or paste</span>
            <textarea name="typedInput" placeholder={textPlaceholder} rows={4} />
          </label>

          <label className="field">
            <span>Context</span>
            <textarea name="documentNote" placeholder={notePlaceholder} rows={2} />
          </label>
        </section>

        <div className="form-actions">
          <button className="action-button primary" type="submit">
            AI extract
          </button>
        </div>
      </form>
    </>
  );

  if (variant === "plain") return content;
  return <article className="card">{content}</article>;
}
