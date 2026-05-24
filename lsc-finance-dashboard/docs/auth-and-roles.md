# Auth And Roles

## Purpose

This file defines the first production auth layer for the finance platform.

The goal is to protect the full app before broader rollout, then use role-aware access as the basis for expense approvals, invoice operations, and commercial workflows.

## Principles

1. Every non-login page must require an authenticated session.
2. Role names should map to real operating responsibilities, not vague technical labels.
3. Role checks should happen in server-side application code, not only in the client.
4. Company and team assignment should be modeled in the database, not hardcoded in UI logic.
5. Session state should be signed and tamper-evident.

## First-Pass Roles

### super_admin

- full platform access
- can manage users, roles, teams, and environment-level setup
- can access all entities and all workflow tools

### finance_admin

- full finance operations access
- can approve documents, expenses, invoices, and payments
- can post canonical finance records

### team_member

- can submit expense items and supporting documents
- can view their team context
- cannot approve or post finance records

### commercial_user

- can work in sponsorship and commercial goal areas
- can view or manage relevant revenue-side workflows
- should not have broad cost-approval rights by default

### viewer

- read-only visibility
- no workflow approvals
- no canonical posting rights

## Core Tables

- `app_users`
- `app_user_company_access`
- `app_teams`
- `team_memberships`
- `auth_access_events`

## Session Model

Use a signed cookie session. The primary production login flow is passwordless magic link,
with the password form retained as an operational fallback while email delivery is being
rolled out.

The session payload should contain:

- user id
- email
- role
- expiry timestamp

The cookie must be:

- `httpOnly`
- `sameSite=lax`
- `secure` in production
- signed with `AUTH_SESSION_SECRET`
- valid for 90 days unless the user logs out or is removed from the allowlist

## Email Allowlist

The finance platform is not open-registration software. Only explicitly allowed identities
may authenticate.

Core tables:

- `auth_allowed_identities`
- `auth_magic_links`

Rules:

1. `auth_allowed_identities` is the source of truth for who can access the platform.
2. At most three identities may be active for the current operating policy.
3. `app_users` may only remain active when the normalized email exists as an active
   allowlisted identity.
4. Magic links are one-time tokens stored only as SHA-256 hashes.
5. Magic links expire after 15 minutes.
6. Sessions are revalidated against the allowlist on server-side auth reads, so removing
   an email from the allowlist blocks future access even if a cookie still exists.

Operational scripts:

- `pnpm auth:sync-allowlist`
- `pnpm test:magic-link-auth`

Environment:

- `RESEND_API_KEY` enables production magic-link email delivery.
- `AUTH_MAGIC_LINK_FROM` controls the email sender address.
- `AUTH_ALLOWED_USERS_JSON` can define the three active users as JSON with
  `email`, `fullName`, and `role`.
- `AUTH_ALLOWED_EMAILS` can define a simpler comma-separated email allowlist.

## Bootstrap Rule

The first admin user should be created from local environment variables or a protected admin bootstrap script.

Do not hardcode a default password.

## Next Build Dependency

Once auth is working, the next production module should be:

1. expense management submission
2. approval queue for finance admins
3. team membership and split logic
