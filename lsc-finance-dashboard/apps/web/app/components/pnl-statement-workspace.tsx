import Link from "next/link";
import { Fragment } from "react";
import { Activity, BadgeDollarSign, BarChart3, FileText, Scale, TrendingDown, TrendingUp } from "lucide-react";
import type { PnlStatementDashboard } from "@lsc/db";
import { FinanceTrendChart, HorizontalComparisonChart, StatusDonutChart, WaterfallBridgeChart, type ChartDatum } from "./lsc-dashboard-charts";
import { CompactLedgerTable, MetricTile, Panel } from "./lsc-blue-primitives";

type PnlStatementWorkspaceProps = {
  data: PnlStatementDashboard;
  basePath: string;
};

function moneyTone(value: number): "good" | "ruby" {
  return value >= 0 ? "good" : "ruby";
}

function labelStatus(value: string) {
  return value.replace(/_/g, " ");
}

function hrefFor(basePath: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const suffix = search.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

export function PnlStatementWorkspace({ data, basePath }: PnlStatementWorkspaceProps) {
  const selected = data.selectedPeriod;
  const selectedLines = data.lines.filter((line) => line.periodCode === data.selectedPeriodCode);
  const selectedSections = data.sectionSummaries.filter((section) => section.periodCode === data.selectedPeriodCode);
  const selectedStatusMix = data.statusMix.filter((row) => row.periodCode === data.selectedPeriodCode);

  const trendRows: ChartDatum[] = data.periods.map((period) => ({
    name: period.periodLabel,
    revenue: period.revenueUsd,
    cost: period.expenseUsd,
    margin: period.netIncomeUsd,
    value: period.netIncomeUsd,
    displayValue: period.netIncome,
    tone: moneyTone(period.netIncomeUsd)
  }));

  const sectionRows: ChartDatum[] = selectedSections
    .filter((section) => section.sectionAmountUsd > 0)
    .map((section) => ({
      name: section.sectionLabel,
      value: section.sectionAmountUsd,
      displayValue: section.amount,
      sublabel: `${section.includedLineCount} lines`,
      tone: section.statementRole === "revenue" ? "good" : "ruby"
    }));

  const statusRows: ChartDatum[] = selectedStatusMix
    .filter((row) => row.amountUsd > 0)
    .map((row) => ({
      name: labelStatus(row.dataStatus),
      value: row.amountUsd,
      displayValue: row.amount,
      sublabel: `${row.lineCount} lines`,
      tone:
        row.dataStatus === "actual" || row.dataStatus === "partial_actual"
          ? "good"
          : row.dataStatus === "pending" || row.dataStatus === "contingency"
            ? "amber"
            : row.dataStatus === "non_cash"
              ? "iris"
              : "brand"
    }));

  const bridgeRows: ChartDatum[] = selected
    ? [
        { name: "Revenue", value: selected.revenueUsd, displayValue: selected.revenue, tone: "good" },
        ...selectedSections
          .filter((section) => section.statementRole === "expense" && section.sectionAmountUsd > 0)
          .map((section) => ({
            name: section.sectionLabel,
            value: -section.sectionAmountUsd,
            displayValue: section.amount,
            tone: "ruby" as const
          }))
      ]
    : [];

  return (
    <div className="page-grid finance-workspace pnl-workspace">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">P&amp;L statement</span>
          <h3>{data.title}</h3>
          <p>{data.subtitle}</p>
        </div>
        <div className="workspace-header-right">
          {data.scenario ? <span className="pill">{data.scenario.scenarioType}</span> : null}
          {data.isFallback ? <span className="pill">Generated view</span> : <span className="pill">Source-backed</span>}
        </div>
      </section>

      <section className="pnl-control-strip">
        <div>
          <span className="section-kicker">Scenario</span>
          <div className="segment-row">
            {data.scenarios.length > 0 ? (
              data.scenarios.map((scenario) => (
                <Link
                  className={`segment-chip ${scenario.scenarioCode === data.scenario?.scenarioCode ? "active" : ""}`}
                  href={hrefFor(basePath, { scenario: scenario.scenarioCode, period: data.selectedPeriodCode })}
                  key={scenario.scenarioCode}
                >
                  {scenario.scenarioName}
                </Link>
              ))
            ) : (
              <span className="segment-chip active">{data.scenario?.scenarioName ?? "Generated"}</span>
            )}
          </div>
        </div>
        <div>
          <span className="section-kicker">Period</span>
          <div className="segment-row">
            {data.periods.map((period) => (
              <Link
                className={`segment-chip ${period.periodCode === data.selectedPeriodCode ? "active" : ""}`}
                href={hrefFor(basePath, { scenario: data.scenario?.scenarioCode, period: period.periodCode })}
                key={period.periodCode}
              >
                {period.periodLabel}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="analytics-kpi-grid">
        <MetricTile icon={TrendingUp} label="Revenue" value={selected?.revenue ?? "$0"} helper={selected?.periodLabel ?? "No period selected"} tone="good" />
        <MetricTile icon={TrendingDown} label="Expenses" value={selected?.expense ?? "$0"} helper={`${selected?.includedLineCount ?? 0} included lines`} tone="ruby" />
        <MetricTile icon={Scale} label="Net income / loss" value={selected?.netIncome ?? "$0"} helper="Derived from P&L statement view" tone={moneyTone(selected?.netIncomeUsd ?? 0)} />
        <MetricTile icon={Activity} label="Actual / partial" value={selected?.actualOrPartial ?? "$0"} helper="Actual and partial-actual tagged lines" tone="brand" />
        <MetricTile icon={BarChart3} label="Forecast" value={selected?.forecast ?? "$0"} helper="Forecast and mixed forecast lines" tone="amber" />
        <MetricTile icon={BadgeDollarSign} label="Non-cash" value={selected?.nonCash ?? "$0"} helper={`${selected?.contingency ?? "$0"} contingency tracked separately`} tone="iris" />
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel className="dashboard-chart-panel" title="Revenue, expenses, and net result" subtitle="Period trend from the P&L statement service.">
          <FinanceTrendChart
            data={trendRows}
            series={[
              { key: "revenue", label: "Revenue", tone: "good" },
              { key: "cost", label: "Expenses", tone: "ruby" },
              { key: "margin", label: "Net income", tone: "brand" }
            ]}
            height={285}
          />
        </Panel>
        <Panel className="dashboard-chart-panel" title={`${selected?.periodLabel ?? "Selected period"} bridge`} subtitle="Revenue less expense sections.">
          <WaterfallBridgeChart data={bridgeRows} height={285} />
        </Panel>
      </section>

      <section className="grid-two">
        <Panel className="dashboard-chart-panel" title="Expense and revenue mix" subtitle="Section-level values for the selected period.">
          <HorizontalComparisonChart data={sectionRows} height={300} />
        </Panel>
        <Panel className="dashboard-chart-panel" title="Actual vs forecast mix" subtitle="Statement lines grouped by data status.">
          <StatusDonutChart data={statusRows} height={300} />
        </Panel>
      </section>

      <section className="grid-two">
        <Panel title="Scenario assumptions" subtitle="Selected options and rates behind the active scenario.">
          {data.assumptions.length > 0 ? (
            <div className="pnl-assumption-list">
              {data.assumptions.slice(0, 8).map((assumption) => (
                <div className={assumption.isSelected ? "selected" : ""} key={assumption.assumptionKey}>
                  <span>{assumption.assumptionLabel}</span>
                  <strong>{assumption.displayValue}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No scenario assumptions are stored for this generated view yet.</p>
          )}
        </Panel>
        <Panel title="Source coverage" subtitle="Lineage by source module and data status.">
          {data.sourceCoverage.length > 0 ? (
            <div className="pnl-source-coverage">
              {data.sourceCoverage.map((row) => (
                <div key={`${row.sourceModule}-${row.dataStatus}`}>
                  <span>
                    {row.sourceModule} · {labelStatus(row.dataStatus)}
                  </span>
                  <strong>{row.includedAmount}</strong>
                  <small>{row.lineCount} lines · {row.sourceDocumentCount} linked docs</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No source coverage is available yet.</p>
          )}
        </Panel>
      </section>

      <Panel
        className="dashboard-chart-panel"
        title={`${selected?.periodLabel ?? "Selected period"} statement`}
        subtitle="Expandable workbook-style statement with source module and lineage chips."
        trailing={<span className="badge">{selected?.netIncome ?? "$0"} net</span>}
      >
        <CompactLedgerTable>
          <table className="pnl-statement-table">
            <thead>
              <tr>
                <th>Line item</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Source</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {selectedSections.map((section) => (
                <Fragment key={`${section.periodCode}-${section.sectionCode}`}>
                  <tr className="pnl-section-row">
                    <td>{section.sectionLabel}</td>
                    <td>{section.includedLineCount} lines</td>
                    <td>{section.amount}</td>
                    <td>Section total</td>
                    <td>{section.statementRole}</td>
                  </tr>
                  {selectedLines
                    .filter((line) => line.sectionCode === section.sectionCode && line.lineKind === "detail")
                    .map((line) => (
                      <tr key={line.lineId}>
                        <td>
                          <div className="pnl-line-title">
                            <FileText size={14} aria-hidden="true" />
                            <span>{line.lineLabel}</span>
                          </div>
                        </td>
                        <td><span className="pill">{labelStatus(line.dataStatus)}</span></td>
                        <td>{line.amount}</td>
                        <td>
                          <div className="source-chip-row">
                            <span className="source-chip">{line.sourceModule}</span>
                            {line.sourceSheetName ? <span className="source-chip">{line.sourceSheetName} r{line.sourceRowNumber}</span> : null}
                            {line.sourceDocumentName ? <span className="source-chip">{line.sourceDocumentName}</span> : null}
                          </div>
                        </td>
                        <td>{line.notes ?? "—"}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </CompactLedgerTable>
      </Panel>
    </div>
  );
}
