import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/normalize-tbr-season-finance.mjs", "--dry-run", "--json"],
    { maxBuffer: 1024 * 1024 * 4 }
  );
  const result = JSON.parse(stdout);

  assert.equal(result.workflow, "tbr_season_finance");
  assert.equal(result.mode, "dry-run");
  assert.equal(result.operatingByKind.season_category_summary, 28);
  assert.equal(result.operatingByKind.race_category_matrix, 97);
  assert.equal(result.operatingByKind.workbook_summary_category, 26);
  assert.equal(result.e1ByTreatment.source_check, 11);
  assert.equal(result.e1ByTreatment.overlap_variance, 29);
  assert.equal(result.e1ByTreatment.excluded_inapplicable, 1);
  assert.equal(result.overlapRows, 29);
  assert.ok(result.operatingBaseline > 650000 && result.operatingBaseline < 660000);

  process.stdout.write(
    JSON.stringify(
      {
        status: "ok",
        checked: [
          "approved top-table TBR ranges",
          "E1 top ledger rows",
          "source-check rows excluded from canonical P&L counts",
          "overlap rows classified for variance-only reconciliation"
        ]
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
