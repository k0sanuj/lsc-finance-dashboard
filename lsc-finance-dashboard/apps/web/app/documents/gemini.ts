import "server-only";

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const FALLBACK_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_INLINE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 12000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1400;

export type GeminiAnalyzerContext = {
  analysisVersion: string;
  company: {
    code: string;
    name: string;
  };
  actor: {
    role: string;
  };
  workflow: {
    raw: string;
    kind:
      | "generic_document_review"
      | "tbr_race_expense_submission"
      | "finance_invoice_intake"
      | "finance_cost_review";
    submissionMode: string | null;
    redirectPath: string;
  };
  race: {
    id: string;
    name: string;
    seasonYear: number;
    location: string;
    countryCode: string;
    countryName: string;
    eventDate: string | null;
    defaultCurrencyCode: string | null;
  } | null;
  hints: {
    expectedDocumentTypes: string[];
    preferredFields: string[];
    outputCurrencyCode: "USD";
    defaultCountryCode: string | null;
    defaultCountryName: string | null;
    defaultCurrencyCode: string | null;
    useContextFallbacks: boolean;
    intakeCategory?: string | null;
    operatorSuppliedFields?: Record<string, string> | null;
    expectedPlatformUpdates?: Array<{
      area: string;
      effect: string;
    }> | null;
  };
};

type ExtractedField = {
  key: string;
  label: string;
  value: string;
  normalizedValue: string;
  confidence: number;
  canonicalTargetTable: string;
  canonicalTargetColumn: string;
};

export type GeminiAnalysisResult = {
  documentType: string;
  overallConfidence: number;
  proposedTarget: string;
  financeInterpretation: string;
  fields: ExtractedField[];
};

const responseSchema = {
  type: "object",
  required: ["documentType", "overallConfidence", "proposedTarget", "financeInterpretation", "fields"],
  properties: {
    documentType: {
      type: "string",
      enum: [
        "Sponsorship Contract",
        "Vendor Invoice",
        "Expense Receipt",
        "Prize Statement",
        "Reimbursement Report",
        "Controlled Manual Entry",
        "Unknown"
      ]
    },
    overallConfidence: { type: "number" },
    proposedTarget: { type: "string" },
    financeInterpretation: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        required: [
          "key",
          "label",
          "value",
          "normalizedValue",
          "confidence",
          "canonicalTargetTable",
          "canonicalTargetColumn"
        ],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          value: { type: "string" },
          normalizedValue: { type: "string" },
          confidence: { type: "number" },
          canonicalTargetTable: { type: "string" },
          canonicalTargetColumn: { type: "string" }
        }
      }
    }
  }
} as const;

function isTextLikeMimeType(mimeType: string) {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "text/csv"
  );
}

function buildPrompt(
  fileName: string,
  mimeType: string,
  note: string | null,
  context: GeminiAnalyzerContext | null,
  compact = false
) {
  const lines = [
    "You are a finance document analyzer for League Sports Co.",
    "Return only structured finance facts supported by the document.",
    "Do not invent values that are not present.",
    "Treat application context as a hint chain, not as source evidence.",
    "If the document conflicts with the context chain, trust the document.",
    "If the document is ambiguous, you may use the context chain conservatively for country and currency fallback.",
    "Prefer a sparse field list over guessed data.",
    "Return valid JSON only. Do not wrap the JSON in markdown fences or prose.",
    compact
      ? "Keep financeInterpretation under 120 characters and return no more than 8 fields."
      : "Keep financeInterpretation concise and return no more than 12 fields.",
    "Supported document types: Sponsorship Contract, Vendor Invoice, Expense Receipt, Prize Statement, Reimbursement Report, Controlled Manual Entry, Unknown.",
    "For sponsorship contracts, extract counterparty, amount, currency, start date, end date, payment schedule, and revenue type if present.",
    "For prize statements, extract counterparty, award basis, amount, currency, and recognition date.",
    "For vendor invoices, extract vendor, invoice number, issue date, due date, amount, currency, and category if present.",
    "For expense receipts, extract merchant, transaction date, total amount, original currency, origin country, and issuer country whenever possible.",
    "For reimbursement reports, extract person, merchant, transaction date, amount, currency, reimbursable status, and category.",
    "Also extract bill-origin context when present: origin_source, origin_country, issuer_country, and currency_code.",
    "Country can come from merchant address, tax details, phone prefix, city-country pair, airport code, card slip metadata, or other issuer markers.",
    "If Dubai, Abu Dhabi, UAE, or United Arab Emirates appears, infer country as United Arab Emirates and currency_code as AED unless the document explicitly states another currency.",
    "Currency must be a 3-letter ISO currency code when present or strongly inferable from the document.",
    "Choose canonical targets conservatively: contracts, invoices, payments, expenses, revenue_records, sponsors_or_customers.",
    "If a value is monetary, normalize normalizedValue to digits only with decimal point and no currency symbol.",
    "If a date is present, normalize normalizedValue to YYYY-MM-DD.",
    `Document name: ${fileName}`,
    `Mime type: ${mimeType}`,
    note ? `Operator note: ${note}` : "Operator note: none"
  ];

  if (context) {
    lines.push("Application context chain:");
    lines.push(JSON.stringify(context, null, 2));
    if (context.hints.intakeCategory) {
      lines.push(`Operator-selected intake category: ${context.hints.intakeCategory}`);
    }
    if (context.hints.operatorSuppliedFields && Object.keys(context.hints.operatorSuppliedFields).length > 0) {
      lines.push("Operator-supplied intake fields:");
      lines.push(JSON.stringify(context.hints.operatorSuppliedFields, null, 2));
    }
  }

  if (context?.workflow.kind === "tbr_race_expense_submission") {
    lines.push(
      "This upload comes from the TBR user race-expense flow. Prioritize bill and receipt extraction over broad finance interpretation."
    );
    lines.push(
      "Prefer Expense Receipt, Vendor Invoice, Reimbursement Report, or Unknown. Do not classify as Sponsorship Contract or Prize Statement unless that is unmistakably what the document is."
    );
    lines.push(
      "For this workflow, prioritize these fields when available: merchant_name, transaction_date or expense_date, total_amount, currency_code, origin_country, issuer_country."
    );
  }

  if (context?.workflow.kind === "finance_invoice_intake") {
    lines.push(
      "This upload comes from the finance invoice-intake workflow. Prioritize vendor invoice extraction and payable review fields."
    );
  }

  // Invoice Hub specific context
  const workflow = String(context?.workflow?.raw ?? "").toLowerCase();
  if (workflow.includes("invoice-hub") || workflow.includes("invoice")) {
    lines.push(
      "INVOICE HUB CONTEXT: This document is being uploaded to the Invoice Hub for payable processing.",
      "Priority extraction fields for invoices:",
      "1. vendor_name — who issued the invoice (the vendor/supplier name)",
      "2. invoice_number — the invoice reference number",
      "3. invoice_date or issue_date — when the invoice was issued",
      "4. due_date — when payment is due",
      "5. total_amount — the total payable amount",
      "6. currency_code — 3-letter ISO code (USD, AED, EUR, etc.)",
      "7. payment_status — is this paid, unpaid, partially paid, or overdue?",
      "8. paid_by — if someone already paid this (e.g. an employee who needs reimbursement), extract their name",
      "9. category — what type of expense is this (catering, travel, licensing, equipment, etc.)",
      "10. description — brief description of what the invoice is for",
      "",
      "If the document shows someone has already paid (e.g. a receipt showing a card payment by an individual),",
      "classify it as a Reimbursement Report and extract the paid_by person's name.",
      "If it's an unpaid vendor bill, classify as Vendor Invoice.",
      "",
      "For the operator note, if it mentions reimbursement or a person who paid, extract that as paid_by field.",
      "Map vendor_name to canonicalTargetTable: sponsors_or_customers, canonicalTargetColumn: name.",
      "Map total_amount to canonicalTargetTable: invoices, canonicalTargetColumn: total_amount.",
      "Map invoice_number to canonicalTargetTable: invoices, canonicalTargetColumn: invoice_number."
    );
  }

  return lines.join("\n");
}

function extractTextPreview(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, " ").slice(0, MAX_TEXT_CHARS);
}

function extractJsonObject(text: string) {
  const stripped = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1);
  }

  return stripped;
}

function tryParseJson(text: string) {
  const candidate = extractJsonObject(text);

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function coerceAnalysis(json: unknown): GeminiAnalysisResult {
  const fallback: GeminiAnalysisResult = {
    documentType: "Unknown",
    overallConfidence: 0.2,
    proposedTarget: "pending review",
    financeInterpretation: "The analyzer could not confidently classify this document.",
    fields: []
  };

  if (!json || typeof json !== "object") {
    return fallback;
  }

  const value = json as Record<string, unknown>;
  const fields = Array.isArray(value.fields)
    ? value.fields
        .filter((field): field is Record<string, unknown> => Boolean(field && typeof field === "object"))
        .map((field) => ({
          key: String(field.key ?? "unknown_field"),
          label: String(field.label ?? "Unknown Field"),
          value: String(field.value ?? ""),
          normalizedValue: String(field.normalizedValue ?? ""),
          confidence: Number(field.confidence ?? 0),
          canonicalTargetTable: String(field.canonicalTargetTable ?? ""),
          canonicalTargetColumn: String(field.canonicalTargetColumn ?? "")
        }))
    : [];

  return {
    documentType: String(value.documentType ?? fallback.documentType),
    overallConfidence: Number(value.overallConfidence ?? fallback.overallConfidence),
    proposedTarget: String(value.proposedTarget ?? fallback.proposedTarget),
    financeInterpretation: String(value.financeInterpretation ?? fallback.financeInterpretation),
    fields
  };
}

export async function analyzeDocumentWithGemini(params: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  note: string | null;
  context: GeminiAnalyzerContext | null;
}) {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim().replace(/[\r\n]/g, "");

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  if (params.buffer.byteLength > MAX_INLINE_BYTES) {
    throw new Error("Document exceeds the current inline analysis size limit of 8 MB.");
  }

  function buildParts(compact = false) {
    const parts: Array<Record<string, unknown>> = [
      { text: buildPrompt(params.fileName, params.mimeType, params.note, params.context, compact) }
    ];

    if (isTextLikeMimeType(params.mimeType)) {
      parts.push({
        text: `Document text preview:\n${extractTextPreview(params.buffer)}`
      });
    } else {
      parts.push({
        inline_data: {
          mime_type: params.mimeType || "application/octet-stream",
          data: params.buffer.toString("base64")
        }
      });
    }

    return parts;
  }

  async function requestAnalysis(model: string, compact = false) {
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: buildParts(compact) }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
            responseJsonSchema: responseSchema,
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        }),
        cache: "no-store"
      }
    );
  }

  let response = await requestAnalysis(DEFAULT_GEMINI_MODEL, false);

  if (!response.ok && response.status === 404 && DEFAULT_GEMINI_MODEL !== FALLBACK_GEMINI_MODEL) {
    response = await requestAnalysis(FALLBACK_GEMINI_MODEL, false);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini analysis failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = payload.candidates?.[0];
  const jsonText = candidate?.content?.parts?.find((part) => typeof part.text === "string")?.text ?? "";

  if (!jsonText) {
    throw new Error("Gemini returned no structured analysis payload.");
  }

  let parsed = tryParseJson(jsonText);

  if (!parsed) {
    const retryResponse = await requestAnalysis(DEFAULT_GEMINI_MODEL, true);

    if (!retryResponse.ok) {
      const retryErrorText = await retryResponse.text();
      throw new Error(`Gemini retry failed: ${retryResponse.status} ${retryErrorText}`);
    }

    const retryPayload = (await retryResponse.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };

    const retryCandidate = retryPayload.candidates?.[0];
    const retryText =
      retryCandidate?.content?.parts?.find((part) => typeof part.text === "string")?.text ?? "";

    parsed = retryText ? tryParseJson(retryText) : null;

    if (!parsed) {
      const finishReason = retryCandidate?.finishReason ?? candidate?.finishReason ?? "unknown";
      throw new Error(
        `Gemini returned invalid JSON after retry. Finish reason: ${finishReason}.`
      );
    }
  }

  return coerceAnalysis(parsed);
}
