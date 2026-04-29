# Project Audit - 2026-04-29

## Scope

Audited the active deployed checkout at:

- git root: `/Users/anujsingh/lsc-finance-dashboard/lsc-finance-dashboard-1`
- app workspace: `lsc-finance-dashboard/`
- Vercel project: `lsc-finance-dashboard`

The outer checkout at `/Users/anujsingh/lsc-finance-dashboard` is stale relative to production and contains `lsc-finance-dashboard-1/` as an untracked nested repo. Treat the nested repo as the current production source until the local workspace is consolidated.

## Deployment Status At Audit Time

Latest Vercel deployment:

- deployment: `dpl_5vDVBpB9gqhLNvUtgG7KRPxsmGWx`
- created: 2026-04-29 17:25:43 IST
- commit: `3346510` (`Remove GitHub setup test`)
- target: production
- state: `ERROR`
- source: Git

Last successful production deployment:

- deployment: `dpl_Awp8er8aLvnA7VEFWtKsZs82SuXE`
- created: 2026-04-29 15:25:29 IST
- commit: `ed6b725` (`feat(legal): contract.created/updated webhook events - Legal owns contracts`)
- state: `READY`
- source: CLI
- production alias: `https://lsc-finance-dashboard.vercel.app`

Production `/login` returns HTTP 200 from the last READY deployment.

## Validation Results

From `lsc-finance-dashboard/`:

- `pnpm typecheck`: passed
- `pnpm build`: passed
- `node scripts/pre-deploy-audit.mjs`: passed, 67 checks
- `pnpm lint`: failed because `next lint` is not a valid lint gate in this Next.js setup

The local build passes from the inner workspace, but Git-triggered Vercel builds fail because Vercel is building from the wrong root/config path. The failed deployment log shows:

```text
Next.js inferred your workspace root, but it may not be correct.
We couldn't find the Next.js package (next/package.json) from the project directory:
/vercel/path1/lsc-finance-dashboard/apps/web/app
```

Deployment configuration update made after the audit:

- Vercel Project Root Directory was changed from `.` to `lsc-finance-dashboard`.
- Vercel Build Command was changed to `npm exec -- pnpm --filter web build`.
- Vercel Install Command was changed to `npm exec -- pnpm install --no-frozen-lockfile`.
- Vercel Output Directory was changed to `apps/web/.next`.
- Vercel Dev Command was changed to `npm exec -- pnpm --filter web dev`.

## Key Issues

1. Workspace/source confusion
   - The outer repo is behind the nested live repo.
   - Future work can easily land in the wrong checkout.

2. Vercel Git deployment was broken at audit time
   - CLI deploy from the inner workspace produced the last READY production deployment.
   - Git deployments are failing on Turbopack workspace root/package resolution.
   - The project settings were updated to use `lsc-finance-dashboard` as the root directory; the next Git or CLI production deployment should be checked for `READY`.

3. CI is not active from the real git root
   - The workflow file is under `lsc-finance-dashboard/.github/workflows/ci.yml`.
   - GitHub only runs workflows from `.github/workflows` at the repository root.
   - If moved to root, it must also run commands in the correct workspace.

4. Lint gate is broken
   - `apps/web/package.json` uses `next lint`.
   - Current command fails before linting.
   - Add a real ESLint config/script or remove lint from release gates until configured.

5. Agentic dispatcher is partially wired
   - Declared skills: 108
   - Registered dispatcher handlers: 65
   - Missing dispatcher handlers: 43
   - `/agent-graph/dispatcher-status` should be treated as a required agentic-flow check before claiming agents are complete.

6. Cascade coverage is incomplete
   - App code uses 44 cascade triggers.
   - `ontology/cascades.ts` has rules for 17 triggers.
   - 35 used triggers currently have no cascade rule, so they only get an audit row with no declared downstream actions.

7. AI/orchestrator env checks are incomplete
   - Vercel has `ANTHROPIC_API_KEY`.
   - Local `apps/web/.env.local` does not list `ANTHROPIC_API_KEY`.
   - `pre-deploy-audit.mjs` checks Gemini but not Anthropic, even though the orchestrator routes T1 classification through Anthropic.

8. Public internal ingest bypass
   - `/api/ingest` accepts `Authorization: Bearer internal`.
   - API routes are excluded from middleware, so this is a public bypass unless another layer blocks it.
   - Replace it with a real internal secret, admin session requirement, or same-origin server action path.

9. Test coverage is effectively absent
   - `tests/` contains only `.gitkeep`.
   - Current confidence comes from typecheck, build, pre-deploy audit, and live smoke checks.

10. Pre-deploy audit is useful but incomplete
   - It checks core routes, DB, Gemini, S3, Vercel env names, and build.
   - It does not cover all 61 built routes, dispatcher coverage, cascade rule coverage, Anthropic, CI placement, or API auth regressions.

## Agentic Flow Status

Working:

- Agent graph exists and validates declared agent/skill relationships.
- Orchestrator can classify plans through the LLM provider layer when env is configured.
- Dispatcher returns structured success/error envelopes.
- HITL steps are skipped unless `autoRunHitl` is true.
- Audit log writes to `audit_log` through `cascadeUpdate()`.

Not complete:

- 43 declared skills have no dispatcher handler.
- Many mutation triggers have no cascade rule.
- Analyzer/orchestrator local tests are stale: some scripts expect `.env.local` at workspace root and comments mention Gemini even though routing uses Anthropic.
- No regression suite exercises `/api/orchestrate`, `/api/dispatch`, or the UI dispatcher status page.

## Next Work

1. Consolidate the workspace.
   - Decide whether `/Users/anujsingh/lsc-finance-dashboard/lsc-finance-dashboard-1` replaces the stale outer checkout or should be moved to a clean location.

2. Verify Vercel Git deployment.
   - The Vercel project root is now set to `lsc-finance-dashboard`.
   - Confirm the next Git deployment is `READY`.

3. Move and repair CI.
   - Put workflow files in root `.github/workflows`.
   - Run commands from the correct workspace.
   - Include `pnpm typecheck`, `pnpm build`, and the expanded audit checks.

4. Replace the lint script.
   - Add ESLint for Next/React/TypeScript or remove `pnpm lint` from scripts until configured.

5. Close agentic-flow gaps.
   - Either register handlers for the 43 missing declared skills or remove/defer declarations that are not intended to run.
   - Add cascade rules for every trigger used by server actions.

6. Harden API auth.
   - Remove `Bearer internal` from `/api/ingest`.
   - Add `ANTHROPIC_API_KEY`, `CRON_SECRET`, Legal, QuickBooks, and internal API env checks to `pre-deploy-audit.mjs`.

7. Add regression tests.
   - Minimum: dispatcher coverage test, cascade trigger coverage test, auth check for public APIs, route smoke test for all built routes, and metric/view correctness checks for seed data.
