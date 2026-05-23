import assert from "node:assert/strict";
import { parseWorkbook, EXPECTED_TOTALS } from "./import-tbr-pnl-statement.mjs";

const workbookPath = process.env.TBR_PNL_STATEMENT_XLSX ?? "/Users/anujsingh/Downloads/TBR_P_L_Statement.xlsx";
const parsed = parseWorkbook(workbookPath);

for (const [seasonCode, expected] of Object.entries(EXPECTED_TOTALS)) {
  const actual = parsed.summary.bySeason[seasonCode];
  assert.ok(actual, `${seasonCode} summary should exist`);
  assert.equal(actual.revenue, expected.revenue, `${seasonCode} revenue should match workbook`);
  assert.equal(actual.expense, expected.expense, `${seasonCode} expenses should match workbook`);
  assert.equal(actual.net, expected.net, `${seasonCode} net income/loss should match workbook`);
}

const included = parsed.lines.filter((line) => line.lineKind === "detail" && line.includeInPnl);
assert.equal(included.length, 77, "approved detail line count should stay stable");

const s3Prize = parsed.lines.find((line) => line.periodCode === "S3" && line.lineCode === "prize_pool");
assert.equal(s3Prize?.reportingAmountUsd, 292500, "S3 selected prize scenario should be imported");
assert.equal(s3Prize?.dataStatus, "forecast", "S3 prize should remain forecast/scenario-driven");

const s3Reserve = parsed.lines.find((line) => line.periodCode === "S3" && /Reserve Fund/i.test(line.lineLabel));
assert.equal(s3Reserve?.dataStatus, "contingency", "S3 spare parts reserve should be tagged contingency");

const stockCompRows = parsed.lines.filter((line) => /Stock-Based Compensation/i.test(line.lineLabel));
assert.ok(stockCompRows.length >= 2, "stock-based compensation rows should be imported");
assert.ok(stockCompRows.every((line) => line.dataStatus === "non_cash"), "stock comp should be non-cash");

const assumptions = parsed.assumptions.filter((item) => item.key.startsWith("s3_prize_"));
assert.equal(assumptions.length, 4, "all S3 prize scenario options should be stored");
assert.equal(assumptions.filter((item) => item.isSelected).length, 1, "exactly one S3 prize scenario should be selected");

process.stdout.write(
  JSON.stringify({
    ok: true,
    workflow: "pnl_statement_import",
    workbookPath,
    includedLineCount: included.length,
    bySeason: parsed.summary.bySeason
  }, null, 2) + "\n"
);
