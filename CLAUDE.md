# LSC Finance Dashboard — Living Financial Operating System

## Project Identity
LSC Finance Dashboard is a living financial operating system for League Sports Co (LSC), built as an ontology-backed dashboard where changes propagate through shared canonical entities, derived metrics, and linked workflows. Not a static reporting UI.

### Business Scope
- **LSC** — consolidated holding company view
- **TBR** (Team Blue Rising) — active operating entity
- **FSP** (Future of Sports) — future entity with placeholder support

## Stack
- **Framework**: Next.js 15 (App Router), TypeScript strict mode
- **Styling**: Tailwind CSS (globals.css)
- **Database**: Neon Postgres via `pg` (node-postgres), raw SQL with role-based connection pooling
- **Validation**: Zod (to be adopted), currently manual validation
- **AI**: Google Gemini API (gemini-2.5-flash) for document intelligence
- **Storage**: AWS S3 for document storage (with inline fallback)
- **Auth**: Custom scrypt + HMAC-SHA256 session tokens
- **Monorepo**: pnpm workspaces (`apps/web`, `packages/db`)
- **Deployment**: Vercel

## Directory Structure
```
lsc-finance-dashboard/
├── ontology/
│   ├── schema.ts          # Drizzle schema (source of truth) [TO BUILD]
│   ├── relations.ts       # Drizzle relations [TO BUILD]
│   └── cascades.ts        # Cascade rules engine [TO BUILD]
├── agents/
│   ├── agent-graph.ts     # Agent topology, skills registry, message validation
│   ├── orchestrator.ts    # Claude-powered intent router
│   ├── finance-agent.ts   # Finance domain agent
│   ├── import-agent.ts    # Data import/normalization agent
│   ├── expense-agent.ts   # Expense workflow agent
│   ├── invoice-agent.ts   # Invoice workflow agent
│   ├── commercial-agent.ts # Commercial goals agent
│   └── ai-analyzers/
│       ├── cash-flow-analyzer.ts
│       ├── receivables-analyzer.ts
│       ├── margin-analyzer.ts
│       ├── budget-analyzer.ts
│       └── goal-tracker.ts
├── skills/
│   ├── finance/
│   │   ├── company-metrics.ts
│   │   ├── monthly-summary.ts
│   │   ├── cash-flow.ts
│   │   └── export-report.ts
│   ├── expenses/
│   │   ├── create-submission.ts
│   │   ├── approve-submission.ts
│   │   ├── manage-budget-rules.ts
│   │   └── expense-queries.ts
│   ├── invoices/
│   │   ├── create-invoice.ts
│   │   ├── approve-invoice.ts
│   │   ├── process-payment.ts
│   │   └── invoice-queries.ts
│   ├── imports/
│   │   ├── import-xlsx.ts
│   │   ├── normalize-payables.ts
│   │   ├── normalize-revenue.ts
│   │   ├── normalize-expenses.ts
│   │   └── validate-import.ts
│   ├── documents/
│   │   ├── upload-document.ts
│   │   ├── analyze-document.ts
│   │   └── document-queries.ts
│   ├── commercial/
│   │   ├── manage-goals.ts
│   │   ├── track-sponsors.ts
│   │   └── partner-performance.ts
│   └── shared/
│       ├── ontology-query.ts
│       ├── cascade-update.ts
│       └── audit-log.ts
├── apps/
│   └── web/                    # Next.js 15 app
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx            # Overview (portfolio)
│       │   ├── login/
│       │   ├── tbr/
│       │   │   ├── page.tsx        # TBR console
│       │   │   ├── races/
│       │   │   ├── my-expenses/
│       │   │   ├── expense-management/
│       │   │   ├── invoice-hub/
│       │   │   └── team-management/
│       │   ├── costs/
│       │   ├── payments/
│       │   ├── commercial-goals/
│       │   ├── documents/
│       │   ├── ai-analysis/
│       │   ├── fsp/
│       │   ├── agent-graph/
│       │   └── workflow-graph/
│       ├── components/
│       ├── lib/
│       │   ├── auth.ts
│       │   ├── session.ts
│       │   └── password.ts
│       └── middleware.ts
├── packages/
│   └── db/
│       └── src/
│           ├── app-data.ts        # Query layer (2577 lines — NEEDS REFACTOR)
│           ├── query.ts           # Connection pooling
│           ├── connection.ts      # Role-based DB URLs
│           ├── seed-data.ts       # Fallback placeholder data
│           ├── agent-graph.ts     # Agent topology visualization
│           ├── workflow-graph.ts  # Workflow stage definitions
│           ├── document-storage.ts # S3 + inline storage
│           └── schema.ts          # Table/view metadata
├── scripts/                       # Import & setup scripts
│   ├── apply-sql.mjs
│   ├── bootstrap-admin-user.mjs
│   ├── import-xlsx.mjs
│   ├── import-csv.mjs
│   ├── normalize-e1-payables.mjs
│   ├── normalize-race-expenses.mjs
│   ├── normalize-revenue.mjs
│   └── seed-*.mjs
├── sql/                           # Schema migrations (001-014)
├── imports/                       # Source data files
└── docs/                          # Specs & design docs
```

## Coding Conventions

### TypeScript
- Strict mode always (`"strict": true` in tsconfig)
- No `any` types — use `unknown` and narrow
- Explicit return types on all exported functions
- Use `satisfies` for config objects

### Database
- All queries go through `packages/db/src/query.ts` connection pools
- Role-based connections: admin (writes), app_read (reads), import (bulk loads)
- Soft delete: never `DELETE`, always set `deletedAt = new Date()`
- All queries filter `WHERE deleted_at IS NULL` by default
- All mutations must go through the cascade engine

### Finance Architecture Layers
1. **Raw input layer** — imported sheet rows, source documents
2. **Canonical domain layer** — companies, sponsors, contracts, invoices, payments, expenses, race_events
3. **Derived analytics layer** — SQL views (consolidated_company_metrics, payments_due, race_cost_summary)
4. **Application layer** — APIs, pages, analysis services

Never collapse these layers. Every UI number must be traceable to a canonical table or derived SQL view.

### Validation
- All skill inputs/outputs validated with Zod schemas
- Server action inputs parsed with `z.safeParse()` — return error on failure
- No trust of client-provided IDs without DB lookup

### Commits
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- One logical change per commit

## Agent Architecture Rules

### Orchestrator
- Single entry point for all AI operations
- Uses Claude to classify intent → generate routing plan
- Validates all routes against `AGENT_GRAPH` before execution
- Merges results from multiple agents into unified response

### Sub-Agents (finance, import, expense, invoice, commercial)
- Own their domain — no cross-domain direct mutations
- All state changes go through skills, not direct DB writes
- Emit cascade events after every mutation skill

### AI Analyzers (cash-flow, receivables, margin, budget, goal-tracker)
- **READ-ONLY** — never mutate database
- Context strictly scoped to defined entity types
- Output recommendations only — orchestrator decides if action taken
- Powered by Gemini API with structured response schemas

### Skills
- Pure async functions: `(input: ZodSchema) => Promise<ZodSchema>`
- No side effects beyond their declared scope
- Always call `cascade-update` after mutations

## Ontology Rules

### Canonical Entities
- companies, sponsors_or_customers, owners, race_events, cost_categories
- contracts, source_documents, invoices, payments, expenses
- revenue_records, commercial_targets, import_batches, raw_import_rows

### Soft Delete
All entities have `deleted_at: timestamp`. Deletion = set `deleted_at`, never remove rows.

### Cascade Updates
Every mutation triggers relevant cascades:
- Payments → receivables aging recalculated
- Invoices → payables due updated
- Expenses → race P&L updated, budget signals refreshed
- Revenue → consolidated metrics updated
- Commercial targets → goal progress recalculated

### Audit Log
Every mutation writes to `audit_log` with before/after state.
Format: `{ entityType, entityId, action, before, after, cascadeTriggered, performedBy }`

### Data Source Lineage
All imports must preserve:
- source system, source sheet/folder, row/file identifier
- import timestamp, import batch identifier
- No imported row should lose its source identity

## Finance Rules
- `Cash`, `Revenue`, `Receivables`, `Expenses`, and `Margin` must never be mixed or inferred casually
- Anything that can be computed should be derived, not manually entered
- LSC, TBR, and FSP totals must always be clearly labeled
- Never build pages that depend on ad hoc spreadsheet columns
- Always normalize imported data into canonical entities first
- If a metric is ambiguous, define it in the metric dictionary before coding

## UI Design

### Colors
- Sidebar: dark navy (#1a1a2e)
- Primary accent: emerald (#4CAF50)
- Content background: warm white (#FAFAF5)
- Cards: white with border (#E5E7EB)
- Primary text: #111827
- Secondary text: #6B7280

### Layout
- Left sidebar with navigation groups
- Role-based menu filtering (super_admin, finance_admin, team_member, etc.)
- Company selector pattern for multi-entity pages

### Components
- Cards: `rounded-lg border bg-white shadow-sm p-6`
- Tables: clean header, alternating rows, pagination
- Buttons: primary=green, secondary=white+border
- Currency: USD ($) — displayed with proper formatting

### Navigation Priority
1. Overview
2. TBR
3. Costs
4. Payments
5. Commercial Goals
6. AI Analysis

## Auth & Security
- Sessions: Custom HMAC-SHA256 tokens, 7-day expiry, HTTP-only cookies
- Passwords: scrypt hashing with random salt
- Roles: super_admin, finance_admin, team_member, commercial_user, viewer
- Middleware: All routes except /login require valid session
- DB roles: app_read (read-only), import_rw (writes during imports), admin (full)
