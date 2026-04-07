# UI Standards — LSC Finance Dashboard

## Core Principle
Every page is a **workspace**, not a report. Users must be able to **view, add, edit, and manage** data directly from the page they're on. No read-only data dumps. No placeholder text. No "coming soon" tabs.

---

## Page Design Rules

### 1. Every data table MUST have a corresponding input form
- If a page shows a table of sponsorships, there MUST be an "Add sponsorship" form on that page
- If a page shows payroll entries, there MUST be inline edit or an "Add role" form
- If a page shows line items, each row MUST be editable (inline inputs or edit action)
- **Never ship a table without a way to populate it**

### 2. Metric cards show ONE value, clearly
- One number per card. Not "Y1: $X | Y2: $Y | Y3: $Z" crammed together
- Use the card's subvalue for context (e.g., "Year 1" as subvalue)
- If showing multi-year data, use a proper comparison layout (3 cards side by side, or a mini table)
- Large numbers formatted with `toLocaleString` — never raw floats

### 3. Empty states are actionable
- Never show an empty table with "$0" rows
- If a sport has no data: show a setup card with "Configure [Sport] — add revenue projections, sponsorships, and team structure to get started" + action button
- If a module has no entries: show the add form prominently, not a gray "No data" row

### 4. Hide what's not ready
- Don't render cards for sports with zero data in consolidated views
- Don't show "coming soon" text — either build the feature or don't show the tab
- Tabs with no implementation should not appear in navigation

### 5. Forms follow the form-grid pattern
- 2-column grid layout using `form-grid` class
- Labels above inputs (not inline)
- Submit button spans full width at bottom (`form-actions` class)
- Default values pre-filled from context (company currency, current date, etc.)
- Select dropdowns for enum fields, number inputs for amounts

### 6. Inline editing for existing data
- Tables with editable data should have inline inputs per cell OR an edit action per row
- Salary updates, status changes, priority changes — all inline, no separate page
- Each row's edit form uses hidden inputs for IDs and submits via server action

### 7. Year-over-year financial layouts
- Use a 3-column layout for Y1/Y2/Y3 comparisons (not string concatenation)
- Growth rates shown as small pills below the values
- Negative values: red text, `signal-risk` pill
- Positive values: green text, `signal-good` pill

---

## Card Design

### Metric Card
```
┌────────────────────────┐
│ [Label]        [Badge] │
│ $1,433,550             │
│ Year 1 · Base scenario │
└────────────────────────┘
```
- One primary value
- Label at top
- Subvalue at bottom for context
- accent-brand / accent-good / accent-warn / accent-risk for tone

### Data Card
```
┌────────────────────────────────────────┐
│ [Kicker]                               │
│ [Title]                    [Action btn] │
│                                        │
│ [Table / Form / Content]               │
└────────────────────────────────────────┘
```
- section-kicker + h3 title in card-title-row
- Action button or link on the right side of the title row
- Content is the table, form, or chart

### Sport Module Card (for consolidated views)
```
┌────────────────────────────────────────┐
│ Squash (WPS)            [-12.3% EBITDA]│
│                                        │
│  Revenue    COGS     OPEX     EBITDA   │
│  $11.6M    $4.6M    $8.4M    -$1.4M   │
│  $13.0M    $5.4M    $10.1M   -$2.5M   │
│  $20.3M    $7.4M    $12.9M   -$21K    │
│                                        │
│                         [Open module →]│
└────────────────────────────────────────┘
```
- Compact 4-column layout
- 3 rows for Y1/Y2/Y3
- EBITDA colored by sign
- Link to full module at bottom

---

## FSP Sport Module Tabs — What Each MUST Contain

### Tab 1: P&L Summary
- 3 section tables (Revenue, COGS, OPEX) with columns: Line Item, Y1 Budget, Y2 Budget, Y3 Budget, Y1 Actual, Y2 Actual, Y3 Actual
- Each row has inline edit inputs for budget values
- "Add line item" form at bottom of each section
- Auto-computed section totals (bold row)
- EBITDA row at bottom with margin %
- Scenario selector (Conservative / Base / Optimistic)

### Tab 2: Sponsorship
- Sponsorship table with all fields
- "Add sponsorship" form: segment, sponsor name, tier, Y1/Y2/Y3 values, status, contract dates, payment schedule, deliverables
- Edit status inline (pipeline → LOI → signed → active → expired)
- Total sponsorship revenue row

### Tab 3: Media Revenue
- Non-linear revenue calculator: impressions input, CPM input → computed revenue
- Linear revenue calculator: same pattern
- SVOD revenue: subscriber count × revenue share
- Influencer tier table: add tiers, set CPM/reach/onboarded count → computed values
- Regional CPM reference table: add/edit regions
- Broadcast partner registry: add/edit partners

### Tab 4: OPEX Detailed
- Category-grouped line items (Social Media, PR, Media & Entertainment, etc.)
- "Add OPEX item" form with category, sub-category, Y1/Y2/Y3 amounts
- Sub-totals per category
- Inline editing for amounts

### Tab 5: Event Production
- Cost items table with unit cost × quantity = line total
- "Add production item" form: category, sub-category, unit cost, quantity
- Event config: segments per event, events per year, venue cost
- Computed totals: per-segment, per-event, per-year

### Tab 6: League Payroll
- Role table with Y1/Y2/Y3 salaries
- "Add role" form: title, department, type, salaries, raise %
- Total payroll row
- Headcount

### Tab 7: Tech Services
- Same as payroll but with allocation % per role
- Allocation-weighted totals

### Tab 8: Revenue Share
- Per-year config: team count, license fee, share %, governing body
- Computed distributions: total franchise revenue, amount to teams, amount to GB, retained
- Edit inline

### Tab 9: Config
- Event config editor
- Financial year definitions
- Sport metadata (display name, league name, status)

---

## What NEVER to do

1. **Never dump multi-year data into a single metric card as a string**
2. **Never render an empty table with $0 rows when there's no data**
3. **Never show a "coming soon" placeholder — build it or don't show the tab**
4. **Never build a read-only page when the user needs to enter data**
5. **Never use inline styles for layout — use CSS classes from globals.css**
6. **Never ship a page without testing what it looks like with zero data AND with real data**
7. **Never abbreviate or truncate currency values in tables**
