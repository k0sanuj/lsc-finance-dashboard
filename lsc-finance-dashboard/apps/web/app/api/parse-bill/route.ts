import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth";

// Lightweight Gemini-powered bill parser. Used by the XTZ invoice generator and
// the subscriptions dashboard to auto-fill add forms from an uploaded receipt.
//
// Returns a small structured payload:
//   { vendor, description, amount, currency, date, category, confidence }
//
// Accepts multipart/form-data with a `file` field (image or PDF, max 8 MB).

const MAX_INLINE_BYTES = 8 * 1024 * 1024;
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const RESPONSE_SCHEMA = {
  type: "object",
  required: ["vendor", "amount", "currency", "date", "confidence"],
  properties: {
    vendor: { type: "string", description: "Merchant or vendor name" },
    description: {
      type: "string",
      description: "Brief description of what the bill is for"
    },
    amount: {
      type: "number",
      description: "Total amount on the bill, as a number with no symbols"
    },
    currency: {
      type: "string",
      description: "ISO 4217 currency code (USD, INR, AED, EUR, etc.)"
    },
    date: {
      type: "string",
      description: "Date of the bill in YYYY-MM-DD format"
    },
    category: {
      type: "string",
      description:
        "One of: software, hosting, communication, design, ai_tool, domain, infrastructure, travel, other"
    },
    confidence: {
      type: "number",
      description: "Confidence between 0 and 1"
    }
  }
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

export async function POST(request: Request) {
  try {
    await requireSession();

    const apiKey = (process.env.GEMINI_API_KEY ?? "").trim().replace(/[\r\n]/g, "");
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured." },
        { status: 500 }
      );
    }

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: buffer.toString("base64")
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 800,
            responseMimeType: "application/json",
            responseJsonSchema: RESPONSE_SCHEMA,
            thinkingConfig: { thinkingBudget: 0 }
          }
        }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}`, detail: errorText },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text =
      payload.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === "string")
        ?.text ?? "";

    if (!text) {
      return NextResponse.json(
        { error: "Gemini returned an empty response." },
        { status: 502 }
      );
    }

    let parsed: Record<string, unknown> = {};
    try {
      const stripped = text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "");
      const start = stripped.indexOf("{");
      const end = stripped.lastIndexOf("}");
      const jsonStr =
        start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped;
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse Gemini response as JSON.", raw: text },
        { status: 502 }
      );
    }

    return NextResponse.json({
      vendor: String(parsed.vendor ?? ""),
      description: String(parsed.description ?? ""),
      amount: Number(parsed.amount ?? 0) || 0,
      currency: String(parsed.currency ?? "USD").toUpperCase(),
      date: String(parsed.date ?? ""),
      category: String(parsed.category ?? "other"),
      confidence: Number(parsed.confidence ?? 0) || 0
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
