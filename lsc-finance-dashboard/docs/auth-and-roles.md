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

Use a signed cookie session for the first pass.

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

## Bootstrap Rule

The first admin user should be created from local environment variables or a protected admin bootstrap script.

Do not hardcode a default password.

## Next Build Dependency

Once auth is working, the next production module should be:

1. expense management submission
2. approval queue for finance admins
3. team membership and split logic
