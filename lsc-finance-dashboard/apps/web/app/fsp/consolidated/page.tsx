import Link from "next/link";
import type { Route } from "next";
import { CircleDollarSign, Layers3, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { requireRole } from "../../../lib/auth";
import { getEntityDashboard, getFspPnlSummaries, getFspSports } from "@lsc/db";
import {
  FinanceTrendChart,
  HorizontalComparisonChart,
  StatusDonutChart,
  WaterfallBridgeChart,
  type ChartDatum
} from "../../components/lsc-dashboard-charts";
import { MetricTile, Panel } from "../../components/lsc-blue-primitives";
import { formatCompactCurrency } from "../../components/dashboard-charts";

type YearKey = 1 | 2 | 3;

function valueForYear(
  row: { revenueY1: number; revenueY2: number; revenueY3: number; cogsY1: number; cogsY2: number; cogsY3: number; opexY1: number; opexY2: number; opexY3: number; ebitdaY1: number; ebitdaY2: number; ebitdaY3: number },
  key: "revenue" | "cogs" | "opex" | "ebitda",
  year: YearKey
) {
  if (key === "revenue") return year === 1 ? row.revenueY1 : year === 2 ? row.revenueY2 : row.revenueY3;
  if (key === "cogs") return year === 1 ? row.cogsY1 : year === 2 ? row.cogsY2 : row.cogsY3;
  if (key === "opex") return year === 1 ? row.opexY1 : year === 2 ? row.opexY2 : row.opexY3;
  return year === 1 ? row.ebitdaY1 : year === 2 ? row.ebitdaY2 : row.ebitdaY3;
}

export default async function FspConsolidatedPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);

  const params = await searchParams;
  const selectedYear: YearKey = params.year === "2" ? 2 : params.year === "3" ? 3 : 1;
  const [dashboard, summaries, sports] = await Promise.all([
    getEntityDashboard("FSP"),
    getFspPnlSummaries("base"),
    getFspSports(),
  ]);

  const yearRevenue = summaries.reduce((sum, row) => sum + valueForYear(row, "revenue", selectedYear), 0);
  const yearCogs = summaries.reduce((sum, row) => sum + valueForYear(row, "cogs", selectedYear), 0);
  const yearOpex = summaries.reduce((sum, row) => sum + valueForYear(row, "opex", selectedYear), 0);
  const yearCost = yearCogs + yearOpex;
  const yearEbitda = summaries.reduce((sum, row) => sum + valueForYear(row, "ebitda", selectedYear), 0);
  const margin = yearRevenue ? (yearEbitda / yearRevenue) * 100 : 0;
  const sportCodesWithData = new Set(
    summaries
      .filter((row) => row.revenueY1 > 0 || row.cogsY1 > 0 || row.opexY1 > 0 || row.ebitdaY1 !== 0)
      .map((row) => row.sportCode)
  );
  const sportsWithoutData = sports.filter((sport) => !sportCodesWithData.has(sport.sportCode));
  const sportRows: ChartDatum[] = summaries.map((row) => {
    const revenue = valueForYear(row, "revenue", selectedYear);
    const cost = valueForYear(row, "cogs", selectedYear) + valueForYear(row, "opex", selectedYear);
    const ebitda = valueForYear(row, "ebitda", selectedYear);
    return {
      name: row.sportName,
      value: Math.abs(ebitda),
      displayValue: formatCompactCurrency(ebitda),
      sublabel: `Revenue ${formatCompactCurrency(revenue)} · Cost ${formatCompactCurrency(cost)}`,
      revenue,
      cost,
      margin: ebitda,
      tone: ebitda >= 0 ? "good" : "ruby"
    };
  });
  const bridgeRows: ChartDatum[] = [
    { name: "Revenue", value: yearRevenue, displayValue: formatCompactCurrency(yearRevenue), tone: "good" },
    { name: "COGS", value: -yearCogs, displayValue: formatCompactCurrency(yearCogs), tone: "ruby" },
    { name: "OPEX", value: -yearOpex, displayValue: formatCompactCurrency(yearOpex), tone: "amber" }
  ];
  const costRows: ChartDatum[] = [
    { name: "COGS", value: yearCogs, displayValue: formatCompactCurrency(yearCogs), tone: "ruby" },
    { name: "OPEX", value: yearOpex, displayValue: formatCompactCurrency(yearOpex), tone: "amber" },
    { name: "EBITDA", value: Math.abs(yearEbitda), displayValue: formatCompactCurrency(yearEbitda), tone: yearEbitda >= 0 ? "good" : "ruby" }
  ];

  return (
    <div className="page-grid lsc-dashboard-page">
      <section className="workspace-header command-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Future of Sports</span>
          <h3>FSP consolidated scenario P&amp;L</h3>
          <p className="muted">{dashboard.policyNote}</p>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            {([1, 2, 3] as const).map((year) => (
              <Link
                className={`segment-chip${selectedYear === year ? " active" : ""}`}
                href={`/fsp/consolidated?year=${year}` as Route}
                key={year}
              >
                Year {year}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="analytics-kpi-grid">
        <MetricTile icon={TrendingUp} label="Revenue" value={formatCompactCurrency(yearRevenue)} helper={`Year ${selectedYear} scenario`} tone="good" />
        <MetricTile icon={TrendingDown} label="COGS" value={formatCompactCurrency(yearCogs)} helper="Sport direct cost" tone="ruby" />
        <MetricTile icon={CircleDollarSign} label="OPEX" value={formatCompactCurrency(yearOpex)} helper="Operating cost" tone="amber" />
        <MetricTile icon={Scale} label="EBITDA" value={formatCompactCurrency(yearEbitda)} helper={`${margin.toFixed(1)}% margin`} tone={yearEbitda >= 0 ? "good" : "ruby"} />
        <MetricTile icon={Layers3} label="Modeled sports" value={sportRows.length} helper={`${sportsWithoutData.length} awaiting setup`} tone="brand" />
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title={`Year ${selectedYear} P&L bridge`}
          subtitle="FSP-only scenario bridge; it is not pushed into LSC consolidated finance."
          trailing={<span className="badge">{formatCompactCurrency(yearEbitda)} EBITDA</span>}
        >
          <WaterfallBridgeChart data={bridgeRows} height={285} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="Portfolio trend"
          subtitle="Revenue, cost, and EBITDA across the three-year scenario."
        >
          <FinanceTrendChart
            data={dashboard.trend.map((row) => ({ ...row }))}
            height={285}
            series={[
              { key: "revenue", label: "Revenue", tone: "good" },
              { key: "cost", label: "Cost", tone: "ruby" },
              { key: "margin", label: "EBITDA", tone: "brand" }
            ]}
          />
        </Panel>
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title={`Sport EBITDA · Year ${selectedYear}`}
          subtitle="Per-sport scenario contribution."
        >
          <HorizontalComparisonChart data={sportRows} height={300} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="Cost composition"
          subtitle="COGS, OPEX, and EBITDA signal for the selected year."
        >
          <StatusDonutChart data={costRows} height={255} />
        </Panel>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Sport P&amp;L table</span>
            <h3>Scenario detail by sport</h3>
          </div>
          <span className="pill">Year {selectedYear}</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Sport</th>
                <th>Revenue</th>
                <th>COGS</th>
                <th>OPEX</th>
                <th>EBITDA</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((row) => {
                const ebitda = valueForYear(row, "ebitda", selectedYear);
                return (
                  <tr key={row.sportId}>
                    <td><Link href={`/fsp/sports/${row.sportCode}` as Route}><strong>{row.sportName}</strong></Link></td>
                    <td>{formatCompactCurrency(valueForYear(row, "revenue", selectedYear))}</td>
                    <td>{formatCompactCurrency(valueForYear(row, "cogs", selectedYear))}</td>
                    <td>{formatCompactCurrency(valueForYear(row, "opex", selectedYear))}</td>
                    <td><span className={`signal-pill ${ebitda >= 0 ? "signal-good" : "signal-risk"}`}>{formatCompactCurrency(ebitda)}</span></td>
                  </tr>
                );
              })}
              {summaries.length === 0 ? (
                <tr>
                  <td className="muted" colSpan={5}>No FSP scenario rows are loaded yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
