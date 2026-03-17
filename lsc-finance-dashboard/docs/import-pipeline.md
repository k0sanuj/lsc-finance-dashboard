# Import Pipeline

## Goal

This project imports confidential finance data in two stages:

1. raw ingestion with lineage
2. canonical normalization

The current implementation covers secure raw ingestion first.

## Current Secure Pattern

The importers:

- read a local manifest
- read a local source file
- connects using the `lsc_import_rw` role
- creates or updates a `source_document`
- creates an `import_batch`
- writes each source row into `raw_import_rows`
- preserves row-level lineage

## Commands

```bash
npm run import:csv -- imports/manifests/tbr-sponsor-revenue.sample.json
npm run import:xlsx -- imports/manifests/tbr-bootstrap-workbooks.json
```

## Manifest Fields

CSV manifest required fields:

- `name`
- `companyCode`
- `sourceSystem`
- `sourceName`
- `documentType`
- `csvPath`

Optional:

- `sourceIdentifier`
- `rowKeyColumn`
- `canonicalTargetTable`

XLSX manifest required fields:

- `name`
- `companyCode`
- `sourceSystem`
- `workbooks`

Per-workbook fields:

- `workbookPath`
- `includeSheets`

Per-workbook optional fields:

- `documentType`
- `canonicalTargetTable`
- `rowKeyColumn`
- `tags`
- `sheetOptions`
  - `headerRowIndex`
  - `maxHeaderScanRows`
  - `minHeaderColumns`

## Security Rules

- use only local ignored raw files
- use the import role, not the admin role
- keep manifests free of secrets
- do not commit real CSV source files
- test first with sanitized fixtures

## Current Limitation

These importers currently write to:

- `source_documents`
- `import_batches`
- `raw_import_rows`

It does not yet normalize into canonical tables. That is the next step after you validate the incoming source structures.

## First Workbook Run

The first production-style workbook import for the uploaded TBR source files is recorded in:

- [initial-ingestion-summary.md](/Users/anujsingh/Documents/Playground/lsc-finance-dashboard/docs/initial-ingestion-summary.md)
