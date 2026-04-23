"use client";

import { useRef, useState, type FormEvent } from "react";

/**
 * Drop-in panel: upload a document, POST to an /api/analyze/* endpoint, and
 * prefill a nearby form with the extracted fields. Prefilling works by DOM
 * lookup of the target form (identified via a data-ai-target attribute) and
 * setting each input's value + dispatching an input event so React re-reads
 * it. This keeps the forms themselves as plain server-rendered <form> tags
 * with server-action submission — no client state lift required.
 */

type FieldMap = Record<string, string | number | null | undefined>;

type Props = {
  /**
   * Path to POST the file to, e.g. "/api/analyze/sponsorship". Must return
   * { ok: true, extract: FieldMap } on success.
   */
  endpoint: string;
  /**
   * data-ai-target value of the target form(s). If the extract JSON has a
   * flat shape, the fields are applied to the single form with this target.
   * For media-kit where the extract is nested ({ nonLinear, linear }), pass
   * `targetFormByKey` instead.
   */
  targetForm?: string;
  /**
   * For nested extracts: maps a top-level key of the extract JSON to a
   * form target. E.g. { nonLinear: "media-non_linear", linear: "media-linear" }.
   */
  targetFormByKey?: Record<string, string>;
  /** Button label (e.g. "Extract from contract"). */
  label: string;
  /** Short helper text shown above the file input. */
  hint?: string;
  /** Accepted MIME types on the file picker. */
  accept?: string;
};

type ExtractResponse = {
  ok?: boolean;
  error?: string;
  fileName?: string;
  modelUsed?: string;
  tokensUsed?: { total?: number } | null;
  extract?: FieldMap | Record<string, FieldMap> | null;
};

function applyFieldsToForm(form: HTMLFormElement, fields: FieldMap): string[] {
  const applied: string[] = [];
  for (const [key, rawValue] of Object.entries(fields)) {
    if (rawValue === null || rawValue === undefined) continue;
    const el = form.elements.namedItem(key) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null;
    if (!el) continue;
    const value = typeof rawValue === "number" ? String(rawValue) : rawValue;
    if (el instanceof HTMLSelectElement) {
      // Only set if the value is a valid option
      const match = Array.from(el.options).find((o) => o.value === value);
      if (match) {
        el.value = value;
      } else {
        continue;
      }
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    applied.push(key);
  }
  return applied;
}

export default function AIExtractPanel({
  endpoint,
  targetForm,
  targetFormByKey,
  label,
  hint,
  accept = "application/pdf,image/png,image/jpeg",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Pick a file first.");
      return;
    }
    setPending(true);
    try {
      const fd = new FormData();
      fd.append("document", file);
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = (await res.json()) as ExtractResponse;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Upload failed (${res.status}).`);
        return;
      }
      const extract = json.extract;
      if (!extract) {
        setError("The analyzer returned no fields.");
        return;
      }

      let appliedTotal = 0;
      let appliedForms = 0;

      if (targetFormByKey) {
        // Nested: each top-level key maps to a different form
        for (const [extractKey, formKey] of Object.entries(targetFormByKey)) {
          const nested = (extract as Record<string, FieldMap>)[extractKey];
          if (!nested) continue;
          const form = document.querySelector<HTMLFormElement>(
            `form[data-ai-target="${formKey}"]`
          );
          if (!form) continue;
          const applied = applyFieldsToForm(form, nested);
          appliedTotal += applied.length;
          if (applied.length > 0) appliedForms += 1;
        }
      } else if (targetForm) {
        const form = document.querySelector<HTMLFormElement>(
          `form[data-ai-target="${targetForm}"]`
        );
        if (!form) {
          setError(`Target form not found on page (${targetForm}).`);
          return;
        }
        const applied = applyFieldsToForm(form, extract as FieldMap);
        appliedTotal = applied.length;
        appliedForms = applied.length > 0 ? 1 : 0;
      }

      if (appliedTotal === 0) {
        setError(
          "Extracted fields did not match any form input. The document may not be the right type."
        );
        return;
      }

      setSuccess(
        `Prefilled ${appliedTotal} field${appliedTotal === 1 ? "" : "s"}${
          appliedForms > 1 ? ` across ${appliedForms} forms` : ""
        }. Review and save.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ai-extract-panel" onSubmit={handleSubmit}>
      <div className="ai-extract-header">
        <span className="section-kicker">AI ingest</span>
        <strong>{label}</strong>
        {hint ? <span className="muted text-xs">{hint}</span> : null}
      </div>
      <div className="ai-extract-controls">
        <input
          type="file"
          accept={accept}
          ref={fileInputRef}
          disabled={pending}
        />
        <button
          className="action-button primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Analyzing…" : "Analyze & prefill"}
        </button>
      </div>
      {error ? (
        <div className="notice error" role="alert">
          <strong>Analysis failed</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className="notice success" role="status">
          <strong>Prefilled</strong>
          <span>{success}</span>
        </div>
      ) : null}
    </form>
  );
}
