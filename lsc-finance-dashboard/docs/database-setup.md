# Database Setup

## Short Answer

You do not need a Neon account yet to define the schema, views, and migration files.

You only need a Neon account when you want to:

- create the hosted Postgres instance
- obtain a real `DATABASE_URL`
- run the SQL files against the live database
- connect the app to live data

## What Is Already Ready

The project now has:

- initial schema SQL in `sql/001_initial_schema.sql`
- derived views in `sql/002_derived_views.sql`
- reference seed SQL in `sql/003_seed_reference_data.sql`
- role and grant SQL in `sql/004_roles_and_grants.sql`
- DB metadata and env guards in `packages/db/src`
- an application data adapter that can later switch from seed data to live queries

This means the backend contract can be designed before infrastructure exists.

## Recommended Sequence

1. finalize the planning docs
2. finalize schema and views locally
3. create the Neon account
4. create the database project in Neon
5. copy the `DATABASE_URL`
6. add it to `.env.local`
7. run the schema SQL
8. import sample data
9. replace seeded UI data with live queries

## When You Create Neon

Once the Neon account exists, create:

- one project for the finance dashboard
- one primary database
- one local development branch if needed

Then add:

```env
DATABASE_URL=postgres://...
```

to `.env.local`.

## Suggested First Live Execution Order

Run these in order:

1. `sql/001_initial_schema.sql`
2. `sql/002_derived_views.sql`
3. `sql/003_seed_reference_data.sql`
4. `sql/004_roles_and_grants.sql` after replacing placeholder passwords

Or use the safer local flow:

```bash
npm run db:setup-roles
```

with `LSC_APP_READ_PASSWORD` and `LSC_IMPORT_RW_PASSWORD` set in `.env.local`.

Then seed:

- companies
- race_events
- cost_categories
- agent_nodes
- workflow_nodes

Then connect the app query layer.

## Current Limitation

The app currently uses seeded TypeScript data, not live database queries. That is intentional until the database exists and canonical records can be loaded safely.

## Current Adapter Behavior

The app now reads through a shared adapter layer rather than importing seed constants directly.

Default behavior:

- `LSC_DATA_BACKEND` unset or `seed` uses local seeded data

Future behavior:

- `LSC_DATA_BACKEND=database` will be used once live Neon queries are implemented
