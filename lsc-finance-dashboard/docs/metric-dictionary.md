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
