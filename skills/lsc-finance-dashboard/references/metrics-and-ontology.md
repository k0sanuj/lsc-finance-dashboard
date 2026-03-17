# Metrics And Ontology

## Core Entities

The canonical model should center on:

- company
- business unit
- sponsor or customer
- contract
- revenue record
- invoice
- payment
- expense
- race event
- cost category
- commercial target
- source document
- import batch

## Layering

Use four layers:

1. raw imports
2. canonical domain tables
3. derived analytics views
4. application and UI

Do not skip directly from raw sheet data to UI.

## Core Financial Distinctions

Keep these separate:

- recognized revenue
- cash received
- receivables
- total cost
- direct cost
- operating expense
- margin

## Current KPI Priorities

Primary overview KPIs should include:

- total revenue
- total cost
- margin
- cash
- receivables
- upcoming payments
- MRR
- sponsor count
- subscriber count
- revenue quality

## Current TBR Needs

TBR needs:

- sponsor revenue breakdown
- prize money tracking
- race-wise cost breakdown
- event invoices versus personal expense reimbursements
- sponsor summary
- race-level operating visibility

## Current FSP Needs

FSP should remain supported in schema and consolidated reporting, with placeholder values if operating data is not ready.

## Metric Discipline

Any metric used in code or UI must have a stable business definition. If a metric is unclear, define it in `docs/metric-dictionary.md` before implementation.
