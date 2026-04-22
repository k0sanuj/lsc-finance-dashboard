"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  analyzeRaceBudgetDocumentAction,
  saveRaceBudgetRulesAction,
  type RaceBudgetAnalysisState
} from "../tbr/expense-management/actions";
import { FormButton } from "../documents/form-button";

type BudgetCategoryOption = {
  id: string;
  label: string;
};

type BudgetRuleDraft = {
  id: string;
  categoryId: string;
  ruleKind: "per_diem" | "budget_cap" | "approved_charge";
  unitLabel: "per_day" | "per_person" | "per_race" | "total";
  ruleLabel: string;
  approvedAmountUsd: string;
  closeThresholdPercent: string;
  notes: string;
};

type RaceBudgetRuleBuilderProps = {
  raceEventId: string;
  raceLabel: string;
  categories: BudgetCategoryOption[];
  returnPath: string;
};

const INITIAL_ANALYSIS_STATE: RaceBudgetAnalysisState = {
  status: "idle",
  message: "",
  appliedKey: null,
  rules: []
};

const QUICK_TEMPLATES = [
  { key: "food", label: "Food / day", categoryTerms: ["catering"], ruleKind: "per_diem" as const, unitLabel: "per_day" as const, ruleLabel: "Food / day" },
  { key: "travel", label: "Travel / day", categoryTerms: ["travel"], ruleKind: "per_diem" as const, unitLabel: "per_day" as const, ruleLabel: "On-site travel / day" },
  { key: "accommodation", label: "Accommodation / day", categoryTerms: ["travel"], ruleKind: "per_diem" as const, unitLabel: "per_day" as const, ruleLabel: "Accommodation / day" },
  { key: "visa", label: "Visa / person", categoryTerms: ["visa"], ruleKind: "approved_charge" as const, unitLabel: "per_person" as const, ruleLabel: "Visa / person" },
  { key: "equipment", label: "Equipment cap", categoryTerms: ["equipment"], ruleKind: "budget_cap" as const, unitLabel: "per_race" as const, ruleLabel: "Equipment contingency" },
  { key: "foil", label: "Foil damage cap", categoryTerms: ["foil damage"], ruleKind: "budget_cap" as const, unitLabel: "per_race" as const, ruleLabel: "Foil damage contingency" }
];

function makeDraft(partial?: Partial<Omit<BudgetRuleDraft, "id">>): BudgetRuleDraft {
  return {
    id: crypto.randomUUID(),
    categoryId: partial?.categoryId ?? "",
    ruleKind: partial?.ruleKind ?? "budget_cap",
    unitLabel: partial?.unitLabel ?? "per_race",
    ruleLabel: partial?.ruleLabel ?? "",
    approvedAmountUsd: partial?.approvedAmountUsd ?? "",
    closeThresholdPercent: partial?.closeThresholdPercent ?? "90",
    notes: partial?.notes ?? ""
  };
}

function findCategoryId(categories: BudgetCategoryOption[], categoryTerms: string[]) {
  const normalizedTerms = categoryTerms.map((t) => t.toLowerCase());
  return categories.find((c) => normalizedTerms.some((t) => c.label.toLowerCase().includes(t)))?.id ?? "";
}

function mergeDrafts(current: BudgetRuleDraft[], incoming: Array<Omit<BudgetRuleDraft, "id">>) {
  const merged = [...current];
  for (const candidate of incoming) {
    const idx = merged.findIndex(
      (r) => r.categoryId === candidate.categoryId && r.ruleKind === candidate.ruleKind && r.ruleLabel.toLowerCase() === candidate.ruleLabel.toLowerCase()
    );
    if (idx >= 0) { merged[idx] = { ...merged[idx], ...candidate }; continue; }
    merged.push(makeDraft(candidate));
  }
  return merged;
}

export function RaceBudgetRuleBuilder({ raceEventId, raceLabel, categories, returnPath }: RaceBudgetRuleBuilderProps) {
  const [drafts, setDrafts] = useState<BudgetRuleDraft[]>([]);
  const [analysisState, analyzeAction] = useActionState(analyzeRaceBudgetDocumentAction, INITIAL_ANALYSIS_STATE);
  const [lastAppliedKey, setLastAppliedKey] = useState<string | null>(null);

  const categoriesJson = useMemo(() => JSON.stringify(categories), [categories]);

  useEffect(() => {
    if (analysisState.status !== "success" || !analysisState.appliedKey || analysisState.appliedKey === lastAppliedKey) return;
    setDrafts((current) =>
      mergeDrafts(current, analysisState.rules.map((r) => ({
        categoryId: r.categoryId, ruleKind: r.ruleKind, unitLabel: r.unitLabel,
        ruleLabel: r.ruleLabel, approvedAmountUsd: r.approvedAmountUsd,
        closeThresholdPercent: r.closeThresholdPercent, notes: r.notes
      })))
    );
    setLastAppliedKey(analysisState.appliedKey);
  }, [analysisState, lastAppliedKey]);

  const addTemplate = (keys: string[]) => {
    const rows = QUICK_TEMPLATES.filter((t) => keys.includes(t.key)).map((t) => ({
      categoryId: findCategoryId(categories, t.categoryTerms),
      ruleKind: t.ruleKind, unitLabel: t.unitLabel, ruleLabel: t.ruleLabel,
      approvedAmountUsd: "", closeThresholdPercent: "90", notes: ""
    }));
    setDrafts((current) => mergeDrafts(current, rows));
  };

  const updateDraft = (id: string, patch: Partial<Omit<BudgetRuleDraft, "id">>) => {
    setDrafts((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeDraft = (id: string) => {
    setDrafts((current) => current.filter((r) => r.id !== id));
  };

  return (
    <div className="stack-form">
      {/* Quick add buttons */}
      <div className="inline-actions">
        <button className="action-button secondary" onClick={() => addTemplate(["food", "travel", "accommodation"])} type="button">
          Add common per-diems
        </button>
        {QUICK_TEMPLATES.map((t) => (
          <button className="ghost-link" key={t.key} onClick={() => addTemplate([t.key])} type="button">
            + {t.label}
          </button>
        ))}
        <button className="ghost-link" onClick={() => setDrafts((c) => [...c, makeDraft()])} type="button">
          + Blank row
        </button>
      </div>

      {/* Editable table */}
      <form action={saveRaceBudgetRulesAction} className="stack-form">
        <input name="raceEventId" type="hidden" value={raceEventId} />
        <input name="returnPath" type="hidden" value={returnPath} />
        <input name="rulesJson" type="hidden" value={JSON.stringify(drafts)} />

        {drafts.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Unit</th>
                  <th>Amount (USD)</th>
                  <th>Threshold</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td>
                      <input
                        className="table-input"
                        value={draft.ruleLabel}
                        onChange={(e) => updateDraft(draft.id, { ruleLabel: e.target.value })}
                        placeholder="Food / day"
                      />
                    </td>
                    <td>
                      <select
                        className="table-select"
                        value={draft.categoryId}
                        onChange={(e) => updateDraft(draft.id, { categoryId: e.target.value })}
                      >
                        <option value="">--</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="table-select"
                        value={draft.ruleKind}
                        onChange={(e) => updateDraft(draft.id, { ruleKind: e.target.value as BudgetRuleDraft["ruleKind"] })}
                      >
                        <option value="per_diem">Per diem</option>
                        <option value="budget_cap">Cap</option>
                        <option value="approved_charge">Charge</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className="table-select"
                        value={draft.unitLabel}
                        onChange={(e) => updateDraft(draft.id, { unitLabel: e.target.value as BudgetRuleDraft["unitLabel"] })}
                      >
                        <option value="per_day">/day</option>
                        <option value="per_person">/person</option>
                        <option value="per_race">/race</option>
                        <option value="total">total</option>
                      </select>
                    </td>
                    <td>
                      <div className="currency-input">
                        <span className="currency-symbol">$</span>
                        <input
                          inputMode="decimal"
                          value={draft.approvedAmountUsd}
                          onChange={(e) => updateDraft(draft.id, { approvedAmountUsd: e.target.value })}
                          placeholder="250.00"
                        />
                      </div>
                    </td>
                    <td>
                      <div className="threshold-input">
                        <input
                          inputMode="decimal"
                          value={draft.closeThresholdPercent}
                          onChange={(e) => updateDraft(draft.id, { closeThresholdPercent: e.target.value })}
                          placeholder="90"
                        />
                        <span className="unit-suffix">%</span>
                      </div>
                    </td>
                    <td>
                      <button className="remove-button" onClick={() => removeDraft(draft.id)} type="button" aria-label="Remove rule">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-note">No budget items yet — add templates above or upload a document below.</div>
        )}

        {drafts.length > 0 && (
          <button className="action-button primary" type="submit">
            Save {drafts.length} budget rule{drafts.length !== 1 ? "s" : ""}
          </button>
        )}
      </form>

      {/* Document upload — AI fills the table */}
      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">AI import</span>
            <h4>Upload per-diem or budget document</h4>
          </div>
        </div>
        <form action={analyzeAction} className="stack-form">
          <input name="raceLabel" type="hidden" value={raceLabel} />
          <input name="categoriesJson" type="hidden" value={categoriesJson} />
          <label className="field">
            <span>Upload document</span>
            <input name="document" type="file" required />
          </label>
          <label className="field">
            <span>Note</span>
            <textarea name="documentNote" placeholder="E.g.: Doha approved per diems and transport caps." rows={2} />
          </label>
          <FormButton label="Analyze & fill table" pendingLabel="Analyzing..." />
        </form>
        {analysisState.message ? (
          <div className={`notice ${analysisState.status === "error" ? "error" : "success"}`}>
            <strong>{analysisState.status === "error" ? "Error" : "Imported"}</strong>
            <span>{analysisState.message}</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
