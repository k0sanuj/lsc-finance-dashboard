import "server-only";

import { agentEdges, agentNodes } from "./agent-graph";
import { isDatabaseConfigured } from "./connection";
import { hasDocumentPreview, resolveDocumentPreview } from "./document-storage";
import {
  aiInsights,
  commercialGoals,
  costCategories,
  dashboardOverview,
  documentAnalysisQueue,
  documentExtractedFields,
  documentPostingEvents,
  monthlyCashFlow,
  partnerPerformance,
  sponsorBreakdown,
  tbrRaceCosts,
  upcomingPayments
} from "./seed-data";
import { queryRows } from "./query";
import { workflowBranches, workflowStages } from "./workflow-graph";

type DataBackend = "seed" | "database";

type OverviewMetric = {
  label: string;
  value: string;
  scope: string;
};

type EntitySnapshotRow = {
  code: "LSC" | "TBR" | "FSP";
  name: string;
  revenue: string;
  cost: string;
  margin: string;
  status: string;
  note: string;
};

type CashFlowRow = {
  month: string;
  cashIn: string;
  cashOut: string;
  net: string;
};

type PaymentRow = {
  vendor: string;
  race: string;
  category: string;
  dueDate: string;
  amount: string;
  status: string;
};

type SponsorRow = {
  name: string;
  contractValue: string;
  recognizedRevenue: string;
  cashCollected: string;
};

type RaceCostRow = {
  race: string;
  eventInvoices: string;
  reimbursements: string;
  total: string;
};

type SeasonSummaryRow = {
  seasonYear: number;
  seasonLabel: string;
  raceCount: string;
  revenue: string;
  cost: string;
  openPayables: string;
  status: string;
};

type RaceCardRow = {
  id: string;
  name: string;
  location: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  seasonYear: number;
  eventDate: string;
  eventInvoices: string;
  reimbursements: string;
  totalCost: string;
  recognizedRevenue: string;
  openPayables: string;
  openInvoiceCount: string;
  submittedExpenses: string;
  approvedExpenses: string;
  pendingReceipts: string;
  status: string;
};

type CostCategoryRow = {
  name: string;
  amount: string;
  description: string;
};

type CostInsightRow = {
  title: string;
  summary: string;
};

type CommercialGoalRow = {
  month: string;
  target: string;
  actual: string;
  gap: string;
};

type PartnerPerformanceRow = {
  owner: string;
  targetRevenue: string;
  closedRevenue: string;
  status: string;
};

type AgentGraphNode = {
  id: string;
  name: string;
  role: string;
  tier: "core" | "specialist" | "subagent";
  parentId?: string;
  status: "active" | "idle" | "blocked";
  x: number;
  y: number;
};

type AgentGraphEdge = {
  id: string;
  from: string;
  to: string;
  type: "routes_to" | "depends_on" | "reports_to" | "validates";
};

type WorkflowStageRow = {
  id: string;
  name: string;
  owner: string;
};

type DocumentQueueRow = {
  id?: string;
  intakeEventId?: string;
  sourceDocumentId?: string;
  documentName: string;
  documentType: string;
  status: string;
  confidence: string;
  proposedTarget: string;
  createdAt?: string;
  workflowContext?: string;
  intakeStatus?: string;
  originCountry?: string;
  currencyCode?: string;
  previewAvailable?: boolean;
  previewDataUrl?: string | null;
  expenseDate?: string;
  originalAmount?: string;
  originalCurrency?: string;
  convertedUsdAmount?: string;
  linkedSubmissionId?: string | null;
  linkedSubmissionTitle?: string | null;
  linkedSubmissionStatus?: string | null;
  intakeCategory?: string;
  updateSummary?: string;
};

type DocumentFieldRow = {
  field: string;
  proposedValue: string;
  confidence: string;
  approval: string;
};

type DocumentPostingRow = {
  target: string;
  status: string;
  summary: string;
};

type DocumentDetailRow = {
  analysisRunId: string;
  sourceDocumentId: string;
  documentName: string;
  documentType: string;
  status: string;
  confidence: string;
  proposedTarget: string;
  financeInterpretation: string;
  createdAt: string;
  uploaderName: string;
  workflowContext: string;
  previewDataUrl: string | null;
  previewMimeType: string | null;
  originSource: string;
  originCountry: string;
  currencyCode: string;
  issuerCountry: string;
  intakeCategory: string;
  intakeFields: Array<{ label: string; value: string }>;
  platformUpdates: Array<{ area: string; effect: string }>;
};

type ExpenseWorkflowSummaryRow = {
  label: string;
  value: string;
  detail: string;
};

type ExpenseQueueRow = {
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

type RaceBudgetRuleRow = {
  id: string;
  category: string;
  ruleKind: string;
  unitLabel: string;
  ruleLabel: string;
  approvedAmountUsd: string;
  closeThreshold: string;
  notes: string;
};

type TeamSnapshotRow = {
  teamName: string;
  members: string;
  openSubmissions: string;
};

type ExpenseFormOption = {
  id: string;
  label: string;
};

type InvoiceWorkflowSummaryRow = {
  label: string;
  value: string;
  detail: string;
};

type InvoiceQueueRow = {
  id: string;
  vendor: string;
  invoiceNumber: string;
  race: string;
  dueDate: string;
  totalAmount: string;
  status: string;
  sourceLabel?: string | null;
};

type TeamDirectoryRow = {
  id: string;
  name: string;
  code: string;
  description: string;
  members: string;
  membershipCount: string;
};

type UserOptionRow = {
  id: string;
  name: string;
  role: string;
};

type ExpenseSubmissionDetail = {
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

type ExpenseSubmissionItemDetail = {
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

type ExpenseSplitDetail = {
  id: string;
  participant: string;
  percentage: string;
  amount: string;
};

type PaymentRowSource = {
  invoice_number: string | null;
  due_date: string | null;
  total_amount: string;
  invoice_status: string;
  race_name: string | null;
  description: string | null;
};

type SponsorRowSource = {
  sponsor_name: string;
  total_contract_value: string;
  recognized_revenue: string;
  cash_collected: string;
};

type RaceCostRowSource = {
  race_name: string;
  season_year: number | null;
  event_start_date: string | null;
  event_invoice_total: string;
  reimbursement_total: string;
  total_race_cost: string;
};

type CostCategoryRowSource = {
  category_name: string;
  total_amount: string;
};

type CommercialGoalRowSource = {
  target_period_start: string;
  target_value: string;
  actual_revenue: string;
  gap_to_target: string;
};

type PartnerPerformanceRowSource = {
  owner_name: string;
  target_revenue: string;
  recognized_revenue: string;
};

type AgentNodeSource = {
  id: string;
  name: string;
  role: string;
  tier: "core" | "specialist" | "subagent";
  parent_agent_id: string | null;
  status: "active" | "idle" | "blocked";
  position_x: number;
  position_y: number;
};

type AgentEdgeSource = {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  interaction_type: "routes_to" | "depends_on" | "reports_to" | "validates";
};

type WorkflowStageSource = {
  id: string;
  name: string;
  owner_name: string | null;
};

type DocumentAnalysisSource = {
  id: string;
  source_file_name: string | null;
  detected_document_type: string | null;
  analysis_status: string;
  overall_confidence: string | null;
  extracted_summary: Record<string, unknown> | null;
};

type DocumentQueueSource = {
  intake_event_id: string;
  analysis_run_id: string;
  source_file_name: string | null;
  detected_document_type: string | null;
  analysis_status: string;
  overall_confidence: string | null;
  extracted_summary: Record<string, unknown> | null;
  created_at: string;
  workflow_context: string | null;
  intake_status: string;
  metadata: Record<string, unknown> | null;
  source_document_id: string;
  linked_submission_id: string | null;
  linked_submission_title: string | null;
  linked_submission_status: string | null;
};

type DocumentFieldSource = {
  field_label: string;
  normalized_value: string | null;
  confidence: string | null;
  approval_status: string;
};

type DocumentPostingSource = {
  canonical_target_table: string;
  posting_status: string;
  posting_summary: string | null;
};

type DocumentDetailSource = {
  analysis_run_id: string;
  source_document_id: string;
  source_file_name: string | null;
  detected_document_type: string | null;
  analysis_status: string;
  overall_confidence: string | null;
  extracted_summary: Record<string, unknown> | null;
  created_at: string;
  workflow_context: string | null;
  uploader_name: string;
  metadata: Record<string, unknown> | null;
};

type ExpenseWorkflowSummarySource = {
  pending_count: string;
  draft_count: string;
  posted_count: string;
  total_pending_amount: string;
};

type ExpenseQueueSource = {
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

type TeamSnapshotSource = {
  team_name: string;
  member_count: string;
  open_submission_count: string;
};

type ExpenseFormOptionSource = {
  id: string;
  label: string;
};

type InvoiceWorkflowSummarySource = {
  pending_count: string;
  posted_count: string;
  total_open_amount: string;
};

type InvoiceQueueSource = {
  id: string;
  vendor_name: string;
  invoice_number: string | null;
  race_name: string | null;
  due_date: string | null;
  total_amount: string;
  intake_status: string;
  linked_submission_title: string | null;
};

type TeamDirectorySource = {
  id: string;
  team_name: string;
  team_code: string;
  description: string | null;
  member_names: string | null;
  membership_count: string;
};

type UserOptionSource = {
  id: string;
  full_name: string;
  role: string;
};

type ExpenseSubmissionDetailSource = {
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

type ExpenseSubmissionItemSource = {
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

type RaceBudgetRuleSource = {
  id: string;
  category_name: string;
  rule_kind: string;
  unit_label: string;
  rule_label: string;
  approved_amount_usd: string;
  close_threshold_ratio: string;
  notes: string | null;
};

type ExpenseSplitSource = {
  id: string;
  participant_name: string | null;
  split_label: string | null;
  split_percentage: string;
  split_amount: string;
};

type TotalsAccumulator = {
  revenue: number;
  expenses: number;
  margin: number;
};

type EntitySnapshotSource = {
  company_code: "LSC" | "TBR" | "FSP";
  company_name: string;
  recognized_revenue: string;
  approved_expenses: string;
  margin: string;
};

type SeasonSummarySource = {
  season_year: number;
  race_count: string;
  revenue_total: string;
  cost_total: string;
  open_payables: string;
};

type RaceCardSource = {
  id: string;
  race_name: string;
  location: string | null;
  season_year: number;
  event_start_date: string | null;
  event_invoice_total: string;
  reimbursement_total: string;
  recognized_revenue: string;
  open_payables: string;
  open_invoice_count: string;
  submitted_expense_total: string;
  approved_expense_total: string;
  pending_receipt_count: string;
};

type RaceWorkflowDocumentSource = {
  intake_event_id: string;
  analysis_run_id: string;
  source_document_id: string;
  source_file_name: string | null;
  detected_document_type: string | null;
  analysis_status: string;
  overall_confidence: string | null;
  extracted_summary: Record<string, unknown> | null;
  created_at: string;
  workflow_context: string | null;
  intake_status: string;
  metadata: Record<string, unknown> | null;
};

type MyExpenseSubmissionSource = {
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

type MyExpenseSubmissionRow = {
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

function getBackend(): DataBackend {
  return process.env.LSC_DATA_BACKEND === "database" ? "database" : "seed";
}

function formatCurrency(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(numeric);
}

function formatMonthLabel(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "TBD";
  }

  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatDateValue(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatStatusLabel(value: string | null | undefined) {
  if (!value) {
    return "pending_review";
  }

  return value.replace(/_/g, " ");
}

function formatExpenseSubmissionStatusLabel(value: string | null | undefined) {
  if (!value) {
    return "pending review";
  }

  if (value === "approved") {
    return "invoice ready";
  }

  return value.replace(/_/g, " ");
}

function getBudgetSignalFromRank(rank: number | string | null | undefined) {
  const numeric = Number(rank ?? 0);
  if (numeric >= 3) {
    return "above_budget";
  }

  if (numeric === 2) {
    return "close_to_budget";
  }

  if (numeric === 1) {
    return "below_budget";
  }

  return "no_rule";
}

function formatBudgetSignalLabel(value: string | null | undefined) {
  switch (value) {
    case "above_budget":
      return "above budget";
    case "close_to_budget":
      return "close to budget";
    case "below_budget":
      return "below budget";
    default:
      return "no budget rule";
  }
}

function formatBudgetSignalTone(value: string | null | undefined) {
  switch (value) {
    case "above_budget":
      return "risk";
    case "close_to_budget":
      return "warn";
    case "below_budget":
      return "good";
    default:
      return "muted";
  }
}

function formatBudgetUnitLabel(value: string | null | undefined) {
  switch (value) {
    case "per_day":
      return "per day";
    case "per_person":
      return "per person";
    case "per_race":
      return "per race";
    case "total":
      return "total";
    default:
      return "per race";
  }
}

function formatDecimalAmount(value: number | string | null | undefined, currencyCode = "USD") {
  const numeric = Number(value ?? 0);
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    return numeric.toFixed(2);
  }

  const safeCurrency = currencyCode;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: 2
  }).format(numeric);
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function countryCodeToFlag(countryCode: string) {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

function inferRaceGeography(raceName: string, location: string | null) {
  const haystack = normalizeText(`${raceName} ${location ?? ""}`);

  const knownMappings = [
    { match: ["jeddah", "saudi"], countryCode: "SA", countryName: "Saudi Arabia" },
    { match: ["doha", "qatar"], countryCode: "QA", countryName: "Qatar" },
    { match: ["dubrovnik", "croatia"], countryCode: "HR", countryName: "Croatia" },
    { match: ["lagos", "nigeria"], countryCode: "NG", countryName: "Nigeria" },
    { match: ["miami", "united states", "usa"], countryCode: "US", countryName: "United States" },
    { match: ["monaco"], countryCode: "MC", countryName: "Monaco" },
    { match: ["venice", "italy"], countryCode: "IT", countryName: "Italy" },
    { match: ["milan", "italy"], countryCode: "IT", countryName: "Italy" }
  ];

  for (const mapping of knownMappings) {
    if (mapping.match.some((token) => haystack.includes(token))) {
      return {
        countryCode: mapping.countryCode,
        countryName: mapping.countryName,
        countryFlag: countryCodeToFlag(mapping.countryCode)
      };
    }
  }

  return {
    countryCode: "UN",
    countryName: "Unknown",
    countryFlag: "🏁"
  };
}

function getSeasonLabel(seasonYear: number, orderedYears: number[]) {
  const seasonNumber = orderedYears.findIndex((year) => year === seasonYear) + 1;
  return seasonNumber > 0 ? `Season ${seasonNumber} · ${seasonYear}` : `Season · ${seasonYear}`;
}

async function getDbOverviewMetrics(): Promise<OverviewMetric[]> {
  const companyMetrics = await queryRows<{
    company_code: string;
    recognized_revenue: string;
    approved_expenses: string;
    margin: string;
  }>(
    `select company_code, recognized_revenue, approved_expenses, margin
     from consolidated_company_metrics`
  );

  const totals = companyMetrics.reduce(
    (
      acc: TotalsAccumulator,
      row: { company_code: string; recognized_revenue: string; approved_expenses: string; margin: string }
    ) => {
      acc.revenue += Number(row.recognized_revenue);
      acc.expenses += Number(row.approved_expenses);
      acc.margin += Number(row.margin);
      return acc;
    },
    { revenue: 0, expenses: 0, margin: 0 }
  );

  const receivableRows = await queryRows<{ outstanding_amount: string }>(
    `select outstanding_amount from receivables_aging`
  );
  const receivables = receivableRows.reduce(
    (sum: number, row: { outstanding_amount: string }) => sum + Number(row.outstanding_amount),
    0
  );

  const payableRows = await queryRows<{ total_amount: string }>(
    `select total_amount from payments_due`
  );
  const payableTotal = payableRows.reduce(
    (sum: number, row: { total_amount: string }) => sum + Number(row.total_amount),
    0
  );

  const settledPayments = await queryRows<{ direction: "inflow" | "outflow"; amount: string }>(
    `select direction, amount
     from payments
     where payment_status = 'settled'`
  );

  let cash = 0;
  for (const payment of settledPayments) {
    cash += payment.direction === "inflow" ? Number(payment.amount) : -Number(payment.amount);
  }

  const sponsorCountRows = await queryRows<{ sponsor_count: string }>(
    `select count(*)::text as sponsor_count
     from sponsors_or_customers sc
     join companies c on c.id = sc.company_id
     where c.code = 'TBR'`
  );

  return [
    { label: "Total Revenue", value: formatCurrency(totals.revenue), scope: "LSC Consolidated" },
    { label: "Total Cost", value: formatCurrency(totals.expenses), scope: "LSC Consolidated" },
    { label: "Margin", value: formatCurrency(totals.margin), scope: "LSC Consolidated" },
    { label: "Cash", value: formatCurrency(cash), scope: "LSC Consolidated" },
    { label: "Receivables", value: formatCurrency(receivables), scope: "LSC Consolidated" },
    { label: "Upcoming Payments", value: formatCurrency(payableTotal), scope: "LSC Consolidated" },
    { label: "MRR", value: formatCurrency(0), scope: "FSP Placeholder" },
    {
      label: "Sponsor Count",
      value: sponsorCountRows[0]?.sponsor_count ?? "0",
      scope: "TBR"
    }
  ];
}

async function getDbMonthlyCashFlow(): Promise<CashFlowRow[]> {
  const rows = await queryRows<{
    month_start: string | null;
    cash_in: string;
    cash_out: string;
  }>(
    `select month_start, cash_in, cash_out
     from monthly_financial_summary
     where company_code = 'LSC'
       and month_start is not null
     order by month_start desc
     limit 6`
  );

  if (rows.length === 0) {
    return [...monthlyCashFlow];
  }

  return rows
    .slice()
    .reverse()
    .map((row: { month_start: string | null; cash_in: string; cash_out: string }) => {
      const cashIn = Number(row.cash_in);
      const cashOut = Number(row.cash_out);
      return {
        month: formatMonthLabel(row.month_start as string),
        cashIn: formatCurrency(cashIn),
        cashOut: formatCurrency(cashOut),
        net: formatCurrency(cashIn - cashOut)
      };
    });
}

async function getDbUpcomingPayments(): Promise<PaymentRow[]> {
  const rows = await queryRows<{
    invoice_number: string | null;
    due_date: string | null;
    total_amount: string;
    invoice_status: string;
    race_name: string | null;
    description: string | null;
  }>(
    `select invoice_number, due_date, total_amount, invoice_status, race_name, description
     from payments_due
     order by due_date nulls last
     limit 10`
  );

  if (rows.length === 0) {
    return [...upcomingPayments];
  }

  return rows.map((row: PaymentRowSource) => ({
    vendor: row.invoice_number || "Payable Invoice",
    race: row.race_name || "General",
    category: row.description || "Operational",
    dueDate: formatDateLabel(row.due_date),
    amount: formatCurrency(row.total_amount),
    status: row.invoice_status
  }));
}

function parseMoney(value: string) {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

function formatHumanLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseIntakeFields(summary: Record<string, unknown> | null) {
  const intakePayload =
    summary && typeof summary.intakePayload === "object" && summary.intakePayload
      ? (summary.intakePayload as Record<string, unknown>)
      : null;
  const operatorFields =
    intakePayload && typeof intakePayload.operatorFields === "object" && intakePayload.operatorFields
      ? (intakePayload.operatorFields as Record<string, unknown>)
      : {};

  return Object.entries(operatorFields)
    .filter((entry) => Boolean(String(entry[1] ?? "").trim()))
    .map((entry) => ({
      label: formatHumanLabel(entry[0]),
      value: String(entry[1])
    }));
}

function parsePlatformUpdates(summary: Record<string, unknown> | null) {
  const updates = Array.isArray(summary?.platformUpdates) ? summary.platformUpdates : [];

  return updates
    .filter(
      (entry): entry is { area: unknown; effect: unknown } =>
        Boolean(entry && typeof entry === "object")
    )
    .map((entry) => ({
      area: String(entry.area ?? "Platform"),
      effect: String(entry.effect ?? "No effect recorded yet.")
    }));
}

async function getDbSponsorBreakdown(): Promise<SponsorRow[]> {
  const rows = await queryRows<{
    sponsor_name: string;
    total_contract_value: string;
    recognized_revenue: string;
    cash_collected: string;
  }>(
    `select sponsor_name, total_contract_value, recognized_revenue, cash_collected
     from tbr_sponsor_revenue_summary
     order by sponsor_name`
  );

  if (rows.length === 0) {
    return [...sponsorBreakdown];
  }

  return rows.map((row: SponsorRowSource) => ({
    name: row.sponsor_name,
    contractValue: formatCurrency(row.total_contract_value),
    recognizedRevenue: formatCurrency(row.recognized_revenue),
    cashCollected: formatCurrency(row.cash_collected)
  }));
}

async function getDbTbrRaceCosts(): Promise<RaceCostRow[]> {
  const rows = await queryRows<{
    race_name: string;
    season_year: number | null;
    event_start_date: string | null;
    event_invoice_total: string;
    reimbursement_total: string;
    total_race_cost: string;
  }>(
    `select race_name, season_year, event_start_date, event_invoice_total, reimbursement_total, total_race_cost
     from tbr_race_cost_summary
     order by season_year nulls last, event_start_date nulls last, race_name`
  );

  if (rows.length === 0) {
    return [...tbrRaceCosts];
  }

  return rows
    .filter(
      (row: RaceCostRowSource) =>
        Number(row.event_invoice_total) > 0 ||
        Number(row.reimbursement_total) > 0 ||
        Number(row.total_race_cost) > 0
    )
    .map((row: RaceCostRowSource) => ({
      race: row.race_name,
      eventInvoices: formatCurrency(row.event_invoice_total),
      reimbursements: formatCurrency(row.reimbursement_total),
      total: formatCurrency(row.total_race_cost)
    }));
}

async function getDbCostCategories(): Promise<CostCategoryRow[]> {
  const rows = await queryRows<{
    category_name: string;
    total_amount: string;
  }>(
    `select cc.name as category_name, coalesce(sum(e.amount), 0)::text as total_amount
     from cost_categories cc
     left join expenses e on e.cost_category_id = cc.id and e.expense_status in ('approved', 'paid')
     join companies c on c.id = cc.company_id
     where c.code = 'TBR'
     group by cc.name
     order by cc.name`
  );

  if (rows.length === 0) {
    return [...costCategories];
  }

  return rows.map((row: CostCategoryRowSource) => ({
    name: row.category_name,
    amount: formatCurrency(row.total_amount),
    description: "Live category total from approved TBR expenses."
  }));
}

async function getDbCommercialGoals(): Promise<CommercialGoalRow[]> {
  const rows = await queryRows<{
    target_period_start: string;
    target_value: string;
    actual_revenue: string;
    gap_to_target: string;
  }>(
    `select target_period_start, target_value, actual_revenue, gap_to_target
     from commercial_goal_progress
     where company_code = 'TBR'
     order by target_period_start
     limit 12`
  );

  if (rows.length === 0) {
    return [...commercialGoals];
  }

  return rows.map((row: CommercialGoalRowSource) => ({
    month: formatMonthLabel(row.target_period_start),
    target: formatCurrency(row.target_value),
    actual: formatCurrency(row.actual_revenue),
    gap: formatCurrency(row.gap_to_target)
  }));
}

async function getDbPartnerPerformance(): Promise<PartnerPerformanceRow[]> {
  const rows = await queryRows<{
    owner_name: string;
    target_revenue: string;
    recognized_revenue: string;
  }>(
    `select owner_name, target_revenue, recognized_revenue
     from partner_performance
     where company_code = 'TBR'
     order by owner_name`
  );

  if (rows.length === 0) {
    return [...partnerPerformance];
  }

  return rows.map((row: PartnerPerformanceRowSource) => ({
    owner: row.owner_name,
    targetRevenue: formatCurrency(row.target_revenue),
    closedRevenue: formatCurrency(row.recognized_revenue),
    status:
      Number(row.target_revenue) > 0 && Number(row.recognized_revenue) >= Number(row.target_revenue)
        ? "on target"
        : "in progress"
  }));
}

async function getDbAiInsights() {
  const metrics = await getDbOverviewMetrics();
  const totalRevenue =
    metrics.find((item: OverviewMetric) => item.label === "Total Revenue")?.value ?? "$0";
  const totalCost = metrics.find((item: OverviewMetric) => item.label === "Total Cost")?.value ?? "$0";
  const upcoming =
    metrics.find((item: OverviewMetric) => item.label === "Upcoming Payments")?.value ?? "$0";

  return [
    {
      type: "Monthly Summary",
      title: "Live overview metrics are now connected",
      summary: `The dashboard is reading LSC consolidated totals directly from Neon. Current revenue is ${totalRevenue} and current cost is ${totalCost}.`
    },
    {
      type: "Risk Flag",
      title: "Commercial and receivable depth still depends on source imports",
      summary: `The database is live, but the business tables are still mostly reference-seeded. Upcoming payments currently show ${upcoming} until invoice imports are loaded.`
    },
    {
      type: "Action",
      title: "Import TBR sponsor, invoice, and expense data next",
      summary: "That will replace placeholders in commercial goals, sponsor tables, receivables, and payment operations with actual operating data."
    }
  ] as const;
}

async function getDbAgentGraph() {
  const nodes = await queryRows<{
    id: string;
    name: string;
    role: string;
    tier: "core" | "specialist" | "subagent";
    parent_agent_id: string | null;
    status: "active" | "idle" | "blocked";
    position_x: number;
    position_y: number;
  }>(
    `select id, name, role, tier, parent_agent_id, status, position_x, position_y
     from agent_nodes
     order by id`
  );

  const edges = await queryRows<{
    id: string;
    from_agent_id: string;
    to_agent_id: string;
    interaction_type: "routes_to" | "depends_on" | "reports_to" | "validates";
  }>(
    `select id, from_agent_id, to_agent_id, interaction_type
     from agent_edges
     where is_active = true
     order by id`
  );

  if (nodes.length === 0 || edges.length === 0) {
    return {
      nodes: [...agentNodes],
      edges: [...agentEdges]
    };
  }

  return {
    nodes: nodes.map<AgentGraphNode>((row: AgentNodeSource) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      tier: row.tier,
      parentId: row.parent_agent_id ?? undefined,
      status: row.status,
      x: row.position_x,
      y: row.position_y
    })),
    edges: edges.map<AgentGraphEdge>((row: AgentEdgeSource) => ({
      id: row.id,
      from: row.from_agent_id,
      to: row.to_agent_id,
      type: row.interaction_type
    }))
  };
}

async function getDbWorkflowGraph() {
  const stages = await queryRows<{
    id: string;
    name: string;
    owner_name: string | null;
  }>(
    `select wn.id, wn.name, an.name as owner_name
     from workflow_nodes wn
     left join agent_nodes an on an.id = wn.owner_agent_id
     order by wn.sequence_order`
  );

  if (stages.length === 0) {
    return {
      stages: [...workflowStages],
      branches: [...workflowBranches]
    };
  }

  return {
    stages: stages.map<WorkflowStageRow>((row: WorkflowStageSource) => ({
      id: row.id,
      name: row.name,
      owner: row.owner_name ?? "Unassigned"
    })),
    branches: workflowBranches
  };
}

export async function getOverviewMetrics() {
  if (getBackend() === "database") {
    return getDbOverviewMetrics();
  }

  return [...dashboardOverview];
}

export async function getEntitySnapshots() {
  if (getBackend() === "database") {
    const rows = await queryRows<EntitySnapshotSource>(
      `select
         c.code as company_code,
         c.name as company_name,
         coalesce(m.recognized_revenue, 0)::text as recognized_revenue,
         coalesce(m.approved_expenses, 0)::text as approved_expenses,
         coalesce(m.margin, 0)::text as margin
       from companies c
       left join consolidated_company_metrics m on m.company_code = c.code
       order by case c.code when 'LSC' then 1 when 'TBR' then 2 else 3 end`
    );

    if (rows.length > 0) {
      return rows.map((row) => ({
        code: row.company_code,
        name: row.company_name,
        revenue: formatCurrency(row.recognized_revenue),
        cost: formatCurrency(row.approved_expenses),
        margin: formatCurrency(row.margin),
        status: row.company_code === "FSP" ? "Schema ready" : "Live",
        note:
          row.company_code === "LSC"
            ? "Consolidated holding-company view across active entities."
            : row.company_code === "TBR"
              ? "Active operating entity with live canonical finance records."
              : "Future operating entity with structure in place and limited live data."
      })) satisfies EntitySnapshotRow[];
    }
  }

  return [
    {
      code: "LSC",
      name: "League Sports Co",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Live",
      note: "Consolidated holding-company view across active entities."
    },
    {
      code: "TBR",
      name: "Team Blue Rising",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Live",
      note: "Active operating entity with live canonical finance records."
    },
    {
      code: "FSP",
      name: "Future of Sports",
      revenue: formatCurrency(0),
      cost: formatCurrency(0),
      margin: formatCurrency(0),
      status: "Schema ready",
      note: "Future operating entity with structure in place and limited live data."
    }
  ] satisfies EntitySnapshotRow[];
}

export async function getMonthlyCashFlow() {
  if (getBackend() === "database") {
    return getDbMonthlyCashFlow();
  }

  return [...monthlyCashFlow];
}

export async function getUpcomingPayments() {
  if (getBackend() === "database") {
    return getDbUpcomingPayments();
  }

  return [...upcomingPayments];
}

export async function getSponsorBreakdown() {
  if (getBackend() === "database") {
    return getDbSponsorBreakdown();
  }

  return [...sponsorBreakdown];
}

export async function getTbrRaceCosts() {
  if (getBackend() === "database") {
    return getDbTbrRaceCosts();
  }

  return [...tbrRaceCosts];
}

export async function getTbrSeasonSummaries() {
  if (getBackend() === "database") {
    const rows = await queryRows<SeasonSummarySource>(
      `with season_races as (
         select re.season_year, count(*)::text as race_count
         from race_events re
         join companies c on c.id = re.company_id
         where c.code = 'TBR'::company_code
           and re.season_year is not null
         group by re.season_year
       ),
       season_revenue as (
         select extract(year from rr.recognition_date)::int as season_year,
                coalesce(sum(rr.amount), 0)::text as revenue_total
         from revenue_records rr
         join companies c on c.id = rr.company_id
         where c.code = 'TBR'::company_code
         group by extract(year from rr.recognition_date)
       ),
       season_cost as (
         select re.season_year,
                coalesce(sum(e.amount), 0)::text as cost_total
         from expenses e
         join race_events re on re.id = e.race_event_id
         join companies c on c.id = e.company_id
         where c.code = 'TBR'::company_code
           and e.expense_status in ('approved', 'paid')
           and re.season_year is not null
         group by re.season_year
       ),
       season_payables as (
         select re.season_year,
                coalesce(sum(i.total_amount), 0)::text as open_payables
         from invoices i
         join race_events re on re.id = i.race_event_id
         join companies c on c.id = i.company_id
         where c.code = 'TBR'::company_code
           and i.direction = 'payable'
           and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
           and re.season_year is not null
         group by re.season_year
       )
       select
         sr.season_year,
         sr.race_count,
         coalesce(srev.revenue_total, '0') as revenue_total,
         coalesce(sc.cost_total, '0') as cost_total,
         coalesce(sp.open_payables, '0') as open_payables
       from season_races sr
       left join season_revenue srev on srev.season_year = sr.season_year
       left join season_cost sc on sc.season_year = sr.season_year
       left join season_payables sp on sp.season_year = sr.season_year
       order by sr.season_year`
    );

    if (rows.length > 0) {
      const seasonYears = rows.map((row) => row.season_year).sort((a, b) => a - b);
      return rows.map((row) => ({
        seasonYear: row.season_year,
        seasonLabel: getSeasonLabel(row.season_year, seasonYears),
        raceCount: row.race_count,
        revenue: formatCurrency(row.revenue_total),
        cost: formatCurrency(row.cost_total),
        openPayables: formatCurrency(row.open_payables),
        status: row.season_year === Math.max(...seasonYears) ? "In progress" : "Completed"
      })) satisfies SeasonSummaryRow[];
    }
  }

  return [] satisfies SeasonSummaryRow[];
}

export async function getTbrRaceCards(seasonYear: number) {
  if (getBackend() === "database") {
    const rows = await queryRows<RaceCardSource>(
      `select
         re.id,
         re.name as race_name,
         re.location,
         re.season_year,
         re.event_start_date::text,
         coalesce((
           select sum(i.total_amount)
           from invoices i
           where i.race_event_id = re.id
             and i.direction = 'payable'
         ), 0)::text as event_invoice_total,
         coalesce((
           select sum(e.amount)
           from expenses e
           where e.race_event_id = re.id
             and e.expense_status in ('approved', 'paid')
         ), 0)::text as reimbursement_total,
         coalesce((
           select sum(rr.amount)
           from revenue_records rr
           where rr.race_event_id = re.id
         ), 0)::text as recognized_revenue,
         coalesce((
           select sum(i.total_amount)
           from invoices i
           where i.race_event_id = re.id
             and i.direction = 'payable'
             and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
         ), 0)::text as open_payables,
         (
           select count(*)::text
           from invoices i
           where i.race_event_id = re.id
             and i.direction = 'payable'
             and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
         ) as open_invoice_count,
         coalesce((
           select sum(esi.amount)
           from expense_submissions es
           join expense_submission_items esi on esi.submission_id = es.id
           where es.race_event_id = re.id
         ), 0)::text as submitted_expense_total,
         coalesce((
           select sum(esi.amount)
           from expense_submissions es
           join expense_submission_items esi on esi.submission_id = es.id
           where es.race_event_id = re.id
             and es.submission_status in ('approved', 'posted')
         ), 0)::text as approved_expense_total,
         (
           select count(*)::text
           from document_intake_events die
           where die.workflow_context like ('tbr-race:' || re.id::text || '%')
             and die.intake_status in ('analyzed', 'reused')
         ) as pending_receipt_count
       from race_events re
       join companies c on c.id = re.company_id
       where c.code = 'TBR'::company_code
         and re.season_year = $1
       order by re.event_start_date nulls last, re.name`,
      [seasonYear]
    );

    return rows.map((row) => {
      const eventInvoiceTotal = Number(row.event_invoice_total);
      const reimbursementTotal = Number(row.reimbursement_total);
      const totalCost = eventInvoiceTotal + reimbursementTotal;
      const geography = inferRaceGeography(row.race_name, row.location);

      return {
        id: row.id,
        name: row.race_name,
        location: row.location ?? "Location pending",
        countryCode: geography.countryCode,
        countryName: geography.countryName,
        countryFlag: geography.countryFlag,
        seasonYear: row.season_year,
        eventDate: formatDateLabel(row.event_start_date),
        eventInvoices: formatCurrency(row.event_invoice_total),
        reimbursements: formatCurrency(row.reimbursement_total),
        totalCost: formatCurrency(totalCost),
        recognizedRevenue: formatCurrency(row.recognized_revenue),
        openPayables: formatCurrency(row.open_payables),
        openInvoiceCount: row.open_invoice_count,
        submittedExpenses: formatCurrency(row.submitted_expense_total),
        approvedExpenses: formatCurrency(row.approved_expense_total),
        pendingReceipts: row.pending_receipt_count,
        status: totalCost > 0 ? "Live finance data" : "Schedule only"
      };
    }) satisfies RaceCardRow[];
  }

  return [] satisfies RaceCardRow[];
}

export async function getTbrRaceCardById(raceId: string) {
  if (getBackend() !== "database") {
    return null;
  }

  const rows = await queryRows<RaceCardSource>(
    `select
       re.id,
       re.name as race_name,
       re.location,
       re.season_year,
       re.event_start_date::text,
       coalesce((
         select sum(i.total_amount)
         from invoices i
         where i.race_event_id = re.id
           and i.direction = 'payable'
       ), 0)::text as event_invoice_total,
       coalesce((
         select sum(e.amount)
         from expenses e
         where e.race_event_id = re.id
           and e.expense_status in ('approved', 'paid')
       ), 0)::text as reimbursement_total,
       coalesce((
         select sum(rr.amount)
         from revenue_records rr
         where rr.race_event_id = re.id
       ), 0)::text as recognized_revenue,
       coalesce((
         select sum(i.total_amount)
         from invoices i
         where i.race_event_id = re.id
           and i.direction = 'payable'
           and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
       ), 0)::text as open_payables,
       (
         select count(*)::text
         from invoices i
         where i.race_event_id = re.id
           and i.direction = 'payable'
           and i.invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')
       ) as open_invoice_count,
       coalesce((
         select sum(esi.amount)
         from expense_submissions es
         join expense_submission_items esi on esi.submission_id = es.id
         where es.race_event_id = re.id
       ), 0)::text as submitted_expense_total,
       coalesce((
         select sum(esi.amount)
         from expense_submissions es
         join expense_submission_items esi on esi.submission_id = es.id
         where es.race_event_id = re.id
           and es.submission_status in ('approved', 'posted')
       ), 0)::text as approved_expense_total,
       (
         select count(*)::text
         from document_intake_events die
         where die.workflow_context like ('tbr-race:' || re.id::text || '%')
           and die.intake_status in ('analyzed', 'reused')
       ) as pending_receipt_count
     from race_events re
     join companies c on c.id = re.company_id
     where c.code = 'TBR'::company_code
       and re.id = $1
     limit 1`,
    [raceId]
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  const geography = inferRaceGeography(row.race_name, row.location);
  const eventInvoiceTotal = Number(row.event_invoice_total);
  const reimbursementTotal = Number(row.reimbursement_total);
  const totalCost = eventInvoiceTotal + reimbursementTotal;

  return {
    id: row.id,
    name: row.race_name,
    location: row.location ?? "Location pending",
    countryCode: geography.countryCode,
    countryName: geography.countryName,
    countryFlag: geography.countryFlag,
    seasonYear: row.season_year,
    eventDate: formatDateLabel(row.event_start_date),
    eventInvoices: formatCurrency(row.event_invoice_total),
    reimbursements: formatCurrency(row.reimbursement_total),
    totalCost: formatCurrency(totalCost),
    recognizedRevenue: formatCurrency(row.recognized_revenue),
    openPayables: formatCurrency(row.open_payables),
    openInvoiceCount: row.open_invoice_count,
    submittedExpenses: formatCurrency(row.submitted_expense_total),
    approvedExpenses: formatCurrency(row.approved_expense_total),
    pendingReceipts: row.pending_receipt_count,
    status: totalCost > 0 ? "Live finance data" : "Schedule only"
  } satisfies RaceCardRow;
}

export async function getCostCategories() {
  if (getBackend() === "database") {
    return getDbCostCategories();
  }

  return [...costCategories];
}

export async function getTbrSeasonCostCategories(seasonYear: number) {
  if (getBackend() === "database") {
    const rows = await queryRows<{
      category_name: string;
      total_amount: string;
    }>(
      `select
         cc.name as category_name,
         coalesce(sum(e.amount), 0)::text as total_amount
       from cost_categories cc
       join companies c on c.id = cc.company_id
       left join expenses e
         on e.cost_category_id = cc.id
        and e.expense_status in ('approved', 'paid')
       left join race_events re on re.id = e.race_event_id
       where c.code = 'TBR'
         and re.season_year = $1
       group by cc.name
       having coalesce(sum(e.amount), 0) > 0
       order by coalesce(sum(e.amount), 0) desc, cc.name`,
      [seasonYear]
    );

    return rows.map((row: CostCategoryRowSource) => ({
      name: row.category_name,
      amount: formatCurrency(row.total_amount),
      description: `Approved reimbursement cost inside Season ${seasonYear}.`
    })) satisfies CostCategoryRow[];
  }

  return [] satisfies CostCategoryRow[];
}

export async function getCommercialGoals() {
  if (getBackend() === "database") {
    return getDbCommercialGoals();
  }

  return [...commercialGoals];
}

export async function getPartnerPerformance() {
  if (getBackend() === "database") {
    return getDbPartnerPerformance();
  }

  return [...partnerPerformance];
}

export async function getCostInsights(companyCode: "TBR" | "FSP" = "TBR") {
  if (companyCode === "FSP") {
    return [
      {
        title: "FSP cost workspace is still preparatory",
        summary: "Keep the structure ready for launch costs, but do not over-interpret placeholder values before FSP has live operating records."
      },
      {
        title: "Use the same operating model later",
        summary: "When FSP costs arrive, review them by category, by source document, and by payable timing just like TBR."
      }
    ] satisfies CostInsightRow[];
  }

  const [categories, races] = await Promise.all([getCostCategories(), getTbrRaceCosts()]);
  const rankedCategories = [...categories].sort((left, right) => parseMoney(right.amount) - parseMoney(left.amount));
  const rankedRaces = [...races].sort((left, right) => parseMoney(right.total) - parseMoney(left.total));

  const topCategory = rankedCategories[0];
  const topRace = rankedRaces[0];
  const totalCost = rankedCategories.reduce((sum, row) => sum + parseMoney(row.amount), 0);
  const topCategoryShare = totalCost > 0 && topCategory ? Math.round((parseMoney(topCategory.amount) / totalCost) * 100) : 0;

  return [
    {
      title: topCategory
        ? `${topCategory.name} is currently the dominant cost bucket`
        : "No approved cost bucket is active yet",
      summary: topCategory
        ? `${topCategory.amount} is sitting in ${topCategory.name}, which is about ${topCategoryShare}% of current approved TBR spend.`
        : "Once live cost rows are approved, this section should call out which category is driving the spend concentration."
    },
    {
      title: topRace ? `${topRace.race} is the heaviest race-cost event so far` : "Race-level cost intensity is still light",
      summary: topRace
        ? `${topRace.total} is currently the largest race total, combining ${topRace.eventInvoices} of event invoices and ${topRace.reimbursements} of reimbursements.`
        : "Race-by-race totals will become useful once more cost rows are linked to race events."
    },
    {
      title: "Review source-backed support after the rollup",
      summary: "Use the analyzer and source queue only after the category and race tables point to something unusual. That keeps finance review focused instead of document-first."
    }
  ] satisfies CostInsightRow[];
}

export async function getAiInsights() {
  if (getBackend() === "database") {
    return getDbAiInsights();
  }

  return [...aiInsights];
}

export async function getAgentGraph() {
  if (getBackend() === "database") {
    return getDbAgentGraph();
  }

  return {
    nodes: [...agentNodes],
    edges: [...agentEdges]
  };
}

export async function getWorkflowGraph() {
  if (getBackend() === "database") {
    return getDbWorkflowGraph();
  }

  return {
    stages: [...workflowStages],
    branches: [...workflowBranches]
  };
}

export async function getDocumentAnalysisQueue(appUserId?: string, workflowContextPrefix?: string) {
  if (getBackend() === "database") {
    const rows = await queryRows<DocumentQueueSource>(
      `select
         die.id as intake_event_id,
         dar.id as analysis_run_id,
         sd.id as source_document_id,
         dar.source_file_name,
         dar.detected_document_type,
         dar.analysis_status,
         dar.overall_confidence::text,
         dar.extracted_summary,
         die.created_at::text,
         die.workflow_context,
         die.intake_status,
         sd.metadata,
         linked.submission_id as linked_submission_id,
         linked.submission_title as linked_submission_title,
         linked.submission_status as linked_submission_status
       from document_intake_events die
       join document_analysis_runs dar on dar.id = die.analysis_run_id
       join source_documents sd on sd.id = die.source_document_id
       left join lateral (
         select
           es.id as submission_id,
           es.submission_title,
           es.submission_status
         from expense_submission_items esi
         join expense_submissions es on es.id = esi.submission_id
         where esi.source_document_id = sd.id
           and ($1::uuid is null or es.submitted_by_user_id = $1::uuid)
         order by esi.created_at desc
         limit 1
       ) linked on true
       where ($1::uuid is null or die.app_user_id = $1::uuid)
         and ($2::text is null or die.workflow_context like ($2 || '%'))
       order by die.created_at desc
       limit 12`,
      [appUserId ?? null, workflowContextPrefix ?? null]
    );

    if (rows.length > 0) {
      return Promise.all(rows.map(async (row) => {
        const preview = await resolveDocumentPreview(row.metadata);
        const platformUpdates = parsePlatformUpdates(row.extracted_summary);

        return {
          id: row.analysis_run_id,
          intakeEventId: row.intake_event_id,
          sourceDocumentId: row.source_document_id,
          documentName: row.source_file_name ?? "Uploaded Document",
          documentType: row.detected_document_type ?? "Unknown",
          status: row.linked_submission_status
            ? `in report · ${formatStatusLabel(row.linked_submission_status)}`
            : row.analysis_status,
          confidence: row.overall_confidence ?? "0.00",
          proposedTarget: String(row.extracted_summary?.proposedTarget ?? "pending review"),
          createdAt: formatDateLabel(row.created_at),
          workflowContext: row.workflow_context ?? "documents",
          intakeStatus: row.intake_status,
          originCountry: String(row.extracted_summary?.originCountry ?? "Unknown"),
          currencyCode: String(row.extracted_summary?.currencyCode ?? "Unknown"),
          previewAvailable: hasDocumentPreview(row.metadata),
          previewDataUrl: preview.previewDataUrl,
          expenseDate: formatDateValue(String(row.extracted_summary?.expenseDate ?? "")),
          originalAmount: formatDecimalAmount(
            Number(row.extracted_summary?.originalAmount ?? 0),
            String(row.extracted_summary?.originalCurrency ?? row.extracted_summary?.currencyCode ?? "USD")
          ),
          originalCurrency: String(
            row.extracted_summary?.originalCurrency ?? row.extracted_summary?.currencyCode ?? "Unknown"
          ),
          convertedUsdAmount: formatDecimalAmount(Number(row.extracted_summary?.usdAmount ?? 0), "USD"),
          linkedSubmissionId: row.linked_submission_id,
          linkedSubmissionTitle: row.linked_submission_title,
          linkedSubmissionStatus: row.linked_submission_status,
          intakeCategory: String(
            (row.extracted_summary?.intakePayload as Record<string, unknown> | undefined)?.label ?? "Unmapped"
          ),
          updateSummary:
            platformUpdates
              .slice(0, 2)
              .map((item) => item.area)
              .join(" • ") || "Pending workflow mapping"
        };
      }));
    }
  }

  return [...documentAnalysisQueue];
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

export async function getDocumentAnalysisDetail(analysisRunId?: string, appUserId?: string) {
  if (getBackend() === "database") {
    const rows = await queryRows<DocumentDetailSource>(
      `select
         dar.id as analysis_run_id,
         sd.id as source_document_id,
         dar.source_file_name,
         dar.detected_document_type,
         dar.analysis_status,
         dar.overall_confidence::text,
         dar.extracted_summary,
         die.created_at::text,
         die.workflow_context,
         au.full_name as uploader_name,
         sd.metadata
       from document_intake_events die
       join document_analysis_runs dar on dar.id = die.analysis_run_id
       join source_documents sd on sd.id = die.source_document_id
       join app_users au on au.id = die.app_user_id
       where ($1::uuid is null or dar.id = $1::uuid)
         and ($2::uuid is null or die.app_user_id = $2::uuid)
       order by die.created_at desc
       limit 1`,
      [analysisRunId ?? null, appUserId ?? null]
    );

    const row = rows[0];

    if (row) {
      const preview = await resolveDocumentPreview(row.metadata);
      const intakePayload =
        row.extracted_summary && typeof row.extracted_summary.intakePayload === "object"
          ? (row.extracted_summary.intakePayload as Record<string, unknown>)
          : null;

      return {
        analysisRunId: row.analysis_run_id,
        sourceDocumentId: row.source_document_id,
        documentName: row.source_file_name ?? "Uploaded Document",
        documentType: row.detected_document_type ?? "Unknown",
        status: row.analysis_status,
        confidence: row.overall_confidence ?? "0.00",
        proposedTarget: String(row.extracted_summary?.proposedTarget ?? "pending review"),
        financeInterpretation: String(
          row.extracted_summary?.financeInterpretation ?? "Awaiting finance interpretation."
        ),
        createdAt: formatDateLabel(row.created_at),
        uploaderName: row.uploader_name,
        workflowContext: row.workflow_context ?? "documents",
        previewDataUrl: preview.previewDataUrl,
        previewMimeType: preview.previewMimeType,
        originSource: String(row.extracted_summary?.originSource ?? row.metadata?.source_system ?? "portal_upload"),
        originCountry: String(row.extracted_summary?.originCountry ?? "Unknown"),
        currencyCode: String(row.extracted_summary?.currencyCode ?? "Unknown"),
        issuerCountry: String(row.extracted_summary?.issuerCountry ?? "Unknown"),
        intakeCategory: String(intakePayload?.label ?? "Unmapped"),
        intakeFields: parseIntakeFields(row.extracted_summary),
        platformUpdates: parsePlatformUpdates(row.extracted_summary)
      } satisfies DocumentDetailRow;
    }
  }

  return null;
}

export async function getDocumentExtractedFields(analysisRunId?: string) {
  if (getBackend() === "database") {
    const rows = await queryRows<{
      field_label: string;
      normalized_value: string | null;
      confidence: string | null;
      approval_status: string;
    }>(
      `select field_label, normalized_value, confidence::text, approval_status
       from document_extracted_fields
       where ($1::uuid is null or analysis_run_id = $1::uuid)
       order by created_at desc
       limit 20`,
      [analysisRunId ?? null]
    );

    if (rows.length > 0) {
      return rows.map((row: DocumentFieldSource) => ({
        field: row.field_label,
        proposedValue: row.normalized_value ?? "Pending extraction",
        confidence: row.confidence ?? "0.00",
        approval: row.approval_status
      }));
    }
  }

  return [...documentExtractedFields];
}

export async function getDocumentPostingEvents(analysisRunId?: string) {
  if (getBackend() === "database") {
    const rows = await queryRows<{
      canonical_target_table: string;
      posting_status: string;
      posting_summary: string | null;
    }>(
      `select canonical_target_table, posting_status, posting_summary
       from document_posting_events
       where ($1::uuid is null or analysis_run_id = $1::uuid)
       order by created_at desc
       limit 10`,
      [analysisRunId ?? null]
    );

    if (rows.length > 0) {
      return rows.map((row: DocumentPostingSource) => ({
        target: row.canonical_target_table,
        status: row.posting_status,
        summary: row.posting_summary ?? "Awaiting posting summary"
      }));
    }
  }

  return [...documentPostingEvents];
}

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

export async function getTeamStructureSnapshot() {
  if (getBackend() === "database") {
    const rows = await queryRows<TeamSnapshotSource>(
      `select
         t.team_name,
         count(distinct tm.app_user_id)::text as member_count,
         count(distinct es.id) filter (where es.submission_status in ('submitted', 'in_review'))::text as open_submission_count
       from app_teams t
       left join team_memberships tm on tm.team_id = t.id
       left join expense_submission_items esi on esi.team_id = t.id
       left join expense_submissions es on es.id = esi.submission_id
       group by t.id, t.team_name
       order by t.team_name`
    );

    return rows.map((row) => ({
      teamName: row.team_name,
      members: row.member_count,
      openSubmissions: row.open_submission_count
    })) satisfies TeamSnapshotRow[];
  }

  return [] satisfies TeamSnapshotRow[];
}

export async function getExpenseFormOptions() {
  if (getBackend() === "database") {
    const [raceRows, teamRows, categoryRows] = await Promise.all([
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
      )
    ]);

    return {
      races: raceRows satisfies ExpenseFormOption[],
      teams: teamRows satisfies ExpenseFormOption[],
      categories: categoryRows satisfies ExpenseFormOption[]
    };
  }

  return {
    races: [] satisfies ExpenseFormOption[],
    teams: [] satisfies ExpenseFormOption[],
    categories: [] satisfies ExpenseFormOption[]
  };
}

export async function getInvoiceWorkflowSummary() {
  if (getBackend() === "database") {
    const rows = await queryRows<InvoiceWorkflowSummarySource>(
      `select
         count(*) filter (where intake_status in ('submitted', 'in_review'))::text as pending_count,
         count(*) filter (where intake_status = 'posted')::text as posted_count,
         coalesce(sum(total_amount) filter (where intake_status in ('submitted', 'in_review')), 0)::text as total_open_amount
       from invoice_intakes`
    );

    if (rows[0]) {
      return [
        {
          label: "Pending invoices",
          value: rows[0].pending_count,
          detail: "Invoice intakes waiting on finance action."
        },
        {
          label: "Posted invoices",
          value: rows[0].posted_count,
          detail: "Invoice intakes already posted into canonical payables."
        },
        {
          label: "Open payable amount",
          value: formatCurrency(rows[0].total_open_amount),
          detail: "Amount sitting in submitted or in-review invoice workflow."
        }
      ] satisfies InvoiceWorkflowSummaryRow[];
    }
  }

  return [
    { label: "Pending invoices", value: "0", detail: "Invoice intakes waiting on finance action." },
    { label: "Posted invoices", value: "0", detail: "Invoice intakes already posted into canonical payables." },
    { label: "Open payable amount", value: formatCurrency(0), detail: "Amount sitting in submitted or in-review invoice workflow." }
  ];
}

export async function getInvoiceApprovalQueue() {
  if (getBackend() === "database") {
    const rows = await queryRows<InvoiceQueueSource>(
      `select
         ii.id,
         ii.vendor_name,
         ii.invoice_number,
         re.name as race_name,
         ii.due_date::text,
         ii.total_amount::text,
         ii.intake_status,
         es.submission_title as linked_submission_title
       from invoice_intakes ii
       left join expense_submissions es on es.id = ii.linked_submission_id
       left join race_events re on re.id = ii.race_event_id
       order by ii.created_at desc
       limit 12`
    );

    return rows.map((row) => ({
      id: row.id,
      vendor: row.vendor_name,
      invoiceNumber: row.invoice_number ?? "Pending number",
      race: row.race_name ?? "Unassigned",
      dueDate: row.due_date ? formatDateLabel(row.due_date) : "TBD",
      totalAmount: formatCurrency(row.total_amount),
      status: row.intake_status,
      sourceLabel: row.linked_submission_title
    })) satisfies InvoiceQueueRow[];
  }

  return [] satisfies InvoiceQueueRow[];
}

export async function getTeamDirectory() {
  if (getBackend() === "database") {
    const rows = await queryRows<TeamDirectorySource>(
      `select
         t.id,
         t.team_name,
         t.team_code,
         t.description,
         string_agg(distinct au.full_name, ', ' order by au.full_name) as member_names,
         count(distinct tm.app_user_id)::text as membership_count
       from app_teams t
       left join team_memberships tm on tm.team_id = t.id
       left join app_users au on au.id = tm.app_user_id
       group by t.id
       order by t.team_name`
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.team_name,
      code: row.team_code,
      description: row.description ?? "No team description yet.",
      members: row.member_names ?? "No members assigned",
      membershipCount: row.membership_count
    })) satisfies TeamDirectoryRow[];
  }

  return [] satisfies TeamDirectoryRow[];
}

export async function getUserOptions() {
  if (getBackend() === "database") {
    const rows = await queryRows<UserOptionSource>(
      `select id, full_name, role::text as role
       from app_users
       where is_active = true
       order by full_name`
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.full_name,
      role: row.role
    })) satisfies UserOptionRow[];
  }

  return [] satisfies UserOptionRow[];
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

export function getDataBackendStatus() {
  return {
    backend: getBackend(),
    databaseConfigured: isDatabaseConfigured()
  } as const;
}
