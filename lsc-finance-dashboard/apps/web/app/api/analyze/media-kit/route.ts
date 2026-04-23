import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import { callLlm } from "@lsc/skills/shared/llm";

// Extract CPM / impressions / viewership fields from an uploaded media kit,
// rate card, or broadcast proposal. Returns per-channel (non_linear + linear)
// projections that the Media Revenue tab prefills into its CPM form.

export type MediaKitChannel = {
  impressionsY1: number | null;
  impressionsY2: number | null;
  impressionsY3: number | null;
  cpmY1: number | null;
  cpmY2: number | null;
  cpmY3: number | null;
  avgViewership: number | null;
};

export type MediaKitExtract = {
  nonLinear: MediaKitChannel;
  linear: MediaKitChannel;
  notes: string | null;
};

const SYSTEM_PROMPT = `You are a media/broadcast operations analyst extracting per-channel CPM projections from a media kit, rate card, or partner proposal. Output valid JSON matching the schema exactly. If a field is not stated, return null. Monetary values (CPM) must be numbers in USD. Impressions are whole numbers. Avg viewership is average concurrent/per-episode viewers. "non_linear" = OTT / streaming / digital. "linear" = traditional TV broadcast.`;

const CHANNEL_SCHEMA = {
  type: "object",
  properties: {
    impressionsY1: { type: ["number", "null"] },
    impressionsY2: { type: ["number", "null"] },
    impressionsY3: { type: ["number", "null"] },
    cpmY1: { type: ["number", "null"] },
    cpmY2: { type: ["number", "null"] },
    cpmY3: { type: ["number", "null"] },
    avgViewership: { type: ["number", "null"] },
  },
  required: [
    "impressionsY1",
    "impressionsY2",
    "impressionsY3",
    "cpmY1",
    "cpmY2",
    "cpmY3",
    "avgViewership",
  ],
};

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    nonLinear: CHANNEL_SCHEMA,
    linear: CHANNEL_SCHEMA,
    notes: { type: ["string", "null"] },
  },
  required: ["nonLinear", "linear", "notes"],
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

    const result = await callLlm<MediaKitExtract>({
      tier: "T1",
      purpose: "media-kit-extract",
      systemPrompt: SYSTEM_PROMPT,
      prompt:
        "Extract per-channel (non-linear = OTT/streaming, linear = traditional TV) CPM model inputs from this media kit / rate card and return JSON per the schema. Provide Y1/Y2/Y3 projections when the document has a multi-year build; if only a single-year figure is stated, put it in Y1 and leave Y2/Y3 null. If the document only covers one channel, leave the other channel's fields null. If the document is not a media kit, return all nulls with a short explanation in notes.",
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
    console.error("[/api/analyze/media-kit]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
