# Document Intelligence Spec

## Purpose

The dashboard should not rely on manual metric entry alone. Uploaded documents must become a source-backed truth layer that can be analyzed, reviewed, and posted into canonical finance records.

## Core Workflow

1. User uploads a finance document in the portal, or creates a controlled manual entry when no external document exists.
2. The app creates a `source_document`.
3. The app creates an `ai_intake_draft` for the selected canonical target.
4. The analyzer extracts proposed fields into `ai_intake_draft_fields`.
5. The user reviews, edits, approves, rejects, or discards the preview fields.
6. Approved fields are posted into canonical tables by the target-specific mapper.
7. An `ai_intake_posting_event` records what was posted and where.
8. A cascade audit log entry records draft creation, approval, rejection, discard, and canonical posting.

`document_analysis_runs`, `document_extracted_fields`, and `document_posting_events` remain as legacy document-intelligence history. New user-facing upload/type flows should use `ai_intake_drafts` first.

## Supported First Document Types

- sponsorship contract
- vendor payable invoice
- prize statement or award notice
- reimbursement report
- expense receipt bundle
- controlled manual finance entry
- FSP sport media kit
- FSP sport sponsorship document
- XTZ India payroll/vendor invoice support

## Required Extracted Fields By Type

### Sponsorship contract

- counterparty name
- contract value
- currency
- start date
- end date
- payment schedule
- owner
- revenue type

### Vendor invoice

- vendor name
- invoice number
- issue date
- due date
- currency
- amount
- category
- race link if applicable

### Prize statement

- counterparty
- event or basis
- amount
- currency
- recognition date

### Reimbursement report

- person
- merchant
- transaction date
- amount
- currency
- reimbursable status
- category

### Controlled manual finance entry

- finance fact type
- amount
- currency
- effective date
- counterparty or owner
- explanation of why manual entry is required
- reviewer
- required attachment if any exists

## Approval Rules

- nothing posts to canonical finance tables without user approval
- confidence should inform the UI but never replace approval
- edited fields must overwrite extracted values, not sit beside them ambiguously
- `ai_intake_draft_fields.preview_value` is the user-editable value that posts to canonical records
- manual entry must still create a `source_document` with `document_type = manual_upload`
- manual entry must require a reason and reviewer trail so it cannot bypass truth controls
- every posted canonical record must remain traceable to:
  - source document
  - AI intake draft
  - approved field set

## Truth Policy

- every finance fact must be backed by either:
  - an uploaded source document
  - or a controlled manual entry with explicit explanation and approval
- no revenue, expense, invoice, or payment should appear in canonical tables without a linked `source_document`
- document upload is the preferred path whenever a real contract, invoice, statement, or receipt exists
- manual entry is a fallback, not the default operating mode

## Canonical Posting Targets

- sponsorship contract -> `sponsors_or_customers`, `contracts`, `invoices`, `payments`, `revenue_records`
- vendor invoice -> `invoices`, `payments`, optionally `expenses`
- prize statement -> `revenue_records`
- expense receipt / reimbursement report -> `expense_submissions`, `expense_submission_items`
- FSP sport sponsorship document -> `fsp_sponsorships`
- FSP sport media kit -> `fsp_media_revenue_cpm` when CPM/impression fields are present
- XTZ India payroll/vendor support -> `software_expenses`, `reimbursement_items`, `provisions`, or payable `invoices` depending on approved section mapping

TBR race receipt drafts are a controlled exception to immediate posting: approval marks the receipt as ready for report grouping, then the report builder creates `expense_submissions` and `expense_submission_items` with source document and AI draft lineage.

The TBR invoice hub uses the shared AI draft queue for uploaded invoices. Approved vendor invoice drafts post directly to canonical payable `invoices` and planned `payments`; the manual payable queue remains available for non-document entries.

## UI Surface

The `Documents` page should show:

- user-specific recent uploads
- selected-run preview for receipt images when available
- bill-origin facts such as source, country, issuer country, and currency
- pending manual entries
- runs awaiting review
- extracted field table with confidence and approval state
- pending postings
- completed postings with canonical links

The same shared AI intake review surface should also be used by FSP sport modules and XTZ India expense/vendor-support modules. Direct DOM prefill without approval should be treated as legacy behavior.

Every upload attempt should create a visible intake event, even when the underlying document hash reuses an existing analysis run.

## AI Requirement

The analyzer should answer:

- what kind of document is this
- what finance facts are being proposed
- which fields are high confidence
- what canonical action this document implies

The analyzer should not auto-post without approval.

## Analyzer Context Chain

The analyzer must not receive only a file and a free-text note.

Every scan should carry a structured app context chain with:

- analysis version
- company code and company name
- actor role
- workflow kind and raw workflow context
- submission mode when relevant
- redirect path / operating surface
- race context when the upload happens inside a race workflow
- fallback hints for country and currency
- expected document types and preferred fields for that workflow

Context is a hint layer, not source evidence. If the document contradicts the app context, the document wins. If the document is ambiguous, the context chain can support conservative fallback logic.

The context signature should also participate in cache reuse so an old low-context analysis run is not silently reused in a different workflow.

## Provider UX Rule

- the platform should expose only one user action: `AI Analyze`
- the underlying provider remains a backend implementation detail
- Gemini is the current backend choice
- if the backend provider changes later, the operator workflow and UI should not change
