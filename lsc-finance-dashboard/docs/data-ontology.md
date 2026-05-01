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
- import_batches
- raw_import_rows

## Derived View Candidates

- consolidated_company_metrics
- monthly_financial_summary
- receivables_aging
- payments_due
- tbr_race_cost_summary
- tbr_sponsor_revenue_summary
- commercial_goal_progress
- partner_performance

## Current Ontology Notes

- TBR is the main active operating entity for v1.
- FSP should exist in the ontology even if it is mostly unpopulated.
- Race events are central to TBR reporting and should not be treated as optional tags.
- The same sponsor should not be duplicated across sheets if it can be mapped to one canonical sponsor entity.
