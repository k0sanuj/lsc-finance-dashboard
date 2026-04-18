"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { callLlm } from "@lsc/skills/shared/llm";
import { requireRole } from "../../lib/auth";

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
    purpose: "ai-ingest-action-classify",
    systemPrompt,
    prompt: `Target module hint: ${targetModule}\n\nInput text:\n${rawContent}`,
    jsonSchema: {}, // JSON mode without strict schema
  });

  if (!result.ok || !result.data) {
    console.error(
      "[AI Ingest Action] Gemini classify failed:",
      result.error ?? "no data"
    );
    return { classification: targetModule, extractedFields: {} };
  }

  return {
    classification: result.data.classification ?? targetModule,
    extractedFields: result.data.extractedFields ?? {},
  };
}

export async function submitIngestionAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const rawContent = String(formData.get("rawContent") ?? "").trim();
  const targetModule = String(formData.get("targetModule") ?? "").trim();
  const targetSport = String(formData.get("targetSport") ?? "").trim() || null;
  const returnPath = "/ai-ingest";

  if (!rawContent) {
    redirect(`${returnPath}?status=error&message=${encodeURIComponent("Content is required.")}` as Route);
  }

  const module = VALID_MODULES.includes(targetModule) ? targetModule : "unclassified";

  // Insert queue record
  const insertRows = await queryRowsAdmin<{ id: string }>(
    `insert into ai_ingestion_queue (
       source_type, source_name, target_module, status,
       raw_content, target_sport_id
     )
     values ('text', 'Manual input', $1, 'queued', $2, $3)
     returning id`,
    [module, rawContent, targetSport]
  );

  const ingestionId = insertRows[0]?.id;
  if (!ingestionId) {
    redirect(`${returnPath}?status=error&message=${encodeURIComponent("Failed to create ingestion record.")}` as Route);
  }

  // Update to processing
  await executeAdmin(
    `update ai_ingestion_queue set status = 'processing' where id = $1`,
    [ingestionId]
  );

  // Classify with Gemini
  const { classification, extractedFields } = await classifyWithGemini(rawContent, module);

  // Update with results
  await executeAdmin(
    `update ai_ingestion_queue
     set status = 'completed',
         ai_classification = $1,
         extracted_data = $2::jsonb,
         processed_at = now()
     where id = $3`,
    [classification, JSON.stringify(extractedFields), ingestionId]
  );

  revalidatePath("/ai-ingest");
  redirect(`${returnPath}?status=success&message=${encodeURIComponent(`Ingestion complete — classified as "${classification}".`)}` as Route);
}
