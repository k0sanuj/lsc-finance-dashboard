# Source Operating Categorization

## Purpose

Imported finance sources should be classified by the operating workflow they support, not only by a generic data domain.

This project should treat the current TBR workbook set as four different finance workflows:

1. `E1 vendor payables`
   - invoices and expected obligations coming from E1
   - licensing, catering, spare parts, and other organizer-linked charges

2. `Race operations reimbursement management`
   - on-site race spend
   - team member reimbursement detail
   - prepaid and reimbursable operating costs

3. `Season planning and control`
   - season budgets
   - expected category totals
   - race-level planned vs actual control layers

4. `Person reconciliation and dues tracking`
   - person-led supplementary accounting
   - team owed / reimbursable balances
   - cross-race personal reconciliations

## Classification Rules

### E1 vendor payables

Use for:

- `LSC - E1 Payments Summaries.xlsx`

Business meaning:

- direct organizer-facing payable workflow
- accounts payable planning and invoice tracking

Canonical direction:

- `invoices`
- `payments`

### Race operations reimbursement management

Use for:

- race reimbursement workbooks for Jeddah, Milan, Venice, Doha, Dubrovnik, Monaco, Lagos, Miami

Business meaning:

- event operations finance
- team expense capture
- reimbursement validation

Canonical direction:

- `expenses`
- later linked to `race_events`, `owners`, and `cost_categories`

### Season planning and control

Use for:

- `TBR Financial Plan_ 2024-25.xlsx`

Business meaning:

- planning baseline
- season control totals
- expected cost structure

Canonical direction:

- validation and control tables first
- selected totals may later map into finance planning views

### Person reconciliation and dues tracking

Use for:

- `John Peeters Expense Report JP's Copy S2 2025 (1).xlsx`
- `Sayan Expense Report .xlsx`

Business meaning:

- supplemental reconciliation layer
- person-level balances and cross-race expense rollups

Canonical direction:

- supplement canonical expenses
- do not override race workbook truth automatically

## Required Metadata

Each imported workbook should carry tags for:

- `finance_stream`
- `operating_workflow`
- `record_granularity`
- `source_role`

Recommended supporting tags:

- `season`
- `race`
- `person`
- `counterparty_type`
- `approval_state`

## Current TBR Mapping

| Workbook group | Finance stream | Operating workflow | Record granularity | Source role |
| --- | --- | --- | --- | --- |
| `LSC - E1 Payments Summaries.xlsx` | `payables` | `e1_vendor_payables` | `invoice_summary` | `primary` |
| `TBR Financial Plan_ 2024-25.xlsx` | `planning_control` | `season_planning_control` | `season_and_race_summary` | `primary` |
| Race reimbursement workbooks | `race_ops_costs` | `race_reimbursement_management` | `transaction_detail` | `primary` |
| Person supplement workbooks | `reconciliation` | `person_reconciliation_dues` | `person_rollup` | `supplemental` |
