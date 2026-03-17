---
name: lsc-finance-dashboard
description: Use this skill when working on the League Sports Co finance dashboard, including planning, ontology design, metric definitions, Neon schema and SQL views, Google Sheets import mapping, multi-agent coordination, and dashboard implementation for LSC, TBR, and FSP.
---

# LSC Finance Dashboard

Use this skill for any work on the League Sports Co finance dashboard. This project is planning-first and ontology-first. The goal is a living finance app where canonical entities, linked relationships, and derived metrics drive all pages and analysis.

## Workflow

Always work in this order unless the task is explicitly isolated:

1. identify the business question
2. identify the affected metrics and entities
3. read the relevant reference file
4. update planning docs if definitions changed
5. implement schema, import, view, API, or UI changes
6. validate metric correctness and lineage

## Agent Model

Act as a central coordinator that routes work to specialists. Use the agent topology in `references/agent-workflow.md`.

Recommended specialists:

- finance architect
- data ontology architect
- schema engineer
- import pipeline engineer
- app engineer
- frontend experience agent
- QA debug agent
- AI analysis agent

Do not let UI work proceed on invented finance logic.

## Required References

Read only the relevant references for the task:

- `references/metrics-and-ontology.md`
  - use for KPI definitions, entities, relationships, and canonical modeling
- `references/agent-workflow.md`
  - use for coordinator and specialist behavior
- `references/build-phases.md`
  - use for dependency-safe execution order
- `references/frontend-design.md`
  - use for page hierarchy, styling decisions, information architecture, and frontend quality rules
- `../lsc-section-categorization/SKILL.md`
  - use whenever creating or refactoring a section, tab, workspace, company route, popup, or action flow in the UI

## Non-Negotiable Rules

1. Treat the app as a living system, not a static dashboard.
2. Preserve lineage from raw input to canonical records.
3. Derive metrics from approved logic only.
4. Keep business logic out of presentational components.
5. Clearly distinguish consolidated and entity-specific numbers.
6. Favor stable SQL views and domain services over duplicated calculations.
7. For frontend work, optimize for clarity, spacing, and action hierarchy before visual polish.
8. Use the League Sports Co brand language as the primary visual reference, not generic dashboard defaults.
9. For any new section UI/UX work, enforce company-first or workflow-first categorization before adding tables, analyzers, or detail panels.

## Current Product Direction

Current primary sections:

1. Overview
2. TBR
3. FSP
4. Costs
5. Payments
6. Commercial Goals
7. AI Analysis

Current frontend cleanup rules:

- user submission paths and admin finance paths must not be mixed on the same surface
- do not place reviewer tools like `Expense Queue` or `Invoice Hub` inside the user branch
- `team_member` navigation should stay narrow, task-based, and free of confidential financial views
- keep the signed-in operator visible in the shell
- use modal or popup entry for secondary create actions like `Add Expense`
- remove redundant explainer cards before adding more UI density

Current frontend hierarchy for this phase:

- `Overview` = portfolio-level LSC with explicit `TBR` and `FSP` separation
- `TBR` = user console first (`My Expenses`, `Races`), then season selection, then race cards, then one race workspace with a modal upload action
- `FSP` = matching structural shell with low-density placeholder states until live data exists
- `Costs`, `Invoice Hub`, and `Expense Management` = should each expose an in-context document analyzer entry
- keep `user submission flows` and `admin approval flows` in separate surfaces whenever possible
- shared finance-admin pages should follow one pattern:
  - root index page with company selection first
  - company-specific workspace page second
  - overview / summary or queue third
  - selected detail only when intentionally opened
- on `Costs`, the TBR workspace should always expose:
  - cost overview
  - detailed breakdown
  - charts
  - finance-style AI commentary
  - source-backed analyzer only after the rollup or breakdown is open
- never dump raw workflow ids, UUID-like route context, or oversized analyzer detail at the top of an operational page

## Output Standard

For major work:

- state the specialist lens being used
- name affected files and layers
- implement changes
- validate correctness
- note assumptions or missing source data
