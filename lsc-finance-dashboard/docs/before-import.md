# Before Import

## Goal

This document defines the minimum safe process before importing confidential financial data.

## Step 1: Prepare Safe Input Storage

Raw imports should live only in local ignored folders such as:

- `imports/raw/`

Sanitized fixtures for development can live in:

- `imports/sanitized-fixtures/`

Do not commit raw sponsor, invoice, or reimbursement files.

## Step 2: Normalize Sensitive Inputs

Before loading a source file, confirm:

- company ownership is known
- race names are normalized
- sponsor names are normalized
- cost categories are normalized
- dates are consistent
- currencies are consistent

## Step 3: Preserve Lineage

Every imported file or row must keep:

- source system
- source file or sheet name
- source row identifier
- import timestamp
- import batch identifier

## Step 4: Keep Roles Separate

Use:

- migration/admin role for schema changes
- read role for dashboard queries
- import role for loading source data

Do not use the owner role for normal app execution.

## Step 5: Verify Data Exposure Boundaries

Before import, confirm:

- app is not publicly deployed
- screenshots or logs do not expose raw data
- no client-side component receives secrets
- no export or temp files are being synced to public folders

## Step 6: Test With Sanitized Samples First

Always run the import logic against sanitized or fake records before loading real sponsor or payment data.

## Step 7: Import In This Order

Recommended first import order:

1. companies and reference tables
2. race events
3. cost categories
4. sponsors or customers
5. contracts
6. invoices
7. payments
8. expenses
9. revenue records
10. commercial targets

## Step 8: Post-Import Verification

After import, check:

- row counts
- receivables totals
- payment due totals
- sponsor counts
- race counts
- dashboard values for obvious anomalies

## Rule

If the data source is unclear or the metric mapping is ambiguous, stop and update the source map before importing.
