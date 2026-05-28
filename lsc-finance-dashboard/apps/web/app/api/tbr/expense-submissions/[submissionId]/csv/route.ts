import {
  executeAdmin,
  getExpenseSubmissionExportRows
} from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole } from "../../../../../../lib/auth";

type RouteContext = {
  params: Promise<{
    submissionId: string;
  }>;
};

const CSV_HEADERS = [
  "Submission",
  "Race",
  "Submitter",
  "Item ID",
  "Merchant",
  "Expense Date",
  "Category",
  "Tags",
  "Original Currency",
  "Original Amount",
  "FX Rate To USD",
  "USD Amount",
  "Approved USD",
  "Review Status",
  "Receipt Status",
  "Rejection Reason",
  "Challenge Reason",
  "Rule Messages",
  "Source Document",
  "Description"
];

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function safeFileSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "expense-report";
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireRole(["super_admin", "finance_admin"]);
  const { submissionId } = await context.params;
  const rows = await getExpenseSubmissionExportRows(submissionId);

  if (rows.length === 0) {
    return new Response("No expense rows found for this submission.", { status: 404 });
  }

  const bodyRows = rows.map((row) => [
    row.submissionTitle,
    row.race,
    row.submitter,
    row.itemId,
    row.merchant,
    row.expenseDate,
    row.category,
    row.tags,
    row.originalCurrency,
    row.originalAmount,
    row.fxRateToUsd,
    row.usdAmount,
    row.approvedUsd,
    row.reviewStatus,
    row.receiptStatus,
    row.rejectionReason,
    row.challengeReason,
    row.ruleMessages,
    row.sourceDocument,
    row.description
  ]);
  const csv = [CSV_HEADERS, ...bodyRows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const fileName = `${safeFileSlug(rows[0]?.submissionTitle ?? "expense-report")}.csv`;

  await executeAdmin(
    `insert into expense_report_exports (
       submission_id,
       exported_by_user_id,
       export_kind,
       export_status,
       file_name,
       row_count,
       metadata
     )
     values ($1, $2, 'csv', 'downloaded', $3, $4, $5::jsonb)`,
    [
      submissionId,
      session.id,
      fileName,
      rows.length,
      JSON.stringify({ userAgentExport: true })
    ]
  );
  await executeAdmin(
    `update expense_submissions
     set exported_at = now(),
         export_count = export_count + 1,
         updated_at = now()
     where id = $1`,
    [submissionId]
  );
  await cascadeUpdate({
    trigger: "expense-submission:exported",
    entityType: "expense_submission",
    entityId: submissionId,
    action: "export-csv",
    after: { fileName, rowCount: rows.length },
    performedBy: session.id,
    agentId: "expense-agent",
  });

  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
