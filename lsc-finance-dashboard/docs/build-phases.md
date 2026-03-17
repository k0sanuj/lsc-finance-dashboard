# Build Phases

## Purpose

This file defines the recommended implementation sequence for the League Sports Co finance dashboard.

## Phase 0: Definition

Create and approve:

- product spec
- metric dictionary
- data ontology
- source maps
- AGENTS.md and custom skill

Exit criteria:

- v1 pages are frozen
- key metrics have definitions
- source inputs are known

## Phase 1: Project Scaffolding

Set up:

- app structure
- package management
- TypeScript baseline
- linting and formatting
- environment file pattern
- database package
- web app package

Exit criteria:

- project runs locally
- database connection pattern is defined

## Phase 2: Schema And Migrations

Create the core schema in Neon:

- companies
- sponsors_or_customers
- owners
- contracts
- revenue_records
- invoices
- payments
- expenses
- race_events
- cost_categories
- commercial_targets
- source_documents
- import_batches
- raw_import_rows

Exit criteria:

- schema is migration-backed
- constraints and indexes are in place

## Phase 3: Import Pipeline

Implement:

- raw import storage
- document upload storage
- document AI extraction workflow
- approval workflow for extracted fields
- import metadata
- normalization rules
- canonical mapping logic

Exit criteria:

- sample source files can be imported
- uploaded documents can be analyzed and reviewed before posting
- lineage is preserved end to end

## Phase 4: Derived Analytics Views

Implement:

- consolidated_company_metrics
- monthly_financial_summary
- receivables_aging
- payments_due
- tbr_race_cost_summary
- tbr_sponsor_revenue_summary
- commercial_goal_progress
- partner_performance

Exit criteria:

- overview and TBR pages can read from stable views

## Phase 5: Application Services

Implement:

- data access services
- API routes or server actions
- filter logic
- shared formatting and query utilities

Exit criteria:

- frontend does not query raw tables directly

## Phase 6: UI Implementation

Build pages in this order:

1. Overview
2. TBR
3. Costs
4. Payments
5. Commercial Goals
6. AI Analysis
7. Agent Graph
8. Workflow Graph

Exit criteria:

- each page is powered by approved views or services
- labels clearly separate LSC, TBR, and FSP

## Phase 7: Testing And QA

Implement:

- metric calculation tests
- import normalization tests
- page-level regression checks
- filter logic tests

Exit criteria:

- critical finance numbers are verified
- race and payment flows are regression-tested

## Phase 8: Iteration

After v1:

- improve FSP support
- add forecasting if formulas are approved
- add workflow automation
- add write-back operations if needed
