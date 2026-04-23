import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import { callLlm } from "@lsc/skills/shared/llm";

// Extract structured sponsorship-deal fields from an uploaded contract PDF
// (or image). Returns a JSON payload that the Sponsorship tab prefills into
// its Add Sponsorship form — the user reviews + saves.

export type SponsorshipExtract = {
  sponsorName: string | null;
  segment: string | null;
  tier: "title" | "presenting" | "official" | "media" | "supporting" | null;
  contractStatus: "pipeline" | "loi" | "signed" | "active" | "expired" | null;
  y1Value: number | null;
  y2Value: number | null;
  y3Value: number | null;
  contractStart: string | null; // YYYY-MM-DD
  contractEnd: string | null;
  paymentSchedule: string | null;
  deliverables: string | null;
  notes: string | null;
};

const SYSTEM_PROMPT = `You are a finance operations analyst extracting structured data from a sponsorship contract for a sports league. Output valid JSON matching the schema exactly. If a field is not explicitly stated, return null — do not guess. Dates must be ISO YYYY-MM-DD. Monetary values must be numbers in USD (convert from stated currency if given — note the original currency in the notes field). Tier is one of: title, presenting, official, media, supporting. Status is one of: pipeline (early discussion), loi (letter of intent), signed, active, expired.`;

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    sponsorName: { type: ["string", "null"] },
    segment: { type: ["string", "null"] },
    tier: {
      type: ["string", "null"],
      enum: ["title", "presenting", "official", "media", "supporting", null],
    },
    contractStatus: {
      type: ["string", "null"],
      enum: ["pipeline", "loi", "signed", "active", "expired", null],
    },
    y1Value: { type: ["number", "null"] },
    y2Value: { type: ["number", "null"] },
    y3Value: { type: ["number", "null"] },
    contractStart: { type: ["string", "null"] },
    contractEnd: { type: ["string", "null"] },
    paymentSchedule: { type: ["string", "null"] },
    deliverables: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
  },
  required: [
    "sponsorName",
    "segment",
    "tier",
    "contractStatus",
    "y1Value",
    "y2Value",
    "y3Value",
    "contractStart",
    "contractEnd",
    "paymentSchedule",
    "deliverables",
    "notes",
  ],
};

export async function POST(request: Request) {
  try {
    await requireSession();
    const formData = await request.formData();
    const file = formData.get("document") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataBase64 = buffer.toString("base64");
    const mimeType = file.type || "application/pdf";

    const result = await callLlm<SponsorshipExtract>({
      tier: "T1",
      purpose: "sponsorship-contract-extract",
      systemPrompt: SYSTEM_PROMPT,
      prompt:
        "Extract the sponsorship deal terms from this contract and return JSON per the schema. Y1/Y2/Y3 value are the annual contract values in USD. Tier = how the sponsor is labeled (Title / Presenting / Official / Media / Supporting). Status: pipeline (still negotiating), loi (letter of intent), signed (executed), active (currently active), expired. Deliverables = short summary of what the sponsor receives. If the document is not a sponsorship contract, return all nulls with a note explaining what it is.",
      inlineParts: [{ mimeType, dataBase64 }],
      jsonSchema: SCHEMA,
      maxOutputTokens: 1024,
      timeoutMs: 45_000,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "LLM call failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      modelUsed: result.modelUsed,
      providerUsed: result.providerUsed,
      tokensUsed: result.tokensUsed ?? null,
      extract: result.data ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/analyze/sponsorship]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
