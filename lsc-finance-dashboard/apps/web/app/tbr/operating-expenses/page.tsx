import Link from "next/link";
import { CircleDollarSign, Flag, ListChecks, Wrench } from "lucide-react";
import { getTbrOperatingExpenseDashboard } from "@lsc/db";
import { formatCompactCurrency } from "../../components/dashboard-charts";
import { HorizontalComparisonChart, StatusDonutChart, type ChartDatum } from "../../components/lsc-dashboard-charts";
import { MetricTile, Panel } from "../../components/lsc-blue-primitives";
import { requireRole } from "../../../lib/auth";
import { addTbrOperatingExpenseLineAction } from "./actions";

type PageProps = {
  searchParams?: Promise<{
    season?: string;
    spares?: string;
    status?: string;
    message?: string;
  }>;
};

const categoryOptions = [
  ["stay_accommodation", "Stay & Accommodation"],
  ["travel", "Travel"],
  ["merchandise_cost", "Merchandise Cost"],
  ["content_capture", "Content Capture"],
  ["miscellaneous_expenses", "Miscellaneous / Other Expenses"],
  ["food_beverages", "Food & Beverages"],
  ["vip_passes", "VIP Passes"],
  ["racesuits_helmets", "Racesuits & Helmets"],
  ["team_insurance", "Team Insurance"],
  ["pre_season_testing_fee", "Pre-Season Testing Fee"],
  ["spare_parts", "Spare Parts Cost"],
  ["pilot_training", "Pilot Training"],
  ["pilot_stipend", "Pilot Stipend"],
  ["mechanic_stipend", "Mechanic Stipend"]
] as const;

function treatmentLink(season: string, includeSpares: boolean) {
  const spares = includeSpares ? "include" : "exclude";
  return `/tbr/operating-expenses?season=${encodeURIComponent(season)}&spares=${spares}`;
}

export default async function TbrOperatingExpensesPage({ searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const params = searchParams ? await searchParams : {};
  const includeSpares = params.spares !== "exclude";
  const data = await getTbrOperatingExpenseDashboard(params.season?.toUpperCase());
  const summary = data.summary;
  const selectedSeason = data.selectedSeasonCode;
  const categoryRows = includeSpares
    ? data.categories
    : data.categories.filter((row) => !row.isSpareParts);
  const raceRows = data.races.map((row) => ({
    ...row,
    selectedAmountUsd: includeSpares ? row.totalOperatingExpenseUsd : row.totalOperatingExpenseExSparesUsd,
    selectedAmount: includeSpares ? row.totalOperatingExpense : row.totalOperatingExpenseExSpares
  }));
  const matrixRows = includeSpares ? data.matrix : data.matrix.filter((row) => !row.isSpareParts);
  const categoryChartRows: ChartDatum[] = categoryRows
    .filter((row) => row.reportingAmountUsd > 0)
    .map((row) => ({
      name: row.categoryName,
      value: row.reportingAmountUsd,
      displayValue: row.amount,
      tone: row.isSpareParts ? "ruby" : "brand"
    }));
  const raceChartRows: ChartDatum[] = raceRows
    .filter((row) => row.selectedAmountUsd > 0)
    .map((row) => ({
      name: row.raceName,
      value: row.selectedAmountUsd,
      displayValue: row.selectedAmount,
      tone: row.sparePartsUsd > 0 && includeSpares ? "amber" : "good"
    }));

  return (
    <div className="page-grid finance-workspace">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">TBR operating expenses</span>
          <h3>Season control dashboard</h3>
          <p>
            Financial Plan top-table data, normalized into backend season controls. Workbook totals and
            lower calculation blocks stay out of canonical P&amp;L.
          </p>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            <Link className="segment-chip" href="/tbr/e1-accounting">E1 Accounting</Link>
            <Link className="segment-chip" href="/tbr/overall-pnl">Overall P&amp;L</Link>
          </div>
        </div>
      </section>

      {params.message ? (
        <section className={`notice ${params.status === "error" ? "error" : "success"}`}>
          <strong>{params.status === "error" ? "Action failed" : "Saved"}</strong>
          <span>{params.message}</span>
        </section>
      ) : null}

      <section className="section">
        <div className="section-headline">
          <div>
            <span className="section-kicker">Season and spare-parts treatment</span>
            <h3>Choose the operating view</h3>
          </div>
          <span className="pill">{includeSpares ? "Including spare parts" : "Excluding spare parts"}</span>
        </div>
        <div className="segment-row">
          {data.seasons.map((season) => (
            <Link
              className={`segment-chip ${season.seasonCode === selectedSeason ? "active" : ""}`}
              href={treatmentLink(season.seasonCode, includeSpares)}
              key={season.seasonCode}
            >
              {season.seasonLabel}
            </Link>
          ))}
        </div>
        <div className="segment-row">
          <Link
            className={`segment-chip ${includeSpares ? "active" : ""}`}
            href={treatmentLink(selectedSeason, true)}
          >
            Include spare parts
          </Link>
          <Link
            className={`segment-chip ${!includeSpares ? "active" : ""}`}
            href={treatmentLink(selectedSeason, false)}
          >
            Exclude spare parts
          </Link>
        </div>
      </section>

      <section className="analytics-kpi-grid">
        <MetricTile
          icon={CircleDollarSign}
          label="Operating baseline"
          value={includeSpares ? summary?.totalOperatingExpense : summary?.totalOperatingExpenseExSpares}
          helper={summary?.seasonLabel ?? selectedSeason}
          tone="brand"
        />
        <MetricTile icon={Wrench} label="Spare parts" value={summary?.spareParts ?? "$0"} helper="Tracked separately for sensitivity" tone="ruby" />
        <MetricTile icon={ListChecks} label="Categories" value={summary?.categoryCount ?? 0} helper="Top-table canonical rows" tone="good" />
        <MetricTile icon={Flag} label="Race rows" value={matrixRows.length} helper="Matrix cells with assigned values" tone="amber" />
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel className="dashboard-chart-panel" title="Operating expense composition" subtitle="Category mix from canonical season controls.">
          <StatusDonutChart data={categoryChartRows} height={245} />
        </Panel>
        <Panel className="dashboard-chart-panel" title="Race and allocation totals" subtitle="Race cost control with spare-parts treatment applied.">
          <HorizontalComparisonChart data={raceChartRows} height={285} />
        </Panel>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Season 3 input</span>
            <h3>Save a new operating expense line</h3>
          </div>
          <span className="badge">Canonical write</span>
        </div>
        <form action={addTbrOperatingExpenseLineAction} className="finance-entry-form">
          <label>
            <span>Season</span>
            <select className="table-select" name="seasonCode" defaultValue={selectedSeason}>
              {data.seasons.map((season) => (
                <option key={season.seasonCode} value={season.seasonCode}>{season.seasonLabel}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Category</span>
            <select className="table-select" name="categoryKey" defaultValue="travel">
              {categoryOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount USD</span>
            <input className="table-input" name="amount" placeholder="25000" type="number" min="0" step="0.01" />
          </label>
          <label className="wide-field">
            <span>Note</span>
            <input className="table-input" name="notes" placeholder="Budget support, source note, or approval context" />
          </label>
          <button className="solid-link" type="submit">Save line</button>
        </form>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Table view</span>
            <h3>{summary?.seasonLabel ?? selectedSeason} operating matrix</h3>
          </div>
          <span className="pill">{formatCompactCurrency(categoryRows.reduce((sum, row) => sum + row.reportingAmountUsd, 0))}</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Race / Allocation</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Treatment</th>
                <th>Source note</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((line) => (
                <tr key={`${line.raceCode}-${line.categoryKey}-${line.reportingAmountUsd}`}>
                  <td><strong>{line.raceName}</strong></td>
                  <td>{line.categoryName}</td>
                  <td>{line.amount}</td>
                  <td>
                    <span className={`pill ${line.isSpareParts ? "risk-pill" : ""}`}>
                      {line.isSpareParts ? "spare parts" : "baseline"}
                    </span>
                  </td>
                  <td>{line.notes ?? "Primary top-table row"}</td>
                </tr>
              ))}
              {matrixRows.length === 0 ? (
                <tr>
                  <td colSpan={5}>No operating matrix rows are loaded for this season yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
