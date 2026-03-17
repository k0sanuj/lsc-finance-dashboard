# Codex Setup

## Recommended Defaults

Use these settings as the baseline for this project:

- permissions: `workspace-write`
- network: restricted by default
- reasoning: `high` for planning, schema, migration, ontology, and finance logic
- reasoning: `medium` for routine UI work, refactors, and wiring
- use local project mode as the default
- connect external systems only when there is a clear data or dependency need

## Should You Give Full Access

No, not by default.

Use `workspace-write` as the standard mode. This is enough for most repo work and it keeps the agent from taking broad action outside the project. Escalate only when needed for:

- dependency installation
- approved network calls
- installing skills
- connecting external data sources

Broad full access is only worth it if you are deliberately running Codex as a highly trusted local operator and you are comfortable with wider file and network actions. For this finance app, the default should remain constrained.

## Local Project vs Web/Remote

Prefer local project context first.

Use local Codex when you want:

- repo-aware changes
- fast iteration
- direct file creation
- local testing
- database and seed work

Use remote/web context only when you need:

- official docs lookup
- external examples
- hosted integrations

Do not make the web context the source of truth for your business logic.

## Automation Strategy

To automate heavily without losing control:

1. encode business rules in docs and skills
2. encode data rules in schema and views
3. encode workflows into specialist prompts
4. automate imports and derived views, not ad hoc dashboard math
5. keep a coordinator prompt that routes work to specialists

## Suggested MCPs

Start with a small, high-signal set:

1. OpenAI docs MCP
2. Postgres or Neon MCP
3. Google Sheets or Drive MCP
4. GitHub MCP

Useful later:

- browser or Puppeteer MCP for UI regression checks
- memory MCP if you need cross-session memory

Avoid loading too many MCPs early. Tool sprawl reduces quality.

## Recommended Working Pattern

Use Codex like this:

1. ask it to read the planning docs first
2. ask it to act as coordinator
3. ask it to split work into specialist tracks
4. ask it to implement one track at a time
5. ask it to verify each change before moving on

## Example Coordinator Prompt

```text
Read AGENTS.md and the finance dashboard skill first.
Act as the central coordinator.
Break this task into specialist workstreams: finance architect, ontology architect, schema engineer, import engineer, app engineer, UI engineer, QA.
Do not skip ontology or metric validation.
Implement only the next dependency-safe step and explain what changed.
```
