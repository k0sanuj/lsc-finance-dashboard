# Frontend Design

Use this reference when the task is primarily frontend-facing.

For section-level structure changes, also read `../lsc-section-categorization/SKILL.md` first.

## Design Language

Follow the League Sports Co visual language:

- editorial rather than generic SaaS
- high contrast headings with generous spacing
- restrained color palette with deep blue, warm neutrals, and selective accent use
- sharp hierarchy between strategic overview and operational tools
- premium but calm presentation

Do not use crowded dashboard patterns, cramped cards, or dense default tables as the primary experience.

## Page Strategy

Before adding detail, always decide:

1. which company is selected
2. which workspace inside that company is selected
3. what the user is trying to do
4. what stays hidden until a record, race, or queue item is chosen

### Overview

- keep this strategic
- show consolidated health, trend, and explicit entity separation
- use `LSC` as the top portfolio layer and then separate `TBR` and `FSP`
- avoid operational payables clutter here
- use strong KPI cards plus one or two explanatory charts

### TBR

- treat this as the main operating cockpit
- organize the user flow `overview -> my expenses -> races -> season -> race -> add expense popup`
- keep season selection compact and obvious
- make races selectable via compact cards with only the context needed
- only show denser detail once a race is selected
- keep the user console and admin console visually and structurally separate
- include clear workflow entry points for:
  - my expenses
  - races
  - document-backed bill upload
- keep admin review tools in a separate branch, not inside the user branch

### FSP

- mirror the TBR information architecture at a lighter level
- keep it visually consistent with TBR and the overall portfolio
- use placeholder cards and future-ready sections instead of oversized empty tables
- keep FSP present in the product model even when most values are zero

### Documents And Tools

- categorize by workflow, not file type alone
- examples:
  - contract intake
  - invoice upload
  - expense management
  - approval queue
- embed analyzer entry points inside operational pages where users update costs, invoices, and expenses
- do not force users to leave context just to run document analysis
- on shared admin pages, show the analyzer as a contextual action, not as the page itself
- analyzer detail should be secondary and selected, not always pre-expanded
- intake popups should not be generic upload forms
- each popup should ask `what are you adding?` first, then show the required fields for that category
- after intake, the selected run should show:
  - saved intake fields
  - extracted AI fields
  - platform areas affected by the document
- never surface raw internal workflow strings to the user; always translate them into human labels
- shared admin pages should begin with:
  - a root index page with company selection first
  - a company-specific workspace page second
  - selected queue, table, chart, or detail third
- selected detail should open progressively:
  - preview and key facts first
  - deeper mapping, extracted-field, and posting tables behind disclosure or secondary sections
- on shared pages like `Costs`, `Payments`, `Documents`, and `Commercial Goals`, the first decision should be `which company am I operating on?`
- the second decision should be `which workspace inside that company do I want?`
- on `Costs`, once the company is selected, the workspace should progress in this order:
  - season selection
  - race selection inside that season
  - cost overview
  - detailed breakdown
  - AI commentary
  - analyzer and source-backed detail only when intentionally opened
- on `Payments`, once the company is selected, the workspace should progress in this order:
  - payment overview
  - due tracker
  - categorized invoice intake
  - selected payable detail only when opened
- on `Commercial Goals`, once the company is selected, the workspace should progress in this order:
  - snapshot
  - target path
  - owner accountability
  - categorized commercial-source intake
  - selected source detail only when opened

### Graph Pages

- graph should be readable first, decorative second
- supporting panels should explain what the viewer is seeing
- avoid dumping raw lists under a complex graph without context

## Laws Of UX To Apply

Use these intentionally:

- `Hick's Law`
  - reduce visible choices at once
  - use tabs, grouped actions, and role-based branches instead of long mixed sections
- `Progressive Disclosure`
  - show top-level metrics first, then detail tools beneath
- `Law of Proximity`
  - group related controls, summaries, and tables
- `Law of Common Region`
  - visually separate overview, operations, tools, and approvals
- `Aesthetic-Usability Effect`
  - cleaner spacing and hierarchy improve perceived usability
- `Fitts's Law`
  - primary actions should be clear, close, and easy to hit
- `Tesler's Law`
  - keep unavoidable finance complexity in the system, not in the first screen

## Frontend Quality Rules

- no overlapping text
- no cramped card headers or table rows
- no giant blocks of explanatory copy above every section
- no page should rely on a single plain table as its main experience
- every page should have an obvious primary purpose and one dominant action path
- no admin-only finance modules inside a user-only workflow page
- no repeated “status/purpose/explainer” cards that restate the same thing
- prefer compact summary cards before dense detail
- use labels and sections that match the operator workflow
- for race workflows, keep the upload form behind a popup instead of pinning it permanently on the page
- use the same `company selection -> workspace selection -> selected summary or queue -> selected detail` shape across shared finance-admin pages
- if a page only makes sense when zoomed out, reduce density before adding more content

## Task-Specific Priorities

For this redesign pass, prioritize:

1. Overview hierarchy by `LSC -> TBR / FSP`
2. TBR user/admin branch separation in navigation and page structure
3. TBR `overview -> my expenses -> races -> season -> race -> add expense popup` interaction model
4. FSP structural parity without fake density
5. embedded analyzer entry inside race, cost, invoice, and expense workflows
6. shared company workspaces that follow:
   - company selection
   - workspace choice
   - queue or summary
   - selected detail
7. cleaner tables, calmer spacing, and stronger card hierarchy
