"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin, withAdminTransaction } from "@lsc/db";
import { callLlm } from "@lsc/skills/shared/llm";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { notifyExpenseEvent } from "@lsc/skills/expenses/notify";
import { postExpenseJournal } from "@lsc/skills/quickbooks/post-expense-journal";
import { requireRole, requireSession, requireTbrExpensePortalAccess } from "../../../lib/auth";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeCurrencyCode(value: string) {
  const match = value.trim().toUpperCase().match(/[A-Z]{3}/);
  return match?.[0] ?? "USD";
}

const EXPENSE_FX_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.1642,
  SAR: 0.2675,
  AED: 0.2723,
  QAR: 0.2747,
  GBP: 1.27,
};

function inferExpenseUsd(amount: number, currencyCode: string, explicitFxRate?: number) {
  const rate = explicitFxRate && explicitFxRate > 0 ? explicitFxRate : EXPENSE_FX_TO_USD[currencyCode] ?? 1;
  return {
    fxRate: rate,
    reportingAmountUsd: Number((amount * rate).toFixed(2)),
    fxSource: explicitFxRate && explicitFxRate > 0 ? "manual_fx_rate" : currencyCode === "USD" ? "native_usd" : "expense_workflow_default_rate",
  };
}

async function queueExpenseItemNotification(input: {
  event: "expense_item_rejected" | "expense_item_needs_clarification" | "expense_item_clarification_replied";
  submissionId: string;
  itemId: string;
  note: string | null;
}) {
  try {
    const rows = await queryRowsAdmin<{
      submitter_email: string | null;
      submission_title: string;
      merchant_name: string | null;
    }>(
      `select
         au.email as submitter_email,
         es.submission_title,
         esi.merchant_name
       from expense_submission_items esi
       join expense_submissions es on es.id = esi.submission_id
       join app_users au on au.id = es.submitted_by_user_id
       where esi.id = $1
         and es.id = $2
       limit 1`,
      [input.itemId, input.submissionId]
    );
    const row = rows[0];
    if (!row?.submitter_email) return;

    const eventLabel =
      input.event === "expense_item_rejected"
        ? "Expense item rejected"
        : input.event === "expense_item_needs_clarification"
          ? "Expense item needs clarification"
          : "Expense clarification replied";

    await executeAdmin(
      `insert into outbound_notifications (
         channel,
         recipient,
         subject,
         body,
         status,
         source_agent_id,
         source_skill,
         idempotency_key,
         metadata
       )
       values ('internal', $1, $2, $3, 'queued', 'expense-agent', $4, $5, $6::jsonb)`,
      [
        row.submitter_email,
        eventLabel,
        [
          `${eventLabel}: ${row.merchant_name ?? "Expense item"}`,
          `Report: ${row.submission_title}`,
          input.note ? `Note: ${input.note}` : null,
          `/tbr/my-expenses/${input.submissionId}`,
        ].filter(Boolean).join("\n"),
        input.event,
        `${input.event}:${input.itemId}:${Date.now()}`,
        JSON.stringify({
          submissionId: input.submissionId,
          itemId: input.itemId,
          event: input.event,
        }),
      ]
    );
  } catch (err) {
    console.warn(
      `[expense-item-notify] ${input.event} failed item=${input.itemId} error=${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

function parseNormalizedNumber(value: unknown) {
  const amount = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function redirectToExpenseWorkflow(
  status: "success" | "error" | "info",
  message: string,
  returnPath = "/tbr/expense-management"
): never {
  const [pathAndSearch, hash] = returnPath.split("#");
  const [pathname, search] = pathAndSearch.split("?");
  const searchParams = new URLSearchParams(search ?? "");
  searchParams.set("status", status);
  searchParams.set("message", message);
  searchParams.set("updated", String(Date.now()));
  const nextPath = `${pathname}?${searchParams.toString()}${hash ? `#${hash}` : ""}`;
  redirect(nextPath as Route);
}

type RaceBudgetRuleDraft = {
  categoryId: string;
  ruleKind: "per_diem" | "budget_cap" | "approved_charge";
  unitLabel: "per_day" | "per_person" | "per_race" | "total";
  ruleLabel: string;
  approvedAmountUsd: string;
  closeThresholdPercent: string;
  notes: string;
};

type BudgetCategoryOption = {
  id: string;
  label: string;
};

export type RaceBudgetAnalysisState = {
  status: "idle" | "success" | "error";
  message: string;
  appliedKey: string | null;
  rules: RaceBudgetRuleDraft[];
};

const INITIAL_BUDGET_ANALYSIS_STATE: RaceBudgetAnalysisState = {
  status: "idle",
  message: "",
  appliedKey: null,
  rules: []
};

const BUDGET_CURRENCY_TO_USD: Record<string, number> = {
  USD: 1,
  AED: 0.2723,
  EUR: 1.09,
  SAR: 0.2667,
  QAR: 0.2747,
  NGN: 0.00067
};

function normalizeBudgetRuleKind(value: string) {
  if (value === "per_diem" || value === "budget_cap" || value === "approved_charge") {
    return value;
  }
  return "budget_cap";
}

function normalizeBudgetUnitLabel(value: string) {
  if (value === "per_day" || value === "per_person" || value === "per_race" || value === "total") {
    return value;
  }
  return "per_race";
}

function inferBudgetUsdAmount(amount: number, currencyCode: string) {
  const rate = BUDGET_CURRENCY_TO_USD[currencyCode.toUpperCase()] ?? 1;
  return Number((amount * rate).toFixed(2));
}

function normalizeBudgetLabel(value: string) {
  return normalizeWhitespace(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function matchBudgetCategoryId(label: string, options: BudgetCategoryOption[]) {
  const normalized = normalizeWhitespace(label).toLowerCase();
  if (!normalized) {
    return "";
  }

  const exact = options.find((option) => normalizeWhitespace(option.label).toLowerCase() === normalized);
  if (exact) {
    return exact.id;
  }

  const partial = options.find((option) => {
    const optionLabel = normalizeWhitespace(option.label).toLowerCase();
    return optionLabel.includes(normalized) || normalized.includes(optionLabel);
  });

  return partial?.id ?? "";
}

export async function createExpenseSubmissionAction(formData: FormData) {
  await requireTbrExpensePortalAccess();
  const session = await requireSession();

  const title = normalizeWhitespace(String(formData.get("submissionTitle") ?? ""));
  const operatorNote = normalizeWhitespace(String(formData.get("operatorNote") ?? "")) || null;
  const raceEventId = normalizeWhitespace(String(formData.get("raceEventId") ?? "")) || null;
  const teamId = normalizeWhitespace(String(formData.get("teamId") ?? "")) || null;
  const costCategoryId = normalizeWhitespace(String(formData.get("costCategoryId") ?? "")) || null;
  const merchantName = normalizeWhitespace(String(formData.get("merchantName") ?? "")) || null;
  const description = normalizeWhitespace(String(formData.get("description") ?? "")) || null;
  const splitMethod = normalizeWhitespace(String(formData.get("splitMethod") ?? "solo")) || "solo";
  const splitCount = Math.max(1, Number(formData.get("splitCount") ?? 1));
  const originalCurrencyCode = normalizeCurrencyCode(String(formData.get("currencyCode") ?? "USD"));
  const originalAmount = parseAmount(String(formData.get("amount") ?? "0"));
  const manualFxRate = parseAmount(String(formData.get("fxRateToUsd") ?? "0"));
  const { fxRate, reportingAmountUsd, fxSource } = inferExpenseUsd(
    originalAmount,
    originalCurrencyCode,
    manualFxRate
  );
  const expenseDate = normalizeWhitespace(String(formData.get("expenseDate") ?? "")) || null;
  const noReceiptReason = normalizeWhitespace(String(formData.get("noReceiptReason") ?? "")) || null;
  const tagId = normalizeWhitespace(String(formData.get("expenseTagId") ?? "")) || null;
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/my-expenses";

  if (!title || originalAmount <= 0) {
    redirectToExpenseWorkflow("error", "Title and a positive amount are required.", returnPath);
  }

  if (!tagId) {
    redirectToExpenseWorkflow("error", "Choose an expense tag before submitting.", returnPath);
  }

  if (!noReceiptReason) {
    redirectToExpenseWorkflow("error", "Manual entries without a receipt require an explanation.", returnPath);
  }

  const companyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = 'TBR'::company_code limit 1`
  );
  const companyId = companyRows[0]?.id;

  if (!companyId) {
    redirectToExpenseWorkflow("error", "TBR company record was not found.", returnPath);
  }

  const submissionRows = await queryRowsAdmin<{ id: string }>(
    `insert into expense_submissions (
       company_id,
       race_event_id,
       submitted_by_user_id,
       submission_status,
       submission_title,
       operator_note,
       submitted_at
     )
     values ($1, $2, $3, 'submitted', $4, $5, now())
     returning id`,
    [companyId, raceEventId || null, session.id, title, operatorNote]
  );

  const submissionId = submissionRows[0]?.id;

  if (!submissionId) {
    redirectToExpenseWorkflow("error", "Submission could not be created.", returnPath);
  }

  const itemRows = await queryRowsAdmin<{ id: string }>(
    `insert into expense_submission_items (
       submission_id,
       cost_category_id,
       team_id,
       merchant_name,
       expense_date,
       amount,
       original_currency_code,
       original_amount,
       fx_rate_to_usd,
       fx_source,
       reporting_currency_code,
       reporting_amount_usd,
       approved_amount_usd,
       receipt_status,
       no_receipt_reason,
       description,
       split_method,
       split_count
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'USD', $11, $11, 'missing_with_reason', $12, $13, $14::expense_split_method, $15)
     returning id`,
    [
      submissionId,
      costCategoryId || null,
      teamId || null,
      merchantName,
      expenseDate || null,
      reportingAmountUsd,
      originalCurrencyCode,
      originalAmount,
      fxRate,
      fxSource,
      reportingAmountUsd,
      noReceiptReason,
      description,
      splitMethod,
      splitCount
    ]
  );

  const itemId = itemRows[0]?.id;

  if (itemId) {
    if (splitMethod === "solo") {
      await executeAdmin(
        `insert into expense_item_splits (
           expense_submission_item_id,
           app_user_id,
           split_label,
           split_percentage,
          split_amount
         )
         values ($1, $2, $3, 100, $4)`,
        [itemId, session.id, session.fullName, reportingAmountUsd]
      );
    }

    if (splitMethod === "equal") {
      const effectiveCount = Math.max(1, splitCount);
      const splitAmount = Number((reportingAmountUsd / effectiveCount).toFixed(2));
      const splitPercentage = Number((100 / effectiveCount).toFixed(4));

      for (let index = 0; index < effectiveCount; index += 1) {
        await executeAdmin(
          `insert into expense_item_splits (
             expense_submission_item_id,
             split_label,
             split_percentage,
             split_amount
           )
           values ($1, $2, $3, $4)`,
          [itemId, `Participant ${index + 1}`, splitPercentage, splitAmount]
        );
      }
    }
  }

  if (itemId && tagId) {
    await executeAdmin(
      `insert into expense_submission_item_tags (expense_submission_item_id, expense_tag_id)
       values ($1, $2)
       on conflict do nothing`,
      [itemId, tagId]
    );
    await refreshExpenseItemRuleFindings(itemId);
  }

  if (submissionId) {
    await cascadeUpdate({
      trigger: "expense-submission:submitted",
      entityType: "expense_submission",
      entityId: submissionId,
      action: "create",
      after: { title, companyId, raceEventId },
      performedBy: session.id,
      agentId: "expense-agent",
    });
    await notifyExpenseEvent("submitted", submissionId);
  }

  revalidatePath("/tbr");
  revalidatePath("/tbr/expense-management");
  revalidatePath(returnPath);
  redirectToExpenseWorkflow("success", "Expense submission created.", returnPath);
}

export async function createExpenseReportFromBillsAction(formData: FormData) {
  await requireTbrExpensePortalAccess();
  const session = await requireSession();

  const submissionTitle = normalizeWhitespace(String(formData.get("submissionTitle") ?? ""));
  const operatorNote = normalizeWhitespace(String(formData.get("operatorNote") ?? "")) || null;
  const raceEventId = normalizeWhitespace(String(formData.get("raceEventId") ?? "")) || null;
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/my-expenses";
  const selectedBillRefs = normalizeWhitespace(String(formData.get("intakeEventIds") ?? ""))
    .split(",")
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);
  const legacyIntakeEventIds = selectedBillRefs.filter((value) => !value.startsWith("ai:"));
  const aiDraftIds = selectedBillRefs
    .filter((value) => value.startsWith("ai:"))
    .map((value) => value.slice(3))
    .filter(Boolean);

  if (!submissionTitle || !raceEventId || selectedBillRefs.length === 0) {
    redirectToExpenseWorkflow(
      "error",
      "Choose at least one analyzed bill and enter a report title.",
      returnPath
    );
  }

  const companyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = 'TBR'::company_code limit 1`
  );
  const companyId = companyRows[0]?.id;

  if (!companyId) {
    redirectToExpenseWorkflow("error", "TBR company record was not found.", returnPath);
  }

  type SelectedBill = {
    billRef: string;
    sourceDocumentId: string;
    sourceFileName: string | null;
    amount: number;
    currencyCode: string;
    originalAmount: number;
    originalCurrencyCode: string;
    fxRateToUsd: number;
    fxSource: string;
    expenseDate: string | null;
    merchantName: string;
    description: string | null;
    aiSummary: Record<string, unknown>;
    aiDraftId?: string;
  };

  const selectedRows: SelectedBill[] = [];

  if (legacyIntakeEventIds.length > 0) {
    const legacyRows = await queryRowsAdmin<{
      intake_event_id: string;
      analysis_run_id: string;
      source_document_id: string;
      source_file_name: string | null;
      extracted_summary: Record<string, unknown> | null;
    }>(
      `select
         die.id as intake_event_id,
         die.analysis_run_id,
         die.source_document_id,
         dar.source_file_name,
         dar.extracted_summary
       from document_intake_events die
       join document_analysis_runs dar on dar.id = die.analysis_run_id
       where die.id = any($1::uuid[])
         and die.app_user_id = $2
         and die.workflow_context like ('tbr-race:' || $3::text || '%')`,
      [legacyIntakeEventIds, session.id, raceEventId]
    );

    for (const row of legacyRows) {
      const summary = row.extracted_summary ?? {};
      const usdAmount =
        parseNormalizedNumber(summary.usdAmount) ||
        (String(summary.originalCurrency ?? summary.currencyCode ?? "").toUpperCase() === "USD"
          ? parseNormalizedNumber(summary.originalAmount)
          : 0);
      const originalCurrencyCode = normalizeCurrencyCode(
        String(summary.originalCurrency ?? summary.currencyCode ?? "USD")
      );
      const originalAmount = parseNormalizedNumber(summary.originalAmount) || usdAmount;
      const inferred = usdAmount > 0 && originalAmount > 0
        ? {
            fxRate: Number((usdAmount / originalAmount).toFixed(6)),
            reportingAmountUsd: usdAmount,
            fxSource: "ai_extracted_usd_amount",
          }
        : inferExpenseUsd(originalAmount, originalCurrencyCode);
      const merchantName =
        normalizeWhitespace(
          String(
            summary.vendorName ??
              summary.merchantName ??
              summary.counterparty ??
              row.source_file_name ??
              "Uploaded bill"
          )
        ) || "Uploaded bill";
      const description =
        normalizeWhitespace(
          String(summary.financeInterpretation ?? summary.proposedTarget ?? row.source_file_name ?? "")
        ) || null;
      const expenseDate = normalizeDate(summary.expenseDate);

      selectedRows.push({
        billRef: row.intake_event_id,
        sourceDocumentId: row.source_document_id,
        sourceFileName: row.source_file_name,
        amount: inferred.reportingAmountUsd,
        currencyCode: "USD",
        originalAmount,
        originalCurrencyCode,
        fxRateToUsd: inferred.fxRate,
        fxSource: inferred.fxSource,
        expenseDate,
        merchantName,
        description,
        aiSummary: {
          analysisRunId: row.analysis_run_id,
          intakeEventId: row.intake_event_id,
          originalAmount: summary.originalAmount ?? null,
          originalCurrency: originalCurrencyCode,
          usdAmount: inferred.reportingAmountUsd,
          fxRateToUsd: inferred.fxRate,
          expenseDate,
          sourceFileName: row.source_file_name ?? null
        }
      });
    }
  }

  if (aiDraftIds.length > 0) {
    const aiRows = await queryRowsAdmin<{
      ai_draft_id: string;
      source_document_id: string;
      source_name: string | null;
      finance_interpretation: string | null;
      field_values: Record<string, unknown> | null;
    }>(
      `select
         aid.id as ai_draft_id,
         aid.source_document_id::text,
         aid.source_name,
         aid.finance_interpretation,
         fields.field_values
       from ai_intake_drafts aid
       left join lateral (
         select jsonb_object_agg(aidf.field_key, aidf.preview_value) as field_values
         from ai_intake_draft_fields aidf
         where aidf.draft_id = aid.id
       ) fields on true
       where aid.id = any($1::uuid[])
         and aid.submitted_by_user_id = $2::uuid
        and (
          aid.workflow_context like ('tbr-race:' || $3::text || ':%')
          or aid.workflow_context = 'tbr-my-expenses'
        )
         and aid.target_kind in ('expense_receipt', 'reimbursement_bundle')
         and aid.status = 'approved'
         and aid.source_document_id is not null`,
      [aiDraftIds, session.id, raceEventId]
    );

    const readField = (fields: Record<string, unknown> | null, ...keys: string[]) => {
      if (!fields) return "";
      for (const key of keys) {
        const value = fields[key];
        if (value === null || value === undefined) continue;
        if (typeof value === "string") return value;
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        return JSON.stringify(value);
      }
      return "";
    };

    for (const row of aiRows) {
      const fields = row.field_values ?? {};
      const originalCurrency =
        readField(fields, "currency_code", "original_currency", "currency").toUpperCase().match(/[A-Z]{3}/)?.[0] ??
        "USD";
      const usdAmount = parseNormalizedNumber(readField(fields, "usd_amount"));
      const originalAmount = parseNormalizedNumber(readField(fields, "original_amount", "total_amount", "amount"));
      const inferred = usdAmount > 0 && originalAmount > 0
        ? {
            fxRate: Number((usdAmount / originalAmount).toFixed(6)),
            reportingAmountUsd: usdAmount,
            fxSource: "ai_extracted_usd_amount",
          }
        : inferExpenseUsd(originalAmount, originalCurrency);
      const currencyCode = "USD";
      const amount = inferred.reportingAmountUsd;
      const merchantName =
        normalizeWhitespace(
          readField(fields, "merchant_name", "vendor_name", "counterparty_name", "payee") ||
            row.source_name ||
            "AI intake bill"
        ) || "AI intake bill";
      const description =
        normalizeWhitespace(
          readField(fields, "description", "document_description", "category") ||
            row.finance_interpretation ||
            row.source_name ||
            ""
        ) || null;
      const expenseDate = normalizeDate(
        readField(fields, "expense_date", "transaction_date", "document_date", "date")
      );

      selectedRows.push({
        billRef: `ai:${row.ai_draft_id}`,
        sourceDocumentId: row.source_document_id,
        sourceFileName: row.source_name,
        amount,
        currencyCode,
        originalAmount,
        originalCurrencyCode: originalCurrency,
        fxRateToUsd: inferred.fxRate,
        fxSource: inferred.fxSource,
        expenseDate,
        merchantName,
        description,
        aiDraftId: row.ai_draft_id,
        aiSummary: {
          aiIntakeDraftId: row.ai_draft_id,
          sourceFileName: row.source_name ?? null,
          amount,
          currencyCode,
          originalAmount,
          originalCurrency,
          usdAmount: inferred.reportingAmountUsd,
          fxRateToUsd: inferred.fxRate,
          expenseDate,
          fields
        }
      });
    }
  }

  if (selectedRows.length === 0) {
    redirectToExpenseWorkflow("error", "The selected bills could not be loaded.", returnPath);
  }

  const duplicateRows = await queryRowsAdmin<{ source_document_id: string }>(
    `select distinct esi.source_document_id
     from expense_submission_items esi
     where esi.source_document_id = any($1::uuid[])`,
    [selectedRows.map((row) => row.sourceDocumentId)]
  );

  if (duplicateRows.length > 0) {
    redirectToExpenseWorkflow(
      "error",
      "One or more selected bills are already attached to an expense report.",
      returnPath
    );
  }

  const validRows = selectedRows.filter((row) => row.amount > 0);

  if (validRows.length === 0) {
    redirectToExpenseWorkflow(
      "error",
      "The selected bills do not have usable amounts yet.",
      returnPath
    );
  }

  const submissionRows = await queryRowsAdmin<{ id: string }>(
    `insert into expense_submissions (
       company_id,
       race_event_id,
       submitted_by_user_id,
       submission_status,
       submission_title,
       operator_note,
       submitted_at
     )
     values ($1, $2, $3, 'submitted', $4, $5, now())
     returning id`,
    [companyId, raceEventId, session.id, submissionTitle, operatorNote]
  );

  const submissionId = submissionRows[0]?.id;

  if (!submissionId) {
    redirectToExpenseWorkflow("error", "Expense report could not be created.", returnPath);
  }

  for (const row of validRows) {
    const itemRows = await queryRowsAdmin<{ id: string }>(
      `insert into expense_submission_items (
         submission_id,
         source_document_id,
         merchant_name,
         expense_date,
         currency_code,
         amount,
         original_currency_code,
         original_amount,
         fx_rate_to_usd,
         fx_source,
         reporting_currency_code,
         reporting_amount_usd,
         approved_amount_usd,
         receipt_status,
         description,
         split_method,
         split_count,
         ai_summary
       )
       values ($1, $2, $3, $4, 'USD', $5, $6, $7, $8, $9, 'USD', $5, $5, 'attached', $10, 'solo', 1, $11::jsonb)
       returning id`,
      [
        submissionId,
        row.sourceDocumentId,
        row.merchantName,
        row.expenseDate,
        row.amount,
        row.originalCurrencyCode,
        row.originalAmount,
        row.fxRateToUsd,
        row.fxSource,
        row.description,
        JSON.stringify(row.aiSummary)
      ]
    );

    const itemId = itemRows[0]?.id;

    if (itemId) {
      await executeAdmin(
        `insert into expense_item_splits (
           expense_submission_item_id,
           app_user_id,
           split_label,
           split_percentage,
           split_amount
         )
         values ($1, $2, $3, 100, $4)`,
        [itemId, session.id, session.fullName, row.amount]
      );
      await refreshExpenseItemRuleFindings(itemId);
    }
  }

  const postedAiDraftIds = validRows
    .map((row) => row.aiDraftId)
    .filter((value): value is string => Boolean(value));

  if (postedAiDraftIds.length > 0) {
    await executeAdmin(
      `update ai_intake_drafts
       set status = 'posted',
           target_entity_type = 'expense_submission',
           target_entity_id = $2::uuid,
           posted_at = now(),
           updated_at = now()
       where id = any($1::uuid[])`,
      [postedAiDraftIds, submissionId]
    );

    for (const aiDraftId of postedAiDraftIds) {
      await executeAdmin(
        `insert into ai_intake_posting_events (
           draft_id,
           posting_status,
           canonical_target_table,
           canonical_target_id,
           posting_summary,
           completed_at
         )
         values ($1, 'posted', 'expense_submissions', $2, $3, now())`,
        [
          aiDraftId,
          submissionId,
          `Grouped into race expense report "${submissionTitle}".`
        ]
      );
    }
  }

  if (submissionId) {
    await notifyExpenseEvent("submitted", submissionId);
  }

  revalidatePath("/tbr");
  revalidatePath("/tbr/my-expenses");
  revalidatePath("/tbr/races");
  revalidatePath(returnPath);
  redirectToExpenseWorkflow(
    "success",
    `Expense report created from ${validRows.length} selected bill${validRows.length === 1 ? "" : "s"}.`,
    returnPath
  );
}

const REJECT_REASON_LABELS: Record<string, string> = {
  missing_receipts: "Missing receipts",
  over_budget: "Over budget",
  policy_violation: "Policy violation",
  needs_team_split: "Needs team split",
  duplicate: "Duplicate submission",
  other: "Other",
};

async function refreshExpenseItemRuleFindings(itemId: string) {
  await executeAdmin(`delete from expense_item_rule_findings where expense_submission_item_id = $1`, [itemId]);

  const rows = await queryRowsAdmin<{
    item_id: string;
    submission_id: string;
    source_document_id: string | null;
    cost_category_id: string | null;
    race_event_id: string | null;
    reporting_amount_usd: string;
    original_currency_code: string | null;
    fx_rate_to_usd: string | null;
    no_receipt_reason: string | null;
    tag_count: string;
    category_name: string | null;
    rule_id: string | null;
    rule_label: string | null;
    rule_approved_amount_usd: string | null;
    close_threshold_ratio: string | null;
  }>(
    `select
       esi.id as item_id,
       esi.submission_id,
       esi.source_document_id::text,
       esi.cost_category_id::text,
       es.race_event_id::text,
       coalesce(esi.reporting_amount_usd, esi.amount)::text as reporting_amount_usd,
       esi.original_currency_code,
       esi.fx_rate_to_usd::text,
       esi.no_receipt_reason,
       count(esit.expense_tag_id)::text as tag_count,
       cc.name as category_name,
       rbr.id::text as rule_id,
       rbr.rule_label,
       rbr.approved_amount_usd::text as rule_approved_amount_usd,
       rbr.close_threshold_ratio::text
     from expense_submission_items esi
     join expense_submissions es on es.id = esi.submission_id
     left join cost_categories cc on cc.id = esi.cost_category_id
     left join expense_submission_item_tags esit on esit.expense_submission_item_id = esi.id
     left join race_budget_rules rbr
       on rbr.race_event_id = es.race_event_id
      and rbr.cost_category_id = esi.cost_category_id
     where esi.id = $1
     group by esi.id, es.race_event_id, cc.name, rbr.id`,
    [itemId]
  );

  const item = rows[0];
  if (!item) return;

  const findings: Array<{
    ruleKey: string;
    severity: "info" | "warning" | "blocker";
    suggestedStatus: "review" | "approved" | "rejected" | "needs_info" | null;
    suggestedApprovedAmountUsd: number | null;
    message: string;
    raceBudgetRuleId?: string | null;
  }> = [];

  if (!item.source_document_id && !item.no_receipt_reason) {
    findings.push({
      ruleKey: "receipt_required",
      severity: "blocker",
      suggestedStatus: "needs_info",
      suggestedApprovedAmountUsd: null,
      message: "Receipt is missing and no explanation was provided.",
    });
  } else if (!item.source_document_id) {
    findings.push({
      ruleKey: "receipt_explanation",
      severity: "info",
      suggestedStatus: "review",
      suggestedApprovedAmountUsd: null,
      message: `No receipt attached. Submitter explanation: ${item.no_receipt_reason}`,
    });
  }

  if (Number(item.tag_count) === 0) {
    findings.push({
      ruleKey: "tag_required",
      severity: "warning",
      suggestedStatus: "review",
      suggestedApprovedAmountUsd: null,
      message: "Expense is missing an operating tag.",
    });
  }

  if (!item.cost_category_id) {
    findings.push({
      ruleKey: "category_required",
      severity: "blocker",
      suggestedStatus: "needs_info",
      suggestedApprovedAmountUsd: null,
      message: "Expense category is required before finance approval.",
    });
  }

  if ((item.original_currency_code ?? "USD") !== "USD" && !item.fx_rate_to_usd) {
    findings.push({
      ruleKey: "fx_required",
      severity: "blocker",
      suggestedStatus: "needs_info",
      suggestedApprovedAmountUsd: null,
      message: "Non-USD expense requires an FX rate before review.",
    });
  }

  const reportingAmount = Number(item.reporting_amount_usd);
  if (item.rule_id && item.rule_approved_amount_usd) {
    const approved = Number(item.rule_approved_amount_usd);
    if (reportingAmount > approved) {
      findings.push({
        ruleKey: "race_budget_over_cap",
        severity: "warning",
        suggestedStatus: "review",
        suggestedApprovedAmountUsd: approved,
        raceBudgetRuleId: item.rule_id,
        message: `${item.rule_label ?? "Race budget"} caps this item at $${approved.toFixed(2)}.`,
      });
    }
  } else if (item.cost_category_id) {
    findings.push({
      ruleKey: "race_budget_rule_missing",
      severity: "warning",
      suggestedStatus: "review",
      suggestedApprovedAmountUsd: null,
      message: `No race budget rule matches ${item.category_name ?? "this category"}.`,
    });
  }

  for (const finding of findings) {
    await executeAdmin(
      `insert into expense_item_rule_findings (
         expense_submission_item_id,
         race_budget_rule_id,
         rule_key,
         severity,
         suggested_review_status,
         suggested_approved_amount_usd,
         message
       )
       values ($1, $2, $3, $4, $5::expense_item_review_status, $6, $7)`,
      [
        itemId,
        finding.raceBudgetRuleId ?? null,
        finding.ruleKey,
        finding.severity,
        finding.suggestedStatus,
        finding.suggestedApprovedAmountUsd,
        finding.message,
      ]
    );
  }

  const nextReceiptStatus = item.source_document_id
    ? "attached"
    : item.no_receipt_reason
      ? "missing_with_reason"
      : "missing";
  const nextReviewStatus =
    findings.some((finding) => finding.severity === "blocker")
      ? "needs_info"
      : findings.length > 0
        ? "review"
        : "pending";

  await executeAdmin(
    `update expense_submission_items
     set receipt_status = $2,
         review_status = case
           when review_status in ('approved', 'rejected') then review_status
           else $3::expense_item_review_status
         end,
         rule_summary = $4::jsonb,
         updated_at = now()
     where id = $1`,
    [
      itemId,
      nextReceiptStatus,
      nextReviewStatus,
      JSON.stringify({
        openFindings: findings.length,
        blockers: findings.filter((finding) => finding.severity === "blocker").length,
      }),
    ]
  );
}

async function postApprovedExpenseItems(submissionId: string, performedBy: string) {
  const items = await queryRowsAdmin<{
    id: string;
    company_id: string;
    race_event_id: string | null;
    cost_category_id: string | null;
    source_document_id: string | null;
    linked_expense_id: string | null;
    merchant_name: string | null;
    expense_date: string | null;
    original_currency_code: string | null;
    original_amount: string | null;
    fx_rate_to_usd: string | null;
    fx_source: string | null;
    reporting_amount_usd: string;
    approved_amount_usd: string | null;
    description: string | null;
    submitter_name: string;
  }>(
    `select
       esi.id,
       es.company_id,
       es.race_event_id::text,
       esi.cost_category_id::text,
       esi.source_document_id::text,
       esi.linked_expense_id::text,
       esi.merchant_name,
       esi.expense_date::text,
       esi.original_currency_code,
       esi.original_amount::text,
       esi.fx_rate_to_usd::text,
       esi.fx_source,
       coalesce(esi.reporting_amount_usd, esi.amount)::text as reporting_amount_usd,
       coalesce(esi.approved_amount_usd, esi.reporting_amount_usd, esi.amount)::text as approved_amount_usd,
       esi.description,
       au.full_name as submitter_name
     from expense_submission_items esi
     join expense_submissions es on es.id = esi.submission_id
     join app_users au on au.id = es.submitted_by_user_id
     where esi.submission_id = $1
       and esi.review_status = 'approved'
       and coalesce(esi.approved_amount_usd, esi.reporting_amount_usd, esi.amount) > 0`,
    [submissionId]
  );

  for (const item of items) {
    if (item.linked_expense_id) {
      await executeAdmin(
        `update expenses
         set company_id = $2,
             race_event_id = $3,
             cost_category_id = $4,
             source_document_id = $5,
             vendor_name = $6,
             expense_status = 'approved',
             expense_date = $7,
             currency_code = 'USD',
             amount = $8,
             original_currency_code = $9,
             original_amount = $10,
             fx_rate_to_usd = $11,
             fx_source = $12,
             reporting_currency_code = 'USD',
             reporting_amount_usd = $8,
             description = $13,
             is_reimbursable = true,
             submitted_by = $14,
             source_expense_submission_id = $15,
             source_expense_submission_item_id = $1,
             updated_at = now()
         where id = $16`,
        [
          item.id,
          item.company_id,
          item.race_event_id,
          item.cost_category_id,
          item.source_document_id,
          item.merchant_name,
          item.expense_date,
          item.approved_amount_usd,
          item.original_currency_code ?? "USD",
          item.original_amount ?? item.reporting_amount_usd,
          item.fx_rate_to_usd,
          item.fx_source,
          item.description,
          item.submitter_name,
          submissionId,
          item.linked_expense_id,
        ]
      );
    } else {
      const expenseRows = await queryRowsAdmin<{ id: string }>(
        `insert into expenses (
           company_id,
           race_event_id,
           cost_category_id,
           source_document_id,
           vendor_name,
           expense_status,
           expense_date,
           currency_code,
           amount,
           original_currency_code,
           original_amount,
           fx_rate_to_usd,
           fx_source,
           reporting_currency_code,
           reporting_amount_usd,
           description,
           is_reimbursable,
           submitted_by,
           source_expense_submission_id,
           source_expense_submission_item_id
         )
         values ($1, $2, $3, $4, $5, 'approved', $6, 'USD', $7, $8, $9, $10, $11, 'USD', $7, $12, true, $13, $14, $15)
         on conflict (source_expense_submission_item_id)
         where source_expense_submission_item_id is not null
         do update
         set amount = excluded.amount,
             reporting_amount_usd = excluded.reporting_amount_usd,
             expense_status = 'approved',
             updated_at = now()
         returning id`,
        [
          item.company_id,
          item.race_event_id,
          item.cost_category_id,
          item.source_document_id,
          item.merchant_name,
          item.expense_date,
          item.approved_amount_usd,
          item.original_currency_code ?? "USD",
          item.original_amount ?? item.reporting_amount_usd,
          item.fx_rate_to_usd,
          item.fx_source,
          item.description,
          item.submitter_name,
          submissionId,
          item.id,
        ]
      );

      const expenseId = expenseRows[0]?.id;
      if (expenseId) {
        await executeAdmin(
          `update expense_submission_items
           set linked_expense_id = $2,
               updated_at = now()
           where id = $1`,
          [item.id, expenseId]
        );

        await cascadeUpdate({
          trigger: "expense:created",
          entityType: "expense",
          entityId: expenseId,
          action: "post-approved-expense-item",
          after: { submissionId, itemId: item.id, amountUsd: item.approved_amount_usd },
          performedBy,
          agentId: "expense-agent",
        });
      }
    }
  }
}

export async function updateExpenseSubmissionStatusAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const submissionId = normalizeWhitespace(String(formData.get("submissionId") ?? ""));
  const nextStatus = normalizeWhitespace(String(formData.get("nextStatus") ?? ""));
  let reviewNote = normalizeWhitespace(String(formData.get("reviewNote") ?? "")) || null;
  const rejectReasonCode = normalizeWhitespace(String(formData.get("rejectReasonCode") ?? ""));
  const rejectReasonDetail =
    normalizeWhitespace(String(formData.get("rejectReasonDetail") ?? "")) || null;
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/expense-management";

  if (!submissionId || !["in_review", "rejected", "needs_clarification"].includes(nextStatus)) {
    redirectToExpenseWorkflow("error", "Invalid submission status update.", returnPath);
  }

  // Rejection requires a structured reason + explanation. Prepend the reason
  // label to the review_note so it is persisted without a schema change.
  let structuredReason: { code: string; label: string } | null = null;
  if (nextStatus === "rejected") {
    if (!rejectReasonCode || !REJECT_REASON_LABELS[rejectReasonCode]) {
      redirectToExpenseWorkflow(
        "error",
        "Pick a rejection reason before rejecting a submission.",
        returnPath
      );
    }
    if (!rejectReasonDetail) {
      redirectToExpenseWorkflow(
        "error",
        "Add an explanation for the rejection so the submitter knows what to fix.",
        returnPath
      );
    }
    const label = REJECT_REASON_LABELS[rejectReasonCode];
    structuredReason = { code: rejectReasonCode, label };
    reviewNote = `[${label}] ${rejectReasonDetail}`;
  } else if (nextStatus === "needs_clarification" && rejectReasonDetail) {
    reviewNote = rejectReasonDetail;
  }

  await executeAdmin(
    `update expense_submissions
     set submission_status = $2::expense_submission_status,
         reviewed_by_user_id = $3,
         reviewed_at = now(),
         review_note = coalesce($4, review_note),
         updated_at = now()
     where id = $1`,
    [submissionId, nextStatus, session.id, reviewNote]
  );

  await cascadeUpdate({
    trigger:
      nextStatus === "rejected"
        ? "expense-submission:rejected"
        : "expense-submission:approved",
    entityType: "expense_submission",
    entityId: submissionId,
    action: nextStatus === "rejected" ? "reject" : `set-${nextStatus}`,
    after: {
      status: nextStatus,
      reviewNote,
      ...(structuredReason ? { rejectReason: structuredReason } : {}),
    },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  if (nextStatus === "rejected") {
    await notifyExpenseEvent("rejected", submissionId);
  } else if (nextStatus === "needs_clarification") {
    await notifyExpenseEvent("needs_clarification", submissionId);
  }
  // No email on set-in_review — it's an internal finance flag, not a
  // submitter-facing state change.

  revalidatePath("/tbr/expense-management");
  revalidatePath(`/tbr/expense-management/${submissionId}`);
  revalidatePath(returnPath);
  redirectToExpenseWorkflow(
    "success",
    nextStatus === "rejected"
      ? "Submission rejected."
      : nextStatus === "needs_clarification"
        ? "Clarification requested from the submitter."
        : "Submission moved into review.",
    returnPath
  );
}

export async function approveExpenseSubmissionAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const submissionId = normalizeWhitespace(String(formData.get("submissionId") ?? ""));
  const reviewNote = normalizeWhitespace(String(formData.get("reviewNote") ?? "")) || null;
  const budgetOverride =
    normalizeWhitespace(String(formData.get("budgetOverride") ?? "")) === "true";
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/expense-management";

  if (!submissionId) {
    redirectToExpenseWorkflow("error", "Missing submission id.", returnPath);
  }

  // Above-budget override guardrail: if any item is over its race-budget rule,
  // finance must explicitly override with a reason in the review note.
  const aboveBudgetRows = await queryRowsAdmin<{ id: string }>(
    `select esi.id::text
     from expense_submission_items esi
     join expense_submissions es on es.id = esi.submission_id
     left join race_budget_rules rbr
       on rbr.race_event_id = es.race_event_id
      and rbr.cost_category_id = esi.cost_category_id
     where esi.submission_id = $1
       and rbr.approved_amount_usd is not null
       and coalesce(esi.approved_amount_usd, esi.reporting_amount_usd, esi.amount) > rbr.approved_amount_usd
       and esi.review_status <> 'rejected'`,
    [submissionId]
  );

  if (aboveBudgetRows.length > 0 && !budgetOverride) {
    redirectToExpenseWorkflow(
      "error",
      `${aboveBudgetRows.length} item(s) are over the approved race budget. Tick "Override budget" and add a reason to approve anyway.`,
      returnPath
    );
  }
  if (aboveBudgetRows.length > 0 && budgetOverride && !reviewNote) {
    redirectToExpenseWorkflow(
      "error",
      "Budget override requires a finance review note explaining the exception.",
      returnPath
    );
  }

  await withAdminTransaction(async () => {
    await executeAdmin(
      `update expense_submission_items
       set review_status = 'approved',
           approved_amount_usd = coalesce(approved_amount_usd, reporting_amount_usd, amount),
           reviewed_by_user_id = $2,
           reviewed_at = now(),
           updated_at = now()
       where submission_id = $1
         and review_status in ('pending', 'review')`,
      [submissionId, session.id]
    );

    const approvedRows = await queryRowsAdmin<{ approved_count: string }>(
      `select count(*)::text as approved_count
       from expense_submission_items
       where submission_id = $1
         and review_status = 'approved'`,
      [submissionId]
    );

    if (Number(approvedRows[0]?.approved_count ?? 0) === 0) {
      throw new Error("At least one line item must be approved before the report can become invoice-ready.");
    }

    await executeAdmin(
      `update expense_submissions
       set submission_status = 'approved',
           reviewed_by_user_id = $2,
           reviewed_at = now(),
           review_note = coalesce($3, review_note, 'Approved and ready for invoice generation.'),
           updated_at = now()
       where id = $1`,
      [submissionId, session.id, reviewNote]
    );

    await postApprovedExpenseItems(submissionId, session.id);
  });

  await cascadeUpdate({
    trigger: "expense-submission:approved",
    entityType: "expense_submission",
    entityId: submissionId,
    action: "approve-invoice-ready",
    after: {
      status: "approved",
      reviewNote,
      budgetOverride: aboveBudgetRows.length > 0 ? true : false,
      aboveBudgetItemCount: aboveBudgetRows.length,
    },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  await notifyExpenseEvent("approved", submissionId);

  // Post to QuickBooks (non-blocking — postExpenseJournal never throws and
  // always logs the attempt to qb_journal_entries, which the expense detail
  // timeline surfaces).
  await postExpenseJournal({
    submissionId,
    initiatedByUserId: session.id,
  });

  revalidatePath("/tbr");
  revalidatePath("/tbr/expense-management");
  revalidatePath("/tbr/my-expenses");
  revalidatePath(`/tbr/expense-management/${submissionId}`);
  revalidatePath(returnPath);
  redirectToExpenseWorkflow(
    "success",
    aboveBudgetRows.length > 0
      ? "Submission approved with budget override."
      : "Submission approved and marked invoice ready.",
    returnPath
  );
}

export async function updateExpenseItemReviewAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const itemId = normalizeWhitespace(String(formData.get("itemId") ?? ""));
  const submissionId = normalizeWhitespace(String(formData.get("submissionId") ?? ""));
  const reviewStatus = normalizeWhitespace(String(formData.get("reviewStatus") ?? ""));
  const approvedAmountUsd = parseAmount(String(formData.get("approvedAmountUsd") ?? "0"));
  const rejectionReasonCode = normalizeWhitespace(String(formData.get("rejectionReasonCode") ?? "")) || null;
  const rejectionReasonDetail =
    normalizeWhitespace(String(formData.get("rejectionReasonDetail") ?? "")) || null;
  const challengeResponse = normalizeWhitespace(String(formData.get("challengeResponse") ?? "")) || null;
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) ||
    `/tbr/expense-management/${submissionId}`;

  if (!itemId || !submissionId || !["approved", "rejected", "needs_info", "review"].includes(reviewStatus)) {
    redirectToExpenseWorkflow("error", "Invalid item review decision.", returnPath);
  }

  if (reviewStatus === "approved" && approvedAmountUsd <= 0) {
    redirectToExpenseWorkflow("error", "Approved line items require a positive approved USD amount.", returnPath);
  }

  if (reviewStatus === "rejected" && (!rejectionReasonCode || !rejectionReasonDetail)) {
    redirectToExpenseWorkflow("error", "Rejected line items require a reason and explanation.", returnPath);
  }

  if (reviewStatus === "needs_info" && !rejectionReasonDetail) {
    redirectToExpenseWorkflow("error", "Clarification requests require a question for the submitter.", returnPath);
  }

  await executeAdmin(
    `update expense_submission_items
     set review_status = $2::expense_item_review_status,
         approved_amount_usd = case when $2 = 'approved' then $3 else approved_amount_usd end,
         rejection_reason_code = case when $2 = 'rejected' then $4 else rejection_reason_code end,
         rejection_reason_detail = case when $2 in ('rejected', 'needs_info', 'review') then $5 else rejection_reason_detail end,
         challenge_status = case
           when challenge_status = 'challenged' and $6::text is not null then 'resolved'
           else challenge_status
         end,
         challenge_response = coalesce($6, challenge_response),
         challenge_responded_by_user_id = case when $6::text is not null then $7 else challenge_responded_by_user_id end,
         challenge_responded_at = case when $6::text is not null then now() else challenge_responded_at end,
         reviewed_by_user_id = $7,
         reviewed_at = now(),
         updated_at = now()
     where id = $1
       and submission_id = $8`,
    [
      itemId,
      reviewStatus,
      approvedAmountUsd,
      rejectionReasonCode,
      rejectionReasonDetail,
      challengeResponse,
      session.id,
      submissionId,
    ]
  );

  if (reviewStatus === "rejected") {
    await executeAdmin(
      `update expenses
       set expense_status = 'rejected',
           updated_at = now()
       where source_expense_submission_item_id = $1`,
      [itemId]
    );
  }

  if (reviewStatus === "rejected" || reviewStatus === "needs_info") {
    await queueExpenseItemNotification({
      event: reviewStatus === "rejected" ? "expense_item_rejected" : "expense_item_needs_clarification",
      submissionId,
      itemId,
      note: rejectionReasonDetail,
    });
  }

  await cascadeUpdate({
    trigger:
      reviewStatus === "rejected"
        ? "expense-item:rejected"
        : "expense-item:reviewed",
    entityType: "expense_submission_item",
    entityId: itemId,
    action: `set-${reviewStatus}`,
    after: {
      submissionId,
      reviewStatus,
      approvedAmountUsd: reviewStatus === "approved" ? approvedAmountUsd : null,
      rejectionReasonCode,
      rejectionReasonDetail,
      challengeResponse,
    },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  revalidatePath("/tbr/expense-management");
  revalidatePath(`/tbr/expense-management/${submissionId}`);
  revalidatePath("/tbr/my-expenses");
  revalidatePath(returnPath);
  redirectToExpenseWorkflow("success", "Line item review updated.", returnPath);
}

export async function challengeExpenseItemRejectionAction(formData: FormData) {
  await requireTbrExpensePortalAccess();
  const session = await requireSession();
  const itemId = normalizeWhitespace(String(formData.get("itemId") ?? ""));
  const submissionId = normalizeWhitespace(String(formData.get("submissionId") ?? ""));
  const challengeReason = normalizeWhitespace(String(formData.get("challengeReason") ?? ""));
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || `/tbr/my-expenses/${submissionId}`;

  if (!itemId || !submissionId || !challengeReason) {
    redirectToExpenseWorkflow("error", "Challenge reason is required.", returnPath);
  }

  const rows = await queryRowsAdmin<{ id: string }>(
    `select esi.id
     from expense_submission_items esi
     join expense_submissions es on es.id = esi.submission_id
     where esi.id = $1
       and es.id = $2
       and es.submitted_by_user_id = $3
       and esi.review_status = 'rejected'
     limit 1`,
    [itemId, submissionId, session.id]
  );

  if (!rows[0]) {
    redirectToExpenseWorkflow("error", "Only rejected items from your own report can be challenged.", returnPath);
  }

  await executeAdmin(
    `update expense_submission_items
     set challenge_status = 'challenged',
         challenge_reason = $2,
         challenged_at = now(),
         updated_at = now()
     where id = $1`,
    [itemId, challengeReason]
  );

  await queueExpenseItemNotification({
    event: "expense_item_clarification_replied",
    submissionId,
    itemId,
    note: challengeReason,
  });

  await cascadeUpdate({
    trigger: "expense-item:challenged",
    entityType: "expense_submission_item",
    entityId: itemId,
    action: "challenge-rejection",
    after: { submissionId, challengeReason },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  revalidatePath("/tbr/my-expenses");
  revalidatePath(`/tbr/my-expenses/${submissionId}`);
  revalidatePath(`/tbr/expense-management/${submissionId}`);
  redirectToExpenseWorkflow("success", "Challenge submitted for finance review.", returnPath);
}

export async function upsertExpenseTagAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const label = normalizeWhitespace(String(formData.get("tagLabel") ?? ""));
  const description = normalizeWhitespace(String(formData.get("tagDescription") ?? "")) || null;
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/expense-management";

  if (!label) {
    redirectToExpenseWorkflow("error", "Tag label is required.", returnPath);
  }

  const companyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = 'TBR'::company_code limit 1`
  );
  const companyId = companyRows[0]?.id;
  if (!companyId) {
    redirectToExpenseWorkflow("error", "TBR company record was not found.", returnPath);
  }

  const tagKey = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  await executeAdmin(
    `insert into expense_tags (
       company_id,
       tag_key,
       tag_label,
       tag_description,
       created_by_user_id,
       updated_by_user_id
     )
     values ($1, $2, $3, $4, $5, $5)
     on conflict (company_id, tag_key)
     do update set
       tag_label = excluded.tag_label,
       tag_description = excluded.tag_description,
       is_active = true,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = now()`,
    [companyId, tagKey, label, description, session.id]
  );

  revalidatePath("/tbr/expense-management");
  revalidatePath("/tbr/my-expenses");
  redirectToExpenseWorkflow("success", "Expense tag saved.", returnPath);
}

export async function upsertExpenseWorkspaceRuleAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const ruleKey = normalizeWhitespace(String(formData.get("ruleKey") ?? ""));
  const ruleLabel = normalizeWhitespace(String(formData.get("ruleLabel") ?? ""));
  const severity = normalizeWhitespace(String(formData.get("severity") ?? "warning"));
  const isActive = normalizeWhitespace(String(formData.get("isActive") ?? "")) === "true";
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/expense-management";

  if (!ruleKey || !ruleLabel || !["info", "warning", "blocker"].includes(severity)) {
    redirectToExpenseWorkflow("error", "Rule key, label, and valid severity are required.", returnPath);
  }

  const companyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = 'TBR'::company_code limit 1`
  );
  const companyId = companyRows[0]?.id;
  if (!companyId) {
    redirectToExpenseWorkflow("error", "TBR company record was not found.", returnPath);
  }

  await executeAdmin(
    `insert into expense_workspace_rules (
       company_id,
       rule_key,
       rule_label,
       severity,
       is_active,
       created_by_user_id,
       updated_by_user_id
     )
     values ($1, $2, $3, $4, $5, $6, $6)
     on conflict (company_id, rule_key)
     do update set
       rule_label = excluded.rule_label,
       severity = excluded.severity,
       is_active = excluded.is_active,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = now()`,
    [companyId, ruleKey, ruleLabel, severity, isActive, session.id]
  );

  revalidatePath("/tbr/expense-management");
  redirectToExpenseWorkflow("success", "Workspace rule updated.", returnPath);
}

export async function analyzeRaceBudgetDocumentAction(
  _previousState: RaceBudgetAnalysisState,
  formData: FormData
): Promise<RaceBudgetAnalysisState> {
  await requireRole(["super_admin", "finance_admin"]);

  const file = formData.get("document");
  const raceLabel = normalizeWhitespace(String(formData.get("raceLabel") ?? ""));
  const categoryOptions = JSON.parse(String(formData.get("categoriesJson") ?? "[]")) as BudgetCategoryOption[];
  const operatorNote = normalizeWhitespace(String(formData.get("documentNote") ?? ""));

  if (!(file instanceof File) || file.size === 0) {
    return {
      ...INITIAL_BUDGET_ANALYSIS_STATE,
      status: "error",
      message: "Upload a budget or per-diem document first."
    };
  }

  const schema = {
    type: "object",
    required: ["summary", "rules"],
    properties: {
      summary: { type: "string" },
      rules: {
        type: "array",
        items: {
          type: "object",
          required: [
            "categoryName",
            "ruleKind",
            "unitLabel",
            "ruleLabel",
            "approvedAmount",
            "currencyCode",
            "closeThresholdPercent",
            "notes"
          ],
          properties: {
            categoryName: { type: "string" },
            ruleKind: { type: "string", enum: ["per_diem", "budget_cap", "approved_charge"] },
            unitLabel: { type: "string", enum: ["per_day", "per_person", "per_race", "total"] },
            ruleLabel: { type: "string" },
            approvedAmount: { type: "number" },
            currencyCode: { type: "string" },
            closeThresholdPercent: { type: "number" },
            notes: { type: "string" }
          }
        }
      }
    }
  } as const;

  const prompt = [
    "You are extracting approved race budgets and per-diems for Team Blue Rising.",
    "Return only structured JSON.",
    "Do not invent a rule if the document does not support it.",
    "Budget and per-diem rules should be normalized into one line per approved threshold.",
    "Use these cost categories only:",
    categoryOptions.map((option) => `- ${option.label}`).join("\n"),
    "Map common items this way when appropriate:",
    "- Food/day -> Catering",
    "- On-site travel/day, taxis/day, cabs/day, local transport/day -> Travel",
    "- Accommodation/day or hotel/day -> Travel",
    "- Visa -> Visa",
    "- Equipment contingency -> Equipment",
    "- Foil damage contingency -> Foil Damage",
    "- VIP or guest pass charges -> VIP Passes",
    "- Licensing charge -> Licensing Fee",
    `Current race: ${raceLabel || "Unknown race"}`,
    operatorNote ? `Admin note: ${operatorNote}` : "Admin note: none",
    "Use these rule kinds:",
    "- per_diem for repeatable daily allowances",
    "- budget_cap for approved caps or contingency envelopes",
    "- approved_charge for one known approved charge",
    "Use these units:",
    "- per_day",
    "- per_person",
    "- per_race",
    "- total",
    "If a document gives food/day, taxis/day, or accommodation/day, use per_diem and per_day.",
    "If a document gives a one-off approved charge, use approved_charge and total or per_race.",
    "If the document is not in USD, return the original currencyCode and amount; the app will normalize to USD."
  ].join("\n");

  try {
    const result = await callLlm<{
      summary?: string;
      rules?: Array<{
        categoryName: string;
        ruleKind: string;
        unitLabel: string;
        ruleLabel: string;
        approvedAmount: number;
        currencyCode: string;
        closeThresholdPercent: number;
        notes: string;
      }>;
    }>({
      tier: "T2",
      purpose: "race-budget-extraction",
      prompt,
      inlineParts: [
        {
          mimeType: file.type || "application/octet-stream",
          dataBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        },
      ],
      jsonSchema: schema,
      enforceStrictSchema: true,
      disableThinking: true,
      maxOutputTokens: 1400,
    });

    if (!result.ok || !result.data) {
      return {
        ...INITIAL_BUDGET_ANALYSIS_STATE,
        status: "error",
        message: `AI analysis failed: ${result.error ?? "no data"}`,
      };
    }

    const parsed = result.data;

    const rules =
      parsed.rules?.map((rule) => {
        const categoryId = matchBudgetCategoryId(rule.categoryName, categoryOptions);
        const currencyCode = normalizeWhitespace(rule.currencyCode || "USD").toUpperCase();
        const approvedAmountUsd = inferBudgetUsdAmount(Number(rule.approvedAmount ?? 0), currencyCode);

        return {
          categoryId,
          ruleKind: normalizeBudgetRuleKind(rule.ruleKind),
          unitLabel: normalizeBudgetUnitLabel(rule.unitLabel),
          ruleLabel: normalizeBudgetLabel(rule.ruleLabel),
          approvedAmountUsd: approvedAmountUsd > 0 ? String(approvedAmountUsd) : "",
          closeThresholdPercent: String(
            Math.max(0, Math.min(100, Number(rule.closeThresholdPercent ?? 90) || 90))
          ),
          notes: normalizeWhitespace(
            `${rule.notes ?? ""}${currencyCode !== "USD" ? ` Original currency: ${currencyCode}.` : ""}`
          )
        } satisfies RaceBudgetRuleDraft;
      }).filter((rule) => rule.categoryId && rule.approvedAmountUsd) ?? [];

    if (rules.length === 0) {
      return {
        ...INITIAL_BUDGET_ANALYSIS_STATE,
        status: "error",
        message: "The analyzer could not extract usable budget rules from that document."
      };
    }

    return {
      status: "success",
      message:
        parsed.summary || `Loaded ${rules.length} suggested budget rule${rules.length === 1 ? "" : "s"}.`,
      appliedKey: `${Date.now()}`,
      rules
    };
  } catch (error) {
    return {
      ...INITIAL_BUDGET_ANALYSIS_STATE,
      status: "error",
      message: error instanceof Error ? error.message : "AI budget analysis failed."
    };
  }
}

export async function saveRaceBudgetRulesAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const raceEventId = normalizeWhitespace(String(formData.get("raceEventId") ?? ""));
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/expense-management";
  const rulesJson = String(formData.get("rulesJson") ?? "[]");
  const rules = JSON.parse(rulesJson) as RaceBudgetRuleDraft[];

  if (!raceEventId) {
    redirectToExpenseWorkflow("error", "Race context is required before saving budget rules.", returnPath);
  }

  const validRules = rules
    .map((rule) => ({
      categoryId: normalizeWhitespace(rule.categoryId),
      ruleKind: normalizeBudgetRuleKind(rule.ruleKind),
      unitLabel: normalizeBudgetUnitLabel(rule.unitLabel),
      ruleLabel: normalizeWhitespace(rule.ruleLabel),
      approvedAmountUsd: parseAmount(rule.approvedAmountUsd),
      closeThresholdPercent: Math.max(0, Math.min(100, parseAmount(rule.closeThresholdPercent || "90"))),
      notes: normalizeWhitespace(rule.notes ?? "") || null
    }))
    .filter((rule) => rule.categoryId && rule.ruleLabel && rule.approvedAmountUsd > 0);

  if (validRules.length === 0) {
    redirectToExpenseWorkflow("error", "Add at least one valid budget rule before saving.", returnPath);
  }

  for (const rule of validRules) {
    await executeAdmin(
      `insert into race_budget_rules (
         race_event_id,
         cost_category_id,
         rule_kind,
         unit_label,
         rule_label,
         approved_amount_usd,
         close_threshold_ratio,
         notes,
         created_by_user_id,
         updated_by_user_id
       )
       values ($1, $2, $3::race_budget_rule_kind, $4, $5, $6, $7, $8, $9, $9)
       on conflict (race_event_id, cost_category_id, rule_kind)
       do update
       set unit_label = excluded.unit_label,
           rule_label = excluded.rule_label,
           approved_amount_usd = excluded.approved_amount_usd,
           close_threshold_ratio = excluded.close_threshold_ratio,
           notes = excluded.notes,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_at = now()`,
      [
        raceEventId,
        rule.categoryId,
        rule.ruleKind,
        rule.unitLabel,
        rule.ruleLabel,
        rule.approvedAmountUsd,
        rule.closeThresholdPercent / 100,
        rule.notes,
        session.id
      ]
    );
  }

  revalidatePath("/tbr/expense-management");
  revalidatePath(returnPath);
  redirectToExpenseWorkflow(
    "success",
    `${validRules.length} budget rule${validRules.length === 1 ? "" : "s"} saved for the selected race.`,
    returnPath
  );
}

export async function createOrUpdateRaceBudgetRuleAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const raceEventId = normalizeWhitespace(String(formData.get("raceEventId") ?? ""));
  const costCategoryId = normalizeWhitespace(String(formData.get("costCategoryId") ?? ""));
  const ruleKind = normalizeBudgetRuleKind(
    normalizeWhitespace(String(formData.get("ruleKind") ?? "budget_cap"))
  );
  const unitLabel = normalizeBudgetUnitLabel(
    normalizeWhitespace(String(formData.get("unitLabel") ?? "per_race"))
  );
  const ruleLabel = normalizeWhitespace(String(formData.get("ruleLabel") ?? ""));
  const approvedAmountUsd = parseAmount(String(formData.get("approvedAmountUsd") ?? "0"));
  const closeThresholdPercent = Math.max(
    0,
    Math.min(100, parseAmount(String(formData.get("closeThresholdPercent") ?? "90")))
  );
  const notes = normalizeWhitespace(String(formData.get("notes") ?? "")) || null;
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/expense-management";

  if (!raceEventId || !costCategoryId) {
    redirectToExpenseWorkflow("error", "Pick a race and cost category before saving a budget rule.", returnPath);
  }

  if (!ruleLabel || approvedAmountUsd <= 0) {
    redirectToExpenseWorkflow("error", "Budget rule label and approved USD amount are required.", returnPath);
  }

  await executeAdmin(
    `insert into race_budget_rules (
       race_event_id,
       cost_category_id,
       rule_kind,
       unit_label,
       rule_label,
       approved_amount_usd,
       close_threshold_ratio,
       notes,
       created_by_user_id,
       updated_by_user_id
     )
     values ($1, $2, $3::race_budget_rule_kind, $4, $5, $6, $7, $8, $9, $9)
     on conflict (race_event_id, cost_category_id, rule_kind)
     do update
     set unit_label = excluded.unit_label,
         rule_label = excluded.rule_label,
         approved_amount_usd = excluded.approved_amount_usd,
         close_threshold_ratio = excluded.close_threshold_ratio,
         notes = excluded.notes,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = now()`,
    [
      raceEventId,
      costCategoryId,
      ruleKind,
      unitLabel,
      ruleLabel,
      approvedAmountUsd,
      closeThresholdPercent / 100,
      notes,
      session.id
    ]
  );

  await cascadeUpdate({
    trigger: "race-budget-rule:created",
    entityType: "race_budget_rule",
    entityId: raceEventId,
    action: "create-or-update",
    after: { raceEventId, costCategoryId, ruleKind, unitLabel, approvedAmountUsd, closeThresholdPercent },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  revalidatePath("/tbr/expense-management");
  revalidatePath(returnPath);
  redirectToExpenseWorkflow("success", "Race budget rule saved.", returnPath);
}

export async function deleteRaceBudgetRuleAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const ruleId = normalizeWhitespace(String(formData.get("ruleId") ?? ""));
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/expense-management";

  if (!ruleId) {
    redirectToExpenseWorkflow("error", "Missing race budget rule id.", returnPath);
  }

  await executeAdmin(`delete from race_budget_rules where id = $1`, [ruleId]);

  await cascadeUpdate({
    trigger: "race-budget-rule:deleted",
    entityType: "race_budget_rule",
    entityId: ruleId,
    action: "delete",
    performedBy: session.id,
    agentId: "expense-agent",
  });

  revalidatePath("/tbr/expense-management");
  revalidatePath(returnPath);
  redirectToExpenseWorkflow("success", "Race budget rule deleted.", returnPath);
}

export async function createReimbursementInvoiceAction(formData: FormData) {
  await requireTbrExpensePortalAccess();
  const session = await requireSession();
  const submissionId = normalizeWhitespace(String(formData.get("submissionId") ?? ""));
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/my-expenses";

  if (!submissionId) {
    redirectToExpenseWorkflow("error", "Missing expense report for invoice generation.", returnPath);
  }

  const rows = await queryRowsAdmin<{
    id: string;
    company_id: string;
    race_event_id: string | null;
    submission_title: string;
    submission_status: string;
    total_amount: string;
    linked_invoice_id: string | null;
  }>(
    `select
       es.id,
       es.company_id,
       es.race_event_id,
       es.submission_title,
       es.submission_status,
       coalesce(sum(coalesce(esi.approved_amount_usd, esi.reporting_amount_usd, esi.amount)) filter (where esi.review_status = 'approved'), 0)::text as total_amount,
       ii.id as linked_invoice_id
     from expense_submissions es
     left join expense_submission_items esi on esi.submission_id = es.id
     left join lateral (
       select id
       from invoice_intakes
       where linked_submission_id = es.id
       order by created_at desc
       limit 1
     ) ii on true
     where es.id = $1
       and es.submitted_by_user_id = $2
     group by es.id, ii.id
     limit 1`,
    [submissionId, session.id]
  );

  const submission = rows[0];

  if (!submission) {
    redirectToExpenseWorkflow("error", "That expense report could not be found.", returnPath);
  }

  if (submission.submission_status !== "approved") {
    redirectToExpenseWorkflow(
      "error",
      "Only invoice-ready expense reports can generate a reimbursement invoice.",
      returnPath
    );
  }

  if (submission.linked_invoice_id) {
    redirectToExpenseWorkflow(
      "info",
      "A reimbursement invoice has already been created for this report.",
      returnPath
    );
  }

  const totalAmount = parseNormalizedNumber(submission.total_amount);
  if (totalAmount <= 0) {
    redirectToExpenseWorkflow(
      "error",
      "This report does not have a usable USD total yet.",
      returnPath
    );
  }

  const invoiceReference = `REIMB-${submission.id.slice(0, 8).toUpperCase()}`;

  const invoiceRows = await queryRowsAdmin<{ id: string }>(
    `insert into invoice_intakes (
       company_id,
       race_event_id,
       submitted_by_user_id,
       linked_submission_id,
       intake_status,
       vendor_name,
       invoice_number,
       currency_code,
       total_amount,
       category_hint,
       operator_note,
       submitted_at
     )
     values ($1, $2, $3, $4, 'submitted', $5, $6, 'USD', $7, 'Reimbursement', $8, now())
     returning id`,
    [
      submission.company_id,
      submission.race_event_id,
      session.id,
      submission.id,
      session.fullName,
      invoiceReference,
      totalAmount,
      `Generated from approved expense report "${submission.submission_title}" for LSC / XTZ Esports Tech Ltd (Dubai).`
    ]
  );
  const invoiceId = invoiceRows[0]?.id;

  await executeAdmin(
    `update expense_submissions
     set accepted_review_at = now(),
         invoice_recipient_label = 'LSC / XTZ Esports Tech Ltd (Dubai)',
         updated_at = now()
     where id = $1`,
    [submission.id]
  );

  await cascadeUpdate({
    trigger: "expense-submission:invoice-created",
    entityType: "expense_submission",
    entityId: submission.id,
    action: "create-reimbursement-invoice",
    after: {
      invoiceId,
      invoiceReference,
      totalAmount,
      recipient: "LSC / XTZ Esports Tech Ltd (Dubai)",
    },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  revalidatePath("/tbr/my-expenses");
  revalidatePath("/tbr/invoice-hub");
  revalidatePath("/payments");
  redirectToExpenseWorkflow(
    "success",
    "Reimbursement invoice created and sent to the finance invoice queue.",
    returnPath
  );
}

async function ensureSubmitterCanEditSplits(input: {
  itemId: string;
  submissionId: string;
  userId: string;
  returnPath: string;
}) {
  const rows = await queryRowsAdmin<{ id: string; submission_status: string }>(
    `select es.id, es.submission_status::text
     from expense_submission_items esi
     join expense_submissions es on es.id = esi.submission_id
     where esi.id = $1
       and es.id = $2
       and es.submitted_by_user_id = $3
     limit 1`,
    [input.itemId, input.submissionId, input.userId]
  );
  const row = rows[0];
  if (!row) {
    redirectToExpenseWorkflow("error", "Only the submitter can edit split allocations.", input.returnPath);
  }
  if (!["submitted", "needs_clarification"].includes(row.submission_status)) {
    redirectToExpenseWorkflow(
      "error",
      "Splits can only be edited before finance review or after finance asks for clarification.",
      input.returnPath
    );
  }
}

export async function generateEqualSplitsAction(formData: FormData) {
  const session = await requireTbrExpensePortalAccess();
  const itemId = normalizeWhitespace(String(formData.get("itemId") ?? ""));
  const submissionId = normalizeWhitespace(String(formData.get("submissionId") ?? ""));
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) ||
    `/tbr/expense-management/${submissionId}`;

  if (!itemId || !submissionId) {
    redirectToExpenseWorkflow("error", "Missing item context for split generation.", returnPath);
  }

  await ensureSubmitterCanEditSplits({ itemId, submissionId, userId: session.id, returnPath });

  const itemRows = await queryRowsAdmin<{ amount: string; split_count: string }>(
    `select amount::text, split_count::text
     from expense_submission_items
     where id = $1
     limit 1`,
    [itemId]
  );

  const item = itemRows[0];

  if (!item) {
    redirectToExpenseWorkflow("error", "Expense item was not found.", returnPath);
  }

  const amount = Number(item.amount);
  const splitCount = Math.max(1, Number(item.split_count));
  const splitAmount = Number((amount / splitCount).toFixed(2));
  const splitPercentage = Number((100 / splitCount).toFixed(4));

  await executeAdmin(`delete from expense_item_splits where expense_submission_item_id = $1`, [itemId]);

  for (let index = 0; index < splitCount; index += 1) {
    await executeAdmin(
      `insert into expense_item_splits (
         expense_submission_item_id,
         split_label,
         split_percentage,
         split_amount
       )
       values ($1, $2, $3, $4)`,
      [itemId, `Participant ${index + 1}`, splitPercentage, splitAmount]
    );
  }

  await cascadeUpdate({
    trigger: "expense-submission:approved",
    entityType: "expense_item_split",
    entityId: itemId,
    action: "regenerate-equal-splits",
    after: { submissionId, itemId, splitCount, splitAmount, splitPercentage },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  revalidatePath(`/tbr/expense-management/${submissionId}`);
  redirectToExpenseWorkflow("success", "Equal split allocations regenerated.", returnPath);
}

export async function addExpenseSplitAction(formData: FormData) {
  const session = await requireTbrExpensePortalAccess();
  const itemId = normalizeWhitespace(String(formData.get("itemId") ?? ""));
  const submissionId = normalizeWhitespace(String(formData.get("submissionId") ?? ""));
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) ||
    `/tbr/expense-management/${submissionId}`;
  const participantId = normalizeWhitespace(String(formData.get("participantId") ?? "")) || null;
  const splitLabel = normalizeWhitespace(String(formData.get("splitLabel") ?? "")) || null;
  const splitPercentage = parseAmount(String(formData.get("splitPercentage") ?? "0"));
  const splitAmount = parseAmount(String(formData.get("splitAmount") ?? "0"));

  if (!itemId || !submissionId || splitAmount <= 0) {
    redirectToExpenseWorkflow("error", "Split amount and item context are required.", returnPath);
  }

  await ensureSubmitterCanEditSplits({ itemId, submissionId, userId: session.id, returnPath });

  await executeAdmin(
    `insert into expense_item_splits (
       expense_submission_item_id,
       app_user_id,
       split_label,
       split_percentage,
       split_amount
     )
     values ($1, $2, $3, $4, $5)`,
    [itemId, participantId, splitLabel, splitPercentage, splitAmount]
  );

  await cascadeUpdate({
    trigger: "expense-submission:approved",
    entityType: "expense_item_split",
    entityId: itemId,
    action: "add-split",
    after: { submissionId, itemId, participantId, splitLabel, splitPercentage, splitAmount },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  revalidatePath(`/tbr/expense-management/${submissionId}`);
  redirectToExpenseWorkflow("success", "Split allocation added.", returnPath);
}
