import "server-only";

import { queryRows } from "../query";
import {
  formatBudgetSignalLabel,
  formatBudgetSignalTone,
  formatBudgetUnitLabel,
  formatCurrency,
  formatDateLabel,
  formatDateValue,
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
  status: string;
  statusLabel: string;
  itemCount: string;
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

export type ExpenseSubmissionDetail = {
  id: string;
  title: string;
  statusKey: string;
  status: string;
  raceEventId: string | null;
  race: string;
  submitter: string;
  submittedAt: string;
  operatorNote: string;
  reviewNote: string;
  totalAmount: string;
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
  category: string;
  team: string;
  description: string;
  splitMethod: string;
  splitCount: string;
  linkedExpenseId: string | null;
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
  status: string;
  totalAmount: string;
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
  submission_status: string;
  item_count: string;
  budget_signal_rank: number;
  matched_budget_count: string;
};

export type ExpenseFormOptionSource = {
  id: string;
  label: string;
};

export type ExpenseSubmissionDetailSource = {
  id: string;
  submission_title: string;
  submission_status: string;
  race_event_id: string | null;
  race_name: string | null;
  submitter_name: string;
  submitted_at: string | null;
  operator_note: string | null;
  review_note: string | null;
  total_amount: string;
  budget_signal_rank: number;
  matched_budget_count: string;
};

export type ExpenseSubmissionItemSource = {
  id: string;
  merchant_name: string | null;
  expense_date: string | null;
  amount: string;
  category_name: string | null;
  team_name: string | null;
  description: string | null;
  split_method: string;
  split_count: string;
  linked_expense_id: string | null;
  budget_signal: string;
  rule_kind: string | null;
  unit_label: string | null;
  rule_label: string | null;
  approved_amount_usd: string | null;
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
  item_count: string;
  linked_invoice_id: string | null;
  linked_invoice_status: string | null;
  linked_invoice_number: string | null;
};

export async function getExpenseWorkflowSummary() {
  if (getBackend() === "database") {
    const rows = await queryRows<ExpenseWorkflowSummarySource>(
      `select
         count(*) filter (where submission_status in ('submitted', 'in_review'))::text as pending_count,
         count(*) filter (where submission_status = 'needs_clarification')::text as draft_count,
         count(*) filter (where submission_status = 'posted')::text as posted_count,
         coalesce(sum(item.amount) filter (where es.submission_status = 'approved'), 0)::text as total_pending_amount
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
}) {
  if (getBackend() === "database") {
    const rows = await queryRows<ExpenseQueueSource>(
      `select
         es.id,
       es.submission_title,
       re.name as race_name,
       re.season_year,
       au.full_name as submitter_name,
       es.submitted_at::text,
       coalesce(sum(esi.amount), 0)::text as total_amount,
       es.submission_status,
       count(esi.id)::text as item_count,
       coalesce(max(case
         when rbr.id is null then 0
         when esi.amount > rbr.approved_amount_usd then 3
         when esi.amount >= (rbr.approved_amount_usd * rbr.close_threshold_ratio) then 2
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
       where ($1::int is null or re.season_year = $1)
         and ($2::uuid is null or es.race_event_id = $2::uuid)
         and ($3::uuid is null or es.submitted_by_user_id = $3::uuid)
         and ($4::text is null or es.submission_status::text = $4)
       group by es.id, re.name, re.season_year, au.full_name
       order by es.created_at desc
       limit 24`,
      [
        filters?.seasonYear ?? null,
        filters?.raceEventId ?? null,
        filters?.submitterId ?? null,
        filters?.submissionStatus ?? null
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
        status: row.submission_status,
        statusLabel: formatExpenseSubmissionStatusLabel(row.submission_status),
        itemCount: row.item_count,
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
       au.full_name as submitter_name,
       es.submitted_at::text,
       es.operator_note,
       es.review_note,
       coalesce(sum(esi.amount), 0)::text as total_amount,
       coalesce(max(case
         when rbr.id is null then 0
         when esi.amount > rbr.approved_amount_usd then 3
         when esi.amount >= (rbr.approved_amount_usd * rbr.close_threshold_ratio) then 2
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
    raceEventId: row.race_event_id,
    race: row.race_name ?? "Unassigned",
    submitter: row.submitter_name,
    submittedAt: row.submitted_at ? formatDateLabel(row.submitted_at) : "Draft",
    operatorNote: row.operator_note ?? "No operator note.",
    reviewNote: row.review_note ?? "No finance review note yet.",
    totalAmount: formatCurrency(row.total_amount),
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
       esi.amount::text,
       cc.name as category_name,
       t.team_name,
       esi.description,
       esi.split_method::text,
       esi.split_count::text,
       esi.linked_expense_id::text,
       case
         when rbr.id is null then 'no_rule'
         when esi.amount > rbr.approved_amount_usd then 'above_budget'
         when esi.amount >= (rbr.approved_amount_usd * rbr.close_threshold_ratio) then 'close_to_budget'
         else 'below_budget'
       end as budget_signal,
       rbr.rule_kind::text,
       rbr.unit_label,
       rbr.rule_label,
       rbr.approved_amount_usd::text,
       rbr.close_threshold_ratio::text,
       rbr.notes as rule_notes
     from expense_submission_items esi
     join expense_submissions es on es.id = esi.submission_id
     left join cost_categories cc on cc.id = esi.cost_category_id
     left join app_teams t on t.id = esi.team_id
     left join race_budget_rules rbr
       on rbr.race_event_id = es.race_event_id
      and rbr.cost_category_id = esi.cost_category_id
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

  return itemRows.map((row) => {
    const variance =
      row.approved_amount_usd !== null ? Number(row.amount) - Number(row.approved_amount_usd) : null;

    return {
      id: row.id,
      merchantName: row.merchant_name ?? "Unknown merchant",
      expenseDate: row.expense_date ? formatDateLabel(row.expense_date) : "No date",
      amount: formatCurrency(row.amount),
      category: row.category_name ?? "Uncategorized",
      team: row.team_name ?? "No team",
      description: row.description ?? "No description",
      splitMethod: row.split_method,
      splitCount: row.split_count,
      linkedExpenseId: row.linked_expense_id,
      budgetStatusKey: row.budget_signal,
      budgetStatusLabel: formatBudgetSignalLabel(row.budget_signal),
      budgetStatusTone: formatBudgetSignalTone(row.budget_signal),
      budgetRuleKind: row.rule_kind ? row.rule_kind.replace(/_/g, " ") : null,
      budgetUnitLabel: row.unit_label ? formatBudgetUnitLabel(row.unit_label) : null,
      budgetRuleLabel: row.rule_label,
      budgetApprovedAmount: row.approved_amount_usd ? formatCurrency(row.approved_amount_usd) : null,
      budgetVariance:
        variance !== null ? `${variance >= 0 ? "+" : "-"}${formatCurrency(Math.abs(variance))}` : null,
      budgetNotes: row.rule_notes ?? null,
      splits: splitsByItem.get(row.id) ?? []
    };
  }) satisfies ExpenseSubmissionItemDetail[];
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
       coalesce(sum(esi.amount), 0)::text as total_amount,
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
    status: formatExpenseSubmissionStatusLabel(row.submission_status),
    totalAmount: formatCurrency(row.total_amount),
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
