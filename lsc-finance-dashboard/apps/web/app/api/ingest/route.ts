import { NextResponse } from "next/server";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { callLlm } from "@lsc/skills/shared/llm";

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

async function classifyWithGemini(
  rawContent: string,
  targetModule: string
): Promise<{ classification: string; extractedFields: Record<string, unknown> }> {
  const systemPrompt = [
    "You are a financial data classifier for a sports company.",
    "Given the input text, classify it into one of: pnl_line_item, sponsorship, expense, payroll, deal_pipeline, event_budget, production_cost, opex_item.",
    "Extract structured fields (amounts, dates, names, categories, descriptions).",
    "Return JSON with keys: classification (string), extractedFields (object).",
  ].join(" ");

  const result = await callLlm<{
    classification?: string;
    extractedFields?: Record<string, unknown>;
  }>({
    tier: "T1",
    purpose: "ai-ingest-classify",
    systemPrompt,
    prompt: `Target module hint: ${targetModule}\n\nInput text:\n${rawContent}`,
    jsonSchema: {}, // JSON mode without strict schema (we want free-form extractedFields)
  });

  if (!result.ok || !result.data) {
    console.error(
      "[AI Ingest] Gemini classify failed:",
      result.error ?? "no data"
    );
    return { classification: targetModule, extractedFields: {} };
  }

  return {
    classification: result.data.classification ?? targetModule,
    extractedFields: result.data.extractedFields ?? {},
  };
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
