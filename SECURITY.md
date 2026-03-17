# Security

## Scope

This repository is intended for local development of the League Sports Co finance dashboard. It may eventually contain sensitive financial logic, vendor data, sponsor data, and internal operational records. Treat it as a sensitive private project.

## Core Rules

1. Keep this repository private.
2. Do not commit secrets.
3. Do not store API keys in markdown, source files, or prompts.
4. Use `.env.local` for local secrets.
5. Use least-privilege access for tools, MCPs, and integrations.

## Recommended Local Security Setup

- enable FileVault on macOS
- use a strong device password
- use a password manager
- enable 2FA on OpenAI, GitHub, Google, and Neon
- keep macOS and browser versions updated
- review connected apps and active sessions regularly

## Recommended Codex Safety Defaults

- permissions: `workspace-write`
- network: restricted by default
- escalate only when necessary
- avoid full-access mode unless explicitly needed
- keep work inside a dedicated project folder

## Secrets Handling

Store secrets only in local env files such as:

- `.env.local`

Never commit:

- database credentials
- API keys
- service account keys
- session tokens
- raw private exports

## External Integrations

Only connect MCPs you trust and need. Start with a minimal set:

- Postgres or Neon
- Google Sheets or Drive
- GitHub
- OpenAI docs

Disable or remove integrations you are not actively using.

## Git Hygiene

Before pushing:

- review `git diff`
- review `git status`
- confirm no secrets or raw exports are staged
- confirm private operational documents are excluded

## Data Hygiene

Raw finance exports and invoices should not be committed by default. Keep them in ignored local directories unless you intentionally create sanitized fixtures for testing.
