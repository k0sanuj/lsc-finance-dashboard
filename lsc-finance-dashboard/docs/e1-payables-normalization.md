# E1 Payables Normalization

## Scope

This normalization step turns the imported E1 workbook data into canonical:

- `invoices`
- `payments`

It covers the `E1 vendor payables` workflow only.

Source workbook:

- `LSC - E1 Payments Summaries.xlsx`

## Included Sheets

- `Season 1`
- `Season 2`
- `Season 3`
- `Email sent on Apr3`

## Deferred Sheet

- `Spare parts Provision S2`

Reason:

- it behaves more like a chargeability and exposure control sheet than a clean invoice ledger
- several rows have no invoice number
- several rows have `E1` or `N/A` instead of payable values

It should remain in the raw/control layer until spare-parts logic is modeled separately.

## First-Pass Mapping Rules

### Season 1

- take the left-side invoice table only
- skip mixed summary rows and totals
- map:
  - invoice number
  - item
  - amount
  - status
  - due amount

### Season 2

- use the main invoice ledger as primary truth
- map:
  - invoice number
  - item
  - invoiced amount
  - status
  - due amount
  - comments

### Season 3

- map both invoiced and expected obligations
- rows without invoice number are treated as draft/planned obligations if they still carry an expected amount

### Apr 3 Follow-Up Sheet

- use as a supplemental comment/status layer
- if an invoice already exists in Season 1/2/3, use this sheet only to enrich comments
- if an invoice exists only here, allow it to create a fallback payable record

## Current Caveats

- no due dates are available yet, so payment timing is inferred only as `planned` or `settled`
- credit notes are modeled as negative/offset payable records and inflow payments
- race-event linking is not done yet
- spare-parts exposure is deferred

## Current Result

After the first successful normalization run:

- `40` canonical invoices were created
- `38` canonical payments were created

Invoice status breakdown:

- `draft`: `4`
- `issued`: `18`
- `partially_paid`: `1`
- `paid`: `15`
- `void`: `2`

Payment breakdown:

- `planned` `outflow`: `19`
- `settled` `outflow`: `17`
- `settled` `inflow`: `2`
