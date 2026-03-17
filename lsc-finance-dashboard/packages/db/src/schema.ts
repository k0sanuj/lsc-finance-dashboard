export type CompanyCode = "LSC" | "TBR" | "FSP";

export type CanonicalTable =
  | "companies"
  | "sponsors_or_customers"
  | "owners"
  | "contracts"
  | "revenue_records"
  | "invoices"
  | "payments"
  | "expenses"
  | "race_events"
  | "cost_categories"
  | "commercial_targets"
  | "source_documents"
  | "import_batches"
  | "raw_import_rows";

export const canonicalTables: CanonicalTable[] = [
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
  "raw_import_rows"
];

export const coreViews = [
  "consolidated_company_metrics",
  "monthly_financial_summary",
  "receivables_aging",
  "payments_due",
  "tbr_race_cost_summary",
  "tbr_sponsor_revenue_summary",
  "commercial_goal_progress",
  "partner_performance"
] as const;
