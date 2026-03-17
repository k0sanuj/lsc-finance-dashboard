# AGENTS.md

## Purpose

This repository is for building the League Sports Co finance dashboard as a living financial system, not a static reporting UI. The app must behave as an ontology-backed operating system for finance data where changes propagate through shared canonical entities, derived metrics, and linked workflows.

The current business scope includes:

- `LSC` as the consolidated holding company view
- `TBR` (`Team Blue Rising`) as the active operating entity
- `FSP` (`Future of Sports`) as a future entity with placeholder support in schema and UI

The dashboard must support:

- company-level overview metrics
- TBR financial and race-level operations
- expenses and invoice tracking
- payment due tracking
- commercial goals and sponsorship tracking
- AI analysis based on derived metrics, not raw rows

## Core Product Rules

1. Always treat this as a `living dashboard`.
2. Never build pages that depend directly on ad hoc spreadsheet columns.
3. Always normalize imported data into canonical entities first.
4. Prefer shared data definitions over duplicated business logic.
5. If a metric is ambiguous, stop and define it in the metric dictionary before coding.
6. Every UI number must be traceable to a canonical table or derived SQL view.
7. `LSC`, `TBR`, and `FSP` totals must always be clearly labeled.
8. `Cash`, `Revenue`, `Receivables`, `Expenses`, and `Margin` must never be mixed or inferred casually.
9. The frontend should read from stable domain services or SQL views, not from raw imports.
10. Anything that can be computed should be derived, not manually entered.

## Working Style

Use a thinker-to-builder workflow:

1. Planning
2. Ontology and metric definition
3. Schema design
4. Import and normalization design
5. Derived analytics design
6. Execution
7. Testing
8. Debugging
9. Refinement
10. Documentation updates

Do not jump directly into UI generation before the ontology, metric dictionary, and data flow are defined.

## Required Reading Before Major Changes

Before making schema, analytics, import, or UI changes, read:

- `docs/product-spec.md` if present
- `docs/metric-dictionary.md` if present
- `docs/data-ontology.md` if present
- `docs/agent-topology.md`
- `docs/starter-checklist.md`

When the custom skill is installed, also read:

- `skills/lsc-finance-dashboard/SKILL.md`

## Default Build Sequence

For new work, follow this order unless a task is explicitly isolated:

1. confirm the business question
2. identify affected entities and metrics
3. update ontology or metric docs if needed
4. update schema or views
5. update import mapping if source data changes
6. implement UI or API
7. test with sample data
8. verify against expected finance logic
9. document any new assumptions

## Multi-Agent Operating Model

This repository should be worked on as a coordinator system with specialist sub-agents.

### Central Coordinator

The coordinator owns:

- task decomposition
- dependency ordering
- handoff between specialists
- enforcement of ontology and metric definitions
- final integration checks

The coordinator should not improvise finance logic. It should route work to the relevant specialist and reconcile outputs.

### Specialist Agents

Use specialist agents with bounded responsibility:

- `finance-architect`
  - owns metric definitions, KPI logic, commercial logic, and financial modeling assumptions
- `data-ontology-architect`
  - owns entities, relationships, canonical models, and lineage
- `schema-engineer`
  - owns Neon schema, migrations, indexes, constraints, and views
- `import-pipeline-engineer`
  - owns Google Sheets and file ingestion, normalization, mapping, and raw-to-canonical flow
- `app-engineer`
  - owns API routes, domain services, and state flow
- `dashboard-ui-engineer`
  - owns page composition, tables, charts, filters, and drill-down UX
- `qa-debug-agent`
  - owns test plans, regression checks, edge cases, and debugging
- `ai-analysis-agent`
  - owns narrative summaries and recommendations based only on approved metrics

Each specialist must write changes so they can be consumed by the coordinator without hidden assumptions.

## Finance Architecture Rules

Use the following layers:

1. `raw input layer`
   - imported sheet rows
   - source documents
   - source metadata

2. `canonical domain layer`
   - companies
   - sponsors/customers
   - contracts
   - race events
   - invoices
   - payments
   - revenue records
   - expenses
   - commercial targets

3. `derived analytics layer`
   - consolidated KPIs
   - receivables aging
   - payments due
   - race P&L
   - sponsor summary
   - commercial target progress

4. `application layer`
   - APIs
   - dashboard pages
   - analysis services

Never collapse these layers into one.

## Data Source Rules

Source data is expected to come from:

- Google Sheets
- invoice folders
- expense reports
- manual uploads if needed

All imports must preserve lineage:

- source system
- source sheet or folder
- row or file identifier
- import timestamp
- import batch identifier

No imported row should lose its source identity.

## UI Rules

The main navigation should prioritize:

1. Overview
2. TBR
3. Costs
4. Payments
5. Commercial Goals
6. AI Analysis

FSP should exist in schema and optionally in filters, but should not force UI complexity before real data exists.

## Testing Rules

Every major feature should be tested at three levels when applicable:

1. metric correctness
2. data lineage and mapping correctness
3. UI correctness

Minimum expectations:

- sample seed data for LSC and TBR
- tests for metric calculations
- tests for import normalization
- at least one regression path for each main page

## Codex Behavior Rules

When working in this repository:

- prefer local context over guessing
- prefer small, auditable changes
- prefer schema and SQL views over duplicated frontend math
- prefer explicit assumptions documented in markdown
- do not invent source fields or finance logic
- do not implement forecasting logic unless the formulas are defined
- do not treat placeholders as real business data

## Settings Recommendations

Recommended default Codex settings for this repo:

- permissions: `workspace-write`
- network: restricted by default, escalate only when needed
- reasoning: `medium` for routine edits, `high` for planning, schema, migrations, and finance logic
- use local project context first
- use remote/web context only when local context is insufficient

Do not run with broad full-access by default. Escalate only for clearly justified cases like installing dependencies, pulling docs, or connecting approved external systems.

## Deliverable Standard

A task is not complete unless it includes all relevant parts:

- implementation
- validation
- documentation update if assumptions changed
- explanation of remaining risks or missing data
