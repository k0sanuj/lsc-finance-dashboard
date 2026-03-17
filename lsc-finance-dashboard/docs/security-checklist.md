# Security Checklist

## Purpose

Use this checklist before storing or importing confidential financial data into the League Sports Co finance dashboard.

This project should be treated as sensitive because it may contain:

- sponsor revenue
- receivables
- invoices
- payments
- expense reimbursements
- internal commercial targets

## Mandatory Before Real Data Import

- keep the repository private
- keep the app local or access-controlled
- confirm `.env.local` is not committed
- rotate any credential that has been pasted into prompts or logs
- do not use the Neon owner role for normal app reads
- create dedicated database roles for app access
- confirm only approved MCPs are connected
- confirm raw finance exports are stored only in ignored directories
- confirm device encryption and 2FA are enabled

## Local Machine Checklist

- FileVault enabled
- strong device password enabled
- password manager in use
- OpenAI account 2FA enabled
- Neon account 2FA enabled
- GitHub account 2FA enabled
- browser session review completed

## Repo Checklist

- `.env.local` exists locally only
- `.env.example` contains placeholders only
- raw CSV or XLSX files are not committed
- invoice PDFs and receipts are not committed unless sanitized
- `git status` reviewed before every commit
- `git diff --staged` reviewed before every commit

## Database Checklist

- owner role reserved for migrations and admin tasks only
- dedicated read role created for dashboard reads
- dedicated import role created for ingestion tasks if needed
- SSL required
- credentials rotated after setup if exposed during bootstrap
- only needed roles are active

## App Checklist

- auth required before hosted deployment
- authorization planned for overview, costs, payments, and commercial sections
- no secret values exposed to the client bundle
- only server-side code reads `DATABASE_URL`
- logs do not print secrets or raw confidential rows

## Tooling Checklist

- Codex remains on `workspace-write`
- only required MCPs are enabled
- Neon MCP is connected only to trusted clients
- avoid shared long-lived API keys when OAuth is available
- avoid giving multiple tools write access unless required

## Operational Rule

Do not import real finance data until this checklist is satisfied.
