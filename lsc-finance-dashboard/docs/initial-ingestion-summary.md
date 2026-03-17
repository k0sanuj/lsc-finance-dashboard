# Initial Ingestion Summary

## Scope

This summary records the first raw Excel ingestion run completed on March 11, 2026 for the approved TBR finance workbooks.

The imported workbook set follows the allowlist and ignore rules defined in:

- [source-audit.md](/Users/anujsingh/Documents/Playground/lsc-finance-dashboard/docs/source-audit.md)

## Result

The raw ingestion run completed successfully into Neon using the restricted `lsc_import_rw` role.

Database totals after the run:

- `source_documents`: `65`
- `import_batches`: `65`
- `raw_import_rows`: `953`

Important note:

- the totals above include the earlier sanitized sponsor sample import used to validate the CSV importer
- the workbook import itself contributed `64` sheet-level imports and `951` raw rows

## Workbook Coverage

| Workbook | Sheets Imported | Raw Rows |
| --- | ---: | ---: |
| `LSC - E1 Payments Summaries.xlsx` | 5 | 75 |
| `TBR Financial Plan_ 2024-25.xlsx` | 8 | 88 |
| `Reimbursement and Bill Reports - Jeddah S1.xlsx` | 4 | 57 |
| `Reimbursements and Bill Reports - Milan S1.xlsx` | 3 | 11 |
| `Reimbursements and Bills Report - Venice S1.xlsx` | 4 | 36 |
| `Reimbursements and Bill S2 Jeddah.xlsx` | 8 | 97 |
| `Reimbursements and Bill S2 DOha.xlsx` | 5 | 79 |
| `Reimbursements and Bill S2 Dubrovnik.xlsx` | 6 | 75 |
| `Reimbursements and Bill S2 Monaco.xlsx` | 7 | 133 |
| `Reimbursements and Bill S2 Lagos.xlsx` | 3 | 39 |
| `Reimbursements and Bill S2 Miami.xlsx` | 7 | 94 |
| `John Peeters Expense Report JP's Copy S2 2025 (1).xlsx` | 2 | 85 |
| `Sayan Expense Report .xlsx` | 2 | 82 |

## Current State

What is done:

- accepted sheets are ingested into the raw lineage layer
- known duplicate and weak sheets from the audit are excluded from the first-pass manifest
- workbook name and sheet name are preserved in raw row payloads and source document metadata
- each workbook is tagged by operating workflow, finance stream, record granularity, and source role

What is not done yet:

- raw rows are not yet normalized into canonical `expenses`, `invoices`, `payments`, `revenue_records`, or `contracts`
- race ordering and prize-money logic have not yet been materialized into reporting tables
- Google Sheets sync is not yet wired

The classification model used for future normalization is documented in:

- [source-operating-categorization.md](/Users/anujsingh/Documents/Playground/lsc-finance-dashboard/docs/source-operating-categorization.md)

## Next Step

The next build step should be canonical normalization for:

1. E1 payment summaries into `invoices` and `payments`
2. race expense reports into `expenses`
3. season-level finance plan sheets into control totals / validation tables

After that, the Overview, TBR, Costs, and Payments pages can start using real imported business data instead of mostly seeded placeholders.
