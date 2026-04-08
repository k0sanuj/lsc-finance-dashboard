import { NextResponse } from "next/server";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";

type IngestPayload = {
  sourceType: string;
  sourceName: string;
  rawContent: string;
  targetModule: string;
  targetSportId?: string | null;
  targetEventId?: string | null;
};

const VALID_MODULES = [
  "pnl_line_item",
  "sponsorship",
  "expense",
  "payroll",
  "deal_pipeline",
  "event_budget",
  "production_cost",
  "opex_item"
];

async function classifyWithGemini(rawContent: string, targetModule: string): Promise<{
  classification: string;
  extractedFields: Record<string, unknown>;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { classification: targetModule, extractedFields: {} };
  }

  const systemPrompt = [
    "You are a financial data classifier for a sports company.",
    "Given the input text, classify it into one of: pnl_line_item, sponsorship, expense, payroll, deal_pipeline, event_budget, production_cost, opex_item.",
    "Extract structured fields (amounts, dates, names, categories, descriptions).",
    "Return JSON with keys: classification (string), extractedFields (object)."
  ].join(" ");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${systemPrompt}\n\nTarget module hint: ${targetModule}\n\nInput text:\n${rawContent}`
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      console.error("[AI Ingest] Gemini API error:", response.status, await response.text());
      return { classification: targetModule, extractedFields: {} };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text) as { classification?: string; extractedFields?: Record<string, unknown> };

    return {
      classification: parsed.classification ?? targetModule,
      extractedFields: parsed.extractedFields ?? {}
    };
  } catch (error) {
    console.error("[AI Ingest] Gemini call failed:", error instanceof Error ? error.message : error);
    return { classification: targetModule, extractedFields: {} };
  }
}

export async function POST(request: Request) {
  try {
    // Auth: accept x-api-key OR Authorization: Bearer internal (for server actions)
    const apiKey = request.headers.get("x-api-key");
    const authHeader = request.headers.get("authorization");
    const isInternalCall = authHeader === "Bearer internal";
    const isApiKeyValid = apiKey && apiKey === process.env.LSC_INTERNAL_API_KEY;

    if (!isApiKeyValid && !isInternalCall) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as IngestPayload;

    if (!body.rawContent || !body.rawContent.trim()) {
      return NextResponse.json(
        { error: "rawContent is required." },
        { status: 400 }
      );
    }

    const sourceType = (body.sourceType ?? "text").trim();
    const sourceName = (body.sourceName ?? "Manual input").trim();
    const targetModule = VALID_MODULES.includes(body.targetModule)
      ? body.targetModule
      : "unclassified";

    // Insert queue record with status 'queued'
    const insertRows = await queryRowsAdmin<{ id: string }>(
      `insert into ai_ingestion_queue (
         source_type, source_name, target_module, status,
         raw_content, target_sport_id, target_event_id
       )
       values ($1, $2, $3, 'queued', $4, $5, $6)
       returning id`,
      [
        sourceType,
        sourceName,
        targetModule,
        body.rawContent.trim(),
        body.targetSportId ?? null,
        body.targetEventId ?? null
      ]
    );

    const ingestionId = insertRows[0]?.id;
    if (!ingestionId) {
      return NextResponse.json({ error: "Failed to create ingestion record." }, { status: 500 });
    }

    // Update status to processing
    await executeAdmin(
      `update ai_ingestion_queue set status = 'processing' where id = $1`,
      [ingestionId]
    );

    // Call Gemini for classification
    const { classification, extractedFields } = await classifyWithGemini(
      body.rawContent,
      targetModule
    );

    // Update record with extracted data and classification
    await executeAdmin(
      `update ai_ingestion_queue
       set status = 'completed',
           ai_classification = $1,
           extracted_data = $2::jsonb,
           processed_at = now()
       where id = $3`,
      [classification, JSON.stringify(extractedFields), ingestionId]
    );

    return NextResponse.json({
      success: true,
      ingestionId,
      classification,
      extractedFields
    });
  } catch (error) {
    console.error("[API /api/ingest]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
