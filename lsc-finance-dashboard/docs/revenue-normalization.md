# Revenue Normalization

## Scope

This first-pass revenue normalization covers:

- Season 1 sponsorship revenue from `Classic Car Club Manhattan`
- the user-approved Season 2 `EUR 100,000` prize-pool rule after Miami, normalized to USD

It does not yet represent a full real sponsorship ledger beyond those explicit business rules.

## Included Sources

### Business rule sources

- `TBR Business Rule :: Season 1 Sponsorship`
- `TBR Business Rule :: Season 2 Prize Pool`

Used for:

- `sponsors_or_customers`
- `contracts`
- `invoices`
- `payments`
- `revenue_records`

## Explicit Rules

1. Season 1 sponsorship revenue is `USD 100,000` from `Classic Car Club Manhattan`.
2. No additional sponsorship revenue is recognized after Season 1 in this first-pass rule set.
3. Season 2 prize pool revenue of `EUR 100,000` is recognized on `2025-11-09`, after Miami.
4. Prize money is normalized to `USD 115,710.00` using ECB EUR/USD reference rate `1.1571` for `2025-11-10`, which is the nearest working day after `2025-11-09`.
5. The prize-money record is linked to the `S2_MIAMI` race event.
6. No cash movement is assumed for prize money unless a real source later confirms it.

## Current Caveats

- sponsorship logic is still rule-based and should be replaced with real contract / invoice source data later
- commercial targets are still not populated
- a real sponsor sheet or Google sync should replace this rule-only layer later
