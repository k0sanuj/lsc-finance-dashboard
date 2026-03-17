# Progress Analysis

## Current Delivery State

This project is not close to zero anymore, but it is also not close to fully finished.

The most accurate read is:

- core planning and architecture: largely done
- secure infrastructure and ingestion layer: largely done
- first canonical finance workflow: partially done
- usable TBR finance operating system: still materially incomplete

## What Is Complete

### Definition and architecture

- product spec
- metric dictionary
- ontology and source maps
- agent graph and workflow graph specs
- security and access-control docs

### Platform foundation

- Next.js app scaffold
- Neon schema and analytics views
- local and live DB wiring
- restricted DB roles
- secure raw import layer
- workbook ingestion for the uploaded Excel set

### Raw data coverage

- `953` raw rows imported
- the uploaded workbook set is audited and classified
- duplicates and weak sheets are identified

### Canonical finance coverage

- `E1 vendor payables` is normalized
- `Race operations reimbursement management` is normalized in a first pass
- `Commercial revenue tracking` is normalized from explicit business rules
- canonical counts currently:
  - `contracts`: `2`
  - `invoices`: `41`
  - `payments`: `39`
  - `expenses`: `246`
  - `revenue_records`: `2`

## What Is Still Missing

### High-priority missing work

1. race reimbursement normalization into canonical `expenses`
2. sponsor / prize / other revenue normalization into `revenue_records`
3. race-event reference completion for the full TBR timeline
4. better category mapping and owner attribution
5. page-level replacement of remaining fallback placeholders

### Medium-priority missing work

1. commercial target loading
2. partner performance ownership logic
3. season planning / control-table normalization
4. better AI analysis based on real derived metrics
5. tests for import and metric logic

### Lower-priority missing work

1. Google Sheets sync
2. platform-native write flows
3. FSP real operational support
4. auth / deployment hardening for hosted use

## Best Estimate Of Remaining Work

If the target is:

### `Backend + data foundation`

Remaining: roughly `15%`

Reason:

- the three critical first-pass workflows are normalized
- raw ingestion is done
- the remaining backend work is mostly refinement, not greenfield foundation

### `Usable TBR finance dashboard v1`

Remaining: roughly `30%`

Reason:

- payments are real
- race costs are materially real
- sponsor and prize revenue are now real at the first-pass rule level
- commercial targets, richer owner attribution, and some UI fallbacks still remain

### `Living finance operating system`

Remaining: roughly `50%`

Reason:

- the app is not yet the primary system of record
- Google sync, write-back workflows, and complete canonical coverage are not done

## Immediate Critical Path

The correct build order from here is:

1. normalize race expenses
2. tighten season planning / control normalization
3. remove UI fallbacks where live data exists
4. add tests
5. move toward real source-of-truth write flows
