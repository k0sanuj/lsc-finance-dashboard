"use client";

import { useState } from "react";

type ParsedBill = {
  vendor: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  confidence: number;
};

type BillUploaderProps = {
  // The form whose fields we should pre-fill. We look up form inputs by name.
  formId: string;
  // Map from parsed-bill keys → form input names. Caller passes only what
  // exists on its form. e.g. { vendor: "vendorName", amount: "amount", date: null }
  fieldMap: Partial<{
    vendor: string;
    description: string;
    amount: string;
    currency: string;
    date: string;
    category: string;
    monthInput: string; // a separate input[type=month] that takes YYYY-MM from date
  }>;
  label?: string;
  helperText?: string;
};

export function BillUploader({
  formId,
  fieldMap,
  label = "Upload bill / receipt — AI auto-fill",
  helperText = "Drop a PDF or photo of the receipt and we'll fill the form below."
}: BillUploaderProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedBill | null>(null);

  function setField(name: string | undefined, value: string) {
    if (!name) return;
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const input = form.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (!input) return;
    if (input instanceof HTMLSelectElement) {
      // Try to match an option
      const opt = Array.from(input.options).find(
        (o) => o.value.toLowerCase() === value.toLowerCase()
      );
      if (opt) input.value = opt.value;
    } else {
      input.value = value;
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-bill", {
        method: "POST",
        body: fd
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const parsed = (await res.json()) as ParsedBill;
      setResult(parsed);

      // Apply to form
      setField(fieldMap.vendor, parsed.vendor);
      setField(fieldMap.description, parsed.description);
      setField(fieldMap.amount, parsed.amount > 0 ? String(parsed.amount) : "");
      setField(fieldMap.currency, parsed.currency);
      setField(fieldMap.date, parsed.date);
      setField(fieldMap.category, parsed.category);
      // If we have a YYYY-MM-DD date and a separate month field, set the month too
      if (parsed.date && parsed.date.length >= 7 && fieldMap.monthInput) {
        setField(fieldMap.monthInput, parsed.date.slice(0, 7));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bill-uploader">
      <div className="bill-uploader-label">
        <strong>{label}</strong>
        <span className="muted">{helperText}</span>
      </div>
      <input
        type="file"
        accept="image/*,application/pdf"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {busy ? (
        <span className="bill-uploader-status">
          Analyzing with Gemini...
        </span>
      ) : null}
      {error ? (
        <span className="bill-uploader-error">Error: {error}</span>
      ) : null}
      {result ? (
        <span className="bill-uploader-success">
          Parsed: <strong>{result.vendor || "Unknown vendor"}</strong>{" "}
          {result.amount > 0
            ? `· ${result.amount.toLocaleString()} ${result.currency}`
            : ""}{" "}
          · confidence {(result.confidence * 100).toFixed(0)}%
        </span>
      ) : null}
    </div>
  );
}
