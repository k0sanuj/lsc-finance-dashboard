# How To Add Skills To Codex

## Where Skills Live

Codex loads local installed skills from:

- `~/.codex/skills`

A project-local skill scaffold can live inside this repository under:

- `skills/`

That makes it version-controlled. To use it in Codex, copy or symlink it into `~/.codex/skills`, then restart Codex.

## Recommended Project Skill

Install this repository's custom skill:

- `skills/lsc-finance-dashboard`

It is designed to keep work aligned around:

- finance ontology
- metric definitions
- multi-agent coordination
- dashboard page structure
- import normalization

## Manual Install

From the repo root:

```bash
mkdir -p ~/.codex/skills
ln -sfn /Users/anujsingh/Documents/Playground/skills/lsc-finance-dashboard ~/.codex/skills/lsc-finance-dashboard
```

Then restart Codex.

If you prefer copying instead of symlinking:

```bash
mkdir -p ~/.codex/skills
cp -R /Users/anujsingh/Documents/Playground/skills/lsc-finance-dashboard ~/.codex/skills/lsc-finance-dashboard
```

Then restart Codex.

## When To Use The Skill

Use the skill whenever the task involves:

- planning the finance dashboard
- defining ontology or metric logic
- schema and view design
- import mapping
- dashboard structure
- multi-agent orchestration

## Installing Additional Skills

You already have the system skills:

- `skill-creator`
- `skill-installer`

Use `skill-installer` when you want Codex to fetch curated or GitHub-based skills into `~/.codex/skills`.

After installing any new skill, restart Codex so it becomes available in the session.
