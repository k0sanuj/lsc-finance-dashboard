# Expense Management

## Purpose

Expense management is the first operator workflow that turns the dashboard into a working finance product.

This module should support:

1. team member expense submission
2. race and category assignment
3. receipt or bill attachment
4. split logic across users or teams
5. finance admin review
6. item-level finance admin review
7. reimbursement invoice creation
8. posting approved lines into canonical `expenses`

## Workflow

### User Console

1. operator opens `TBR`
2. operator chooses `My Expenses`
3. operator uploads one or more bills / receipts, or manually adds a no-receipt item with a required reason
4. AI extracts only the user-facing bill facts needed for submission:
   - expense date
   - original amount
   - original currency
   - USD amount
   - merchant
   - category
   - tag
   - race
   - receipt status
5. user previews and edits extracted fields before adding them to a race report
6. uploaded support remains visible through document preview links and source lineage
7. finance reviews each item later in the admin queue
8. rejected items can be challenged by the submitter with required reasoning
9. user can later accept the reviewed report and convert approved expense items into a reimbursement invoice request

### Admin Console

1. finance admin opens the admin queue
2. finance admin loads race-level budgets and per-diems before review starts
3. finance admin reviews race-wise or user-wise submissions against those approved thresholds
4. finance admin sees whether each expense is below, close to, or above the approved rule
5. finance admin approves, rejects, requests info, or flags individual items for review
6. rejected items require a rejection reason and can later receive a submitter challenge
7. approved items post into canonical `expenses` with source submission and source item lineage
8. approved reports become `invoice ready` for the user branch
9. lineage back to the source document, submission, review action, and approved race budget remains preserved

## Key Tables

- `expense_submissions`
- `expense_submission_items`
- `expense_item_splits`
- `expense_workspace_rules`
- `expense_tags`
- `expense_submission_item_tags`
- `expense_item_rule_findings`
- `expense_report_exports`
- `race_budget_rules`

## First-Pass UI

Under TBR, provide:

- a TBR landing page with `Financial Overview`, `My Expenses`, and `Races`
- a race browser grouped `season first -> race second`
- a race-detail user workflow for bill / receipt upload
- a mobile-first `My Expenses` surface with camera/file receipt capture, AI preview cards, and reimbursement progress tracking
- Expensify-style report detail grouped by category, with original amount, FX rate, USD amount, receipt indicator, rule notes, and item status
- bill-to-expense-report grouping inside the race workflow
- a separate admin review queue
- an exception-first approval lane that can filter budget exceptions before clean reports
- an item-level approval column supporting `approve`, `reject`, `needs info`, and `flag for review`
- submitter challenge handling for rejected items
- workspace tag and rule management inside the admin review console
- side-by-side receipt evidence and mapped finance fields on the review detail page
- race, season, user, and status filters inside the admin review console
- budget signal filtering for `exceptions`, `over budget`, `close to budget`, `no rule`, and `clean`
- race-level budget and per-diem setup inside the admin review console
- race-budget table with:
  - cost category
  - rule type
  - unit basis such as `per day`, `per person`, or `per race`
  - approved amount in USD
  - close-to-budget threshold
  - finance note
- multi-line budget builder that can save several approved rules at once
- AI budget-document import that prefills the builder with suggested race rules
- budget signal badges in the queue and item detail:
  - `below budget`
  - `close to budget`
  - `above budget`
- team and split rule snapshot
- approval notes and invoice-readiness states
- CSV export that writes an audited export event

## Currency And Bill Rules

- Bill scanning should prefer explicit document currency.
- If currency is not explicit, infer it from merchant / issuer location when supported.
- Example: `Dubai` or `UAE` implies `AED` unless the document explicitly states another currency.
- User-side bill tables should show both original amount and USD-converted amount.
- Each item stores original currency, original amount, FX rate, FX source, reporting currency, and USD reporting amount.
- Current controlled workflow uses deterministic fallback FX rates for submission and review.
- Production finance correctness should move to a formal FX source before broad rollout.

## Mashael Lake Como Seed

The seeded Lake Como Season 3 report for `mashael@teambluerising.com` is a source-backed reference report from `/Users/anujsingh/Downloads/Mashael expenses S2 Lake Como/TBR_Mashael_Expense_Review_LakeComo_S3.xlsx`.

Expected control totals:

- workbook-equivalent original total: `EUR 2,535.95`
- reporting total: `USD 2,952.35`
- over-cap amount: `USD 31.49`

This seed must remain traceable to `source_documents`, `import_batches`, raw row metadata, expense submission items, rule findings, and item-level review status.

## Storage Direction

- Current prototype image previews are stored in source-document metadata for speed.
- Production storage target should be a private S3 bucket with signed access, while Neon stores metadata and lineage only.

## Posting Rule

Canonical `expenses` remain the approved ledger.

Submission tables are the workflow layer before that approval.

Approved expense items are posted to canonical `expenses` with source submission and source item ids. Rejected, discarded, or unresolved items must not post. Reimbursement invoices include approved items only. When a reimbursement invoice is marked paid, downstream recognition should show paid TBR cost and LSC consolidated cost/cash impact without double counting against the TBR operating baseline.
