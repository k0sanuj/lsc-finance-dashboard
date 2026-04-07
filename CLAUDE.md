# LSC Finance Dashboard — Living Financial Operating System

## Project Identity
A living financial operating system for League Sports Co (LSC). Ontology-backed dashboard where changes propagate through shared canonical entities, derived metrics, and linked workflows. Not a static reporting UI.

## MANDATORY: UI Standards (read docs/UI_STANDARDS.md)
- Every page is a **workspace** — users MUST be able to add, edit, and manage data directly
- Every table MUST have a corresponding input form on the same page
- Metric cards show ONE value per card — never concatenate multi-year data as strings
- Empty states are actionable (setup prompts) — never show $0 tables or "coming soon" text
- Hide modules/sports with no data in consolidated views
- Never ship a tab without full implementation
- Year-over-year data uses 3-column layouts, not string concatenation

### Business Scope
- **LSC** — consolidated holding company view
- **TBR** (Team Blue Rising) — active operating entity
- **FSP** (Future of Sports) — future entity with placeholder support

## Stack
- **Framework**: Next.js 16.2.1 (App Router), React 19, TypeScript strict mode
- **Styling**: Vanilla CSS with CSS custom properties (`globals.css`) — NOT Tailwind
- **Database**: Neon Postgres via `pg` (node-postgres), raw SQL with role-based connection pooling
- **Validation**: Manual validation (Zod planned but not yet adopted)
- **AI**: Google Gemini API (`gemini-2.5-flash`) for document intelligence
- **Storage**: AWS S3 for document storage (with inline base64 fallback)
- **Auth**: Custom HMAC-SHA256 session tokens via Web Crypto API
- **Monorepo**: pnpm workspaces (root `package.json` + `lsc-finance-dashboard/` inner workspace)
- **Deployment**: Vercel

## Actual Directory Structure

The repo has a nested structure — the git root is `lsc-finance-dashboard-1/`, and the main workspace lives inside `lsc-finance-dashboard/`:

```
lsc-finance-dashboard-1/          # Git root
├── CLAUDE.md
├── AGENTS.md
├── SECURITY.md
├── package.json                   # Root workspace config
├── docs/                          # High-level docs (starter-checklist, codex setup)
├── skills/                        # Codex skill definitions
│   ├── lsc-finance-dashboard/
│   └── lsc-section-categorization/
└── lsc-finance-dashboard/         # Inner workspace
    ├── package.json               # pnpm scripts (dev, build, db:*, import:*, seed:*)
    ├── vercel.json                # Vercel deployment config
    ├── tsconfig.base.json         # Shared TS config
    ├── ontology/
    │   ├── schema.ts              # Canonical type definitions + enums (all entities)
    │   ├── relations.ts           # Entity relationship graph
    │   ├── cascades.ts            # Cascade rules engine (trigger → actions)
    │   └── index.ts
    ├── agents/
    │   ├── agent-graph.ts         # Agent topology, skill registry, routing validation
    │   └── orchestrator.ts        # Intent classification + plan execution
    ├── skills/
    │   └── shared/
    │       ├── audit-log.ts       # Audit log skill (stub — console-only for now)
    │       └── cascade-update.ts
    ├── apps/
    │   └── web/                   # Next.js app
    │       ├── next.config.ts     # CSP headers, transpilePackages, tracing root
    │       ├── middleware.ts       # Session-based auth guard
    │       ├── lib/
    │       │   ├── auth.ts        # Session management, login, role checks
    │       │   ├── session.ts     # HMAC-SHA256 token create/verify (Web Crypto)
    │       │   └── password.ts    # Password hashing
    │       └── app/
    │           ├── layout.tsx     # Root layout with SessionShell
    │           ├── session-shell.tsx  # Client-side sidebar + nav + breadcrumbs
    │           ├── page.tsx       # Overview (portfolio dashboard)
    │           ├── globals.css    # All styles (CSS custom properties, no Tailwind)
    │           ├── login/         # Login page + actions
    │           ├── logout/        # POST route for sign-out
    │           ├── tbr/
    │           │   ├── page.tsx           # TBR console
    │           │   ├── races/             # Race list + [raceId] detail
    │           │   ├── my-expenses/       # Personal expense view
    │           │   ├── expense-management/ # Admin review + [submissionId] detail
    │           │   ├── invoice-hub/       # Invoice intake + actions
    │           │   └── team-management/   # User/team admin
    │           ├── costs/[company]/       # Cost breakdown by company
    │           ├── payments/[company]/    # Payment tracking by company
    │           ├── commercial-goals/[company]/ # Commercial targets by company
    │           ├── documents/[company]/   # Document intelligence by company
    │           ├── ai-analysis/           # AI analysis dashboard
    │           ├── fsp/                   # FSP placeholder
    │           ├── agent-graph/           # Agent topology visualization
    │           ├── workflow-graph/        # Workflow stage visualization
    │           ├── api/analyze/           # POST route for Gemini doc analysis
    │           ├── components/            # Shared UI components
    │           │   ├── paginated-table.tsx
    │           │   ├── race-bill-table.tsx
    │           │   ├── race-budget-rule-builder.tsx
    │           │   ├── race-expense-report-builder.tsx
    │           │   ├── document-analyzer-panel.tsx
    │           │   ├── document-analysis-summary.tsx
    │           │   ├── company-selection-index.tsx
    │           │   ├── company-workspace-index.tsx
    │           │   ├── company-workspace-shell.tsx
    │           │   └── modal-launcher.tsx
    │           └── lib/
    │               ├── shared-workspace.ts
    │               └── workflow-labels.ts
    ├── packages/
    │   └── db/                    # @lsc/db package
    │       └── src/
    │           ├── index.ts       # Re-exports everything
    │           ├── query.ts       # Connection pools (getPool, getAdminPool, queryRows, queryRowsAdmin)
    │           ├── connection.ts  # Role-based DB URL derivation
    │           ├── metadata.ts    # DB metadata + required env vars
    │           ├── schema.ts      # Table/view metadata constants
    │           ├── app-data.ts    # Re-exports queries (1 line — queries were refactored out)
    │           ├── seed-data.ts   # Fallback placeholder data
    │           ├── agent-graph.ts # Agent graph visualization data
    │           ├── workflow-graph.ts # Workflow stage definitions
    │           ├── document-storage.ts # S3 upload/preview + inline fallback
    │           └── queries/       # Domain query modules (refactored from app-data.ts)
    │               ├── index.ts
    │               ├── shared.ts      # Formatters, helpers, types (313 lines)
    │               ├── finance.ts     # Overview metrics, cash flow, entity snapshots (279 lines)
    │               ├── costs.ts       # Cost breakdown queries (193 lines)
    │               ├── expenses.ts    # Expense submissions, items, splits (649 lines)
    │               ├── invoices.ts    # Invoice intake queries (114 lines)
    │               ├── documents.ts   # Document analysis queries (363 lines)
    │               ├── commercial.ts  # Commercial goals, sponsors (105 lines)
    │               ├── races.ts       # Race events, seasons, budgets (362 lines)
    │               ├── teams.ts       # Team/user management (120 lines)
    │               └── system.ts      # System status, data backend (329 lines)
    ├── scripts/                   # Node.js scripts (.mjs)
    │   ├── pre-deploy-audit.mjs   # MANDATORY pre-deploy checks
    │   ├── apply-sql.mjs          # Run SQL migrations
    │   ├── bootstrap-admin-user.mjs
    │   ├── import-xlsx.mjs / import-csv.mjs
    │   ├── normalize-*.mjs        # Data normalization scripts
    │   ├── seed-*.mjs             # Seed data scripts
    │   └── deploy-preview.mjs
    ├── sql/                       # Schema migrations (001-014)
    ├── imports/                   # Source data manifests
    └── docs/                      # Design specs & docs
```

## Key Architecture Details

### Database Query Layer (`@lsc/db`)
- **Read pool**: `queryRows()` — uses `lsc_app_read` role or falls back to admin URL
- **Write pool**: `queryRowsAdmin()` / `executeAdmin()` — uses `DATABASE_URL_ADMIN`
- Raw SQL queries, no ORM — all queries in `packages/db/src/queries/`
- Queries were refactored from monolithic `app-data.ts` into domain-specific modules
- `app-data.ts` is now just `export * from "./queries"` (1 line)

### Ontology Layer (`ontology/`)
- `schema.ts`: TypeScript types mirroring SQL tables (not Drizzle — plain types + const enums)
- `relations.ts`: Declarative entity relationship graph
- `cascades.ts`: Trigger → Action rules engine (currently, SQL views are always-current so most actions are no-ops; audit-log and analyzer triggers are stubs)

### Agent Architecture (`agents/`)
- `agent-graph.ts`: Defines 11 agents (1 orchestrator, 6 specialists, 5 analyzers) with topology, skills registry, and routing validation
- `orchestrator.ts`: Intent classification (keyword-based stub, Gemini integration planned) + topological plan execution with parallel steps
- Analyzers are READ-ONLY with scoped context

### Auth System
- **NOT scrypt** — uses Web Crypto `HMAC-SHA256` for session tokens
- Password hashing is in `lib/password.ts`
- Session token format: `base64url(payload).base64url(hmac_signature)`
- 7-day expiry, HTTP-only cookies
- Middleware redirects unauthenticated users to `/login`
- Roles: `super_admin`, `finance_admin`, `team_member`, `commercial_user`, `viewer`
- Role-based nav filtering in `session-shell.tsx`

### Styling
- **Vanilla CSS** with CSS custom properties in `globals.css`
- Design tokens: `--bg`, `--bg-deep`, `--surface`, `--ink`, `--ink-soft`, `--line`, `--brand`, `--accent`, `--good`, `--warn`, `--risk`
- Sidebar: dark navy (`--bg-deep: #0f2438`)
- Accent: warm copper (`--accent: #b56a3d`)
- Layout: CSS Grid sidebar (310px) + content area
- Components: no `apps/web/components/` — all components live in `apps/web/app/components/`

### Document Intelligence
- Gemini API integration in `app/documents/gemini.ts`
- API route at `/api/analyze` for file upload + analysis
- S3 storage with inline base64 fallback for previews
- Workflow contexts: generic review, race expense submission, invoice intake, cost review

## Coding Conventions

### TypeScript
- Strict mode (`"strict": true`)
- Target ES2022, module ESNext, bundler resolution
- Path aliases: `@lsc/db` → `packages/db/src/index.ts`
- `satisfies` used for config objects (e.g., `StoredDocumentMetadata`)

### Database
- All reads through `queryRows()`, all writes through `queryRowsAdmin()` / `executeAdmin()`
- Role-based connections: admin (writes), app_read (reads), import (bulk loads)
- Soft delete: set `deleted_at`, never `DELETE`
- All queries filter `WHERE deleted_at IS NULL` by default
- SQL migrations numbered `001` through `014` in `sql/`

### Finance Architecture Layers
1. **Raw input** — imported sheet rows, source documents
2. **Canonical domain** — companies, sponsors, contracts, invoices, payments, expenses, race_events
3. **Derived analytics** — SQL views (consolidated_company_metrics, payments_due, tbr_race_cost_summary)
4. **Application** — APIs, pages, analysis services

Never collapse these layers. Every UI number must trace to a canonical table or derived view.

### Page Patterns
- Company-scoped pages use `[company]` dynamic segments (costs, payments, documents, commercial-goals)
- Index pages (costs, payments, etc.) render a company selection screen
- Server components fetch data with `await` calls to `@lsc/db` functions
- Server actions in co-located `actions.ts` files
- Error/loading boundary files per route segment

### Commits
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- One logical change per commit

## Environment Variables

### Required
- `DATABASE_URL` or `DATABASE_URL_ADMIN` — Neon Postgres connection
- `AUTH_SESSION_SECRET` — HMAC signing key for sessions
- `GEMINI_API_KEY` — Google Gemini API key

### Optional
- `DATABASE_URL_APP_READ` — Dedicated read-only connection
- `LSC_APP_READ_PASSWORD` / `LSC_APP_READ_ROLE` — Derive read URL from admin URL
- `LSC_IMPORT_RW_PASSWORD` / `LSC_IMPORT_RW_ROLE` — Import role
- `LSC_DATA_BACKEND` — `"database"` or `"seed"` (fallback placeholder data)
- `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — Document storage
- `DOCUMENT_STORAGE_BACKEND` — `"s3"` or `"inline"` (default)
- `GEMINI_MODEL` — Override model (default: `gemini-2.5-flash`)

## Pre-Deploy Audit (MANDATORY)

```bash
cd lsc-finance-dashboard && node scripts/pre-deploy-audit.mjs
```

Checks: env vars, DB connection, critical queries, Gemini key, S3, page routes, build compilation, Vercel env parity.

**Do not deploy if any check fails.**

### Deploy Process
1. Make code changes
2. Run `node scripts/pre-deploy-audit.mjs` — all checks must pass
3. `git add && git commit`
4. `git push origin main`
5. `cd lsc-finance-dashboard && npx vercel --prod --scope anujsingh012001-gmailcoms-projects --yes`

### Env Var Rules
- ALWAYS use `printf` (never `echo`) when adding Vercel env vars
- `echo` adds trailing newlines that silently break string comparisons

## pnpm Scripts (from `lsc-finance-dashboard/package.json`)

```bash
pnpm dev                    # Start dev server
pnpm build                  # Build for production
pnpm typecheck              # TypeScript check
pnpm db:apply               # Apply core SQL migrations
pnpm db:apply:expense-workflow  # Apply expense management schema
pnpm db:apply:invoice-workflow  # Apply invoice workflow schema
pnpm db:apply:race-budgets  # Apply budget rules schema
pnpm db:setup-roles         # Apply role/grant SQL
pnpm auth:bootstrap-admin   # Create initial admin user
pnpm import:xlsx / import:csv  # Import data
pnpm normalize:e1-payables  # Normalize payables
pnpm normalize:race-expenses # Normalize expenses
pnpm normalize:revenue      # Normalize revenue
pnpm seed:document-analysis # Seed document data
pnpm seed:expense-management # Seed expense data
pnpm seed:invoice-workflow  # Seed invoice data
```
