# Secrets And Rotation

## Rule

If a credential has been exposed in prompts, shell output, screenshots, or logs, rotate it.

## Current Recommendation

Rotate the current Neon password before importing real financial data.

Then:

- keep the owner/admin role only for maintenance
- create an app read role
- create an import role
- use role-specific connection strings in local env files

## Local Env Strategy

Suggested future env split:

- `DATABASE_URL_ADMIN`
- `DATABASE_URL_APP_READ`
- `DATABASE_URL_IMPORT`

For now, keep a single `DATABASE_URL` only until the role split is implemented end to end.

## Local Role Creation Pattern

Do not hardcode the role passwords in SQL.

Instead:

1. put `LSC_APP_READ_PASSWORD` in `.env.local`
2. put `LSC_IMPORT_RW_PASSWORD` in `.env.local`
3. run `npm run db:setup-roles`

The local SQL runner will substitute those values at execution time without committing them.

## Rotation Triggers

Rotate credentials when:

- a key appears in screenshots
- a key appears in prompts
- a key appears in logs
- a collaborator leaves
- a tool is connected that no longer needs access
- a repo or machine is suspected compromised

## Rotation Discipline

- rotate before production use
- rotate after onboarding new external integrations
- rotate after any accidental exposure
