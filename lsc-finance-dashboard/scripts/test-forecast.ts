/**
 * Live integration test for the Financial Forecast analyzer.
 * Hits Claude Sonnet + Neon for real.
 */
import fs from "node:fs/promises";

async function main() {
  const env = await fs.readFile(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }

  const { runFinancialForecast } = await import("../skills/analyzers/financial-forecast");

  for (const scope of ["TBR", "XTZ"]) {
    console.log(`\n=== ${scope} forecast ===`);
    const r = await runFinancialForecast({ companyCode: scope });
    console.log("Model:", r.modelUsed);
    console.log("Tokens:", r.tokensUsed);
    console.log("Cash:", r.currentCashUsd);
    console.log("Monthly burn:", r.monthlyBurnUsd);
    console.log("Runway (months):", r.runwayMonths);
    console.log("Break-even path:", r.breakEvenAnalysis.pathDescription);
    console.log("3mo base:", r.projectedIn3Months?.baseCase);
    console.log("12mo base:", r.projectedIn12Months?.baseCase);
    console.log(`Risks (${r.riskFactors.length}):`, r.riskFactors.slice(0, 3));
    console.log(`Recommendations (${r.recommendations.length}):`, r.recommendations.slice(0, 3));
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
