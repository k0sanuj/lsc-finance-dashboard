import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  const full = join(root, path);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

const failures = [];
const advisories = [];

const queuePagePath = "apps/web/app/tbr/expense-management/page.tsx";
const detailPagePath = "apps/web/app/tbr/expense-management/[submissionId]/page.tsx";
const queuePage = read(queuePagePath);
const detailPage = read(detailPagePath);

if (!queuePage.includes("review-focus-drawer")) {
  failures.push(`${queuePagePath}: KPI cards must open the focused review drawer.`);
}

const queuePrefix = queuePage.split("Approval queue")[0] ?? queuePage;
const firstScreenCardCount = count(queuePrefix, "metric-card");
if (firstScreenCardCount > 6) {
  failures.push(`${queuePagePath}: found ${firstScreenCardCount} metric-card literals before the approval queue.`);
}

if (!detailPage.includes("compact-review-table")) {
  failures.push(`${detailPagePath}: submission detail must use the compact review table.`);
}

for (const label of ["Approve", "Reject", "Ask clarification"]) {
  if (!detailPage.includes(label)) {
    failures.push(`${detailPagePath}: missing inline row action "${label}".`);
  }
}

if (detailPage.includes("addExpenseSplitAction") || detailPage.includes("generateEqualSplitsAction")) {
  failures.push(`${detailPagePath}: reviewer route must not import split mutation actions.`);
}

if (detailPage.includes("Add split row") || detailPage.includes("Generate equal splits")) {
  failures.push(`${detailPagePath}: reviewer route must not render split mutation controls.`);
}

if (/<article className="card" key=\{item\.id\}/.test(detailPage)) {
  failures.push(`${detailPagePath}: repeated per-item cards are prohibited; use table rows.`);
}

const priorityRoutes = [
  "apps/web/app/tbr/my-expenses/page.tsx",
  "apps/web/app/tbr/invoice-hub/page.tsx",
  "apps/web/app/xtz-expenses/page.tsx",
  "apps/web/app/payroll-invoices/page.tsx",
  "apps/web/app/payments/[company]/page.tsx",
  "apps/web/app/receivables/[company]/page.tsx",
  "apps/web/app/costs/[company]/page.tsx",
  "apps/web/app/fsp/sports/page.tsx",
  "apps/web/app/fsp/sports/[sport]/page.tsx",
];

for (const path of priorityRoutes) {
  const source = read(path);
  if (!source) continue;
  const beforeFirstTable = source.split("clean-table")[0] ?? source;
  const metricCards = count(beforeFirstTable, "metric-card");
  if (metricCards > 6) {
    advisories.push(`${path}: ${metricCards} metric-card literals before first table; convert to table-first workflow in next UX pass.`);
  }
  if (/<article className="card" key=\{(?:item|row|invoice|expense)\.id\}/.test(source)) {
    advisories.push(`${path}: repeated row card pattern detected; prefer compact table + expandable details.`);
  }
}

if (advisories.length > 0) {
  console.warn("[audit:ops-ux-density] advisory backlog:");
  for (const advisory of advisories) console.warn(`- ${advisory}`);
}

if (failures.length > 0) {
  console.error("[audit:ops-ux-density] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[audit:ops-ux-density] passed");
