# Source Maps

## Purpose

This file maps expected source data inputs into canonical entities and derived outcomes. It is the bridge between messy source data and the living dashboard.

## Mapping Rules

1. Never map raw sheet columns directly into UI components.
2. Always define the canonical target table first.
3. Preserve source row identity and import metadata.
4. Normalize names for races, sponsors, vendors, and categories.

## Initial Source Set

### 1. TBR Sponsor Revenue Sheet

Expected contents:

- sponsor name
- contract value
- invoice schedule
- cash received
- recognized revenue
- start date
- end date
- sponsorship category
- owner

Canonical targets:

- sponsors_or_customers
- contracts
- revenue_records
- invoices
- payments
- owners

### 2. TBR Event Invoice Sheet

Expected contents:

- race name
- invoice type
- vendor or issuer
- fee category
- invoice amount
- due date
- payment status

Canonical targets:

- race_events
- invoices
- expenses
- cost_categories
- payments

### 3. TBR Personal Expense Reimbursement Sheet

Expected contents:

- person
- race
- category
- amount
- date
- notes
- receipt or report reference
- reimbursement status

Canonical targets:

- race_events
- expenses
- cost_categories
- source_documents
- payments

### 4. Cash Movement / Bank Ledger

Expected contents:

- date
- amount
- direction
- description
- related invoice or payment
- account

Canonical targets:

- payments
- invoices where linkable
- revenue_records where linkable
- expenses where linkable

### 5. Receivables Sheet

Expected contents:

- sponsor or customer
- invoice number
- issue date
- due date
- amount
- collected amount
- outstanding amount
- status

Canonical targets:

- sponsors_or_customers
- invoices
- payments

### 6. Commercial Targets Sheet

Expected contents:

- month
- target revenue
- sponsorship target
- sponsor count target
- owner target

Canonical targets:

- commercial_targets
- owners

## Normalization Rules

Normalize these value groups early:

- race names
- sponsor names
- vendor names
- cost category names
- owner names
- currency values
- date formats

## Open Mapping Decisions

These decisions should be finalized during implementation:

- revenue recognition policy by contract type
- how race-level revenue should be attributed
- owner attribution policy for commercial performance
- whether reimbursements become expenses at submission or approval
