# Source Audit

## Scope

This audit covers the Excel workbooks currently provided from:

- `/Users/anujsingh/Downloads/Data for App`

The goal is to identify:

- what usable finance data exists
- which sheets are duplicates
- which sheets are incomplete or weak
- what season timeline should be used for chronological reporting

## High-Level Read

The source set is strong enough to start populating:

- TBR race-by-race expense history
- E1 payment summary history
- TBR budget and season-level expense summaries
- person-level reimbursement detail for multiple races

Operationally, these sources should be treated as four separate workflows, not one generic import pool:

- E1 vendor payables
- race operations reimbursement management
- season planning and control
- person reconciliation and dues tracking

It is not yet strong enough to fully populate:

- clean sponsorship pipeline history
- normalized receivables lifecycle
- complete season 3 operating costs

## File-Level Assessment

### 1. `LSC - E1 Payments Summaries.xlsx`

Best use:

- payable invoice history
- season-level E1 invoice tracking
- due amounts
- expected future invoices

Strong sheets:

- `Season 1`
- `Season 2`
- `Season 3`
- `Spare parts Provision S2`
- `Email sent on Apr3`

Use with caution:

- `Summary As of March 25th`
  - weak summary / commentary style
- `Monaco Expected`
  - forecast-style expected invoices
- `Expected invoices April onwards`
  - expected items, not finalized obligations

### 2. `TBR Financial Plan_ 2024-25.xlsx`

Best use:

- season summaries
- race totals
- budget and expected category structures

Strong sheets:

- `Summary Sheets`
- `Season 1`
- `Season 2`
- `Jeddah`
- `Milan`
- `Venice`
- `Puerto Banus`
- `Raw Estimates`

Ignore:

- `DASHBOARD - SEASON 1`
  - empty

### 3. Season 1 reimbursement workbooks

Files:

- `Reimbursement and Bill Reports - Jeddah S1.xlsx`
- `Reimbursements and Bill Reports - Milan S1.xlsx`
- `Reimbursements and Bills Report - Venice S1.xlsx`

Best use:

- individual reimbursement detail
- race-specific operating spend
- merchant/category-level expense records

Strong sheets:

- most named person sheets with real headers and transaction rows

Weak / partial:

- `Reimbursements and Bill Reports - Milan S1.xlsx`
  - several sheets are short and likely partial
- `Reimbursements and Bills Report - Venice S1.xlsx / Sheet4`
  - not structured, should ignore
- `Sayan Mukherjees Expense Report`
  - only 2 rows, likely summary only

### 4. Season 2 reimbursement workbooks

Files:

- `Reimbursements and Bill S2 Jeddah.xlsx`
- `Reimbursements and Bill S2 DOha.xlsx`
- `Reimbursements and Bill S2 Dubrovnik.xlsx`
- `Reimbursements and Bill S2 Monaco.xlsx`
- `Reimbursements and Bill S2 Lagos.xlsx`
- `Reimbursements and Bill S2 Miami.xlsx`

Best use:

- race-specific expenses
- summary sheets
- reimbursable person-level detail

Strong sheets:

- most named person sheets with transaction tables
- `Summary Sheet`, `Budgeting`, `Prepaid Expenses` in `S2 Jeddah`
- `Sara Summary Sheet` style tabs where clearly structured

Weak / partial:

- `Reimbursements and Bill S2 Dubrovnik.xlsx / Anandh`
  - generic `Column 1` style header, should ignore
- `Reimbursements and Bill S2 Miami.xlsx / Roghit`
  - empty, ignore

### 5. Person-specific workbooks

Files:

- `John Peeters Expense Report JP's Copy S2 2025 (1).xlsx`
- `Sayan Expense Report .xlsx`

Best use:

- person-specific reconciliations
- dues / owed-by-team logic
- supplementary detail not always present in race sheets

Use with caution:

- these should supplement race workbooks, not override them automatically

## Confirmed Duplicate Sheets

These are exact duplicates and should only be imported once:

- `Reimbursements and Bill S2 Miami.xlsx / Sayan Monaco Expenses`
- `Reimbursements and Bill S2 Monaco.xlsx / Sayan Monaco Expenses`

- `Reimbursements and Bill S2 Miami.xlsx / Roghith`
- `Reimbursements and Bill S2 Monaco.xlsx / Roghith`

Confirmed empty duplicates:

- `Reimbursements and Bill S2 Miami.xlsx / Roghit`
- `TBR Financial Plan_ 2024-25.xlsx / DASHBOARD - SEASON 1`

## Sheets To Ignore On First Import

- empty sheets
- sheets with generic headers like `Column 1`, `Sheet4`, or single-cell leftovers
- tabs that are clearly subtotal-only or commentary-only unless they are explicitly needed as summary layers
- tables far below the main structured content where the top structured table is already present elsewhere

## Recommended First-Pass Import Set

Import first:

1. `LSC - E1 Payments Summaries.xlsx`
   - `Season 1`
   - `Season 2`
   - `Season 3`
   - `Spare parts Provision S2`

2. `TBR Financial Plan_ 2024-25.xlsx`
   - `Summary Sheets`
   - `Season 1`
   - `Season 2`
   - race sheets with structured category totals

3. race reimbursement workbooks
   - named person sheets with full transaction tables

4. person-specific supplement workbooks
   - `John Peeters...`
   - `Sayan Expense Report`

## Operating Classification

Map the imported sources to business workflows as follows:

1. `LSC - E1 Payments Summaries.xlsx`
   - workflow: `E1 vendor payables`
   - use: organizer-side payable tracking, due monitoring, expected invoice follow-up

2. `TBR Financial Plan_ 2024-25.xlsx`
   - workflow: `Season planning and control`
   - use: budget baselines, planned category totals, race control totals

3. Race reimbursement workbooks
   - workflow: `Race operations reimbursement management`
   - use: operating transactions, person-level expense detail, on-site reimbursements

4. Person-specific supplement workbooks
   - workflow: `Person reconciliation and dues tracking`
   - use: supplemental reconciliation, outstanding balance logic, cross-race person rollups

Detailed tagging rules are defined in:

- [source-operating-categorization.md](/Users/anujsingh/Documents/Playground/lsc-finance-dashboard/docs/source-operating-categorization.md)

## Timeline To Use

Use a single chronological timeline from Season 1 to Season 3.

### Season 1

Use for imports:

- Jeddah
- Milan / Lake Maggiore testing event
- Venice
- Puerto Banus
- Monaco
- Lake Como

Official race dates used for ordering:

- Jeddah: 2-3 February 2024
- Venice: 11-12 May 2024
- Puerto Banus: 1-2 June 2024
- Monaco: 26-27 July 2024
- Lake Como: 23-24 August 2024

Notes:

- official early calendar references Geneva, Rotterdam, and Hong Kong, but these do not appear in your finance files and should not be imported unless source records appear
- Milan / Lake Maggiore should be treated as testing / operating event rather than championship race

### Season 2

Use for imports:

- Jeddah
- Doha
- Dubrovnik
- Lago Maggiore
- Monaco
- Lagos
- Miami

Official race dates used for ordering:

- Jeddah: 24-25 January 2025
- Doha: 21-22 February 2025
- Dubrovnik: 13-14 June 2025
- Lago Maggiore: 27-28 June 2025
- Monaco: 18-19 July 2025
- Lagos: 4-5 October 2025
- Miami: 7-8 November 2025

Notes:

- TBR won Monaco in 2025
- the user-provided business rule says a `100,000 EUR` prize pool should be recognized after Miami for Season 2
- sponsorship can stay dummy / minimal for now

### Season 3

Files only partially support this so far.

Use official calendar ordering only until internal finance records are provided:

- Jeddah: 23-24 January 2026
- Lake Como: 24-25 April 2026
- Dubrovnik: 12-13 June 2026
- Monaco: 17-18 July 2026
- TBC: 11-12 September 2026
- Lagos: 3-4 October 2026
- Miami: 13-14 November 2026
- TBC / Bahamas: 21-22 November 2026

## Business Rules To Encode

1. Keep sponsorship minimal / dummy for now.
2. Add Season 2 prize pool revenue of `EUR 100,000` after Miami.
3. Order all races linearly across seasons using real event order.
4. Only import complete structured tables.
5. Drop exact duplicates.
6. Treat testing events separately from championship races.

## Recommended Next Technical Step

Build an Excel workbook importer that:

- reads each workbook sheet-by-sheet
- creates one `source_document` and `import_batch` per accepted sheet
- tags each sheet with season, race, person, and source type
- excludes ignored sheets by manifest
- then normalizes accepted raw rows into canonical tables

## Sources Used For Timeline

- Official 2024 season announcement: [E1’s ‘Race to Hong Kong’ revealed](https://www.e1series.com/news/92_E1s-Race-to-Hong-Kong-revealed-with-seven-events-around-the-world-to-form-first-season-test)
- Official 2024 Lake Como addition: [E1 adds Lake Como GP to 2024 calendar](https://www.e1series.com/news/126_E1-adds-Lake-Como-GP-presented-by-Villa-dEste-to-2024-race-calendar)
- Official 2025 race sequence pages and releases: [E1 Championship page](https://www.e1series.com/championship/), [Monaco race release](https://mediacentre.e1series.com/mediacentre/press-release/293_Cricket-star-Virat-Kohlis-Team-Blue-Rising-wins-their-first-ever-E1-race-as-stars-align-in-Monaco), [Miami finale release](https://mediacentre.e1series.com/mediacentre/press-release/299_Miami-to-host-first-US-race-for-celebrity-backed-E1-raceboat-Championship)
- Official 2026 calendar: [E1 reveals calendar for 2026 season](https://mediacentre.e1series.com/mediacentre/press-release/308_E1-reveals-calendar-for-2026-season)
