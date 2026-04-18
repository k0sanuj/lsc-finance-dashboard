import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth";
import { callGemini } from "@lsc/skills/shared/gemini";

// Lightweight Gemini-powered bill parser. Used by the XTZ invoice generator and
// the subscriptions dashboard to auto-fill add forms from an uploaded receipt.

const MAX_INLINE_BYTES = 8 * 1024 * 1024;

const RESPONSE_SCHEMA = {
  type: "object",
  required: ["vendor", "amount", "currency", "date", "confidence"],
  properties: {
    vendor: { type: "string", description: "Merchant or vendor name" },
    description: {
      type: "string",
      description: "Brief description of what the bill is for",
    },
    amount: {
      type: "number",
      description: "Total amount on the bill, as a number with no symbols",
    },
    currency: {
      type: "string",
      description: "ISO 4217 currency code (USD, INR, AED, EUR, etc.)",
    },
    date: { type: "string", description: "Date of the bill in YYYY-MM-DD format" },
    category: {
      type: "string",
      description:
        "One of: software, hosting, communication, design, ai_tool, domain, infrastructure, travel, other",
    },
    confidence: { type: "number", description: "Confidence between 0 and 1" },
  },
} as const;

const PROMPT = `You are a bill/receipt parser for a finance ops team. Extract these
fields from the document:
- vendor: the merchant or vendor name (e.g. "Google", "Dropbox", "GoDaddy")
- description: a brief description of what the bill is for
- amount: total amount due (number only, no currency symbol)
- currency: 3-letter ISO code (USD, INR, AED, EUR, etc.)
- date: invoice/receipt date in YYYY-MM-DD format
- category: one of software, hosting, communication, design, ai_tool, domain, infrastructure, travel, other
- confidence: how confident you are in the extraction, 0 to 1

Return only valid JSON matching the schema. Do not invent values that are not
present. If a field is missing, use empty string for strings or 0 for numbers.`;

type ParsedBill = {
  vendor?: string;
  description?: string;
  amount?: number;
  currency?: string;
  date?: string;
  category?: string;
  confidence?: number;
};

export async function POST(request: Request) {
  try {
    await requireSession();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (file.size > MAX_INLINE_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 8 MB inline limit." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const result = await callGemini<ParsedBill>({
      tier: "T2",
      purpose: "parse-bill",
      prompt: PROMPT,
      inlineParts: [{ mimeType, dataBase64: buffer.toString("base64") }],
      jsonSchema: RESPONSE_SCHEMA,
      enforceStrictSchema: true,
      disableThinking: true,
      maxOutputTokens: 800,
    });

    if (!result.ok || !result.data) {
      return NextResponse.json(
        { error: result.error ?? "Gemini parse failed" },
        { status: 502 }
      );
    }

    const parsed = result.data;
    return NextResponse.json({
      vendor: String(parsed.vendor ?? ""),
      description: String(parsed.description ?? ""),
      amount: Number(parsed.amount ?? 0) || 0,
      currency: String(parsed.currency ?? "USD").toUpperCase(),
      date: String(parsed.date ?? ""),
      category: String(parsed.category ?? "other"),
      confidence: Number(parsed.confidence ?? 0) || 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
