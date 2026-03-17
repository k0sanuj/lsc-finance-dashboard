# Expense Management

## Purpose

Expense management is the first operator workflow that turns the dashboard into a working finance product.

This module should support:

1. team member expense submission
2. race and category assignment
3. receipt or bill attachment
4. split logic across users or teams
5. finance admin review
6. posting into canonical `expenses`

## Workflow

### User Console

1. operator opens `TBR`
2. operator chooses `My Expenses` or `Races`
3. operator opens a season and then a race
4. operator uploads one or more bills / receipts, or an expense report bundle
5. AI extracts only the user-facing bill facts needed for submission:
   - expense date
   - original amount
   - original currency
   - USD amount
   - status
6. uploaded support remains visible under that race workflow
7. user selects analyzed bills and groups them into one expense report
8. finance reviews the report later in the admin queue
9. user can later convert approved expense items into an invoice request

### Admin Console

1. finance admin opens the admin queue
2. finance admin loads race-level budgets and per-diems before review starts
3. finance admin reviews race-wise or user-wise submissions against those approved thresholds
4. finance admin sees whether each expense is below, close to, or above the approved rule
5. finance admin approves, rejects, or requests clarification
6. approved reports become `invoice ready` for the user branch
7. canonical posting into `expenses` happens later in the finance lifecycle, not at first approval
8. lineage back to the source document, submission, and approved race budget remains preserved

## Key Tables

- `expense_submissions`
- `expense_submission_items`
- `expense_item_splits`
- `race_budget_rules`

## First-Pass UI

Under TBR, provide:

- a TBR landing page with `Financial Overview`, `My Expenses`, and `Races`
- a race browser grouped `season first -> race second`
- a race-detail user workflow for bill / receipt upload
- bill-to-expense-report grouping inside the race workflow
- a separate admin review queue
- race, season, user, and status filters inside the admin review console
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

## Currency And Bill Rules

- Bill scanning should prefer explicit document currency.
- If currency is not explicit, infer it from merchant / issuer location when supported.
- Example: `Dubai` or `UAE` implies `AED` unless the document explicitly states another currency.
- User-side bill tables should show both original amount and USD-converted amount.
- Current prototype conversion uses deterministic fallback FX rates in the app layer.
- Production finance correctness should move to a formal FX source before broad rollout.

## Storage Direction

- Current prototype image previews are stored in source-document metadata for speed.
- Production storage target should be a private S3 bucket with signed access, while Neon stores metadata and lineage only.

## Posting Rule

Canonical `expenses` remain the approved ledger.

Submission tables are the workflow layer before that approval.
