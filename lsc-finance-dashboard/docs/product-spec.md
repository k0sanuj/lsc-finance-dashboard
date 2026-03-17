# Product Spec

## Product Name

League Sports Co Finance Dashboard

## Product Intent

Build a living finance dashboard for League Sports Co (`LSC`) that acts as an internal financial operating system rather than a static reporting layer. The system should unify imported financial records, canonical business entities, and derived analytics into one interconnected application.

The dashboard should:

- present consolidated LSC financial performance
- provide detailed TBR operating visibility
- support FSP as a future-ready entity in schema and filters
- track costs, invoices, receivables, and payments
- track commercial goals and sponsorship progress
- support AI-generated analysis from approved derived metrics

## Current Business Scope

### LSC

League Sports Co is the parent operating and finance view. It consolidates the active business units.

### TBR

Team Blue Rising is the current active entity. It operates as a team in the E1 series. Its current revenue is primarily sponsorship-driven, with additional revenue sources such as prize money or other team-related income.

### FSP

Future of Sports is a future business line. It should be supported in schema and consolidated logic, but may remain largely zero-filled or placeholder-driven in v1.

## Product Principles

1. The product is a living app, not a presentation-only dashboard.
2. Imported data must flow through canonical entities and then into derived analytics.
3. Every major page should answer a distinct business question.
4. Consolidated and entity-specific numbers must be visually separated.
5. No raw spreadsheet logic should live in the UI.
6. Filters and drill-downs must preserve financial truth.
7. Selected detail should open progressively: key facts first, deeper tables second.

## Primary Users

- founder or operator
- finance lead
- commercial lead
- operations lead for TBR

## V1 Navigation

1. Overview
2. TBR
3. Costs
4. Payments
5. Commercial Goals
6. AI Analysis
7. Documents
8. Agent Graph
9. Workflow Graph

## Page Requirements

### 1. Overview

Purpose:

- show LSC consolidated health at a glance
- show TBR contribution clearly
- keep FSP visible in model but not visually dominant while unlaunched

Main KPIs:

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

Main sections:

- KPI strip
- revenue trend over time
- cost trend over time
- cash flow table by month
- revenue composition by entity and type
- receivables summary
- upcoming payments summary
- AI summary card

### 2. TBR

Purpose:

- provide detailed team-level operating and finance visibility

Main sections:

- TBR overview
- user console entry points:
  - my expenses
  - races
- season-wise race browser
- race-detail workflow for user bill and receipt intake
- sponsor revenue summary
- prize money summary
- admin-only review tools for:
  - race budget dashboard
  - expense approvals
  - invoice approvals
  - team management
  - AI-assisted budget and per-diem document import for each race

Required filters:

- date range
- race
- cost category
- sponsor

### 3. Costs

Purpose:

- provide a control center for expenses and cost composition
- start with company selection before any detailed cost content is shown

Main sections:

- root index page with company selector: `TBR` or `FSP`
- company workspace route after selection
- workspace cards:
  - cost overview
  - detailed breakdown
  - cost analyzer
- selected summary, chart, table, AI comment block, or source-detail surface only after company and workspace are chosen

For v1, prioritize TBR cost visibility. FSP cost structure may remain defined but unpopulated.

### 4. Payments

Purpose:

- track due payments and payment operations
- make payables readable as a company-first operational flow

Main sections:

- root index page with company selector: `TBR` or `FSP`
- company workspace route after selection
- workspace cards:
  - payment overview
  - due tracker
  - invoice intake
  - settlement path
- selected queue or process surface after workspace choice
- categorized popup for invoice and payable intake
- queue table showing saved intake mapping and downstream platform updates
- selected source-detail surface only when one run is intentionally opened

### 5. Commercial Goals

Purpose:

- track sponsorship and revenue targets versus actual progress
- keep commercial planning indexed by company first

Main sections:

- root index page with company selector: `TBR` or `FSP`
- company workspace route after selection
- workspace cards:
  - snapshot
  - target path
  - owner accountability
  - source documents
- selected summary or table surface after workspace choice
- categorized popup for sponsorship, prize, and commercial source documents
- queue table showing saved intake mapping and downstream platform updates
- selected source-detail surface only when one run is intentionally opened

### 6. AI Analysis

Purpose:

- provide structured financial interpretation, anomaly detection, and action prompts

Main sections:

- monthly financial summary
- commercial performance summary
- anomaly summary
- recommended actions

AI output must only use approved derived metrics and should never infer unsupported numbers.

### 7. Documents

Purpose:

- make uploaded contracts, invoices, statements, reimbursement files, and other finance documents the source-backed truth layer for the app
- let the user upload a document, or create a controlled manual entry when no source file exists, then run AI extraction, approve or correct the extracted fields, and post approved values into canonical records
- keep intake navigable through company and document-workspace selection first

Main sections:

- root index page with company selector: `TBR` or `FSP`
- company workspace route after selection
- workflow cards for the selected company
- analyzer intake surface
- categorized intake popup with required fields per document category
- queue for the selected workflow
- selected document preview
- bill-origin and currency scan summary
- saved intake-field table
- platform-update mapping table
- extracted field review
- approval workspace
- posting history
- source-document to canonical-record lineage

Required workflow:

1. upload document
2. or create controlled manual entry
3. detect document type
4. extract key fields with confidence
5. show proposed finance interpretation
6. let user approve or edit fields
7. post approved fields into canonical records
8. preserve lineage and approval history

Examples:

- sponsorship contract -> sponsor, value, start/end date, payment schedule, owner
- vendor invoice -> counterparty, amount, due date, race link, category
- prize / statement document -> amount, date, counterparty, recognition event
- reimbursement report -> person, merchant, date, category, reimbursable status
- manual entry -> explicit reason, reviewer, effective date, and canonical posting target

User-side bill and receipt analysis should default to a narrow table view:

- preview
- expense date
- original amount
- original currency
- USD amount
- workflow status

### 8. Agent Graph

Purpose:

- show how the Finance Overlord agent coordinates specialist agents
- show which agents connect directly to the core
- show which specialists exchange data or handoffs with each other
- make the internal operating model of the app visible

Main sections:

- central Finance Overlord node
- direct specialist nodes
- secondary sub-agent nodes where applicable
- active/inactive status indicators
- current task ownership panel
- recent handoff log

Visual direction:

- central-node network graph
- node-and-edge structure similar to a neural network or memory graph
- edges should indicate direction and type of interaction

### 9. Workflow Graph

Purpose:

- show how work moves through the system from planning to data ingestion to analytics to dashboard output
- let the user inspect how workflows are connected and where a task currently sits

Main sections:

- stage blocks connected by directional lines
- current workflow status view
- dependency map
- recent execution history
- failed or blocked stage indicators

Visual direction:

- block-based graph
- connected rectangular stages with arrows
- clear separation between planning, schema, import, analytics, UI, QA, and AI interpretation

## V1 Exclusions

Do not include these in v1 unless source definitions become stable:

- advanced forecasting engine
- fully operational FSP dashboard
- CRM-style sponsorship pipeline system
- document OCR workflow
- write-back expense submission portal
- complex role-permission system

## Success Criteria

V1 is successful when:

- consolidated LSC metrics are accurate and clearly labeled
- TBR can be analyzed by sponsor, race, and cost type
- payments due and receivables can be monitored
- commercial targets can be tracked monthly
- all UI values are traceable to canonical tables or derived views
- canonical finance records can be traced back to uploaded source documents and approval decisions
