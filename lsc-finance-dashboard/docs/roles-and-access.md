# Roles And Access

## Goal

This project should use least privilege across the database, app, and AI tooling.

## Database Role Model

Recommended roles:

### 1. Admin Role

Use for:

- schema creation
- migrations
- one-time maintenance
- role and grant management

Do not use this role for the running app.

### 2. App Read Role

Use for:

- dashboard queries
- analytics views
- read-only app rendering

This role should be able to:

- connect
- read canonical tables
- read derived views

It should not be able to:

- create schema
- drop tables
- modify grants

### 3. Import Role

Use for:

- loading source data
- writing to raw import tables
- writing canonical records through controlled scripts

This role should be tightly scoped and only used by import jobs or controlled local scripts.

## Secure Local Setup Flow

Use local-only env variables for role creation:

- `LSC_APP_READ_PASSWORD`
- `LSC_IMPORT_RW_PASSWORD`

Then run:

```bash
npm run db:setup-roles
```

This workflow keeps the real role passwords in `.env.local` and out of committed SQL.

## App Access Model

Recommended future app user groups:

- founder/admin
- finance
- operations
- commercial
- read-only

Planned page sensitivity:

- Overview: medium sensitivity
- TBR: high sensitivity
- Costs: high sensitivity
- Payments: very high sensitivity
- Commercial Goals: high sensitivity
- AI Analysis: medium to high sensitivity depending on source data
- Agent Graph / Workflow Graph: low to medium sensitivity

## Tool Access Model

### Codex

- allowed for local project work
- keep on `workspace-write`
- do not give unnecessary filesystem or network scope

### Neon MCP

- trusted client only
- read access preferred unless admin work is intentional

### Other AI Tools

- connect only if needed
- avoid duplicating write access across many tools

## Operational Rule

No single day-to-day app credential should have full owner privileges.
