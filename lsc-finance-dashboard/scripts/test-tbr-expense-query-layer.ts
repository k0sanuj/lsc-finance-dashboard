import fs from "node:fs/promises";
import path from "node:path";
import {
  getExpenseApprovalQueue,
  getExpenseSubmissionDetail,
  getExpenseSubmissionExportRows,
  getExpenseSubmissionItems,
  getExpenseWorkspaceControls,
  getMyExpenseSubmissions,
  queryRowsAdmin,
} from "@lsc/db";

const MASHAEL_EMAIL = "mashael@teambluerising.com";
const REPORT_SOURCE_ID = "mashael-lake-como-s3-expense-review-v1";

async function loadEnvFile(envPath: string) {
  try {
    const content = await fs.readFile(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  await loadEnvFile(path.join(projectRoot, "apps", "web", ".env.local"));
  process.env.LSC_DATA_BACKEND = "database";

  const [user] = await queryRowsAdmin<{ id: string }>(
    `select id from app_users where normalized_email = $1 and role::text = 'expense_submitter' and is_active = true`,
    [MASHAEL_EMAIL]
  );
  assert(user, "Mashael expense submitter user is available to the query layer.");

  const [sourceSubmission] = await queryRowsAdmin<{ id: string }>(
    `select id from expense_submissions where report_metadata->>'source_identifier' = $1`,
    [REPORT_SOURCE_ID]
  );
  assert(sourceSubmission, "Lake Como source-backed expense submission exists.");

  const queue = await getExpenseApprovalQueue({ seasonYear: 2026 });
  const queueRow = queue.find((row) => row.id === sourceSubmission.id);
  assert(queueRow, "Admin approval queue includes the Lake Como report.");
  assert(queueRow?.itemCount === "8", "Admin approval queue exposes the 8 imported items.");
  assert(
    Number(queueRow?.openItemCount ?? 0) +
      Number(queueRow?.approvedItemCount ?? 0) +
      Number(queueRow?.rejectedItemCount ?? 0) ===
      8,
    "Admin approval queue exposes item review status counts."
  );
  assert(Number(queueRow?.openRuleFindingCount ?? 0) >= 4, "Admin approval queue exposes rule exception count.");
  assert(queueRow?.missingReceiptCount === "3", "Admin approval queue exposes no-receipt item count.");

  const detail = await getExpenseSubmissionDetail(sourceSubmission.id);
  assert(detail, "Report detail service returns the Lake Como report.");
  assert(detail?.submittedByUserId === user.id, "Report detail preserves submitter ownership.");
  assert(detail?.totalAmount === "$2,624", "Report detail returns the corrected USD submitted total.");

  const items = await getExpenseSubmissionItems(sourceSubmission.id);
  assert(items.length === 8, "Report item service returns 8 items.");
  assert(items.some((item) => item.originalCurrencyCode === "SAR"), "Report item service preserves SAR original currency.");
  assert(items.some((item) => item.merchantName === "Podium bonus" && item.originalCurrencyCode === "USD" && item.reportingAmountUsd === "$2,000"), "Report item service reflects the USD podium bonus correction.");
  assert(items.filter((item) => Boolean(item.sourcePreviewDataUrl)).length >= 5, "Report item service exposes attached receipt previews.");
  assert(items.some((item) => item.tagLabels.includes("Lake Como")), "Report item service exposes item tags.");
  assert(items.some((item) => Number(item.openRuleFindingCount) > 0), "Report item service exposes rule findings.");
  assert(items.some((item) => item.reviewStatusKey === "needs_info"), "Report item service exposes needs-info lines.");

  const myReports = await getMyExpenseSubmissions(user.id);
  assert(myReports.some((report) => report.id === sourceSubmission.id), "Submitter portal query returns the Lake Como report.");

  const controls = await getExpenseWorkspaceControls();
  assert(controls.tags.some((tag) => tag.label === "Lake Como S3"), "Workspace controls include the Lake Como tag.");
  assert(controls.rules.some((rule) => rule.key === "tag_required" && rule.isActive), "Workspace controls include active tag rule.");
  assert(controls.rules.some((rule) => rule.key === "receipt_required" && rule.isActive), "Workspace controls include active receipt rule.");

  const exportRows = await getExpenseSubmissionExportRows(sourceSubmission.id);
  assert(exportRows.length === 8, "CSV export query returns one row per item.");
  assert(exportRows.some((row) => row.ruleMessages.length > 0), "CSV export query includes rule messages.");
  assert(exportRows.every((row) => row.originalCurrency.length > 0), "CSV export query preserves original currency per row.");

  console.log(JSON.stringify({
    ok: true,
    submissionId: sourceSubmission.id,
    queueItems: queueRow?.itemCount,
    detailTotal: detail?.totalAmount,
    itemCount: items.length,
    tagCount: controls.tags.length,
    ruleCount: controls.rules.length,
    exportRows: exportRows.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
