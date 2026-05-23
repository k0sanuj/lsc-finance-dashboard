import "server-only";

import { queryRows } from "../query";
import { formatCurrency, getBackend } from "./shared";

export type PnlOwnerType = "entity" | "sport" | "asset";

export type PnlScenarioOption = {
  scenarioId: string;
  scenarioCode: string;
  scenarioName: string;
  scenarioType: string;
  isDefault: boolean;
};

export type PnlPeriodSummary = {
  periodId: string;
  periodCode: string;
  periodLabel: string;
  periodOrder: number;
  fiscalYear: number | null;
  periodStatus: string;
  revenueUsd: number;
  expenseUsd: number;
  netIncomeUsd: number;
  actualOrPartialUsd: number;
  forecastUsd: number;
  contingencyUsd: number;
  nonCashUsd: number;
  includedLineCount: number;
  revenue: string;
  expense: string;
  netIncome: string;
  actualOrPartial: string;
  forecast: string;
  contingency: string;
  nonCash: string;
};

export type PnlStatementLine = {
  lineId: string;
  periodCode: string;
  sectionCode: string;
  sectionLabel: string;
  sectionOrder: number;
  lineCode: string;
  lineLabel: string;
  lineOrder: number;
  statementRole: string;
  lineKind: string;
  dataStatus: string;
  includeInPnl: boolean;
  reportingAmountUsd: number;
  signedAmountUsd: number;
  amount: string;
  sourceModule: string;
  sourceDocumentName: string | null;
  sourceSheetName: string | null;
  sourceRowNumber: number | null;
  notes: string | null;
};

export type PnlSectionSummary = {
  periodCode: string;
  sectionCode: string;
  sectionLabel: string;
  sectionOrder: number;
  statementRole: string;
  sectionAmountUsd: number;
  includedLineCount: number;
  amount: string;
};

export type PnlStatusMix = {
  periodCode: string;
  dataStatus: string;
  amountUsd: number;
  lineCount: number;
  amount: string;
};

export type PnlAssumption = {
  assumptionKey: string;
  assumptionLabel: string;
  assumptionType: string;
  optionOrder: number;
  sourceAmount: number | null;
  sourceCurrency: string | null;
  fxRate: number | null;
  reportingAmountUsd: number | null;
  valueText: string | null;
  isSelected: boolean;
  displayValue: string;
};

export type PnlStatementDashboard = {
  ownerType: PnlOwnerType;
  ownerCode: string;
  title: string;
  subtitle: string;
  scenario: PnlScenarioOption | null;
  scenarios: PnlScenarioOption[];
  periods: PnlPeriodSummary[];
  selectedPeriodCode: string;
  selectedPeriod: PnlPeriodSummary | null;
  lines: PnlStatementLine[];
  sectionSummaries: PnlSectionSummary[];
  statusMix: PnlStatusMix[];
  assumptions: PnlAssumption[];
  sourceCoverage: Array<{
    sourceModule: string;
    dataStatus: string;
    lineCount: number;
    includedAmountUsd: number;
    includedAmount: string;
    sourceDocumentCount: number;
  }>;
  isFallback: boolean;
};

type ScenarioRow = {
  scenario_id: string;
  scenario_code: string;
  scenario_name: string;
  scenario_type: string;
  is_default: boolean;
};

type SummaryRow = {
  period_id: string;
  period_code: string;
  period_label: string;
  period_order: string | number;
  fiscal_year: string | number | null;
  period_status: string;
  revenue_usd: string;
  expense_usd: string;
  net_income_usd: string;
  actual_or_partial_usd: string;
  forecast_usd: string;
  contingency_usd: string;
  non_cash_usd: string;
  included_line_count: string | number;
};

type LineRow = {
  line_id: string;
  period_code: string;
  section_code: string;
  section_label: string;
  section_order: string | number;
  line_code: string;
  line_label: string;
  line_order: string | number;
  statement_role: string;
  line_kind: string;
  data_status: string;
  include_in_pnl: boolean;
  reporting_amount_usd: string;
  signed_amount_usd: string;
  source_module: string;
  source_document_name: string | null;
  source_sheet_name: string | null;
  source_row_number: string | number | null;
  notes: string | null;
};

type SectionRow = {
  period_code: string;
  section_code: string;
  section_label: string;
  section_order: string | number;
  statement_role: string;
  section_amount_usd: string;
  included_line_count: string | number;
};

type StatusRow = {
  period_code: string;
  data_status: string;
  amount_usd: string;
  line_count: string | number;
};

type AssumptionRow = {
  assumption_key: string;
  assumption_label: string;
  assumption_type: string;
  option_order: string | number;
  source_amount: string | null;
  source_currency: string | null;
  fx_rate: string | null;
  reporting_amount_usd: string | null;
  value_text: string | null;
  is_selected: boolean;
};

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function periodSummary(row: SummaryRow): PnlPeriodSummary {
  const revenue = numeric(row.revenue_usd);
  const expense = numeric(row.expense_usd);
  const net = numeric(row.net_income_usd);
  const actualOrPartial = numeric(row.actual_or_partial_usd);
  const forecast = numeric(row.forecast_usd);
  const contingency = numeric(row.contingency_usd);
  const nonCash = numeric(row.non_cash_usd);
  return {
    periodId: row.period_id,
    periodCode: row.period_code,
    periodLabel: row.period_label,
    periodOrder: Number(row.period_order),
    fiscalYear: row.fiscal_year === null ? null : Number(row.fiscal_year),
    periodStatus: row.period_status,
    revenueUsd: revenue,
    expenseUsd: expense,
    netIncomeUsd: net,
    actualOrPartialUsd: actualOrPartial,
    forecastUsd: forecast,
    contingencyUsd: contingency,
    nonCashUsd: nonCash,
    includedLineCount: Number(row.included_line_count),
    revenue: formatCurrency(revenue),
    expense: formatCurrency(expense),
    netIncome: formatCurrency(net),
    actualOrPartial: formatCurrency(actualOrPartial),
    forecast: formatCurrency(forecast),
    contingency: formatCurrency(contingency),
    nonCash: formatCurrency(nonCash)
  };
}

function statementLine(row: LineRow): PnlStatementLine {
  const amount = numeric(row.reporting_amount_usd);
  return {
    lineId: row.line_id,
    periodCode: row.period_code,
    sectionCode: row.section_code,
    sectionLabel: row.section_label,
    sectionOrder: Number(row.section_order),
    lineCode: row.line_code,
    lineLabel: row.line_label,
    lineOrder: Number(row.line_order),
    statementRole: row.statement_role,
    lineKind: row.line_kind,
    dataStatus: row.data_status,
    includeInPnl: row.include_in_pnl,
    reportingAmountUsd: amount,
    signedAmountUsd: numeric(row.signed_amount_usd),
    amount: formatCurrency(amount),
    sourceModule: row.source_module,
    sourceDocumentName: row.source_document_name,
    sourceSheetName: row.source_sheet_name,
    sourceRowNumber: row.source_row_number === null ? null : Number(row.source_row_number),
    notes: row.notes
  };
}

function makeTitle(ownerType: PnlOwnerType, ownerCode: string) {
  if (ownerType === "sport") return `${ownerCode.toUpperCase()} P&L statement`;
  const labels: Record<string, string> = {
    LSC: "LSC P&L statement",
    TBR: "TBR P&L statement",
    FSP: "FSP portfolio P&L statement",
    XTZ: "XTZ India P&L statement"
  };
  return labels[ownerCode] ?? `${ownerCode} P&L statement`;
}

function fallbackEmpty(ownerType: PnlOwnerType, ownerCode: string): PnlStatementDashboard {
  return {
    ownerType,
    ownerCode,
    title: makeTitle(ownerType, ownerCode),
    subtitle: "No approved P&L statement lines are available yet. Add source-backed lines through imports or approved intake.",
    scenario: null,
    scenarios: [],
    periods: [],
    selectedPeriodCode: "",
    selectedPeriod: null,
    lines: [],
    sectionSummaries: [],
    statusMix: [],
    assumptions: [],
    sourceCoverage: [],
    isFallback: true
  };
}

export async function getPnlStatementDashboard({
  ownerType,
  ownerCode,
  scenarioCode,
  selectedPeriodCode
}: {
  ownerType: PnlOwnerType;
  ownerCode: string;
  scenarioCode?: string;
  selectedPeriodCode?: string;
}): Promise<PnlStatementDashboard> {
  if (getBackend() !== "database") return fallbackEmpty(ownerType, ownerCode);

  const scenarios = await queryRows<ScenarioRow>(
    `select
       id as scenario_id,
       scenario_code,
       scenario_name,
       scenario_type,
       is_default
     from finance_pnl_scenarios
     where owner_type = $1
       and owner_code = $2
     order by is_default desc, scenario_type, scenario_name`,
    [ownerType, ownerCode]
  );

  if (scenarios.length === 0) {
    return getGeneratedPnlFallback(ownerType, ownerCode);
  }

  const selectedScenario =
    scenarios.find((row) => row.scenario_code === scenarioCode) ??
    scenarios.find((row) => row.is_default) ??
    scenarios[0];

  const [summaryRows, lineRows, sectionRows, statusRows, assumptionRows, coverageRows] = await Promise.all([
    queryRows<SummaryRow>(
      `select *
       from finance_pnl_summary_by_period
       where scenario_id = $1
       order by period_order`,
      [selectedScenario.scenario_id]
    ),
    queryRows<LineRow>(
      `select
         line_id,
         period_code,
         section_code,
         section_label,
         section_order,
         line_code,
         line_label,
         line_order,
         statement_role,
         line_kind,
         data_status,
         include_in_pnl,
         reporting_amount_usd::text,
         signed_amount_usd::text,
         source_module,
         source_document_name,
         source_sheet_name,
         source_row_number,
         notes
       from finance_pnl_statement_lines
       where scenario_id = $1
       order by period_order, section_order, line_order, line_label`,
      [selectedScenario.scenario_id]
    ),
    queryRows<SectionRow>(
      `select *
       from finance_pnl_section_summary_by_period
       where scenario_id = $1
       order by period_order, section_order`,
      [selectedScenario.scenario_id]
    ),
    queryRows<StatusRow>(
      `select *
       from finance_pnl_status_mix_by_period
       where scenario_id = $1
       order by period_code, data_status`,
      [selectedScenario.scenario_id]
    ),
    queryRows<AssumptionRow>(
      `select
         assumption_key,
         assumption_label,
         assumption_type,
         option_order,
         source_amount::text,
         source_currency,
         fx_rate::text,
         reporting_amount_usd::text,
         value_text,
         is_selected
       from finance_pnl_assumptions
       where scenario_id = $1
       order by option_order, assumption_label`,
      [selectedScenario.scenario_id]
    ),
    queryRows<{
      source_module: string;
      data_status: string;
      line_count: string | number;
      included_amount_usd: string;
      source_document_count: string | number;
    }>(
      `select
         source_module,
         data_status,
         sum(line_count)::integer as line_count,
         sum(included_amount_usd)::numeric(14,2)::text as included_amount_usd,
         sum(source_document_count)::integer as source_document_count
       from finance_pnl_source_coverage_view
       where owner_type = $1
         and owner_code = $2
         and scenario_code = $3
       group by source_module, data_status
       order by source_module, data_status`,
      [ownerType, ownerCode, selectedScenario.scenario_code]
    )
  ]);

  const periods = summaryRows.map(periodSummary);
  const selectedPeriod =
    periods.find((period) => period.periodCode === selectedPeriodCode) ??
    periods.at(-1) ??
    null;

  return {
    ownerType,
    ownerCode,
    title: makeTitle(ownerType, ownerCode),
    subtitle: selectedScenario.scenario_name,
    scenario: {
      scenarioId: selectedScenario.scenario_id,
      scenarioCode: selectedScenario.scenario_code,
      scenarioName: selectedScenario.scenario_name,
      scenarioType: selectedScenario.scenario_type,
      isDefault: selectedScenario.is_default
    },
    scenarios: scenarios.map((row) => ({
      scenarioId: row.scenario_id,
      scenarioCode: row.scenario_code,
      scenarioName: row.scenario_name,
      scenarioType: row.scenario_type,
      isDefault: row.is_default
    })),
    periods,
    selectedPeriodCode: selectedPeriod?.periodCode ?? selectedPeriodCode ?? "",
    selectedPeriod,
    lines: lineRows.map(statementLine),
    sectionSummaries: sectionRows.map((row) => {
      const amount = numeric(row.section_amount_usd);
      return {
        periodCode: row.period_code,
        sectionCode: row.section_code,
        sectionLabel: row.section_label,
        sectionOrder: Number(row.section_order),
        statementRole: row.statement_role,
        sectionAmountUsd: amount,
        includedLineCount: Number(row.included_line_count),
        amount: formatCurrency(amount)
      };
    }),
    statusMix: statusRows.map((row) => {
      const amount = numeric(row.amount_usd);
      return {
        periodCode: row.period_code,
        dataStatus: row.data_status,
        amountUsd: amount,
        lineCount: Number(row.line_count),
        amount: formatCurrency(amount)
      };
    }),
    assumptions: assumptionRows.map((row) => {
      const reporting = row.reporting_amount_usd === null ? null : numeric(row.reporting_amount_usd);
      return {
        assumptionKey: row.assumption_key,
        assumptionLabel: row.assumption_label,
        assumptionType: row.assumption_type,
        optionOrder: Number(row.option_order),
        sourceAmount: row.source_amount === null ? null : numeric(row.source_amount),
        sourceCurrency: row.source_currency,
        fxRate: row.fx_rate === null ? null : numeric(row.fx_rate),
        reportingAmountUsd: reporting,
        valueText: row.value_text,
        isSelected: row.is_selected,
        displayValue: reporting === null ? row.value_text ?? "" : formatCurrency(reporting)
      };
    }),
    sourceCoverage: coverageRows.map((row) => {
      const amount = numeric(row.included_amount_usd);
      return {
        sourceModule: row.source_module,
        dataStatus: row.data_status,
        lineCount: Number(row.line_count),
        includedAmountUsd: amount,
        includedAmount: formatCurrency(amount),
        sourceDocumentCount: Number(row.source_document_count)
      };
    }),
    isFallback: false
  };
}

async function getGeneratedPnlFallback(ownerType: PnlOwnerType, ownerCode: string): Promise<PnlStatementDashboard> {
  if (ownerType === "sport") return getGeneratedSportPnl(ownerCode);
  if (ownerCode === "FSP") return getGeneratedFspPortfolioPnl();
  if (ownerCode === "LSC" || ownerCode === "XTZ") return getGeneratedRecognitionPnl(ownerCode);
  return fallbackEmpty(ownerType, ownerCode);
}

async function getGeneratedRecognitionPnl(ownerCode: string): Promise<PnlStatementDashboard> {
  const rows = await queryRows<{
    company_code: string;
    company_name: string;
    actual_revenue: string;
    actual_cost: string;
    actual_margin: string;
    committed_payables: string;
    recognition_policy: string;
  }>(
    `select company_code::text, company_name, actual_revenue::text, actual_cost::text,
            actual_margin::text, committed_payables::text, recognition_policy
     from finance_recognition_by_entity
     where company_code = $1::company_code`,
    [ownerCode]
  );
  const row = rows[0];
  if (!row) return fallbackEmpty("entity", ownerCode);

  const revenue = numeric(row.actual_revenue);
  const expense = numeric(row.actual_cost);
  const committed = numeric(row.committed_payables);
  const period: PnlPeriodSummary = {
    periodId: "generated-current",
    periodCode: "CURRENT",
    periodLabel: "Current",
    periodOrder: 1,
    fiscalYear: null,
    periodStatus: "actual",
    revenueUsd: revenue,
    expenseUsd: expense,
    netIncomeUsd: revenue - expense,
    actualOrPartialUsd: revenue + expense,
    forecastUsd: 0,
    contingencyUsd: 0,
    nonCashUsd: 0,
    includedLineCount: 2,
    revenue: formatCurrency(revenue),
    expense: formatCurrency(expense),
    netIncome: formatCurrency(revenue - expense),
    actualOrPartial: formatCurrency(revenue + expense),
    forecast: "$0",
    contingency: "$0",
    nonCash: "$0"
  };

  return {
    ...fallbackEmpty("entity", ownerCode),
    subtitle: `Generated from finance recognition policy: ${row.recognition_policy}.`,
    scenario: {
      scenarioId: "generated-recognition",
      scenarioCode: "generated-recognition",
      scenarioName: "Generated recognition P&L",
      scenarioType: "actual",
      isDefault: true
    },
    periods: [period],
    selectedPeriodCode: "CURRENT",
    selectedPeriod: period,
    lines: [
      {
        lineId: "actual-revenue",
        periodCode: "CURRENT",
        sectionCode: "revenue",
        sectionLabel: "Revenue",
        sectionOrder: 10,
        lineCode: "actual_revenue",
        lineLabel: "Actual recognized revenue",
        lineOrder: 10,
        statementRole: "revenue",
        lineKind: "detail",
        dataStatus: "actual",
        includeInPnl: true,
        reportingAmountUsd: revenue,
        signedAmountUsd: revenue,
        amount: formatCurrency(revenue),
        sourceModule: "finance_recognition_by_entity",
        sourceDocumentName: null,
        sourceSheetName: null,
        sourceRowNumber: null,
        notes: row.recognition_policy
      },
      {
        lineId: "actual-cost",
        periodCode: "CURRENT",
        sectionCode: "expenses",
        sectionLabel: "Expenses",
        sectionOrder: 20,
        lineCode: "actual_cost",
        lineLabel: "Actual approved cost",
        lineOrder: 20,
        statementRole: "expense",
        lineKind: "detail",
        dataStatus: "actual",
        includeInPnl: true,
        reportingAmountUsd: expense,
        signedAmountUsd: -expense,
        amount: formatCurrency(expense),
        sourceModule: "finance_recognition_by_entity",
        sourceDocumentName: null,
        sourceSheetName: null,
        sourceRowNumber: null,
        notes: committed > 0 ? `${formatCurrency(committed)} committed payables remain outside actual P&L.` : row.recognition_policy
      }
    ],
    sectionSummaries: [
      { periodCode: "CURRENT", sectionCode: "revenue", sectionLabel: "Revenue", sectionOrder: 10, statementRole: "revenue", sectionAmountUsd: revenue, includedLineCount: 1, amount: formatCurrency(revenue) },
      { periodCode: "CURRENT", sectionCode: "expenses", sectionLabel: "Expenses", sectionOrder: 20, statementRole: "expense", sectionAmountUsd: expense, includedLineCount: 1, amount: formatCurrency(expense) }
    ],
    statusMix: [{ periodCode: "CURRENT", dataStatus: "actual", amountUsd: revenue + expense, lineCount: 2, amount: formatCurrency(revenue + expense) }],
    sourceCoverage: [{ sourceModule: "finance_recognition_by_entity", dataStatus: "actual", lineCount: 2, includedAmountUsd: revenue + expense, includedAmount: formatCurrency(revenue + expense), sourceDocumentCount: 0 }],
    isFallback: true
  };
}

async function getGeneratedFspPortfolioPnl(): Promise<PnlStatementDashboard> {
  const rows = await queryRows<{
    year_number: string | number;
    revenue: string;
    cogs: string;
    opex: string;
    ebitda: string;
  }>(
    `with years(year_number) as (values (1), (2), (3))
     select
       y.year_number,
       case y.year_number when 1 then coalesce(sum(revenue_y1), 0)
                          when 2 then coalesce(sum(revenue_y2), 0)
                          else coalesce(sum(revenue_y3), 0) end::numeric(14,2)::text as revenue,
       case y.year_number when 1 then coalesce(sum(cogs_y1), 0)
                          when 2 then coalesce(sum(cogs_y2), 0)
                          else coalesce(sum(cogs_y3), 0) end::numeric(14,2)::text as cogs,
       case y.year_number when 1 then coalesce(sum(opex_y1), 0)
                          when 2 then coalesce(sum(opex_y2), 0)
                          else coalesce(sum(opex_y3), 0) end::numeric(14,2)::text as opex,
       case y.year_number when 1 then coalesce(sum(ebitda_y1), 0)
                          when 2 then coalesce(sum(ebitda_y2), 0)
                          else coalesce(sum(ebitda_y3), 0) end::numeric(14,2)::text as ebitda
     from years y
     left join fsp_pnl_summary fps on fps.scenario::text = 'base' or fps.scenario is null
     group by y.year_number
     order by y.year_number`
  );

  const periods = rows.map((row) => {
    const revenue = numeric(row.revenue);
    const expense = numeric(row.cogs) + numeric(row.opex);
    return {
      periodId: `fsp-y${row.year_number}`,
      periodCode: `Y${row.year_number}`,
      periodLabel: `Year ${row.year_number}`,
      periodOrder: Number(row.year_number),
      fiscalYear: null,
      periodStatus: "forecast",
      revenueUsd: revenue,
      expenseUsd: expense,
      netIncomeUsd: revenue - expense,
      actualOrPartialUsd: 0,
      forecastUsd: revenue + expense,
      contingencyUsd: 0,
      nonCashUsd: 0,
      includedLineCount: 3,
      revenue: formatCurrency(revenue),
      expense: formatCurrency(expense),
      netIncome: formatCurrency(revenue - expense),
      actualOrPartial: "$0",
      forecast: formatCurrency(revenue + expense),
      contingency: "$0",
      nonCash: "$0"
    } satisfies PnlPeriodSummary;
  });

  return {
    ...fallbackEmpty("entity", "FSP"),
    subtitle: "Generated from FSP base scenario sport portfolio modules.",
    scenario: { scenarioId: "fsp-base-generated", scenarioCode: "fsp-base", scenarioName: "FSP Base Scenario", scenarioType: "forecast", isDefault: true },
    periods,
    selectedPeriodCode: periods.at(-1)?.periodCode ?? "",
    selectedPeriod: periods.at(-1) ?? null,
    lines: [],
    sectionSummaries: [],
    statusMix: periods.map((period) => ({ periodCode: period.periodCode, dataStatus: "forecast", amountUsd: period.revenueUsd + period.expenseUsd, lineCount: 3, amount: formatCurrency(period.revenueUsd + period.expenseUsd) })),
    sourceCoverage: [{ sourceModule: "fsp_pnl_summary", dataStatus: "forecast", lineCount: rows.length * 3, includedAmountUsd: periods.reduce((sum, period) => sum + period.revenueUsd + period.expenseUsd, 0), includedAmount: formatCurrency(periods.reduce((sum, period) => sum + period.revenueUsd + period.expenseUsd, 0)), sourceDocumentCount: 0 }],
    isFallback: true
  };
}

async function getGeneratedSportPnl(sportCode: string): Promise<PnlStatementDashboard> {
  const rows = await queryRows<{
    sport_id: string;
    sport_code: string;
    sport_name: string;
    section: string;
    category: string;
    sub_category: string | null;
    display_order: string | number;
    year_1_budget: string;
    year_2_budget: string;
    year_3_budget: string;
    year_1_actual: string;
    year_2_actual: string;
    year_3_actual: string;
    source_module: string | null;
    notes: string | null;
  }>(
    `select
       fs.id::text as sport_id,
       fs.sport_code::text,
       fs.display_name as sport_name,
       fpli.section::text,
       fpli.category,
       fpli.sub_category,
       fpli.display_order,
       fpli.year_1_budget::text,
       fpli.year_2_budget::text,
       fpli.year_3_budget::text,
       fpli.year_1_actual::text,
       fpli.year_2_actual::text,
       fpli.year_3_actual::text,
       fpli.source_module,
       fpli.notes
     from fsp_sports fs
     join fsp_pnl_line_items fpli on fpli.sport_id = fs.id
     where lower(fs.sport_code::text) = lower($1)
       and fpli.scenario::text = 'base'
     order by fpli.section, fpli.display_order`,
    [sportCode]
  );
  if (rows.length === 0) return fallbackEmpty("sport", sportCode);

  const periods = ([1, 2, 3] as const).map((year) => {
    const revenue = rows
      .filter((row) => row.section === "revenue")
      .reduce((sum, row) => sum + numeric(row[`year_${year}_budget` as keyof typeof row] as string), 0);
    const expense = rows
      .filter((row) => row.section !== "revenue")
      .reduce((sum, row) => sum + numeric(row[`year_${year}_budget` as keyof typeof row] as string), 0);
    return {
      periodId: `${sportCode}-y${year}`,
      periodCode: `Y${year}`,
      periodLabel: `Year ${year}`,
      periodOrder: year,
      fiscalYear: null,
      periodStatus: "forecast",
      revenueUsd: revenue,
      expenseUsd: expense,
      netIncomeUsd: revenue - expense,
      actualOrPartialUsd: 0,
      forecastUsd: revenue + expense,
      contingencyUsd: 0,
      nonCashUsd: 0,
      includedLineCount: rows.length,
      revenue: formatCurrency(revenue),
      expense: formatCurrency(expense),
      netIncome: formatCurrency(revenue - expense),
      actualOrPartial: "$0",
      forecast: formatCurrency(revenue + expense),
      contingency: "$0",
      nonCash: "$0"
    } satisfies PnlPeriodSummary;
  });

  return {
    ...fallbackEmpty("sport", sportCode),
    title: `${rows[0].sport_name} P&L statement`,
    subtitle: "Generated from FSP sport base scenario module.",
    scenario: { scenarioId: "sport-base-generated", scenarioCode: "base", scenarioName: "Base Scenario", scenarioType: "forecast", isDefault: true },
    periods,
    selectedPeriodCode: periods.at(-1)?.periodCode ?? "",
    selectedPeriod: periods.at(-1) ?? null,
    lines: rows.flatMap((row) =>
      ([1, 2, 3] as const).map((year) => {
        const amount = numeric(row[`year_${year}_budget` as keyof typeof row] as string);
        const isRevenue = row.section === "revenue";
        return {
          lineId: `${row.sport_id}-${row.section}-${row.display_order}-y${year}`,
          periodCode: `Y${year}`,
          sectionCode: row.section,
          sectionLabel: row.section.toUpperCase(),
          sectionOrder: isRevenue ? 10 : row.section === "cogs" ? 20 : 30,
          lineCode: row.category.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          lineLabel: row.sub_category ? `${row.category}: ${row.sub_category}` : row.category,
          lineOrder: Number(row.display_order),
          statementRole: isRevenue ? "revenue" : "expense",
          lineKind: "detail",
          dataStatus: "forecast",
          includeInPnl: true,
          reportingAmountUsd: amount,
          signedAmountUsd: isRevenue ? amount : -amount,
          amount: formatCurrency(amount),
          sourceModule: row.source_module ?? "fsp_pnl_line_items",
          sourceDocumentName: null,
          sourceSheetName: null,
          sourceRowNumber: null,
          notes: row.notes
        } satisfies PnlStatementLine;
      })
    ),
    statusMix: periods.map((period) => ({ periodCode: period.periodCode, dataStatus: "forecast", amountUsd: period.revenueUsd + period.expenseUsd, lineCount: rows.length, amount: formatCurrency(period.revenueUsd + period.expenseUsd) })),
    sourceCoverage: [{ sourceModule: "fsp_pnl_line_items", dataStatus: "forecast", lineCount: rows.length, includedAmountUsd: periods.reduce((sum, period) => sum + period.revenueUsd + period.expenseUsd, 0), includedAmount: formatCurrency(periods.reduce((sum, period) => sum + period.revenueUsd + period.expenseUsd, 0)), sourceDocumentCount: 0 }],
    isFallback: true
  };
}
