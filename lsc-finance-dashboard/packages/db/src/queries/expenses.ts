import "server-only";

import { resolveDocumentPreview } from "../document-storage";
import { queryRows } from "../query";
import {
  formatBudgetSignalLabel,
  formatBudgetSignalTone,
  formatBudgetUnitLabel,
  formatCurrency,
  formatDateLabel,
  formatDateValue,
  formatDecimalAmount,
  formatExpenseSubmissionStatusLabel,
  getBackend,
  getBudgetSignalFromRank,
  getSeasonLabel
} from "./shared";

export type ExpenseWorkflowSummaryRow = {
  label: string;
  value: string;
  detail: string;
};

export type ExpenseQueueRow = {
  id: string;
  title: string;
  seasonLabel: string;
  race: string;
  submitter: string;
  submittedAt: string;
  totalAmount: string;
  submittedAmountUsd: string;
  approvedAmountUsd: string;
  rejectedAmountUsd: string;
  status: string;
  statusLabel: string;
  itemCount: string;
  approvedItemCount: string;
  rejectedItemCount: string;
  openItemCount: string;
  challengedItemCount: string;
  missingReceiptCount: string;
  openRuleFindingCount: string;
  budgetSignal: string;
  budgetSignalLabel: string;
  budgetSignalTone: string;
  matchedBudgetCount: string;
};

export type RaceBudgetRuleRow = {
  id: string;
  category: string;
  ruleKind: string;
  unitLabel: string;
  ruleLabel: string;
  approvedAmountUsd: string;
  closeThreshold: string;
  notes: string;
};

export type ExpenseFormOption = {
  id: string;
  label: string;
};

export type ExpenseTagRow = {
  id: string;
  key: string;
  label: string;
  description: string;
};

export type ExpenseWorkspaceRuleRow = {
  id: string;
  key: string;
  label: string;
  severity: string;
  isActive: boolean;
};

export type ExpenseSubmissionDetail = {
  id: string;
  title: string;
  statusKey: string;
  status: string;
  submittedByUserId: string;
  raceEventId: string | null;
  race: string;
  submitter: string;
  submittedAt: string;
  operatorNote: string;
  reviewNote: string;
  totalAmount: string;
  submittedAmountUsd: string;
  approvedAmountUsd: string;
  rejectedAmountUsd: string;
  openItemCount: string;
  challengedItemCount: string;
  budgetSignal: string;
  budgetSignalLabel: string;
  budgetSignalTone: string;
  matchedBudgetCount: string;
};

export type ExpenseSubmissionItemDetail = {
  id: string;
  merchantName: string;
  expenseDate: string;
  amount: string;
  currencyCode: string;
  originalAmount: string;
  originalCurrencyCode: string;
  reportingAmountUsd: string;
  approvedAmountUsd: string;
  fxRateToUsd: string | null;
  fxSource: string | null;
  reviewStatusKey: string;
  reviewStatus: string;
  rejectionReasonCode: string | null;
  rejectionReasonDetail: string | null;
  challengeStatus: string;
  challengeReason: string | null;
  receiptStatus: string;
  noReceiptReason: string | null;
  tagLabels: string;
  ruleMessages: string;
  openRuleFindingCount: string;
  category: string;
  team: string;
  description: string;
  splitMethod: string;
  splitCount: string;
  linkedExpenseId: string | null;
  sourceDocumentName: string;
  sourcePreviewDataUrl: string | null;
  sourcePreviewMimeType: string | null;
  aiIntakeDraftId: string | null;
  aiTargetKind: string | null;
  aiCategory: string | null;
  paidBy: string | null;
  budgetStatusKey: string;
  budgetStatusLabel: string;
  budgetStatusTone: string;
  budgetRuleKind: string | null;
  budgetUnitLabel: string | null;
  budgetRuleLabel: string | null;
  budgetApprovedAmount: string | null;
  budgetVariance: string | null;
  budgetNotes: string | null;
  splits: ExpenseSplitDetail[];
};

export type ExpenseSplitDetail = {
  id: string;
  participant: string;
  percentage: string;
  amount: string;
};

export type MyExpenseSubmissionRow = {
  id: string;
  title: string;
  race: string;
  seasonLabel: string;
  submittedAt: string;
  statusKey: string;
  status: string;
  totalAmount: string;
  submittedAmountUsd: string;
  approvedAmountUsd: string;
  rejectedAmountUsd: string;
  openItemCount: string;
  challengedItemCount: string;
  itemCount: string;
  linkedInvoiceId: string | null;
  linkedInvoiceStatus: string | null;
  linkedInvoiceNumber: string | null;
  canGenerateInvoice: boolean;
};

export type ExpenseWorkflowSummarySource = {
  pending_count: string;
  draft_count: string;
  posted_count: string;
  total_pending_amount: string;
};

export type ExpenseQueueSource = {
  id: string;
  submission_title: string;
  race_name: string | null;
  season_year: number | null;
  submitter_name: string;
  submitted_at: string | null;
  total_amount: string;
  submitted_amount_usd: string;
  approved_amount_usd: string;
  rejected_amount_usd: string;
  submission_status: string;
  item_count: string;
  approved_item_count: string;
  rejected_item_count: string;
  open_item_count: string;
  challenged_item_count: string;
  missing_receipt_count: string;
  open_rule_finding_count: string;
  budget_signal_rank: number;
  matched_budget_count: string;
};

export type ExpenseFormOptionSource = {
  id: string;
  label: string;
};

export type ExpenseTagSource = {
  id: string;
  tag_key: string;
  tag_label: string;
  tag_description: string | null;
};

export type ExpenseWorkspaceRuleSource = {
  id: string;
  rule_key: string;
  rule_label: string;
  severity: string;
  is_active: boolean;
};

export type ExpenseSubmissionDetailSource = {
  id: string;
  submission_title: string;
  submission_status: string;
  race_event_id: string | null;
  race_name: string | null;
  submitted_by_user_id: string;
  submitter_name: string;
  submitted_at: string | null;
  operator_note: string | null;
  review_note: string | null;
  total_amount: string;
  submitted_amount_usd: string;
  approved_amount_usd: string;
  rejected_amount_usd: string;
  open_item_count: string;
  challenged_item_count: string;
  budget_signal_rank: number;
  matched_budget_count: string;
};

export type ExpenseSubmissionItemSource = {
  id: string;
  merchant_name: string | null;
  expense_date: string | null;
  currency_code: string;
  amount: string;
  original_currency_code: string | null;
  original_amount: string | null;
  fx_rate_to_usd: string | null;
  fx_source: string | null;
  reporting_amount_usd: string | null;
  approved_amount_usd: string | null;
  review_status: string;
  rejection_reason_code: string | null;
  rejection_reason_detail: string | null;
  challenge_status: string;
  challenge_reason: string | null;
  receipt_status: string;
  no_receipt_reason: string | null;
  tag_labels: string | null;
  rule_messages: string | null;
  open_rule_finding_count: string | null;
  category_name: string | null;
  team_name: string | null;
  description: string | null;
  split_method: string;
  split_count: string;
  linked_expense_id: string | null;
  source_document_name: string | null;
  source_document_metadata: Record<string, unknown> | null;
  ai_summary: Record<string, unknown> | null;
  budget_signal: string;
  rule_kind: string | null;
  unit_label: string | null;
  rule_label: string | null;
  budget_approved_amount_usd: string | null;
  close_threshold_ratio: string | null;
  rule_notes: string | null;
};

export type RaceBudgetRuleSource = {
  id: string;
  category_name: string;
  rule_kind: string;
  unit_label: string;
  rule_label: string;
  approved_amount_usd: string;
  close_threshold_ratio: string;
  notes: string | null;
};

export type ExpenseSplitSource = {
  id: string;
  participant_name: string | null;
  split_label: string | null;
  split_percentage: string;
  split_amount: string;
};

export type MyExpenseSubmissionSource = {
  id: string;
  submission_title: string;
  race_name: string | null;
  season_year: number | null;
  submitted_at: string | null;
  submission_status: string;
  total_amount: string;
  submitted_amount_usd: string;
  approved_amount_usd: string;
  rejected_amount_usd: string;
  open_item_count: string;
  challenged_item_count: string;
  item_count: string;
  linked_invoice_id: string | null;
  linked_invoice_status: string | null;
  linked_invoice_number: string | null;
};

export type ExpenseSubmissionExportRow = {
  submissionTitle: string;
  race: string;
  submitter: string;
  itemId: string;
  merchant: string;
  expenseDate: string;
  category: string;
  tags: string;
  originalCurrency: string;
  originalAmount: string;
  fxRateToUsd: string;
  usdAmount: string;
  approvedUsd: string;
  reviewStatus: string;
  receiptStatus: string;
  rejectionReason: string;
  challengeReason: string;
  ruleMessages: string;
  sourceDocument: string;
  description: string;
};

export async function getExpenseWorkflowSummary() {
  if (getBackend() === "database") {
    const rows = await queryRows<ExpenseWorkflowSummarySource>(
      `select
         count(*) filter (where submission_status in ('submitted', 'in_review'))::text as pending_count,
         count(*) filter (where submission_status = 'needs_clarification')::text as draft_count,
         count(*) filter (where submission_status = 'posted')::text as posted_count,
         coalesce(sum(coalesce(item.approved_amount_usd, item.reporting_amount_usd, item.amount)) filter (where es.submission_status = 'approved' and item.review_status = 'approved'), 0)::text as total_pending_amount
       from expense_submissions es
       left join expense_submission_items item on item.submission_id = es.id`
    );

    if (rows[0]) {
      return [
        {
          label: "Awaiting review",
          value: rows[0].pending_count,
          detail: "Submissions waiting on finance admin review."
        },
        {
          label: "Needs clarification",
          value: rows[0].draft_count,
          detail: "Reports sent back to users before approval."
        },
        {
          label: "Invoice ready",
          value: formatCurrency(rows[0].total_pending_amount),
          detail: "Approved report amount now ready for user invoice generation."
        },
        {
          label: "Posted",
          value: rows[0].posted_count,
          detail: "Reports already posted into canonical expenses."
        }
      ] satisfies ExpenseWorkflowSummaryRow[];
    }
  }

  return [
    {
      label: "Awaiting review",
      value: "0",
      detail: "Submissions waiting on finance admin review."
    },
    {
      label: "Needs clarification",
      value: "0",
      detail: "Reports sent back to users before approval."
    },
    {
      label: "Invoice ready",
      value: formatCurrency(0),
      detail: "Approved report amount now ready for user invoice generation."
    },
    {
      label: "Posted",
      value: "0",
      detail: "Reports already posted into canonical expenses."
    }
  ];
}

export async function getExpenseApprovalQueue(filters?: {
  seasonYear?: number | null;
  raceEventId?: string | null;
  submitterId?: string | null;
  submissionStatus?: string | null;
  budgetSignal?: string | null;
}) {
  if (getBackend() === "database") {
    const rows = await queryRows<ExpenseQueueSource>(
      `with approval_queue as (
       select
         es.id,
         es.submission_title,
         re.name as race_name,
         re.season_year,
         au.full_name as submitter_name,
         es.submitted_at::text,
         es.created_at,
         coalesce(sum(coalesce(esi.reporting_amount_usd, esi.amount)), 0)::text as total_amount,
         coalesce(sum(coalesce(esi.reporting_amount_usd, esi.amount)), 0)::text as submitted_amount_usd,
         coalesce(sum(coalesce(esi.approved_amount_usd, esi.reporting_amount_usd, esi.amount)) filter (where esi.review_status = 'approved'), 0)::text as approved_amount_usd,
         coalesce(sum(coalesce(esi.reporting_amount_usd, esi.amount)) filter (where esi.review_status = 'rejected'), 0)::text as rejected_amount_usd,
         es.submission_status,
         count(esi.id)::text as item_count,
         count(esi.id) filter (where esi.review_status = 'approved')::text as approved_item_count,
         count(esi.id) filter (where esi.review_status = 'rejected')::text as rejected_item_count,
         count(esi.id) filter (where esi.review_status in ('pending', 'review', 'needs_info'))::text as open_item_count,
         count(esi.id) filter (where esi.challenge_status = 'challenged')::text as challenged_item_count,
         count(esi.id) filter (where coalesce(esi.receipt_status, 'unknown') <> 'attached')::text as missing_receipt_count,
         coalesce(sum(open_findings.open_count), 0)::text as open_rule_finding_count,
         coalesce(max(case
           when rbr.id is null then 0
           when coalesce(esi.reporting_amount_usd, esi.amount) > rbr.approved_amount_usd then 3
           when coalesce(esi.reporting_amount_usd, esi.amount) >= (rbr.approved_amount_usd * rbr.close_threshold_ratio) then 2
           else 1
         end), 0)::int as budget_signal_rank,
         count(rbr.id)::text as matched_budget_count
         from expense_submissions es
         join app_users au on au.id = es.submitted_by_user_id
         left join race_events re on re.id = es.race_event_id
         left join expense_submission_items esi on esi.submission_id = es.id
         left join race_budget_rules rbr
           on rbr.race_event_id = es.race_event_id
         and rbr.cost_category_id = esi.cost_category_id
         left join lateral (
           select count(*)::int as open_count
           from expense_item_rule_findings erf
           where erf.expense_submission_item_id = esi.id
             and erf.finding_status = 'open'
         ) open_findings on true
         where ($1::int is null or re.season_year = $1)
           and ($2::uuid is null or es.race_event_id = $2::uuid)
           and ($3::uuid is null or es.submitted_by_user_id = $3::uuid)
           and ($4::text is null or es.submission_status::text = $4)
         group by es.id, re.name, re.season_year, au.full_name
       )
       select
         id,
         submission_title,
         race_name,
         season_year,
         submitter_name,
         submitted_at,
         total_amount,
         submitted_amount_usd,
         approved_amount_usd,
         rejected_amount_usd,
         submission_status,
         item_count,
         approved_item_count,
         rejected_item_count,
         open_item_count,
         challenged_item_count,
         missing_receipt_count,
         open_rule_finding_count,
         budget_signal_rank,
         matched_budget_count
       from approval_queue
       where ($5::text is null
          or ($5::text = 'exception' and budget_signal_rank in (0, 2, 3))
          or ($5::text = 'above_budget' and budget_signal_rank = 3)
          or ($5::text = 'close_to_budget' and budget_signal_rank = 2)
          or ($5::text = 'below_budget' and budget_signal_rank = 1)
          or ($5::text = 'no_rule' and budget_signal_rank = 0))
       order by budget_signal_rank desc, created_at desc
       limit 24`,
      [
        filters?.seasonYear ?? null,
        filters?.raceEventId ?? null,
        filters?.submitterId ?? null,
        filters?.submissionStatus ?? null,
        filters?.budgetSignal ?? null
      ]
    );

    const seasonYears = Array.from(
      new Set(rows.map((row) => row.season_year).filter((value): value is number => value !== null))
    ).sort((a, b) => a - b);

    return rows.map((row) => {
      const budgetSignal = getBudgetSignalFromRank(row.budget_signal_rank);
      return {
        id: row.id,
        title: row.submission_title,
        seasonLabel:
          row.season_year !== null ? getSeasonLabel(row.season_year, seasonYears) : "Race not assigned",
        race: row.race_name ?? "Unassigned",
        submitter: row.submitter_name,
        submittedAt: row.submitted_at ? formatDateLabel(row.submitted_at) : "Draft",
        totalAmount: formatCurrency(row.total_amount),
        submittedAmountUsd: formatCurrency(row.submitted_amount_usd),
        approvedAmountUsd: formatCurrency(row.approved_amount_usd),
        rejectedAmountUsd: formatCurrency(row.rejected_amount_usd),
        status: row.submission_status,
        statusLabel: formatExpenseSubmissionStatusLabel(row.submission_status),
        itemCount: row.item_count,
        approvedItemCount: row.approved_item_count,
        rejectedItemCount: row.rejected_item_count,
        openItemCount: row.open_item_count,
        challengedItemCount: row.challenged_item_count,
        missingReceiptCount: row.missing_receipt_count,
        openRuleFindingCount: row.open_rule_finding_count,
        budgetSignal,
        budgetSignalLabel: formatBudgetSignalLabel(budgetSignal),
        budgetSignalTone: formatBudgetSignalTone(budgetSignal),
        matchedBudgetCount: row.matched_budget_count
      };
    }) satisfies ExpenseQueueRow[];
  }

  return [] satisfies ExpenseQueueRow[];
}

export async function getExpenseSubmissionDetail(submissionId: string) {
  if (getBackend() !== "database") {
    return null;
  }

  const rows = await queryRows<ExpenseSubmissionDetailSource>(
    `select
       es.id,
       es.submission_title,
       es.submission_status,
       es.race_event_id::text,
       re.name as race_name,
       es.submitted_by_user_id::text,
       au.full_name as submitter_name,
       es.submitted_at::text,
       es.operator_note,
       es.review_note,
       coalesce(sum(coalesce(esi.reporting_amount_usd, esi.amount)), 0)::text as total_amount,
       coalesce(sum(coalesce(esi.reporting_amount_usd, esi.amount)), 0)::text as submitted_amount_usd,
       coalesce(sum(coalesce(esi.approved_amount_usd, esi.reporting_amount_usd, esi.amount)) filter (where esi.review_status = 'approved'), 0)::text as approved_amount_usd,
       coalesce(sum(coalesce(esi.reporting_amount_usd, esi.amount)) filter (where esi.review_status = 'rejected'), 0)::text as rejected_amount_usd,
       count(esi.id) filter (where esi.review_status in ('pending', 'review', 'needs_info'))::text as open_item_count,
       count(esi.id) filter (where esi.challenge_status = 'challenged')::text as challenged_item_count,
       coalesce(max(case
         when rbr.id is null then 0
         when coalesce(esi.reporting_amount_usd, esi.amount) > rbr.approved_amount_usd then 3
         when coalesce(esi.reporting_amount_usd, esi.amount) >= (rbr.approved_amount_usd * rbr.close_threshold_ratio) then 2
         else 1
       end), 0)::int as budget_signal_rank,
       count(rbr.id)::text as matched_budget_count
     from expense_submissions es
     join app_users au on au.id = es.submitted_by_user_id
     left join race_events re on re.id = es.race_event_id
     left join expense_submission_items esi on esi.submission_id = es.id
     left join race_budget_rules rbr
       on rbr.race_event_id = es.race_event_id
      and rbr.cost_category_id = esi.cost_category_id
     where es.id = $1
     group by es.id, es.race_event_id, re.name, au.full_name`,
    [submissionId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  const budgetSignal = getBudgetSignalFromRank(row.budget_signal_rank);
  return {
    id: row.id,
    title: row.submission_title,
    statusKey: row.submission_status,
    status: formatExpenseSubmissionStatusLabel(row.submission_status),
    submittedByUserId: row.submitted_by_user_id,
    raceEventId: row.race_event_id,
    race: row.race_name ?? "Unassigned",
    submitter: row.submitter_name,
    submittedAt: row.submitted_at ? formatDateLabel(row.submitted_at) : "Draft",
    operatorNote: row.operator_note ?? "No operator note.",
    reviewNote: row.review_note ?? "No finance review note yet.",
    totalAmount: formatCurrency(row.total_amount),
    submittedAmountUsd: formatCurrency(row.submitted_amount_usd),
    approvedAmountUsd: formatCurrency(row.approved_amount_usd),
    rejectedAmountUsd: formatCurrency(row.rejected_amount_usd),
    openItemCount: row.open_item_count,
    challengedItemCount: row.challenged_item_count,
    budgetSignal,
    budgetSignalLabel: formatBudgetSignalLabel(budgetSignal),
    budgetSignalTone: formatBudgetSignalTone(budgetSignal),
    matchedBudgetCount: row.matched_budget_count
  } satisfies ExpenseSubmissionDetail;
}

export async function getExpenseSubmissionItems(submissionId: string) {
  if (getBackend() !== "database") {
    return [] satisfies ExpenseSubmissionItemDetail[];
  }

  const itemRows = await queryRows<ExpenseSubmissionItemSource>(
    `select
       esi.id,
       esi.merchant_name,
       esi.expense_date::text,
       esi.currency_code,
       esi.amount::text,
       esi.original_currency_code,
       esi.original_amount::text,
       esi.fx_rate_to_usd::text,
       esi.fx_source,
       esi.reporting_amount_usd::text,
       esi.approved_amount_usd::text,
       esi.review_status::text,
       esi.rejection_reason_code,
       esi.rejection_reason_detail,
       esi.challenge_status,
       esi.challenge_reason,
       esi.receipt_status,
       esi.no_receipt_reason,
       cc.name as category_name,
       t.team_name,
       esi.description,
       esi.split_method::text,
       esi.split_count::text,
       esi.linked_expense_id::text,
       sd.source_name as source_document_name,
       sd.metadata as source_document_metadata,
       esi.ai_summary,
       case
         when rbr.id is null then 'no_rule'
         when coalesce(esi.reporting_amount_usd, esi.amount) > rbr.approved_amount_usd then 'above_budget'
         when coalesce(esi.reporting_amount_usd, esi.amount) >= (rbr.approved_amount_usd * rbr.close_threshold_ratio) then 'close_to_budget'
         else 'below_budget'
       end as budget_signal,
       rbr.rule_kind::text,
       rbr.unit_label,
       rbr.rule_label,
       rbr.approved_amount_usd::text as budget_approved_amount_usd,
       rbr.close_threshold_ratio::text,
       rbr.notes as rule_notes,
       coalesce(tags.tag_labels, '') as tag_labels,
       coalesce(findings.open_rule_finding_count, 0)::text as open_rule_finding_count,
       coalesce(findings.rule_messages, '') as rule_messages
     from expense_submission_items esi
     join expense_submissions es on es.id = esi.submission_id
     left join cost_categories cc on cc.id = esi.cost_category_id
     left join app_teams t on t.id = esi.team_id
     left join source_documents sd on sd.id = esi.source_document_id
     left join race_budget_rules rbr
       on rbr.race_event_id = es.race_event_id
      and rbr.cost_category_id = esi.cost_category_id
     left join lateral (
       select string_agg(et.tag_label, ', ' order by et.tag_label) as tag_labels
       from expense_submission_item_tags esit
       join expense_tags et on et.id = esit.expense_tag_id
       where esit.expense_submission_item_id = esi.id
     ) tags on true
     left join lateral (
       select
         count(*) filter (where erf.finding_status = 'open')::int as open_rule_finding_count,
         string_agg(erf.message, ' | ' order by erf.created_at) filter (where erf.finding_status = 'open') as rule_messages
       from expense_item_rule_findings erf
       where erf.expense_submission_item_id = esi.id
     ) findings on true
     where esi.submission_id = $1
     order by esi.created_at`,
    [submissionId]
  );

  const splitsByItem = new Map<string, ExpenseSplitDetail[]>();
  const rawSplitRows = await queryRows<
    ExpenseSplitSource & { expense_submission_item_id: string }
  >(
    `select
       eis.id,
       eis.expense_submission_item_id,
       au.full_name as participant_name,
       eis.split_label,
       eis.split_percentage::text,
       eis.split_amount::text
     from expense_item_splits eis
     left join app_users au on au.id = eis.app_user_id
     where eis.expense_submission_item_id in (
       select id from expense_submission_items where submission_id = $1
     )
     order by eis.created_at`,
    [submissionId]
  );

  for (const split of rawSplitRows) {
    const existing = splitsByItem.get(split.expense_submission_item_id) ?? [];
    existing.push({
      id: split.id,
      participant: split.participant_name ?? split.split_label ?? "Unassigned participant",
      percentage: `${Number(split.split_percentage).toFixed(2)}%`,
      amount: formatCurrency(split.split_amount)
    });
    splitsByItem.set(split.expense_submission_item_id, existing);
  }

  return Promise.all(itemRows.map(async (row) => {
    const reportingAmount = row.reporting_amount_usd ?? row.amount;
    const approvedAmount = row.approved_amount_usd ?? reportingAmount;
    const variance =
      row.approved_amount_usd !== null ? Number(reportingAmount) - Number(row.approved_amount_usd) : null;
    const preview = await resolveDocumentPreview(row.source_document_metadata);
    const aiSummary = row.ai_summary ?? {};
    const aiIntakeDraftId = typeof aiSummary.aiIntakeDraftId === "string" ? aiSummary.aiIntakeDraftId : null;
    const aiTargetKind = typeof aiSummary.targetKind === "string" ? aiSummary.targetKind : null;
    const aiCategory = typeof aiSummary.category === "string" ? aiSummary.category : null;
    const paidBy = typeof aiSummary.paidBy === "string" ? aiSummary.paidBy : null;

    return {
      id: row.id,
      merchantName: row.merchant_name ?? "Unknown merchant",
      expenseDate: row.expense_date ? formatDateLabel(row.expense_date) : "No date",
      amount: formatCurrency(row.amount),
      currencyCode: row.currency_code,
      originalAmount: formatDecimalAmount(row.original_amount ?? row.amount, row.original_currency_code ?? row.currency_code),
      originalCurrencyCode: row.original_currency_code ?? row.currency_code,
      reportingAmountUsd: formatCurrency(reportingAmount),
      approvedAmountUsd: formatCurrency(approvedAmount),
      fxRateToUsd: row.fx_rate_to_usd,
      fxSource: row.fx_source,
      reviewStatusKey: row.review_status,
      reviewStatus: row.review_status.replace(/_/g, " "),
      rejectionReasonCode: row.rejection_reason_code,
      rejectionReasonDetail: row.rejection_reason_detail,
      challengeStatus: row.challenge_status,
      challengeReason: row.challenge_reason,
      receiptStatus: row.receipt_status.replace(/_/g, " "),
      noReceiptReason: row.no_receipt_reason,
      tagLabels: row.tag_labels ?? "",
      ruleMessages: row.rule_messages ?? "",
      openRuleFindingCount: row.open_rule_finding_count ?? "0",
      category: row.category_name ?? "Uncategorized",
      team: row.team_name ?? "No team",
      description: row.description ?? "No description",
      splitMethod: row.split_method,
      splitCount: row.split_count,
      linkedExpenseId: row.linked_expense_id,
      sourceDocumentName: row.source_document_name ?? "No source document linked",
      sourcePreviewDataUrl: preview.previewDataUrl,
      sourcePreviewMimeType: preview.previewMimeType,
      aiIntakeDraftId,
      aiTargetKind,
      aiCategory,
      paidBy,
      budgetStatusKey: row.budget_signal,
      budgetStatusLabel: formatBudgetSignalLabel(row.budget_signal),
      budgetStatusTone: formatBudgetSignalTone(row.budget_signal),
      budgetRuleKind: row.rule_kind ? row.rule_kind.replace(/_/g, " ") : null,
      budgetUnitLabel: row.unit_label ? formatBudgetUnitLabel(row.unit_label) : null,
      budgetRuleLabel: row.rule_label,
      budgetApprovedAmount: row.budget_approved_amount_usd ? formatCurrency(row.budget_approved_amount_usd) : null,
      budgetVariance:
        variance !== null ? `${variance >= 0 ? "+" : "-"}${formatCurrency(Math.abs(variance))}` : null,
      budgetNotes: row.rule_notes ?? null,
      splits: splitsByItem.get(row.id) ?? []
    };
  })) satisfies Promise<ExpenseSubmissionItemDetail[]>;
}

export async function getMyExpenseSubmissions(appUserId: string, raceId?: string) {
  if (getBackend() !== "database") {
    return [] satisfies MyExpenseSubmissionRow[];
  }

  const rows = await queryRows<MyExpenseSubmissionSource>(
    `select
       es.id,
       es.submission_title,
       re.name as race_name,
       re.season_year,
       es.submitted_at::text,
       es.submission_status,
       coalesce(sum(coalesce(esi.reporting_amount_usd, esi.amount)), 0)::text as total_amount,
       coalesce(sum(coalesce(esi.reporting_amount_usd, esi.amount)), 0)::text as submitted_amount_usd,
       coalesce(sum(coalesce(esi.approved_amount_usd, esi.reporting_amount_usd, esi.amount)) filter (where esi.review_status = 'approved'), 0)::text as approved_amount_usd,
       coalesce(sum(coalesce(esi.reporting_amount_usd, esi.amount)) filter (where esi.review_status = 'rejected'), 0)::text as rejected_amount_usd,
       count(esi.id) filter (where esi.review_status in ('pending', 'review', 'needs_info'))::text as open_item_count,
       count(esi.id) filter (where esi.challenge_status = 'challenged')::text as challenged_item_count,
       count(esi.id)::text as item_count,
       ii.id as linked_invoice_id,
       ii.intake_status as linked_invoice_status,
       ii.invoice_number as linked_invoice_number
     from expense_submissions es
     left join race_events re on re.id = es.race_event_id
     left join expense_submission_items esi on esi.submission_id = es.id
     left join lateral (
       select id, intake_status, invoice_number
       from invoice_intakes
       where linked_submission_id = es.id
       order by created_at desc
       limit 1
     ) ii on true
     where es.submitted_by_user_id = $1
       and ($2::uuid is null or es.race_event_id = $2::uuid)
     group by es.id, re.name, re.season_year, ii.id, ii.intake_status, ii.invoice_number
     order by es.created_at desc
     limit 24`,
    [appUserId, raceId ?? null]
  );

  const seasonYears = Array.from(
    new Set(rows.map((row) => row.season_year).filter((value): value is number => value !== null))
  ).sort((a, b) => a - b);

  return rows.map((row) => ({
    id: row.id,
    title: row.submission_title,
    race: row.race_name ?? "Unassigned race",
    seasonLabel:
      row.season_year !== null ? getSeasonLabel(row.season_year, seasonYears) : "Race not assigned",
    submittedAt: row.submitted_at ? formatDateValue(row.submitted_at) : "Draft",
    statusKey: row.submission_status,
    status: formatExpenseSubmissionStatusLabel(row.submission_status),
    totalAmount: formatCurrency(row.total_amount),
    submittedAmountUsd: formatCurrency(row.submitted_amount_usd),
    approvedAmountUsd: formatCurrency(row.approved_amount_usd),
    rejectedAmountUsd: formatCurrency(row.rejected_amount_usd),
    openItemCount: row.open_item_count,
    challengedItemCount: row.challenged_item_count,
    itemCount: row.item_count,
    linkedInvoiceId: row.linked_invoice_id,
    linkedInvoiceStatus: row.linked_invoice_status,
    linkedInvoiceNumber: row.linked_invoice_number,
    canGenerateInvoice: row.submission_status === "approved" && !row.linked_invoice_id
  })) satisfies MyExpenseSubmissionRow[];
}

export async function getRaceBudgetRules(raceEventId: string | null | undefined) {
  if (getBackend() !== "database" || !raceEventId) {
    return [] satisfies RaceBudgetRuleRow[];
  }

  const rows = await queryRows<RaceBudgetRuleSource>(
    `select
       rbr.id,
       cc.name as category_name,
       rbr.rule_kind::text,
       rbr.unit_label,
       rbr.rule_label,
       rbr.approved_amount_usd::text,
       rbr.close_threshold_ratio::text,
       rbr.notes
     from race_budget_rules rbr
     join cost_categories cc on cc.id = rbr.cost_category_id
     where rbr.race_event_id = $1
     order by cc.name, rbr.rule_kind, rbr.created_at`,
    [raceEventId]
  );

  return rows.map((row) => ({
    id: row.id,
    category: row.category_name,
    ruleKind: row.rule_kind.replace(/_/g, " "),
    unitLabel: formatBudgetUnitLabel(row.unit_label),
    ruleLabel: row.rule_label,
    approvedAmountUsd: formatCurrency(row.approved_amount_usd),
    closeThreshold: `${Math.round(Number(row.close_threshold_ratio) * 100)}%`,
    notes: row.notes ?? "No budget note."
  })) satisfies RaceBudgetRuleRow[];
}

export async function getExpenseFormOptions() {
  if (getBackend() === "database") {
    const [raceRows, teamRows, categoryRows, userRows] = await Promise.all([
      queryRows<ExpenseFormOptionSource>(
        `select id, name as label
         from race_events
         where season_year is not null
         order by season_year desc, event_start_date desc nulls last, name`
      ),
      queryRows<ExpenseFormOptionSource>(
        `select id, team_name as label
         from app_teams
         where is_active = true
         order by team_name`
      ),
      queryRows<ExpenseFormOptionSource>(
        `select id, name as label
         from cost_categories
         where company_id in (select id from companies where code = 'TBR'::company_code)
         order by name`
      ),
      queryRows<ExpenseFormOptionSource>(
        `select id, full_name as label
         from app_users
         where is_active = true
         order by full_name`
      )
    ]);

    return {
      races: raceRows satisfies ExpenseFormOption[],
      teams: teamRows satisfies ExpenseFormOption[],
      categories: categoryRows satisfies ExpenseFormOption[],
      users: userRows satisfies ExpenseFormOption[]
    };
  }

  return {
    races: [] satisfies ExpenseFormOption[],
    teams: [] satisfies ExpenseFormOption[],
    categories: [] satisfies ExpenseFormOption[],
    users: [] satisfies ExpenseFormOption[]
  };
}

export async function getExpenseWorkspaceControls() {
  if (getBackend() !== "database") {
    return {
      tags: [] satisfies ExpenseTagRow[],
      rules: [] satisfies ExpenseWorkspaceRuleRow[],
    };
  }

  const [tags, rules] = await Promise.all([
    queryRows<ExpenseTagSource>(
      `select et.id, et.tag_key, et.tag_label, et.tag_description
       from expense_tags et
       join companies c on c.id = et.company_id
       where c.code = 'TBR'::company_code
         and et.is_active = true
       order by et.tag_label`
    ),
    queryRows<ExpenseWorkspaceRuleSource>(
      `select ewr.id, ewr.rule_key, ewr.rule_label, ewr.severity, ewr.is_active
       from expense_workspace_rules ewr
       join companies c on c.id = ewr.company_id
       where c.code = 'TBR'::company_code
       order by ewr.rule_key`
    )
  ]);

  return {
    tags: tags.map((tag) => ({
      id: tag.id,
      key: tag.tag_key,
      label: tag.tag_label,
      description: tag.tag_description ?? "No description.",
    })) satisfies ExpenseTagRow[],
    rules: rules.map((rule) => ({
      id: rule.id,
      key: rule.rule_key,
      label: rule.rule_label,
      severity: rule.severity,
      isActive: rule.is_active,
    })) satisfies ExpenseWorkspaceRuleRow[],
  };
}

export async function getExpenseSubmissionExportRows(submissionId: string) {
  if (getBackend() !== "database") {
    return [] satisfies ExpenseSubmissionExportRow[];
  }

  const rows = await queryRows<{
    submission_title: string;
    race_name: string | null;
    submitter_name: string;
    item_id: string;
    merchant_name: string | null;
    expense_date: string | null;
    category_name: string | null;
    tag_labels: string | null;
    original_currency_code: string | null;
    original_amount: string | null;
    fx_rate_to_usd: string | null;
    reporting_amount_usd: string | null;
    approved_amount_usd: string | null;
    review_status: string;
    receipt_status: string;
    rejection_reason_detail: string | null;
    challenge_reason: string | null;
    rule_messages: string | null;
    source_document_name: string | null;
    description: string | null;
  }>(
    `select
       es.submission_title,
       re.name as race_name,
       au.full_name as submitter_name,
       item.item_id,
       item.merchant_name,
       item.expense_date::text,
       item.category_name,
       item.tag_labels,
       item.original_currency_code,
       item.original_amount::text,
       item.fx_rate_to_usd::text,
       item.reporting_amount_usd::text,
       item.approved_amount_usd::text,
       item.review_status,
       item.receipt_status,
       item.rejection_reason_detail,
       item.challenge_reason,
       item.rule_messages,
       item.source_document_name,
       item.description
     from v_tbr_expense_item_review item
     join expense_submissions es on es.id = item.submission_id
     join app_users au on au.id = es.submitted_by_user_id
     left join race_events re on re.id = es.race_event_id
     where item.submission_id = $1
     order by item.expense_date nulls last, item.merchant_name`,
    [submissionId]
  );

  return rows.map((row) => ({
    submissionTitle: row.submission_title,
    race: row.race_name ?? "Unassigned race",
    submitter: row.submitter_name,
    itemId: row.item_id,
    merchant: row.merchant_name ?? "Unknown merchant",
    expenseDate: row.expense_date ?? "",
    category: row.category_name ?? "Uncategorized",
    tags: row.tag_labels ?? "",
    originalCurrency: row.original_currency_code ?? "USD",
    originalAmount: row.original_amount ?? "0",
    fxRateToUsd: row.fx_rate_to_usd ?? "",
    usdAmount: row.reporting_amount_usd ?? "0",
    approvedUsd: row.approved_amount_usd ?? "",
    reviewStatus: row.review_status,
    receiptStatus: row.receipt_status,
    rejectionReason: row.rejection_reason_detail ?? "",
    challengeReason: row.challenge_reason ?? "",
    ruleMessages: row.rule_messages ?? "",
    sourceDocument: row.source_document_name ?? "",
    description: row.description ?? "",
  })) satisfies ExpenseSubmissionExportRow[];
}

// ─── Email-notification helper (minimal fields for templates) ─────────

export type ExpenseNotificationContext = {
  submissionId: string;
  title: string;
  statusKey: string;
  raceName: string | null;
  totalAmountUsd: number;
  submitterId: string;
  submitterName: string;
  submitterEmail: string | null;
  reviewNote: string | null;
};

export async function getExpenseNotificationContext(
  submissionId: string
): Promise<ExpenseNotificationContext | null> {
  if (getBackend() !== "database") return null;
  const rows = await queryRows<{
    id: string;
    submission_title: string;
    submission_status: string;
    race_name: string | null;
    total: string;
    submitted_by_user_id: string;
    submitter_name: string;
    submitter_email: string | null;
    review_note: string | null;
  }>(
    `select es.id,
            es.submission_title,
            es.submission_status::text,
            re.name as race_name,
            coalesce(sum(esi.amount), 0)::text as total,
            es.submitted_by_user_id::text,
            au.full_name as submitter_name,
            au.email as submitter_email,
            es.review_note
     from expense_submissions es
     join app_users au on au.id = es.submitted_by_user_id
     left join race_events re on re.id = es.race_event_id
     left join expense_submission_items esi on esi.submission_id = es.id
     where es.id = $1
     group by es.id, re.name, au.full_name, au.email`,
    [submissionId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    submissionId: row.id,
    title: row.submission_title,
    statusKey: row.submission_status,
    raceName: row.race_name,
    totalAmountUsd: Number(row.total) || 0,
    submitterId: row.submitted_by_user_id,
    submitterName: row.submitter_name,
    submitterEmail: row.submitter_email,
    reviewNote: row.review_note,
  };
}
