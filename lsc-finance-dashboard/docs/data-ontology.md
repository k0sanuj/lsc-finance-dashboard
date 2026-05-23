# Data Ontology

## Purpose

The dashboard should operate on canonical business entities and relationships rather than raw sheet columns. This file defines the first-pass ontology.

## Modeling Principles

1. Raw imported data is not the domain model.
2. Canonical entities should map to real business concepts.
3. Derived metrics should be computed from canonical entities.
4. Lineage must be preserved from source to canonical record.
5. The same concept should have one canonical representation.

## Core Entities

### Company

Represents a top-level business entity or reporting entity.

Examples:

- LSC
- TBR
- FSP
- XTZ

### Business Unit

Optional sub-entity used if a company requires internal segmentation.

### SponsorOrCustomer

Represents a commercial counterparty.

Examples:

- sponsor for TBR
- subscriber customer group for FSP
- corporate partner

### Contract

Represents a commercial agreement that can generate revenue obligations, billing, or recurring relationships.

Contract records should remain traceable to the uploaded or manually-created `source_document` that established the agreement.

### RevenueRecord

Represents a recognized revenue event tied to an entity, counterparty, contract, and revenue type.

### Invoice

Represents a billing document, either issued outward or received inward.

Recommended first distinction:

- receivable invoice
- payable invoice

### Payment

Represents actual movement of cash tied to invoice settlement, reimbursement, or standalone movement.

### Expense

Represents an approved spend record.

Expense should be linkable to:

- company
- category
- race event if applicable
- vendor if applicable
- invoice if applicable
- payment if applicable

### RaceEvent

Represents a TBR operating event or race.

This is a first-class entity because race-level reporting is a core requirement.

### CostCategory

Represents a normalized cost bucket.

Examples:

- licensing fee
- catering
- travel
- visa
- VIP passes
- foil damage
- accommodation
- equipment
- software
- hosting

### CommercialTarget

Represents a target amount or count for sponsorship or revenue performance in a period.

### Owner

Represents a responsible person such as a commercial owner or budget owner.

### SourceDocument

Represents the original sheet, file, invoice, or expense report source.

This can also represent a controlled manual entry when no external file exists, as long as the entry remains reviewable and traceable.

### DocumentAnalysisRun

Represents one AI-assisted analysis pass over an uploaded source document.

### DocumentExtractedField

Represents one extracted field proposed by the analyzer and later approved, corrected, or rejected by a human reviewer.

### DocumentPostingEvent

Represents the posting of approved extracted data into canonical finance tables.

### AiIntakeDraft

Represents the shared approval object for AI-assisted source intake. A draft is created from either an uploaded file or typed/pasted source text and targets one approved canonical posting family such as vendor invoice, expense receipt, reimbursement bundle, sponsorship document, FSP media kit, FSP sponsorship document, or XTZ India payroll/vendor support.

### AiIntakeDraftField

Represents one AI-extracted field with both the extracted value and the human-editable preview value. Canonical posting must use the approved preview value.

### AiIntakePostingEvent

Represents the bridge from an approved AI intake draft to the canonical table and record that were created or updated.

### ImportBatch

Represents a specific import operation and preserves operational lineage.

### FinanceReportingExclusion

Represents a preserved source or canonical row that must be excluded from default reporting, usually because it is QA/test data or an intentionally quarantined artifact. Exclusions never delete the source row; they add reporting metadata with reason, source table, source id, quarantine timestamp, and reviewer notes.

### FinanceRecognitionByEntity

Represents the shared backend recognition contract used by entity dashboards. It separates actual revenue/cost/cash, committed payables/receivables, planning/scenario values, and quarantined/excluded values so dashboards do not infer finance treatment from raw status text.

### FinancePnlScenario

Represents one P&L scenario for an entity, sport, or future asset. Scenario types include actual, management, forecast, budget, and sensitivity. A scenario owns ordered P&L periods, assumptions, and line items.

### FinancePnlPeriod

Represents a P&L reporting column such as TBR Season 1, Season 2, Season 3 management forecast, an FSP planning year, or an XTZ recognition period.

### FinancePnlLineItem

Represents one source-backed P&L statement row. It stores section, display order, source amount and currency, FX, USD reporting amount, data status, source module, source document, import batch, notes, and include/exclude treatment.

### FinancePnlAssumption

Represents editable assumptions behind a scenario, including prize pool cases, FX rates, bonus scenarios, and future sensitivity inputs.

### AgentMutationIdempotency

Represents one approved mutating agent skill execution. It stores the agent id, skill, idempotency key, request payload, resulting entity, and success/failure status so retried agent actions cannot double-post canonical finance rows.

### CascadeActionEvent

Represents one downstream cascade action emitted after a canonical mutation, including audit lineage update, analyzer queue, notification queue, or skipped live-view refresh.

### TbrSeason

Represents a TBR operating season used for season-level financial control, E1 accounting, and overall P&L reporting.

### TbrOperatingExpenseLine

Represents a season-control operating expense line from the TBR Financial Plan or a controlled manual entry. These lines are reporting baselines and control facts; they are not generic transaction-level `expenses` unless separately supported by invoice or reimbursement proof.

### TbrE1AccountingLine

Represents an E1 invoice, credit note, due item, contingent item, or explicit source check from the E1 payment summary workbook.

E1 accounting lines can be edited from the platform after import. The row remains the canonical E1 control record, and platform edits must preserve source amount, currency, USD reporting amount, invoice status, P&L treatment, notes, and source document lineage.

### TbrE1InvoiceTracker

Represents a derived invoice-level dashboard grouped from `TbrE1AccountingLine` records by season and invoice number. It is not a duplicate ledger. Updating invoice status updates the underlying E1 rows, and cost-facing surfaces consume derived E1 cost views from those rows.

### TbrE1OperatingReconciliationLink

Represents the link between E1 accounting rows and matching operating expense baseline categories so that Overall P&L can apply the variance-only policy without double counting.

## Core Relationships

- company has many contracts
- company has many expenses
- company has many invoices
- contract belongs to company and sponsor or customer
- contract generates revenue records
- invoice may relate to contract
- invoice may settle through one or more payments
- expense may relate to invoice
- expense may relate to payment
- expense may relate to race event
- commercial target may relate to company and owner
- source document connects raw imports to canonical records
- document analysis run belongs to a source document
- extracted fields belong to an analysis run
- approved extracted fields can post into contracts, invoices, payments, expenses, or revenue records
- posting events preserve the bridge from approved document facts to canonical records
- AI intake draft belongs to a source document and company
- AI intake draft fields belong to one AI intake draft
- AI intake posting events preserve the bridge from approved preview fields to canonical records
- finance reporting exclusions mark source rows as preserved but excluded from default finance views
- finance recognition views consume canonical records plus quarantine metadata and expose entity-ready recognition buckets
- P&L scenarios have many P&L periods, assumptions, and line items
- P&L line items link back to source documents, import batches, raw rows, and the canonical module that produced them
- entity and sport pages consume P&L statement views; source/detail modules remain the operational owners
- mutating agent skill runs create idempotency, audit, and cascade action records
- TBR seasons have many operating expense control lines
- TBR seasons have many E1 accounting lines
- E1 accounting lines group into derived invoice tracker rows by season and invoice number
- E1 accounting lines may reconcile to operating expense baseline lines by category, race, and source-document lineage
- E1 accounting lines may link to invoice source documents through `source_documents`

## Data Layers

### 1. Raw Layer

Stores imported rows and source metadata exactly as received.

### 2. Canonical Layer

Stores normalized business entities and transaction-like facts.

### 3. Derived Layer

Stores SQL views or materialized summaries for reporting and AI analysis.

### 4. Application Layer

Exposes filtered views, APIs, and page-level read models.

## First-Pass Canonical Tables

- companies
- sponsors_or_customers
- owners
- contracts
- revenue_records
- invoices
- payments
- expenses
- race_events
- cost_categories
- commercial_targets
- source_documents
- document_analysis_runs
- document_extracted_fields
- document_posting_events
- ai_intake_drafts
- ai_intake_draft_fields
- ai_intake_posting_events
- finance_reporting_exclusions
- agent_mutation_idempotency
- outbound_notifications
- cascade_action_events
- import_batches
- raw_import_rows
- tbr_seasons
- tbr_operating_expense_lines
- tbr_e1_accounting_lines
- tbr_e1_operating_reconciliation_links

## Derived View Candidates

- consolidated_company_metrics
- monthly_financial_summary
- receivables_aging
- payments_due
- tbr_race_cost_summary
- tbr_sponsor_revenue_summary
- commercial_goal_progress
- partner_performance
- tbr_operating_expense_summary_by_season
- tbr_operating_expense_by_race
- tbr_operating_expense_by_category
- tbr_e1_accounting_status_by_season
- tbr_e1_reconciliation_view
- tbr_overall_pnl_by_season
- finance_recognition_by_entity
- finance_reporting_exclusion_summary
- fsp_consolidation_eligible_actuals

## Current Ontology Notes

- TBR is the main active operating entity for v1.
- FSP is a visible portfolio entity. Its sport scenario/planning values are entity-local until explicitly approved as consolidation-eligible actuals.
- XTZ is a visible India operating/payroll/vendor entity. XTZ invoice status drives committed payable, paid cost, and XTZ revenue recognition by status.
- Race events are central to TBR reporting and should not be treated as optional tags.
- TBR Financial Plan summary rows live in season-control tables, not the generic expense ledger.
- Overall TBR P&L applies a variance-only E1 reconciliation policy: operating baseline counts once, matched E1 overlap rows are visible in E1 Accounting, only positive E1 variance above the matched baseline flows into P&L, and non-overlapping confirmed E1 obligations count as incremental cost.
- Legacy entity aliases normalize internally to LSC/Dubai compatibility reads and must not appear in visible navigation, prompts, or new writes.
- The same sponsor should not be duplicated across sheets if it can be mapped to one canonical sponsor entity.
