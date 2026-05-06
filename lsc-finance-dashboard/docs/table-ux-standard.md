# Platform Table UX Standard

Tables in the finance platform are operational controls, not form dumps. Each table must make the primary business object obvious, keep lifecycle controls close to the field they mutate, and avoid duplicate action columns.

## Required Pattern

- The first column is the business object and description, for example `Invoice / description`, `Employee / role`, or `Subscription / vendor`.
- Status is edited from the status cell with a dropdown when the update is a single-field lifecycle change.
- Document upload lives in the documents cell as one `Attach document` control.
- After upload, the document name appears as a hyperlink in the same documents cell.
- Notes are either inline expandable context or a compact secondary line, not a mandatory box beside every status change.
- Generic `Actions`, `Update status`, and `Add document` columns should be avoided unless the row has a real multi-step workflow.

## Current Reference Implementation

`/tbr/e1-accounting` is the first refactored pattern:

- `Invoice / description` shows the invoice number and the highest-value item in the group.
- `Status` contains the dropdown and submits immediately.
- `Documents` shows either a linked document name or a single attach control.
- Status changes continue to cascade into E1 cost views and TBR Costs.

## Audit Command

Run the advisory scanner before broad UI work:

```bash
pnpm audit:table-ux
```

Use strict mode only when the platform is ready to block new violations:

```bash
node scripts/audit-table-ux.mjs --strict
```

## Refactor Backlog

- `employees`: merge status display and status update into one column.
- `subscriptions`: remove duplicated status/update columns and use inline lifecycle controls.
- `tbr/invoice-hub`: split queue actions into state-specific row controls.
- `tbr/expense-management`: move approval lifecycle out of a generic action column.
- `payroll-invoices`: keep lifecycle controls in status and attach/source evidence in documents.
- `receivables`: make payment lifecycle a status-cell dropdown where safe.
- `fsp/sports/[sport]`: move sponsorship status editing into the status column and document evidence into the documents column.
