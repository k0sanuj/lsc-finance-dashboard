---
name: lsc-finance-dashboard
description: Use this skill when working on the League Sports Co finance dashboard, including audits, planning, ontology design, metric definitions, Neon schema and SQL views, import mapping, agentic workflow/dispatcher updates, Vercel deployment checks, and dashboard implementation for LSC, TBR, FSP, XTZ, and related finance workflows.
---

# LSC Finance Dashboard

Use this skill for any work on the League Sports Co finance dashboard. The product is a living finance operating system: canonical entities, linked relationships, audit trails, agent/workflow routing, and derived metrics drive pages and analysis.

## First Checks

Before editing, identify the active git root and app workspace. This project has had duplicate local checkouts; do not assume the current shell folder is the deployed code.

Expected active layout:

- git root: repository root containing `AGENTS.md`, `CLAUDE.md`, `skills/`, and the inner `lsc-finance-dashboard/` workspace
- app workspace: `lsc-finance-dashboard/`
- Next app: `lsc-finance-dashboard/apps/web/`
- deployment: Vercel project `lsc-finance-dashboard`

If a sibling or nested clone exists, compare `git log --oneline -n 3`, `.vercel/project.json`, and Vercel latest deployment metadata before deciding where to edit.

## Workflow

Always work in this order unless the task is explicitly isolated:

1. identify the business question
2. identify the affected metrics and entities
3. read the relevant reference file
4. identify the responsible specialist lens
5. update planning docs if definitions changed
6. implement schema, import, view, API, agent, or UI changes
7. validate metric correctness, lineage, auth, and deployment impact

## Agent Model

Act as a central coordinator that routes work to specialists. Use `references/agent-workflow.md` and the actual runtime files:

- `lsc-finance-dashboard/agents/agent-graph.ts`
- `lsc-finance-dashboard/agents/orchestrator.ts`
- `lsc-finance-dashboard/skills/dispatcher.ts`
- `lsc-finance-dashboard/ontology/cascades.ts`
- `lsc-finance-dashboard/skills/shared/cascade-update.ts`

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

## Required Reading

Read only what is needed, but for major schema, analytics, import, UI, agentic flow, or deployment work, read:

- `AGENTS.md`
- `CLAUDE.md`
- `lsc-finance-dashboard/docs/product-spec.md`
- `lsc-finance-dashboard/docs/metric-dictionary.md`
- `lsc-finance-dashboard/docs/data-ontology.md`
- `lsc-finance-dashboard/docs/UI_STANDARDS.md`
- `docs/agent-topology.md`
- this `SKILL.md`

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

## Validation Commands

Run from the inner app workspace (`lsc-finance-dashboard/`) unless the task is only editing root docs or skills:

```bash
pnpm typecheck
pnpm build
node scripts/pre-deploy-audit.mjs
```

Current caveats:

- `pnpm lint` is not a valid quality gate until the Next lint script is replaced with a real ESLint setup.
- The pre-deploy audit checks a core route subset and live services; it does not cover every added page or every dispatcher/cascade registration.
- Some scripts expect `.env.local` at the workspace root while the app uses `apps/web/.env.local`; verify env loading before trusting script failures.

## Deployment Rules

Vercel Git deployments and CLI deployments may use different roots. Before reporting deployment health:

1. read `.vercel/project.json`
2. check the Vercel latest deployment and last READY deployment
3. inspect failed deployment logs
4. verify whether the build used the repo root or the inner `lsc-finance-dashboard/` workspace

The known failure mode is Vercel Git building from the wrong root with a dashboard build command like `cd lsc-finance-dashboard/apps/web && npx next build`, which can fail Turbopack root/package resolution even when local `pnpm build` passes from the inner workspace.

Prefer one source of truth:

- set the Vercel Project Root Directory to `lsc-finance-dashboard`, or
- add root-level workspace/config scripts that intentionally build the nested app

Do not deploy if the latest production deployment is `ERROR`, even if the previous production alias still serves.

## Agentic Flow Checks

When changing or auditing agentic flows:

- every declared skill in `AGENT_SKILLS` must have a handler in `skills/dispatcher.ts`, unless it is an explicit infra skill (`ontology-query`, `cascade-update`, `audit-log`) or orchestrator-internal skill
- every write-capable server action must call `cascadeUpdate()` with `trigger`, `action`, and `agentId`
- every `cascadeUpdate()` trigger used by app code should have a rule in `ontology/cascades.ts`
- HITL and analyzer steps must not mutate canonical records without a human confirmation path
- orchestrator LLM routing depends on `ANTHROPIC_API_KEY`; document/image extraction depends on `GEMINI_API_KEY`
- `/agent-graph/dispatcher-status` should show missing dispatcher coverage before new agent work is considered complete

Use a quick dispatcher/cascade audit when relevant:

```bash
rg -n "cascadeUpdate\\(|trigger:" lsc-finance-dashboard/apps lsc-finance-dashboard/skills
rg -n "AGENT_SKILLS|SKILL_REGISTRY" lsc-finance-dashboard/agents lsc-finance-dashboard/skills
```

## Security Checks

API routes are excluded from middleware, so each API route must enforce its own auth. Do not introduce public bearer bypasses. Internal API calls should require a real secret, admin session, Vercel cron auth, or verified HMAC.

Verify Vercel env names when touching AI, cron, Legal, QuickBooks, S3, or internal APIs. The minimum deployment audit env list is not exhaustive.

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
10. Do not declare future agent skills, routes, tabs, or metrics as complete until handlers, auth, cascades, and validation exist.

## Current Product Direction

Current primary sections:

1. Overview
2. TBR
3. FSP
4. Costs
5. Payments
6. Receivables
7. Commercial Goals
8. AI Analysis
9. Documents
10. Agent Graph / Workflow Graph
11. Operational modules such as vendors, subscriptions, payroll invoices, QuickBooks, audit log, treasury, cap table, litigation, and FSP sports modules when backed by canonical data

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
- report deployment status and remaining risk when deployment or production behavior is in scope
