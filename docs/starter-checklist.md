# Starter Checklist

## Before You Build

Complete these before asking Codex to generate app code:

- write and review `AGENTS.md`
- install the `lsc-finance-dashboard` skill into `~/.codex/skills`
- create `docs/product-spec.md`
- create `docs/metric-dictionary.md`
- create `docs/data-ontology.md`
- create a first-pass `docs/source-maps.md`
- create a first-pass `docs/build-phases.md`
- freeze the v1 sidebar structure
- decide the stack
- create the Neon project
- decide the ORM or schema approach
- prepare sample source data exports

## Business Definition Checklist

These definitions must exist before schema work:

- what counts as revenue
- what counts as recognized revenue
- what counts as cash received
- what counts as receivables
- what counts as cost versus expense
- what MRR means in this business
- what revenue quality means for FSP
- what break-even revenue means
- what counts as sponsor count
- what counts as subscriber count

## Source Data Checklist

Prepare these first:

- TBR sponsor revenue data
- TBR event invoice data
- TBR personal expense reimbursement data
- cash movement or bank ledger data
- receivables data
- commercial targets data

Each source should have:

- source owner
- source location
- update frequency
- entity owner
- expected canonical destination

## Build Order Checklist

Build in this order:

1. planning docs
2. custom skill
3. schema
4. raw import tables
5. normalization layer
6. derived analytics views
7. APIs and services
8. dashboard UI
9. tests
10. AI analysis

## Codex Session Checklist

For each substantial session:

- tell Codex to read `AGENTS.md`
- tell Codex to read the custom skill
- ask Codex to act as coordinator
- ask it to identify the specialist responsible
- ask it to work on one bounded task
- ask it to validate before moving on

## Release Readiness Checklist

Before calling a section complete:

- metrics match the dictionary
- views return the expected totals
- imported rows preserve lineage
- UI labels distinguish LSC, TBR, and FSP
- race filters work correctly
- payments due logic is tested
- commercial target math is tested
- AI summary references approved derived metrics only
