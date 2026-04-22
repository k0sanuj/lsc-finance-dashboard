/**
 * Invoice Math Verifier (HITL, T1 — Claude Haiku)
 *
 * Given a canonical invoice id OR a payroll invoice id, fetches the invoice
 * + its line items and checks:
 *   - line item amounts sum to subtotal
 *   - tax/discount/total math is internally consistent
 *   - currency conversion rates are plausible (when fx_rate present)
 *
 * Returns structured findings. Read-only — never mutates the invoice.
 * Meant to be invoked on-demand by the orchestrator or by a future
 * invoice:created cascade hook.
 */

import { queryRowsAdmin } from "@lsc/db";
import { callLlm } from "../shared/llm";

export type MathVerification = {
  target: "canonical-invoice" | "payroll-invoice";
  invoiceId: string;
  passed: boolean;
  findings: MathFinding[];
  lineSumComputed: number;
  totalReported: number;
  variance: number;
  summary: string;
  tokensUsed?: { prompt: number; candidates: number; total: number };
  modelUsed: string;
};

export type MathFinding = {
  severity: "info" | "warn" | "error";
  rule: string;
  detail: string;
};

const SYSTEM_PROMPT = `You verify finance-invoice arithmetic for League Sports Co.

Rules:
- Treat numeric mismatches >= 0.5 as an error, 0.01–0.49 as a warn (rounding).
- If fx_rate present on a line, line amount should ≈ original_amount × fx_rate.
- If tax_amount on invoice is set, subtotal + tax_amount should ≈ total_amount.
- If lineSumComputed ≠ totalReported by > 0.5, surface as error.
- Never invent numbers. Base every finding on the provided arithmetic.
- Keep rule names short ("line sum", "fx math", "tax addition").`;

const SCHEMA = {
  type: "object",
  required: ["passed", "findings", "summary"],
  properties: {
    passed: { type: "boolean" },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "rule", "detail"],
        properties: {
          severity: { type: "string", enum: ["info", "warn", "error"] },
          rule: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
};

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function verifyPayrollInvoiceMath(invoiceId: string): Promise<MathVerification> {
  const headerRows = await queryRowsAdmin<{
    id: string;
    invoice_number: string;
    subtotal: string;
    tax_amount: string;
    total_amount: string;
    currency_code: string;
  }>(
    `select id, invoice_number, subtotal::text, tax_amount::text, total_amount::text, currency_code
     from payroll_invoices
     where id = $1
     limit 1`,
    [invoiceId]
  );
  const header = headerRows[0];
  if (!header) {
    return {
      target: "payroll-invoice",
      invoiceId,
      passed: false,
      findings: [{ severity: "error", rule: "lookup", detail: "Invoice not found." }],
      lineSumComputed: 0,
      totalReported: 0,
      variance: 0,
      summary: `Invoice ${invoiceId} not found.`,
      modelUsed: "n/a",
    };
  }

  const lines = await queryRowsAdmin<{
    description: string | null;
    quantity: string;
    unit_price: string;
    amount: string;
    section: string | null;
    original_amount: string | null;
    original_currency: string | null;
    fx_rate: string | null;
  }>(
    `select description, quantity::text, unit_price::text, amount::text, section::text,
            original_amount::text, original_currency, fx_rate::text
     from payroll_invoice_items
     where payroll_invoice_id = $1`,
    [invoiceId]
  );

  // Deterministic pre-computation: line sum + variance — LLM augments with judgement on rounding / fx
  const lineSum = lines.reduce((s, l) => s + toNum(l.amount), 0);
  const totalReported = toNum(header.total_amount);
  const subtotal = toNum(header.subtotal);
  const tax = toNum(header.tax_amount);
  const variance = Number((lineSum - totalReported).toFixed(2));

  const context = {
    invoice: {
      number: header.invoice_number,
      currency: header.currency_code,
      subtotal,
      tax,
      total: totalReported,
    },
    lineSum: Number(lineSum.toFixed(2)),
    variance,
    subtotalPlusTaxVsTotal: Number((subtotal + tax - totalReported).toFixed(2)),
    lines: lines.map((l) => ({
      description: l.description ?? null,
      quantity: toNum(l.quantity),
      unit_price: toNum(l.unit_price),
      amount: toNum(l.amount),
      section: l.section,
      original_amount: l.original_amount ? toNum(l.original_amount) : null,
      original_currency: l.original_currency,
      fx_rate: l.fx_rate ? toNum(l.fx_rate) : null,
    })),
  };

  const result = await callLlm<Omit<MathVerification, "target" | "invoiceId" | "lineSumComputed" | "totalReported" | "variance" | "tokensUsed" | "modelUsed">>(
    {
      tier: "T1",
      purpose: "invoice-math-verify",
      systemPrompt: SYSTEM_PROMPT,
      prompt: `Verify invoice arithmetic and return JSON matching the schema.\n\nDATA:\n${JSON.stringify(
        context,
        null,
        2
      )}`,
      jsonSchema: SCHEMA,
      maxOutputTokens: 1200,
    }
  );

  if (!result.ok || !result.data) {
    // Fallback: deterministic judgement when LLM fails
    const passed = Math.abs(variance) < 0.5 && Math.abs(subtotal + tax - totalReported) < 0.5;
    return {
      target: "payroll-invoice",
      invoiceId,
      passed,
      findings: [
        {
          severity: passed ? "info" : "error",
          rule: "line sum",
          detail: `Line items sum to ${lineSum.toFixed(2)} ${header.currency_code}, invoice total ${totalReported} ${header.currency_code} — variance ${variance}.`,
        },
      ],
      lineSumComputed: Number(lineSum.toFixed(2)),
      totalReported,
      variance,
      summary: passed ? "Math verified via deterministic fallback." : "Discrepancy detected; LLM verify unavailable.",
      modelUsed: result.modelUsed,
    };
  }

  return {
    target: "payroll-invoice",
    invoiceId,
    passed: Boolean(result.data.passed),
    findings: Array.isArray(result.data.findings) ? result.data.findings : [],
    lineSumComputed: Number(lineSum.toFixed(2)),
    totalReported,
    variance,
    summary: String(result.data.summary ?? ""),
    tokensUsed: result.tokensUsed,
    modelUsed: result.modelUsed,
  };
}

/**
 * Verify a canonical invoice (`invoices` table) — thinner data model, so
 * we only check subtotal vs total_amount vs notes-embedded hints.
 */
export async function verifyCanonicalInvoiceMath(invoiceId: string): Promise<MathVerification> {
  const rows = await queryRowsAdmin<{
    id: string;
    invoice_number: string | null;
    currency_code: string;
    subtotal_amount: string | null;
    total_amount: string;
  }>(
    `select id, invoice_number, currency_code, subtotal_amount::text, total_amount::text
     from invoices where id = $1 limit 1`,
    [invoiceId]
  );
  const inv = rows[0];
  if (!inv) {
    return {
      target: "canonical-invoice",
      invoiceId,
      passed: false,
      findings: [{ severity: "error", rule: "lookup", detail: "Invoice not found." }],
      lineSumComputed: 0,
      totalReported: 0,
      variance: 0,
      summary: `Invoice ${invoiceId} not found.`,
      modelUsed: "n/a",
    };
  }

  const subtotal = toNum(inv.subtotal_amount);
  const total = toNum(inv.total_amount);
  const variance = Number((subtotal - total).toFixed(2));

  // Canonical invoices rarely have line items in the current schema — use deterministic check
  const passed = Math.abs(variance) < 0.5;
  return {
    target: "canonical-invoice",
    invoiceId,
    passed,
    findings: passed
      ? [{ severity: "info", rule: "subtotal vs total", detail: "Match within tolerance." }]
      : [
          {
            severity: "error",
            rule: "subtotal vs total",
            detail: `Subtotal ${subtotal} ${inv.currency_code} differs from total ${total} by ${variance}.`,
          },
        ],
    lineSumComputed: subtotal,
    totalReported: total,
    variance,
    summary: passed
      ? `Invoice ${inv.invoice_number ?? inv.id}: math verified.`
      : `Invoice ${inv.invoice_number ?? inv.id}: math discrepancy of ${variance}.`,
    modelUsed: "deterministic",
  };
}
