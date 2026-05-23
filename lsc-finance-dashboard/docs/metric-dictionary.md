# Metric Dictionary

## Purpose

This file defines the business meaning of key metrics. If a metric is used in schema, SQL, API, UI, or AI analysis, it must have a definition here.

## Core Rules

1. A metric definition must state whether it is based on recognized activity, invoicing, or cash movement.
2. If a metric is period-based, the period must be explicit.
3. If a metric differs by entity, that distinction must be stated.

## Metrics

### Total Revenue

Definition:

Sum of recognized revenue records within the selected time period.

Notes:

- not the same as cash received
- should be filterable by entity and revenue type

### Sponsorship Revenue

Definition:

Recognized revenue attributed to sponsorship contracts.

Applies to:

- primarily TBR in v1

### Prize Money

Definition:

Recognized revenue attributable to team prize earnings or competitive event payouts.

### Other Revenue

Definition:

Recognized revenue not classified as sponsorship, prize money, or subscription.

### Total Cost

Definition:

Sum of approved expense records in the selected period.

Notes:

- should include both event invoices and reimbursable team expenses if approved

### Direct Cost

Definition:

Costs directly attributable to an event, sponsor delivery, race, or other operating activity.

### Operating Expense

Definition:

Costs that support operations but are not directly attributable to a single revenue event or race.

### Margin

Definition:

`Total Revenue - Total Cost`

Display:

- absolute value
- optionally percentage if denominator logic is approved

### Cash

Definition:

Ending cash balance or selected-period cash position from approved cash movement records.

### Cash In

Definition:

Incoming settled payments recorded in the selected period.

### Cash Out

Definition:

Outgoing settled payments recorded in the selected period.

### Receivables

Definition:

Amounts invoiced to customers or sponsors that remain unpaid or partially unpaid as of the selected date.

### Payables / Upcoming Payments

Definition:

Amounts owed on vendor or operational invoices that are unpaid and due within the selected period.

### XTZ Invoice Commitment

Definition:

Total XTZ India payroll/vendor invoice amount in `generated` or `sent` status.

Finance treatment:

- visible as committed payable pressure for the billed entity
- not recognized as approved cost
- not recognized as cash movement
- becomes approved cost/cash out for the billed entity only when status becomes `paid`

### XTZ Paid Invoice Cost

Definition:

Total XTZ India payroll/vendor invoice amount in `paid` status.

Finance treatment:

- recognized as XTZ India revenue/cash in for intercompany invoices
- recognized as approved cost/cash out for the billed entity
- void invoices remain audit/history only

### Monthly Burn

Definition:

Net cash outflow or monthly operating cash usage for the selected month, depending on approved finance treatment.

Pending clarification:

- whether burn is defined as total net cash outflow or as operating burn only

### MRR

Definition:

Monthly recurring revenue from active recurring subscription contracts.

Notes:

- likely applies to FSP rather than TBR
- should be zero if no recurring contracts exist

### Revenue Quality

Definition:

Share of revenue that is recurring, predictable, or contractually durable, based on the approved revenue-quality formula.

Initial v1 assumption:

- for FSP, `recurring subscription revenue / total FSP revenue`

This should remain explicitly labeled as an assumption until approved.

### FSP Scenario P&L

Definition:

Sport-level planning revenue, COGS, OPEX, and EBITDA from FSP sport scenario tables.

Finance treatment:

- visible in FSP overview, FSP sports, FSP consolidated, and FSP cost workspaces
- excluded from LSC holding-company consolidated finance totals
- must not be copied into generic `revenue_records` or `expenses` without an explicit approved-actual consolidation gate

### Universal P&L Statement

Definition:

Reusable statement view for an entity, sport, or future asset. It presents revenue, expense sections, and net income/loss from approved source-backed P&L line items or backend-generated recognition views.

Finance treatment:

- every P&L line has an owner scope, scenario, period, section, data status, source module, and lineage
- `actual` and `partial_actual` lines represent available source-backed activity
- `forecast`, `contingency`, and `non_cash` lines are shown separately and must not be treated as cash movement
- TBR Season 3 is a management P&L: first two races are actual/partial actual where noted in the workbook, remaining races are forecast
- P&L statement totals are derived in SQL views or backend services, not React components

### P&L Scenario

Definition:

A named version of a P&L statement, such as actual, management, forecast, budget, or sensitivity. A scenario owns the assumptions and periods used to produce a statement.

Notes:

- TBR default scenario is the workbook-backed management reference
- FSP base scenario remains portfolio planning until approved as actual consolidation
- only actual scenarios should feed cash or recognized accounting views unless another recognition policy is explicitly approved

### Sponsor Count

Definition:

Count of active sponsors in the selected period.

Active sponsor rule:

- sponsor has an active contract or recognized sponsorship revenue in the selected period

### Subscriber Count

Definition:

Count of active paying subscribers in the selected period.

Likely applies to:

- FSP

### Break-Even Revenue

Definition:

Revenue required for the selected period such that revenue equals approved cost basis.

Pending clarification:

- whether break-even is based on all costs, fixed costs only, or fixed plus expected variable costs

### Commercial Target Revenue

Definition:

Revenue target assigned for a month, quarter, or year under the approved commercial plan.

### Actual Revenue vs Target

Definition:

Comparison between recognized revenue and commercial target revenue for the selected period.

### Partner Performance Revenue

Definition:

Recognized or closed revenue attributed to a specific responsible commercial owner.

Pending clarification:

- whether attribution is full-credit, split-credit, or owner-of-record

### Race Cost

Definition:

All approved costs linked to a selected race event.

Includes:

- organizer or event invoices
- travel and visa
- catering
- equipment
- damage-related charges
- on-site expenses
- reimbursable team expenses

### Race P&L

Definition:

Revenue attributable to a race minus costs attributable to that race, if race-level revenue attribution is available and approved.

### TBR Operating Baseline

Definition:

Season-level operating cost baseline from approved top-table ranges in `TBR Financial Plan_ 2024-25.xlsx` and controlled manual Season 3 entries. It is a control/baseline source, not proof of individual vendor invoice settlement.

Notes:

- stored in `tbr_operating_expense_lines`
- reported in USD while preserving original amount, original currency, FX rate, and FX source
- does not represent transaction-level proof in the generic `expenses` ledger

### E1 Invoice Cost

Definition:

E1 accounting rows from the E1 invoice tracker that are active payable/cost evidence.

Included statuses:

- paid
- issued
- partially paid
- due
- unpaid

Excluded statuses:

- pending review
- source check
- not applicable
- void

Notes:

- Costs module visibility may include E1 invoice cost rows for operational invoice tracking.
- Overall TBR P&L must still apply the approved variance-only policy for E1 overlaps, so E1 invoice cost visibility must not imply double counting in Overall P&L.

### TBR E1 Incremental Cost

Definition:

Confirmed E1 accounting obligations that are not matched to the TBR operating baseline and are not explicitly duplicate, inapplicable, contingent, credit-only, or source-check rows.

### TBR E1 Overlap Variance

Definition:

For E1 rows matched to an operating baseline category, the positive amount by which confirmed E1 obligations exceed the matched baseline.

Formula:

`max(confirmed matched E1 amount - matched operating baseline amount, 0)`

Notes:

- matched baseline still counts once in operating baseline
- matched E1 rows remain visible in E1 Accounting and reconciliation views
- negative variance does not reduce the baseline in Overall P&L

### TBR Overall P&L

Definition:

Season-level P&L from recognized TBR revenue minus TBR operating baseline, positive E1 overlap variance, and non-overlapping confirmed E1 incremental cost.

Formula:

`recognized revenue - operating baseline - E1 overlap variance - E1 incremental cost`

Approved revenue rules:

- Season 1 includes `USD 250,000` sponsorship revenue from `Classic Car Club Manhattan`
- Season 2 includes `EUR 100,000` prize money, preserved in EUR and converted to USD for reporting

### Finance Recognition Buckets

Definition:

Shared backend reporting contract that separates values into actuals, committed exposure, planning/scenario values, and excluded/quarantined rows.

Finance treatment:

- actual revenue/cost/cash affects entity metrics and, except FSP scenario-only values, the LSC holding view
- committed payables/receivables show obligation pressure but do not affect approved cost or cash until settled
- planning/scenario values are visible inside their entity dashboards only
- quarantined QA/test rows remain in source tables but are excluded from default finance views

### Quarantined Reporting Data

Definition:

Rows marked in `finance_reporting_exclusions` with `excluded_from_reporting = true`.

Finance treatment:

- preserved for audit and lineage
- excluded from consolidated metrics, monthly summaries, payables, and entity recognition views
- visible only in admin/system reporting surfaces

### TBR Management P&L Cost

Definition:

Backend-derived TBR season cost from `tbr_overall_pnl_by_season`, including operating baseline plus E1 variance/incremental cost under the approved no-double-count policy.

Finance treatment:

- used for TBR management P&L and entity dashboard cost visibility
- supplements generic approved expense rows when those rows do not yet represent the season-control workbook/E1 ledger
- does not double count E1 overlap rows already covered by operating baseline
