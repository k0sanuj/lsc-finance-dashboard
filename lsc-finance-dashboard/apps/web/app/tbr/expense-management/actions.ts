"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { callLlm } from "@lsc/skills/shared/llm";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { notifyExpenseEvent } from "@lsc/skills/expenses/notify";
import { postExpenseJournal } from "@lsc/skills/quickbooks/post-expense-journal";
import { requireRole, requireSession } from "../../../lib/auth";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
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
  redirect(
    `${returnPath}?status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}` as Route
  );
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
  await requireRole(["super_admin", "finance_admin", "team_member"]);
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
  const amount = parseAmount(String(formData.get("amount") ?? "0"));
  const expenseDate = normalizeWhitespace(String(formData.get("expenseDate") ?? "")) || null;

  if (!title || amount <= 0) {
    redirectToExpenseWorkflow("error", "Title and a positive amount are required.");
  }

  const companyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = 'TBR'::company_code limit 1`
  );
  const companyId = companyRows[0]?.id;

  if (!companyId) {
    redirectToExpenseWorkflow("error", "TBR company record was not found.");
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
    redirectToExpenseWorkflow("error", "Submission could not be created.");
  }

  const itemRows = await queryRowsAdmin<{ id: string }>(
    `insert into expense_submission_items (
       submission_id,
       cost_category_id,
       team_id,
       merchant_name,
       expense_date,
       amount,
       description,
       split_method,
       split_count
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::expense_split_method, $9)
     returning id`,
    [
      submissionId,
      costCategoryId || null,
      teamId || null,
      merchantName,
      expenseDate || null,
      amount,
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
        [itemId, session.id, session.fullName, amount]
      );
    }

    if (splitMethod === "equal") {
      const effectiveCount = Math.max(1, splitCount);
      const splitAmount = Number((amount / effectiveCount).toFixed(2));
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

  if (submissionId) {
    await cascadeUpdate({
      trigger: "expense-submission:approved",
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
  redirectToExpenseWorkflow("success", "Expense submission created.");
}

export async function createExpenseReportFromBillsAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin", "team_member"]);
  const session = await requireSession();

  const submissionTitle = normalizeWhitespace(String(formData.get("submissionTitle") ?? ""));
  const operatorNote = normalizeWhitespace(String(formData.get("operatorNote") ?? "")) || null;
  const raceEventId = normalizeWhitespace(String(formData.get("raceEventId") ?? "")) || null;
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/tbr/my-expenses";
  const intakeEventIds = normalizeWhitespace(String(formData.get("intakeEventIds") ?? ""))
    .split(",")
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);

  if (!submissionTitle || !raceEventId || intakeEventIds.length === 0) {
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

  const selectedRows = await queryRowsAdmin<{
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
    [intakeEventIds, session.id, raceEventId]
  );

  if (selectedRows.length === 0) {
    redirectToExpenseWorkflow("error", "The selected bills could not be loaded.", returnPath);
  }

  const duplicateRows = await queryRowsAdmin<{ source_document_id: string }>(
    `select distinct esi.source_document_id
     from expense_submission_items esi
     where esi.source_document_id = any($1::uuid[])`,
    [selectedRows.map((row) => row.source_document_id)]
  );

  if (duplicateRows.length > 0) {
    redirectToExpenseWorkflow(
      "error",
      "One or more selected bills are already attached to an expense report.",
      returnPath
    );
  }

  const validRows = selectedRows.filter((row) => {
    const summary = row.extracted_summary ?? {};
    const usdAmount =
      parseNormalizedNumber(summary.usdAmount) ||
      (String(summary.originalCurrency ?? summary.currencyCode ?? "").toUpperCase() === "USD"
        ? parseNormalizedNumber(summary.originalAmount)
        : 0);

    return usdAmount > 0;
  });

  if (validRows.length === 0) {
    redirectToExpenseWorkflow(
      "error",
      "The selected bills do not have usable USD amounts yet.",
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
    const summary = row.extracted_summary ?? {};
    const usdAmount =
      parseNormalizedNumber(summary.usdAmount) ||
      (String(summary.originalCurrency ?? summary.currencyCode ?? "").toUpperCase() === "USD"
        ? parseNormalizedNumber(summary.originalAmount)
        : 0);

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

    const itemRows = await queryRowsAdmin<{ id: string }>(
      `insert into expense_submission_items (
         submission_id,
         source_document_id,
         merchant_name,
         expense_date,
         currency_code,
         amount,
         description,
         split_method,
         split_count,
         ai_summary
       )
       values ($1, $2, $3, $4, 'USD', $5, $6, 'solo', 1, $7::jsonb)
       returning id`,
      [
        submissionId,
        row.source_document_id,
        merchantName,
        expenseDate,
        usdAmount,
        description,
        JSON.stringify({
          analysisRunId: row.analysis_run_id,
          intakeEventId: row.intake_event_id,
          originalAmount: summary.originalAmount ?? null,
          originalCurrency: summary.originalCurrency ?? summary.currencyCode ?? null,
          usdAmount,
          expenseDate,
          sourceFileName: row.source_file_name ?? null
        })
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
        [itemId, session.id, session.fullName, usdAmount]
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
     left join race_budget_rules rbr
       on rbr.race_event_id = (
         select race_event_id from expense_submissions where id = $1
       )
       and rbr.cost_category = esi.category
       and rbr.rule_status = 'approved'
     where esi.expense_submission_id = $1
       and rbr.approved_amount_usd is not null
       and esi.amount > rbr.approved_amount_usd`,
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
  await requireRole(["super_admin", "finance_admin", "team_member"]);
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
       coalesce(sum(esi.amount), 0)::text as total_amount,
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

  await executeAdmin(
    `insert into invoice_intakes (
       company_id,
       race_event_id,
       submitted_by_user_id,
       linked_submission_id,
       intake_status,
       vendor_name,
       invoice_number,
       total_amount,
       category_hint,
       operator_note,
       submitted_at
     )
     values ($1, $2, $3, $4, 'submitted', $5, $6, $7, 'Reimbursement', $8, now())`,
    [
      submission.company_id,
      submission.race_event_id,
      session.id,
      submission.id,
      session.fullName,
      invoiceReference,
      totalAmount,
      `Generated from approved expense report "${submission.submission_title}".`
    ]
  );

  revalidatePath("/tbr/my-expenses");
  revalidatePath("/tbr/invoice-hub");
  revalidatePath("/payments");
  redirectToExpenseWorkflow(
    "success",
    "Reimbursement invoice created and sent to the finance invoice queue.",
    returnPath
  );
}

export async function generateEqualSplitsAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin", "team_member"]);
  const session = await requireSession();
  const itemId = normalizeWhitespace(String(formData.get("itemId") ?? ""));
  const submissionId = normalizeWhitespace(String(formData.get("submissionId") ?? ""));
  const returnPath =
    normalizeWhitespace(String(formData.get("returnPath") ?? "")) ||
    `/tbr/expense-management/${submissionId}`;

  if (!itemId || !submissionId) {
    redirectToExpenseWorkflow("error", "Missing item context for split generation.", returnPath);
  }

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
  await requireRole(["super_admin", "finance_admin", "team_member"]);
  const session = await requireSession();
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
