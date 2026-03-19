/**
 * LSC Finance Dashboard — Entity Relations
 *
 * Defines all relationships between canonical entities.
 * Used by the cascade engine to know what to propagate.
 */

export type RelationType = "one-to-many" | "many-to-one" | "one-to-one";

export type Relation = {
  from: string;
  to: string;
  type: RelationType;
  foreignKey: string;
  description: string;
};

export const RELATIONS: Relation[] = [
  // Company is the root entity
  { from: "companies", to: "sponsors_or_customers", type: "one-to-many", foreignKey: "company_id", description: "Company has many sponsors/customers" },
  { from: "companies", to: "owners", type: "one-to-many", foreignKey: "company_id", description: "Company has many owners" },
  { from: "companies", to: "race_events", type: "one-to-many", foreignKey: "company_id", description: "Company has many race events" },
  { from: "companies", to: "cost_categories", type: "one-to-many", foreignKey: "company_id", description: "Company has many cost categories" },
  { from: "companies", to: "contracts", type: "one-to-many", foreignKey: "company_id", description: "Company has many contracts" },
  { from: "companies", to: "invoices", type: "one-to-many", foreignKey: "company_id", description: "Company has many invoices" },
  { from: "companies", to: "payments", type: "one-to-many", foreignKey: "company_id", description: "Company has many payments" },
  { from: "companies", to: "expenses", type: "one-to-many", foreignKey: "company_id", description: "Company has many expenses" },
  { from: "companies", to: "revenue_records", type: "one-to-many", foreignKey: "company_id", description: "Company has many revenue records" },
  { from: "companies", to: "commercial_targets", type: "one-to-many", foreignKey: "company_id", description: "Company has many commercial targets" },
  { from: "companies", to: "expense_submissions", type: "one-to-many", foreignKey: "company_id", description: "Company has many expense submissions" },
  { from: "companies", to: "invoice_intakes", type: "one-to-many", foreignKey: "company_id", description: "Company has many invoice intakes" },

  // Contracts link sponsors to companies
  { from: "sponsors_or_customers", to: "contracts", type: "one-to-many", foreignKey: "sponsor_or_customer_id", description: "Sponsor has many contracts" },
  { from: "contracts", to: "invoices", type: "one-to-many", foreignKey: "contract_id", description: "Contract has many invoices" },
  { from: "contracts", to: "revenue_records", type: "one-to-many", foreignKey: "contract_id", description: "Contract has many revenue records" },

  // Race events as cost/revenue centers
  { from: "race_events", to: "invoices", type: "one-to-many", foreignKey: "race_event_id", description: "Race has many invoices" },
  { from: "race_events", to: "expenses", type: "one-to-many", foreignKey: "race_event_id", description: "Race has many expenses" },
  { from: "race_events", to: "revenue_records", type: "one-to-many", foreignKey: "race_event_id", description: "Race has many revenue records" },
  { from: "race_events", to: "expense_submissions", type: "one-to-many", foreignKey: "race_event_id", description: "Race has many expense submissions" },
  { from: "race_events", to: "invoice_intakes", type: "one-to-many", foreignKey: "race_event_id", description: "Race has many invoice intakes" },
  { from: "race_events", to: "race_budget_rules", type: "one-to-many", foreignKey: "race_event_id", description: "Race has many budget rules" },

  // Cost categories
  { from: "cost_categories", to: "expenses", type: "one-to-many", foreignKey: "cost_category_id", description: "Category has many expenses" },
  { from: "cost_categories", to: "expense_submission_items", type: "one-to-many", foreignKey: "cost_category_id", description: "Category has many submission items" },
  { from: "cost_categories", to: "race_budget_rules", type: "one-to-many", foreignKey: "cost_category_id", description: "Category has many budget rules" },

  // Invoice → Payment chain
  { from: "invoices", to: "payments", type: "one-to-many", foreignKey: "invoice_id", description: "Invoice has many payments" },
  { from: "invoices", to: "expenses", type: "one-to-many", foreignKey: "invoice_id", description: "Invoice has many linked expenses" },

  // Expense submissions workflow
  { from: "expense_submissions", to: "expense_submission_items", type: "one-to-many", foreignKey: "submission_id", description: "Submission has many items" },
  { from: "expense_submission_items", to: "expense_item_splits", type: "one-to-many", foreignKey: "expense_submission_item_id", description: "Item has many splits" },
  { from: "expense_submissions", to: "invoice_intakes", type: "one-to-one", foreignKey: "linked_submission_id", description: "Submission links to reimbursement invoice" },

  // Document intelligence chain
  { from: "source_documents", to: "document_analysis_runs", type: "one-to-many", foreignKey: "source_document_id", description: "Document has many analysis runs" },
  { from: "document_analysis_runs", to: "document_extracted_fields", type: "one-to-many", foreignKey: "analysis_run_id", description: "Run has many extracted fields" },
  { from: "document_analysis_runs", to: "document_posting_events", type: "one-to-many", foreignKey: "analysis_run_id", description: "Run has many posting events" },
  { from: "document_analysis_runs", to: "document_intake_events", type: "one-to-many", foreignKey: "analysis_run_id", description: "Run has many intake events" },

  // Import lineage
  { from: "import_batches", to: "raw_import_rows", type: "one-to-many", foreignKey: "import_batch_id", description: "Batch has many raw rows" },
  { from: "source_documents", to: "raw_import_rows", type: "one-to-many", foreignKey: "source_document_id", description: "Document has many raw rows" },

  // Auth & teams
  { from: "companies", to: "app_teams", type: "one-to-many", foreignKey: "company_id", description: "Company has many teams" },
  { from: "app_teams", to: "team_memberships", type: "one-to-many", foreignKey: "team_id", description: "Team has many memberships" },
  { from: "app_users", to: "team_memberships", type: "one-to-many", foreignKey: "app_user_id", description: "User has many team memberships" },
  { from: "app_users", to: "expense_submissions", type: "one-to-many", foreignKey: "submitted_by_user_id", description: "User submits many expenses" },
  { from: "app_users", to: "invoice_intakes", type: "one-to-many", foreignKey: "submitted_by_user_id", description: "User submits many invoices" },

  // Owners
  { from: "owners", to: "contracts", type: "one-to-many", foreignKey: "owner_id", description: "Owner manages many contracts" },
  { from: "owners", to: "invoices", type: "one-to-many", foreignKey: "owner_id", description: "Owner owns many invoices" },
  { from: "owners", to: "expenses", type: "one-to-many", foreignKey: "owner_id", description: "Owner owns many expenses" },
  { from: "owners", to: "revenue_records", type: "one-to-many", foreignKey: "owner_id", description: "Owner owns many revenue records" },
  { from: "owners", to: "commercial_targets", type: "one-to-many", foreignKey: "owner_id", description: "Owner owns many targets" },
];

/**
 * Get all relations where a given table is the source (parent)
 */
export function getChildRelations(table: string): Relation[] {
  return RELATIONS.filter((r) => r.from === table);
}

/**
 * Get all relations where a given table is the target (child)
 */
export function getParentRelations(table: string): Relation[] {
  return RELATIONS.filter((r) => r.to === table);
}

/**
 * Get all tables directly related to a given table
 */
export function getRelatedTables(table: string): string[] {
  const related = new Set<string>();
  for (const r of RELATIONS) {
    if (r.from === table) related.add(r.to);
    if (r.to === table) related.add(r.from);
  }
  return [...related];
}
