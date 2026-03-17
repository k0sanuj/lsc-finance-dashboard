---
name: lsc-section-categorization
description: Use this skill when creating or refactoring a section, tab, workspace, or workflow surface in the League Sports Co finance app. It defines how pages should be categorized, sequenced, and reduced into clear company-first and workflow-first UI.
---

# LSC Section Categorization

Use this skill whenever a new UI/UX section is created or an existing section is reorganized. The goal is to stop pages from becoming mixed dashboards with unrelated actions, detail panes, and analysis blocks competing on the same screen.

## Core Rule

Every section must answer one clear question first, then reveal the next decision only when the user has chosen context.

Do not build pages where overview, queue, analyzer, detail, and approval are all visible at once without a clear sequence.

## Section Design Order

When designing a new section, always structure it in this order:

1. identify the company context
2. identify the workspace within that company
3. identify the page purpose
4. identify the primary user action
5. decide what detail stays hidden until selected
6. decide what data points update after save or approval

## Default Flow Shapes

### Shared Finance Admin Pages

Use this shape for sections like `Costs`, `Payments`, `Documents`, and `Commercial Goals`:

1. root index page
   - choose company: `TBR` or `FSP`
2. company workspace page
   - choose workspace card
3. workspace surface
   - show summary first
   - then charts, queue, or table
4. selected detail
   - only after a row, run, race, or card is chosen
5. action modal or popup
   - for add, analyze, upload, approve, or post

Selected detail should open in layers:

- preview and key facts first
- deeper tables behind disclosure or secondary sections

Do not dump every extracted field table, posting table, and mapping table fully expanded at once.

Never pre-expand the selected detail by default unless the page exists only to review one record.

### User Workflow Pages

Use this shape for user-side submission flows:

1. user home
2. task list or race list
3. chosen context
4. current table or history
5. popup to add something
6. saved result visible back in the table

User pages should never expose confidential cross-company finance or admin queue data.

### Admin Review Pages

Use this shape for admin-only review surfaces:

1. entity or race filter
2. queue table
3. selected submission detail
4. approval decision area
5. resulting status and downstream effect

## Popup Rules

Every popup for `Add`, `Upload`, `Analyze`, or `Create` must follow the same sequence:

1. ask what category is being added
2. show only the required fields for that category
3. show what will be updated across the platform
4. submit and save
5. reflect the result in the relevant table
6. show the saved mapping in the selected detail view

Do not use generic upload popups with no category or no downstream mapping.

## Required Mapping After Save

For any intake or add flow, the UI must make these visible:

- saved category
- required intake fields
- extracted or entered values
- current workflow status
- which platform areas are updated
- which tables or metrics will change

If this mapping is not visible in the queue row or selected detail, the section is incomplete.

## Financial Page Heuristics

### Overview

- start with `LSC`
- show `TBR` and `FSP` underneath
- keep it strategic, not operational

### Entity Hubs

- start with `Overview`
- then branch into workflows
- example:
  - `My Expenses`
  - `Races`
  - `Review Console`

### Costs

- choose company first
- if the company is `TBR`, choose season next
- then choose one race inside that season
- then choose:
  - overview
  - detailed breakdown
  - charts
  - AI comments
  - source-backed analyzer
- keep source-backed analyzer anchored to the selected season or race, never floating without that context

### Payments

- choose company first
- then choose:
  - due tracker
  - settlement path
  - invoice-linked operations

### Documents

- choose company first
- then choose workflow
- then intake queue
- then selected analysis detail

## Red Flags

Stop and refactor if a page has any of these:

- analyzer detail rendered before context is selected
- giant tables as the entire page
- repeated explainer cards saying the same thing
- admin tools inside user workflows
- raw workflow ids or UUID-like labels visible to users
- add buttons with no categorized form behind them
- pages so wide that they only make sense when zoomed out
- no obvious primary action
- selected detail that expands into four or five full tables at once

## Decision Checklist

Before finishing a new section, verify:

1. does the page start with context selection if needed?
2. is the primary user action obvious?
3. is detail hidden until selection?
4. are the add/upload actions categorized?
5. does save or approval reflect in a visible table?
6. does the page show what platform data was updated?
7. is the page appropriate for the role viewing it?

If any answer is `no`, the section should not be considered complete.
