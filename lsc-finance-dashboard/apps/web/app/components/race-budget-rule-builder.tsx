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
  {
    key: "food",
    label: "Food / day",
    categoryTerms: ["catering"],
    ruleKind: "per_diem" as const,
    unitLabel: "per_day" as const,
    ruleLabel: "Food / day"
  },
  {
    key: "travel",
    label: "On-site travel / day",
    categoryTerms: ["travel"],
    ruleKind: "per_diem" as const,
    unitLabel: "per_day" as const,
    ruleLabel: "On-site travel / day"
  },
  {
    key: "accommodation",
    label: "Accommodation / day",
    categoryTerms: ["travel"],
    ruleKind: "per_diem" as const,
    unitLabel: "per_day" as const,
    ruleLabel: "Accommodation / day"
  },
  {
    key: "visa",
    label: "Visa / person",
    categoryTerms: ["visa"],
    ruleKind: "approved_charge" as const,
    unitLabel: "per_person" as const,
    ruleLabel: "Visa / person"
  },
  {
    key: "equipment",
    label: "Equipment contingency",
    categoryTerms: ["equipment"],
    ruleKind: "budget_cap" as const,
    unitLabel: "per_race" as const,
    ruleLabel: "Equipment contingency"
  },
  {
    key: "foil",
    label: "Foil damage contingency",
    categoryTerms: ["foil damage"],
    ruleKind: "budget_cap" as const,
    unitLabel: "per_race" as const,
    ruleLabel: "Foil damage contingency"
  }
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
  const normalizedTerms = categoryTerms.map((term) => term.toLowerCase());
  const match = categories.find((category) =>
    normalizedTerms.some((term) => category.label.toLowerCase().includes(term))
  );
  return match?.id ?? "";
}

function mergeDrafts(current: BudgetRuleDraft[], incoming: Array<Omit<BudgetRuleDraft, "id">>) {
  const merged = [...current];

  for (const candidate of incoming) {
    const existingIndex = merged.findIndex(
      (rule) =>
        rule.categoryId === candidate.categoryId &&
        rule.ruleKind === candidate.ruleKind &&
        rule.ruleLabel.toLowerCase() === candidate.ruleLabel.toLowerCase()
    );

    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...candidate
      };
      continue;
    }

    merged.push(makeDraft(candidate));
  }

  return merged;
}

export function RaceBudgetRuleBuilder({
  raceEventId,
  raceLabel,
  categories,
  returnPath
}: RaceBudgetRuleBuilderProps) {
  const [drafts, setDrafts] = useState<BudgetRuleDraft[]>([]);
  const [analysisState, analyzeAction] = useActionState(
    analyzeRaceBudgetDocumentAction,
    INITIAL_ANALYSIS_STATE
  );
  const [lastAppliedKey, setLastAppliedKey] = useState<string | null>(null);

  const categoriesJson = useMemo(() => JSON.stringify(categories), [categories]);
  const commonPerDiemTemplates = useMemo(
    () => QUICK_TEMPLATES.filter((template) => ["food", "travel", "accommodation"].includes(template.key)),
    []
  );

  useEffect(() => {
    if (analysisState.status !== "success" || !analysisState.appliedKey || analysisState.appliedKey === lastAppliedKey) {
      return;
    }

    setDrafts((current) =>
      mergeDrafts(
        current,
        analysisState.rules.map((rule) => ({
          categoryId: rule.categoryId,
          ruleKind: rule.ruleKind,
          unitLabel: rule.unitLabel,
          ruleLabel: rule.ruleLabel,
          approvedAmountUsd: rule.approvedAmountUsd,
          closeThresholdPercent: rule.closeThresholdPercent,
          notes: rule.notes
        }))
      )
    );
    setLastAppliedKey(analysisState.appliedKey);
  }, [analysisState, lastAppliedKey]);

  const addTemplate = (templateKeys: string[]) => {
    const nextRows = QUICK_TEMPLATES.filter((template) => templateKeys.includes(template.key)).map((template) => ({
      categoryId: findCategoryId(categories, template.categoryTerms),
      ruleKind: template.ruleKind,
      unitLabel: template.unitLabel,
      ruleLabel: template.ruleLabel,
      approvedAmountUsd: "",
      closeThresholdPercent: "90",
      notes: ""
    }));

    setDrafts((current) => mergeDrafts(current, nextRows));
  };

  const updateDraft = (id: string, patch: Partial<Omit<BudgetRuleDraft, "id">>) => {
    setDrafts((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule))
    );
  };

  const removeDraft = (id: string) => {
    setDrafts((current) => current.filter((rule) => rule.id !== id));
  };

  return (
    <div className="stack-form">
      <div className="info-grid">
        <div className="process-step">
          <span className="process-step-index">Templates</span>
          <strong>Start with the common race allowances</strong>
          <span className="muted">
            Add the typical per-diems first, then adjust the limits per race before saving.
          </span>
        </div>
      </div>

      <div className="inline-actions">
        <button
          className="action-button secondary"
          onClick={() => addTemplate(commonPerDiemTemplates.map((template) => template.key))}
          type="button"
        >
          Add common per-diem set
        </button>
        {QUICK_TEMPLATES.map((template) => (
          <button
            className="ghost-link"
            key={template.key}
            onClick={() => addTemplate([template.key])}
            type="button"
          >
            {template.label}
          </button>
        ))}
        <button className="ghost-link" onClick={() => setDrafts((current) => [...current, makeDraft()])} type="button">
          Add blank row
        </button>
      </div>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">AI import</span>
            <h4>Analyze a budget or per-diem document</h4>
          </div>
          <span className="pill">Optional</span>
        </div>
        <form action={analyzeAction} className="stack-form">
          <input name="raceLabel" type="hidden" value={raceLabel} />
          <input name="categoriesJson" type="hidden" value={categoriesJson} />
          <label className="field">
            <span>Upload budget or per-diem document</span>
            <input name="document" type="file" required />
          </label>
          <label className="field">
            <span>Admin note</span>
            <textarea
              name="documentNote"
              placeholder="Example: Doha approved per diems and transport caps."
              rows={3}
            />
          </label>
          <div className="actions-row">
            <FormButton label="Analyze and prefill" pendingLabel="Analyzing..." />
            <span className="muted">
              The analyzer will try to create one editable row per approved threshold in the document.
            </span>
          </div>
        </form>
        {analysisState.message ? (
          <div className={`notice ${analysisState.status === "error" ? "error" : "success"}`}>
            <strong>{analysisState.status === "error" ? "Analyzer" : "AI import"}</strong>
            <span>{analysisState.message}</span>
          </div>
        ) : null}
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Budget rows</span>
            <h4>Save multiple thresholds in one go</h4>
          </div>
          <span className="pill">{drafts.length} rows</span>
        </div>
        {drafts.length > 0 ? (
          <form action={saveRaceBudgetRulesAction} className="stack-form">
            <input name="raceEventId" type="hidden" value={raceEventId} />
            <input name="returnPath" type="hidden" value={returnPath} />
            <input name="rulesJson" type="hidden" value={JSON.stringify(drafts)} />
            <div className="support-grid">
              {drafts.map((draft, index) => (
                <article className="card budget-draft-card" key={draft.id}>
                  <div className="card-title-row">
                    <div>
                      <span className="section-kicker">Rule {index + 1}</span>
                      <h4>{draft.ruleLabel || "Untitled rule"}</h4>
                    </div>
                    <button className="ghost-link danger-link" onClick={() => removeDraft(draft.id)} type="button">
                      Remove
                    </button>
                  </div>
                  <div className="grid-two compact-grid">
                    <label className="field">
                      <span>Cost category</span>
                      <select
                        onChange={(event) => updateDraft(draft.id, { categoryId: event.target.value })}
                        value={draft.categoryId}
                      >
                        <option value="">Choose one category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Rule type</span>
                      <select
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            ruleKind: event.target.value as BudgetRuleDraft["ruleKind"]
                          })
                        }
                        value={draft.ruleKind}
                      >
                        <option value="per_diem">Per diem</option>
                        <option value="budget_cap">Budget cap</option>
                        <option value="approved_charge">Approved charge</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid-two compact-grid">
                    <label className="field">
                      <span>Rule label</span>
                      <input
                        onChange={(event) => updateDraft(draft.id, { ruleLabel: event.target.value })}
                        placeholder="Food / day, on-site travel / day, accommodation / day..."
                        value={draft.ruleLabel}
                      />
                    </label>
                    <label className="field">
                      <span>Unit</span>
                      <select
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            unitLabel: event.target.value as BudgetRuleDraft["unitLabel"]
                          })
                        }
                        value={draft.unitLabel}
                      >
                        <option value="per_day">Per day</option>
                        <option value="per_person">Per person</option>
                        <option value="per_race">Per race</option>
                        <option value="total">Total</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid-two compact-grid">
                    <label className="field">
                      <span>Approved amount (USD)</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) => updateDraft(draft.id, { approvedAmountUsd: event.target.value })}
                        placeholder="250"
                        value={draft.approvedAmountUsd}
                      />
                    </label>
                    <label className="field">
                      <span>Close-to-budget threshold (%)</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) => updateDraft(draft.id, { closeThresholdPercent: event.target.value })}
                        placeholder="90"
                        value={draft.closeThresholdPercent}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>Finance note</span>
                    <textarea
                      onChange={(event) => updateDraft(draft.id, { notes: event.target.value })}
                      placeholder="What this approved amount covers and how finance should interpret it."
                      rows={3}
                      value={draft.notes}
                    />
                  </label>
                </article>
              ))}
            </div>
            <div className="actions-row">
              <button className="action-button primary" disabled={drafts.length === 0} type="submit">
                Save budget rules
              </button>
              <span className="muted">
                Saving updates the race budget dashboard immediately and the queue will compare reports against the new thresholds.
              </span>
            </div>
          </form>
        ) : (
          <div className="process-step">
            <span className="process-step-index">Empty</span>
            <strong>Add templates or analyze a document to start</strong>
            <span className="muted">
              This builder is designed for multiple thresholds at once, so start by adding the common race items or importing them from a budget document.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
