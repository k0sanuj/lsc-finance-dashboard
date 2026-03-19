/**
 * LSC Finance Dashboard — Ontology Schema
 *
 * Single source of truth for all database entities.
 * Mirrors the SQL schema (001-014) as TypeScript types with
 * Drizzle-compatible column definitions for future migration.
 *
 * Current database uses raw `pg` queries, so this module provides:
 * 1. Canonical type definitions for every table
 * 2. Enum definitions matching Postgres enums
 * 3. Table metadata (name, columns, constraints)
 */

// ─── Enums ─────────────────────────────────────────────────

export const CompanyCode = {
  LSC: "LSC",
  TBR: "TBR",
  FSP: "FSP",
} as const;
export type CompanyCode = (typeof CompanyCode)[keyof typeof CompanyCode];

export const InvoiceDirection = {
  Receivable: "receivable",
  Payable: "payable",
} as const;
export type InvoiceDirection = (typeof InvoiceDirection)[keyof typeof InvoiceDirection];

export const InvoiceStatus = {
  Draft: "draft",
  Issued: "issued",
  PartiallyPaid: "partially_paid",
  Paid: "paid",
  Overdue: "overdue",
  Void: "void",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentDirection = {
  Inflow: "inflow",
  Outflow: "outflow",
} as const;
export type PaymentDirection = (typeof PaymentDirection)[keyof typeof PaymentDirection];

export const PaymentStatus = {
  Planned: "planned",
  Scheduled: "scheduled",
  Settled: "settled",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const ExpenseStatus = {
  Submitted: "submitted",
  Approved: "approved",
  Paid: "paid",
  Rejected: "rejected",
} as const;
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

export const ContractStatus = {
  Draft: "draft",
  Active: "active",
  Completed: "completed",
  Cancelled: "cancelled",
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

export const RevenueType = {
  Sponsorship: "sponsorship",
  PrizeMoney: "prize_money",
  Subscription: "subscription",
  Other: "other",
} as const;
export type RevenueType = (typeof RevenueType)[keyof typeof RevenueType];

export const SourceDocumentType = {
  SheetRow: "sheet_row",
  InvoiceFile: "invoice_file",
  ExpenseReport: "expense_report",
  ManualUpload: "manual_upload",
} as const;
export type SourceDocumentType = (typeof SourceDocumentType)[keyof typeof SourceDocumentType];

export const AppUserRole = {
  SuperAdmin: "super_admin",
  FinanceAdmin: "finance_admin",
  TeamMember: "team_member",
  CommercialUser: "commercial_user",
  Viewer: "viewer",
} as const;
export type AppUserRole = (typeof AppUserRole)[keyof typeof AppUserRole];

export const ExpenseSubmissionStatus = {
  Draft: "draft",
  Submitted: "submitted",
  InReview: "in_review",
  NeedsClarification: "needs_clarification",
  Approved: "approved",
  Rejected: "rejected",
  Posted: "posted",
} as const;
export type ExpenseSubmissionStatus = (typeof ExpenseSubmissionStatus)[keyof typeof ExpenseSubmissionStatus];

export const ExpenseSplitMethod = {
  Solo: "solo",
  Equal: "equal",
  Custom: "custom",
} as const;
export type ExpenseSplitMethod = (typeof ExpenseSplitMethod)[keyof typeof ExpenseSplitMethod];

export const InvoiceIntakeStatus = {
  Draft: "draft",
  Submitted: "submitted",
  InReview: "in_review",
  Approved: "approved",
  Rejected: "rejected",
  Posted: "posted",
} as const;
export type InvoiceIntakeStatus = (typeof InvoiceIntakeStatus)[keyof typeof InvoiceIntakeStatus];

export const RaceBudgetRuleKind = {
  PerDiem: "per_diem",
  BudgetCap: "budget_cap",
  ApprovedCharge: "approved_charge",
} as const;
export type RaceBudgetRuleKind = (typeof RaceBudgetRuleKind)[keyof typeof RaceBudgetRuleKind];

export const BudgetRuleUnit = {
  PerDay: "per_day",
  PerPerson: "per_person",
  PerRace: "per_race",
  Total: "total",
} as const;
export type BudgetRuleUnit = (typeof BudgetRuleUnit)[keyof typeof BudgetRuleUnit];

// ─── Entity Types ──────────────────────────────────────────

export type Company = {
  id: string;
  code: CompanyCode;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SponsorOrCustomer = {
  id: string;
  companyId: string | null;
  name: string;
  normalizedName: string;
  counterpartyType: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Owner = {
  id: string;
  companyId: string | null;
  name: string;
  email: string | null;
  role: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RaceEvent = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  location: string | null;
  eventStartDate: string | null;
  eventEndDate: string | null;
  seasonYear: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CostCategory = {
  id: string;
  companyId: string | null;
  code: string;
  name: string;
  parentCategoryId: string | null;
  categoryScope: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Contract = {
  id: string;
  companyId: string;
  sponsorOrCustomerId: string;
  ownerId: string | null;
  contractName: string;
  contractStatus: ContractStatus;
  contractValue: number;
  currencyCode: string;
  startDate: string | null;
  endDate: string | null;
  isRecurring: boolean;
  billingFrequency: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SourceDocument = {
  id: string;
  companyId: string | null;
  documentType: SourceDocumentType;
  sourceSystem: string;
  sourceIdentifier: string;
  sourceName: string | null;
  sourceUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type ImportBatch = {
  id: string;
  companyId: string | null;
  sourceSystem: string;
  sourceName: string;
  importedAt: Date;
  status: string;
  metadata: Record<string, unknown>;
};

export type RawImportRow = {
  id: string;
  importBatchId: string;
  sourceDocumentId: string | null;
  sourceRowKey: string;
  payload: Record<string, unknown>;
  canonicalTargetTable: string | null;
  canonicalTargetId: string | null;
  createdAt: Date;
};

export type Invoice = {
  id: string;
  companyId: string;
  contractId: string | null;
  sponsorOrCustomerId: string | null;
  ownerId: string | null;
  raceEventId: string | null;
  sourceDocumentId: string | null;
  direction: InvoiceDirection;
  invoiceNumber: string | null;
  invoiceStatus: InvoiceStatus;
  issueDate: string | null;
  dueDate: string | null;
  currencyCode: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Payment = {
  id: string;
  companyId: string;
  invoiceId: string | null;
  sourceDocumentId: string | null;
  direction: PaymentDirection;
  paymentStatus: PaymentStatus;
  paymentDate: string | null;
  dueDate: string | null;
  currencyCode: string;
  amount: number;
  paymentMethod: string | null;
  referenceNumber: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Expense = {
  id: string;
  companyId: string;
  invoiceId: string | null;
  paymentId: string | null;
  raceEventId: string | null;
  costCategoryId: string | null;
  ownerId: string | null;
  sourceDocumentId: string | null;
  vendorName: string | null;
  expenseStatus: ExpenseStatus;
  expenseDate: string | null;
  currencyCode: string;
  amount: number;
  description: string | null;
  isReimbursable: boolean;
  submittedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RevenueRecord = {
  id: string;
  companyId: string;
  contractId: string | null;
  invoiceId: string | null;
  sponsorOrCustomerId: string | null;
  ownerId: string | null;
  raceEventId: string | null;
  sourceDocumentId: string | null;
  revenueType: RevenueType;
  recognitionDate: string;
  currencyCode: string;
  amount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CommercialTarget = {
  id: string;
  companyId: string;
  ownerId: string | null;
  targetPeriodStart: string;
  targetPeriodEnd: string;
  targetType: string;
  targetLabel: string;
  targetValue: number;
  targetCount: number | null;
  currencyCode: string;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Auth & Teams ──────────────────────────────────────────

export type AppUser = {
  id: string;
  fullName: string;
  email: string;
  normalizedEmail: string;
  role: AppUserRole;
  passwordHash: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
};

export type AppTeam = {
  id: string;
  companyId: string;
  teamCode: string;
  teamName: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TeamMembership = {
  id: string;
  teamId: string;
  appUserId: string;
  membershipRole: "lead" | "member";
  createdAt: Date;
};

// ─── Document Intelligence ─────────────────────────────────

export type DocumentAnalysisRun = {
  id: string;
  sourceDocumentId: string;
  companyId: string;
  analyzerType: string | null;
  analysisStatus: string;
  sourceFileName: string | null;
  sourceFileType: string | null;
  detectedDocumentType: string | null;
  extractedSummary: Record<string, unknown> | null;
  overallConfidence: number | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentExtractedField = {
  id: string;
  analysisRunId: string;
  fieldKey: string;
  fieldLabel: string;
  extractedValue: unknown;
  normalizedValue: string | null;
  confidence: number | null;
  approvalStatus: string;
  canonicalTargetTable: string | null;
  canonicalTargetColumn: string | null;
  reviewerNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentPostingEvent = {
  id: string;
  analysisRunId: string;
  postingStatus: string;
  canonicalTargetTable: string | null;
  canonicalTargetId: string | null;
  postingSummary: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type DocumentIntakeEvent = {
  id: string;
  sourceDocumentId: string;
  analysisRunId: string;
  companyId: string;
  appUserId: string;
  sourceFileName: string | null;
  workflowContext: string | null;
  intakeStatus: string;
  intakeNote: string | null;
  createdAt: Date;
};

// ─── Expense Management ────────────────────────────────────

export type ExpenseSubmission = {
  id: string;
  companyId: string;
  raceEventId: string | null;
  submittedByUserId: string;
  reviewedByUserId: string | null;
  submissionStatus: ExpenseSubmissionStatus;
  submissionTitle: string;
  operatorNote: string | null;
  reviewNote: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExpenseSubmissionItem = {
  id: string;
  submissionId: string;
  sourceDocumentId: string | null;
  costCategoryId: string | null;
  teamId: string | null;
  linkedExpenseId: string | null;
  merchantName: string | null;
  description: string | null;
  expenseDate: string | null;
  currencyCode: string;
  amount: number;
  splitMethod: ExpenseSplitMethod;
  splitCount: number;
  aiSummary: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExpenseItemSplit = {
  id: string;
  expenseSubmissionItemId: string;
  appUserId: string | null;
  splitLabel: string | null;
  splitPercentage: number;
  splitAmount: number;
  createdAt: Date;
};

// ─── Invoice Workflow ──────────────────────────────────────

export type InvoiceIntake = {
  id: string;
  companyId: string;
  raceEventId: string | null;
  submittedByUserId: string;
  reviewedByUserId: string | null;
  sourceDocumentId: string | null;
  canonicalInvoiceId: string | null;
  linkedSubmissionId: string | null;
  intakeStatus: InvoiceIntakeStatus;
  vendorName: string | null;
  invoiceNumber: string | null;
  dueDate: string | null;
  currencyCode: string;
  totalAmount: number;
  categoryHint: string | null;
  operatorNote: string | null;
  reviewNote: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Race Budget Rules ─────────────────────────────────────

export type RaceBudgetRule = {
  id: string;
  raceEventId: string;
  costCategoryId: string;
  ruleKind: RaceBudgetRuleKind;
  unitLabel: BudgetRuleUnit;
  ruleLabel: string;
  approvedAmountUsd: number;
  closeThresholdRatio: number;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Table Registry ────────────────────────────────────────

export const CANONICAL_TABLES = [
  "companies",
  "sponsors_or_customers",
  "owners",
  "contracts",
  "revenue_records",
  "invoices",
  "payments",
  "expenses",
  "race_events",
  "cost_categories",
  "commercial_targets",
  "source_documents",
  "import_batches",
  "raw_import_rows",
  "app_users",
  "app_teams",
  "team_memberships",
  "document_analysis_runs",
  "document_extracted_fields",
  "document_posting_events",
  "document_intake_events",
  "expense_submissions",
  "expense_submission_items",
  "expense_item_splits",
  "invoice_intakes",
  "race_budget_rules",
] as const;

export type CanonicalTable = (typeof CANONICAL_TABLES)[number];

export const DERIVED_VIEWS = [
  "consolidated_company_metrics",
  "monthly_financial_summary",
  "receivables_aging",
  "payments_due",
  "tbr_race_cost_summary",
  "tbr_sponsor_revenue_summary",
  "commercial_goal_progress",
  "partner_performance",
] as const;

export type DerivedView = (typeof DERIVED_VIEWS)[number];
