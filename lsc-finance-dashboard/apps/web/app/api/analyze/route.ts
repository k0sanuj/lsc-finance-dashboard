import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth";
import { analyzeDocumentWithGemini, type GeminiAnalyzerContext } from "../../documents/gemini";
import { storeUploadedDocument } from "@lsc/db";
import crypto from "node:crypto";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { getEntityMetadata, normalizeCompanyCode } from "../../lib/entities";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const formData = await request.formData();

    const file = formData.get("document") as File | null;
    const note = (formData.get("documentNote") as string) ?? "";
    const companyCode = normalizeCompanyCode((formData.get("companyCode") as string) ?? "TBR", "TBR");
    const company = getEntityMetadata(companyCode);
    const workflowContext = (formData.get("workflowContext") as string) ?? "invoice-hub";

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const fileName = file.name;
    const mimeType = file.type || "application/octet-stream";

    // Store to S3
    const storageResult = await storeUploadedDocument({
      buffer,
      fileName,
      mimeType,
      fileSize: buffer.byteLength,
      fileHash,
      companyCode,
      workflowContext,
    });

    // Get company ID
    const companyRows = await queryRowsAdmin<{ id: string }>(
      `SELECT id FROM companies WHERE code = $1::company_code LIMIT 1`,
      [companyCode]
    );
    const companyId = companyRows[0]?.id;

    if (!companyId) {
      return NextResponse.json({ error: "Company not found" }, { status: 400 });
    }

    // Create source document record
    const docRows = await queryRowsAdmin<{ id: string }>(
      `INSERT INTO source_documents (company_id, document_type, source_system, source_identifier, source_name, metadata)
       VALUES ($1, 'invoice_file'::source_document_type, 'upload', $2, $3, $4)
       ON CONFLICT (source_system, source_identifier) DO UPDATE SET source_name = $3, updated_at = now()
       RETURNING id`,
      [companyId, fileHash, fileName, JSON.stringify(storageResult.storageMetadata ?? {})]
    );
    const sourceDocumentId = docRows[0]?.id;

    // Build Gemini context
    const context: GeminiAnalyzerContext = {
      analysisVersion: "2026-03-21-invoice-hub-v2",
      company: { code: companyCode, name: company.label },
      actor: { role: session.role },
      workflow: {
        raw: workflowContext,
        kind: "finance_invoice_intake",
        submissionMode: null,
        redirectPath: "/tbr/invoice-hub",
      },
      race: null,
      hints: {
        expectedDocumentTypes: ["Vendor Invoice", "Expense Receipt", "Reimbursement Report"],
        preferredFields: ["vendor_name", "invoice_number", "issue_date", "due_date", "total_amount", "currency_code", "paid_by", "category"],
        outputCurrencyCode: "USD",
        defaultCountryCode: null,
        defaultCountryName: null,
        defaultCurrencyCode: null,
        useContextFallbacks: true,
        intakeCategory: "vendor_invoice",
        operatorSuppliedFields: note ? { operatorNote: note } : null,
      },
    };

    // Call Gemini
    const analysis = await analyzeDocumentWithGemini({
      fileName,
      mimeType,
      buffer,
      note: note || null,
      context,
    });

    // Save analysis run to DB
    const analysisRows = await queryRowsAdmin<{ id: string }>(
      `INSERT INTO document_analysis_runs (
         source_document_id, company_id, analyzer_type, analysis_status,
         source_file_name, source_file_type, detected_document_type,
         extracted_summary, overall_confidence, submitted_at
       ) VALUES ($1, $2, 'gemini_document_analyzer', 'pending_review', $3, $4, $5, $6, $7, now())
       RETURNING id`,
      [
        sourceDocumentId,
        companyId,
        fileName,
        mimeType,
        analysis.documentType,
        JSON.stringify({ fields: analysis.fields, financeInterpretation: analysis.financeInterpretation }),
        analysis.overallConfidence,
      ]
    );
    const analysisRunId = analysisRows[0]?.id;

    // Save extracted fields
    if (analysisRunId && analysis.fields?.length > 0) {
      for (const field of analysis.fields) {
        await executeAdmin(
          `INSERT INTO document_extracted_fields (
             analysis_run_id, field_key, field_label, extracted_value,
             normalized_value, confidence, approval_status,
             canonical_target_table, canonical_target_column
           ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)`,
          [
            analysisRunId,
            field.key,
            field.label,
            JSON.stringify(field.value),
            field.normalizedValue,
            field.confidence,
            field.canonicalTargetTable || "",
            field.canonicalTargetColumn || "",
          ]
        );
      }
    }

    // Create intake event
    if (analysisRunId && sourceDocumentId) {
      await executeAdmin(
        `INSERT INTO document_intake_events (
           source_document_id, analysis_run_id, company_id, app_user_id,
           source_file_name, workflow_context, intake_status
         ) VALUES ($1, $2, $3, $4, $5, $6, 'analyzed')`,
        [sourceDocumentId, analysisRunId, companyId, session.id, fileName, workflowContext]
      );
    }

    return NextResponse.json({
      success: true,
      analysisRunId,
      documentType: analysis.documentType,
      confidence: analysis.overallConfidence,
      interpretation: analysis.financeInterpretation,
      fileName,
      fields: analysis.fields.map((f) => ({
        key: f.key,
        label: f.label,
        value: f.value,
        normalizedValue: f.normalizedValue,
        confidence: f.confidence,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API /api/analyze]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
