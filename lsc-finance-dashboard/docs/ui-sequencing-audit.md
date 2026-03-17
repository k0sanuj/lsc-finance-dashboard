# UI Sequencing Audit

## Purpose

This document records the strict sequencing rules used to clean the League Sports Co finance platform after multiple workflow surfaces became too dense or mixed together.

The target rule for every major page is:

1. context first
2. summary second
3. action third
4. working queue or table fourth
5. selected detail last

## Findings

### 1. Shared admin pages drifted into mixed-context layouts

Problem:

- company selection, workspace choice, queue, analyzer, and selected detail were appearing too close together
- pages became readable only when zoomed far out

Fix:

- all shared admin tabs must start with a company index page
- company workspace pages must state the active company and active workspace before showing detailed content

### 2. Selected detail was too dense

Problem:

- document analysis detail showed too many full tables at once
- opening one run expanded the page dramatically and pushed the queue out of the working view

Fix:

- selected detail keeps preview and key metadata visible
- deeper tables move into disclosure sections
- counts for saved fields, updates, extracted fields, and posting events show first

### 3. FSP was structurally present but not sequenced like a real branch

Problem:

- the page read like a placeholder note rather than an actual company branch

Fix:

- FSP now behaves like a company hub with workspace entry points
- live density remains low, but the navigation pattern matches the rest of the platform

### 4. AI Analysis was not scoped enough

Problem:

- all narrative cards appeared together with no clear lens

Fix:

- the page now starts with scope selection
- the operator picks the analysis lens before reading the brief

## Non-Negotiable Rules

1. `LSC` stays above company branches.
2. Shared admin tabs must begin with company choice.
3. Company workspaces must show active company and active workspace explicitly.
4. User flows and admin review flows must remain separate.
5. Add and upload actions belong in popups or controlled entry points, not dumped inline by default.
6. Selected detail must stay quiet until intentionally opened.
7. If a page only makes sense when zoomed out, it is too dense.

## Pages Covered In This Pass

- `Overview`
- `TBR`
- `FSP`
- `Costs`
- `Payments`
- `Commercial Goals`
- `Documents`
- `AI Analysis`
- `Review Console`
- `Invoice Hub`

## Remaining Watchouts

- `FSP` remains structurally correct but will still feel light until real operating data exists
- selected detail density should continue to be monitored on any new queue-based page

## Invoice Hub Rule

`Invoice Hub` should always read in this order:

1. choose intake path
2. review source-backed invoice runs
3. review payable intake queue
4. post only after source and payable rows agree
