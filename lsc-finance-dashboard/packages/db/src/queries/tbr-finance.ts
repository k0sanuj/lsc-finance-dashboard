import "server-only";

import { queryRows } from "../query";
import { formatCurrency, getBackend } from "./shared";

export type TbrFinanceSeason = {
  seasonId: string;
  seasonCode: string;
  seasonNumber: number;
  seasonYear: number;
  seasonLabel: string;
  status: string;
};

export type TbrOperatingSummary = TbrFinanceSeason & {
  categoryCount: number;
  totalOperatingExpenseUsd: number;
  totalOperatingExpenseExSparesUsd: number;
  sparePartsUsd: number;
  totalOperatingExpense: string;
  totalOperatingExpenseExSpares: string;
  spareParts: string;
};

export type TbrOperatingCategory = {
  categoryKey: string;
  categoryName: string;
  displayOrder: number;
  isSpareParts: boolean;
  reportingAmountUsd: number;
  amount: string;
};

export type TbrOperatingRace = {
  raceCode: string;
  raceName: string;
  totalOperatingExpenseUsd: number;
  totalOperatingExpenseExSparesUsd: number;
  sparePartsUsd: number;
  totalOperatingExpense: string;
  totalOperatingExpenseExSpares: string;
  spareParts: string;
};

export type TbrOperatingMatrixLine = {
  raceCode: string;
  raceName: string;
  categoryKey: string;
  categoryName: string;
  displayOrder: number;
  reportingAmountUsd: number;
  amount: string;
  isSpareParts: boolean;
  notes: string | null;
};

export type TbrE1StatusSummary = TbrFinanceSeason & {
  lineCount: number;
  grossE1AmountUsd: number;
  paidAmountUsd: number;
  dueAmountUsd: number;
  creditNoteAmountUsd: number;
  overlapVisibleAmountUsd: number;
  incrementalVisibleAmountUsd: number;
  excludedLineCount: number;
  pendingReviewCount: number;
  grossE1Amount: string;
  paidAmount: string;
  dueAmount: string;
  creditNoteAmount: string;
  overlapVisibleAmount: string;
  incrementalVisibleAmount: string;
};

export type TbrE1Line = {
  e1LineId: string;
  seasonCode: string;
  invoiceNumber: string | null;
  item: string;
  normalizedStatus: string;
  lineType: string;
  pnlTreatment: string;
  overlapCategoryKey: string | null;
  reportingAmountUsd: number;
  dueAmountReportingUsd: number;
  amount: string;
  dueAmount: string;
  overlapGroupE1Amount: string;
  overlapGroupBaseline: string;
  overlapGroupVariance: string;
  comments: string | null;
};

export type TbrOverallPnlRow = TbrFinanceSeason & {
  sponsorshipRevenueUsd: number;
  prizeMoneyRevenueUsd: number;
  otherRevenueUsd: number;
  totalRevenueUsd: number;
  operatingBaselineUsd: number;
  operatingBaselineExSparesUsd: number;
  sparePartsUsd: number;
  e1IncrementalCostUsd: number;
  e1OverlapVarianceUsd: number;
  totalCostUsd: number;
  ebitdaUsd: number;
  sponsorshipRevenue: string;
  prizeMoneyRevenue: string;
  otherRevenue: string;
  totalRevenue: string;
  operatingBaseline: string;
  operatingBaselineExSpares: string;
  spareParts: string;
  e1IncrementalCost: string;
  e1OverlapVariance: string;
  totalCost: string;
  ebitda: string;
};

export type TbrReconciliationGroup = {
  seasonCode: string;
  overlapCategoryKey: string;
  overlapGroupE1AmountUsd: number;
  overlapGroupBaselineUsd: number;
  overlapGroupVarianceUsd: number;
  overlapGroupE1Amount: string;
  overlapGroupBaseline: string;
  overlapGroupVariance: string;
};

type SeasonRow = {
  season_id: string;
  season_code: string;
  season_number: number;
  season_year: number;
  season_label: string;
  status: string;
};

type OperatingSummaryRow = SeasonRow & {
  category_count: number | string;
  total_operating_expense_usd: string;
  total_operating_expense_ex_spares_usd: string;
  spare_parts_usd: string;
};

type OperatingCategoryRow = {
  category_key: string;
  category_name: string;
  display_order: number | string;
  is_spare_parts: boolean;
  reporting_amount_usd: string;
};

type OperatingRaceRow = {
  race_code: string | null;
  race_name: string;
  total_operating_expense_usd: string;
  total_operating_expense_ex_spares_usd: string;
  spare_parts_usd: string;
};

type OperatingMatrixRow = {
  race_code: string | null;
  race_name: string | null;
  category_key: string;
  category_name: string;
  display_order: number | string;
  reporting_amount_usd: string;
  is_spare_parts: boolean;
  notes: string | null;
};

type E1SummaryRow = SeasonRow & {
  line_count: number | string;
  gross_e1_amount_usd: string;
  paid_amount_usd: string;
  due_amount_usd: string;
  credit_note_amount_usd: string;
  overlap_visible_amount_usd: string;
  incremental_visible_amount_usd: string;
  excluded_line_count: number | string;
  pending_review_count: number | string;
};

type E1LineRow = {
  e1_line_id: string;
  season_code: string;
  invoice_number: string | null;
  item: string;
  normalized_status: string;
  line_type: string;
  pnl_treatment: string;
  overlap_category_key: string | null;
  reporting_amount_usd: string;
  due_amount_reporting_usd: string;
  overlap_group_e1_amount_usd: string;
  overlap_group_baseline_usd: string;
  overlap_group_variance_usd: string;
  comments: string | null;
};

type OverallRow = SeasonRow & {
  sponsorship_revenue_usd: string;
  prize_money_revenue_usd: string;
  other_revenue_usd: string;
  total_revenue_usd: string;
  operating_baseline_usd: string;
  operating_baseline_ex_spares_usd: string;
  spare_parts_usd: string;
  e1_incremental_cost_usd: string;
  e1_overlap_variance_usd: string;
  total_cost_usd: string;
  ebitda_usd: string;
};

type ReconciliationGroupRow = {
  season_code: string;
  overlap_category_key: string;
  overlap_group_e1_amount_usd: string;
  overlap_group_baseline_usd: string;
  overlap_group_variance_usd: string;
};

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSeason(row: SeasonRow): TbrFinanceSeason {
  return {
    seasonId: row.season_id,
    seasonCode: row.season_code,
    seasonNumber: Number(row.season_number),
    seasonYear: Number(row.season_year),
    seasonLabel: row.season_label,
    status: row.status
  };
}

function defaultSeasonCode(seasons: readonly TbrFinanceSeason[]) {
  const completedWithData = [...seasons]
    .filter((season) => season.status !== "planning")
    .sort((left, right) => right.seasonNumber - left.seasonNumber);
  return completedWithData[0]?.seasonCode ?? seasons[0]?.seasonCode ?? "S2";
}

export async function getTbrFinanceSeasons(): Promise<TbrFinanceSeason[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<SeasonRow>(
    `select
       id as season_id,
       season_code,
       season_number,
       season_year,
       season_label,
       status
     from tbr_seasons
     order by season_number`
  );

  return rows.map(normalizeSeason);
}

export async function getTbrOperatingExpenseDashboard(selectedSeasonCode?: string) {
  if (getBackend() !== "database") {
    return {
      seasons: [] as TbrFinanceSeason[],
      selectedSeasonCode: selectedSeasonCode ?? "S2",
      summary: null as TbrOperatingSummary | null,
      summaries: [] as TbrOperatingSummary[],
      categories: [] as TbrOperatingCategory[],
      races: [] as TbrOperatingRace[],
      matrix: [] as TbrOperatingMatrixLine[]
    };
  }

  const summaryRows = await queryRows<OperatingSummaryRow>(
    `select
       season_id,
       season_code,
       season_number,
       season_year,
       season_label,
       status,
       category_count,
       total_operating_expense_usd,
       total_operating_expense_ex_spares_usd,
       spare_parts_usd
     from tbr_operating_expense_summary_by_season
     order by season_number`
  );
  const summaries = summaryRows.map((row) => {
    const total = numeric(row.total_operating_expense_usd);
    const exSpares = numeric(row.total_operating_expense_ex_spares_usd);
    const spares = numeric(row.spare_parts_usd);
    return {
      ...normalizeSeason(row),
      categoryCount: Number(row.category_count),
      totalOperatingExpenseUsd: total,
      totalOperatingExpenseExSparesUsd: exSpares,
      sparePartsUsd: spares,
      totalOperatingExpense: formatCurrency(total),
      totalOperatingExpenseExSpares: formatCurrency(exSpares),
      spareParts: formatCurrency(spares)
    } satisfies TbrOperatingSummary;
  });
  const seasons = summaries.map((row) => ({
    seasonId: row.seasonId,
    seasonCode: row.seasonCode,
    seasonNumber: row.seasonNumber,
    seasonYear: row.seasonYear,
    seasonLabel: row.seasonLabel,
    status: row.status
  }));
  const resolvedSeasonCode =
    summaries.some((row) => row.seasonCode === selectedSeasonCode)
      ? selectedSeasonCode
      : defaultSeasonCode(seasons);

  const [categoryRows, raceRows, matrixRows] = await Promise.all([
    queryRows<OperatingCategoryRow>(
      `select category_key, category_name, display_order, is_spare_parts, reporting_amount_usd
       from tbr_operating_expense_by_category
       where season_code = $1
       order by display_order, category_name`,
      [resolvedSeasonCode]
    ),
    queryRows<OperatingRaceRow>(
      `select race_code, race_name, total_operating_expense_usd, total_operating_expense_ex_spares_usd, spare_parts_usd
       from tbr_operating_expense_by_race
       where season_code = $1
       order by race_code nulls last, race_name`,
      [resolvedSeasonCode]
    ),
    queryRows<OperatingMatrixRow>(
      `select race_code, race_name, category_key, category_name, display_order, reporting_amount_usd, is_spare_parts, notes
       from tbr_operating_expense_matrix
       where season_code = $1
       order by race_code nulls last, display_order, category_name`,
      [resolvedSeasonCode]
    )
  ]);

  return {
    seasons,
    selectedSeasonCode: resolvedSeasonCode ?? "S2",
    summary: summaries.find((row) => row.seasonCode === resolvedSeasonCode) ?? null,
    summaries,
    categories: categoryRows.map((row) => {
      const amount = numeric(row.reporting_amount_usd);
      return {
        categoryKey: row.category_key,
        categoryName: row.category_name,
        displayOrder: Number(row.display_order),
        isSpareParts: row.is_spare_parts,
        reportingAmountUsd: amount,
        amount: formatCurrency(amount)
      };
    }),
    races: raceRows.map((row) => {
      const total = numeric(row.total_operating_expense_usd);
      const exSpares = numeric(row.total_operating_expense_ex_spares_usd);
      const spares = numeric(row.spare_parts_usd);
      return {
        raceCode: row.race_code ?? "UNASSIGNED",
        raceName: row.race_name,
        totalOperatingExpenseUsd: total,
        totalOperatingExpenseExSparesUsd: exSpares,
        sparePartsUsd: spares,
        totalOperatingExpense: formatCurrency(total),
        totalOperatingExpenseExSpares: formatCurrency(exSpares),
        spareParts: formatCurrency(spares)
      };
    }),
    matrix: matrixRows.map((row) => {
      const amount = numeric(row.reporting_amount_usd);
      return {
        raceCode: row.race_code ?? "UNASSIGNED",
        raceName: row.race_name ?? "Unassigned",
        categoryKey: row.category_key,
        categoryName: row.category_name,
        displayOrder: Number(row.display_order),
        reportingAmountUsd: amount,
        amount: formatCurrency(amount),
        isSpareParts: row.is_spare_parts,
        notes: row.notes
      };
    })
  };
}

export async function getTbrE1AccountingDashboard(selectedSeasonCode?: string) {
  if (getBackend() !== "database") {
    return {
      seasons: [] as TbrFinanceSeason[],
      selectedSeasonCode: selectedSeasonCode ?? "S2",
      summary: null as TbrE1StatusSummary | null,
      summaries: [] as TbrE1StatusSummary[],
      lines: [] as TbrE1Line[]
    };
  }

  const rows = await queryRows<E1SummaryRow>(
    `select
       season_id,
       season_code,
       season_number,
       season_year,
       season_label,
       status,
       line_count,
       gross_e1_amount_usd,
       paid_amount_usd,
       due_amount_usd,
       credit_note_amount_usd,
       overlap_visible_amount_usd,
       incremental_visible_amount_usd,
       excluded_line_count,
       pending_review_count
     from tbr_e1_accounting_status_by_season
     order by season_number`
  );
  const summaries = rows.map((row) => {
    const gross = numeric(row.gross_e1_amount_usd);
    const paid = numeric(row.paid_amount_usd);
    const due = numeric(row.due_amount_usd);
    const credit = numeric(row.credit_note_amount_usd);
    const overlap = numeric(row.overlap_visible_amount_usd);
    const incremental = numeric(row.incremental_visible_amount_usd);
    return {
      ...normalizeSeason(row),
      lineCount: Number(row.line_count),
      grossE1AmountUsd: gross,
      paidAmountUsd: paid,
      dueAmountUsd: due,
      creditNoteAmountUsd: credit,
      overlapVisibleAmountUsd: overlap,
      incrementalVisibleAmountUsd: incremental,
      excludedLineCount: Number(row.excluded_line_count),
      pendingReviewCount: Number(row.pending_review_count),
      grossE1Amount: formatCurrency(gross),
      paidAmount: formatCurrency(paid),
      dueAmount: formatCurrency(due),
      creditNoteAmount: formatCurrency(credit),
      overlapVisibleAmount: formatCurrency(overlap),
      incrementalVisibleAmount: formatCurrency(incremental)
    } satisfies TbrE1StatusSummary;
  });
  const seasons = summaries.map((row) => ({
    seasonId: row.seasonId,
    seasonCode: row.seasonCode,
    seasonNumber: row.seasonNumber,
    seasonYear: row.seasonYear,
    seasonLabel: row.seasonLabel,
    status: row.status
  }));
  const resolvedSeasonCode =
    summaries.some((row) => row.seasonCode === selectedSeasonCode)
      ? selectedSeasonCode
      : defaultSeasonCode(seasons);

  const lineRows = await queryRows<E1LineRow>(
    `select
       e1_line_id,
       season_code,
       invoice_number,
       item,
       normalized_status,
       line_type,
       pnl_treatment,
       overlap_category_key,
       reporting_amount_usd,
       due_amount_reporting_usd,
       overlap_group_e1_amount_usd,
       overlap_group_baseline_usd,
       overlap_group_variance_usd,
       comments
     from tbr_e1_reconciliation_view
     where season_code = $1
     order by invoice_number nulls last, item`,
    [resolvedSeasonCode]
  );

  return {
    seasons,
    selectedSeasonCode: resolvedSeasonCode ?? "S2",
    summary: summaries.find((row) => row.seasonCode === resolvedSeasonCode) ?? null,
    summaries,
    lines: lineRows.map((row) => {
      const amount = numeric(row.reporting_amount_usd);
      const dueAmount = numeric(row.due_amount_reporting_usd);
      return {
        e1LineId: row.e1_line_id,
        seasonCode: row.season_code,
        invoiceNumber: row.invoice_number,
        item: row.item,
        normalizedStatus: row.normalized_status,
        lineType: row.line_type,
        pnlTreatment: row.pnl_treatment,
        overlapCategoryKey: row.overlap_category_key,
        reportingAmountUsd: amount,
        dueAmountReportingUsd: dueAmount,
        amount: formatCurrency(amount),
        dueAmount: formatCurrency(dueAmount),
        overlapGroupE1Amount: formatCurrency(row.overlap_group_e1_amount_usd),
        overlapGroupBaseline: formatCurrency(row.overlap_group_baseline_usd),
        overlapGroupVariance: formatCurrency(row.overlap_group_variance_usd),
        comments: row.comments
      };
    })
  };
}

export async function getTbrOverallPnlDashboard(selectedSeasonCode?: string) {
  if (getBackend() !== "database") {
    return {
      seasons: [] as TbrFinanceSeason[],
      selectedSeasonCode: selectedSeasonCode ?? "S2",
      selected: null as TbrOverallPnlRow | null,
      rows: [] as TbrOverallPnlRow[],
      reconciliationGroups: [] as TbrReconciliationGroup[],
      exceptions: [] as TbrE1Line[]
    };
  }

  const rows = await queryRows<OverallRow>(
    `select
       season_id,
       season_code,
       season_number,
       season_year,
       season_label,
       status,
       sponsorship_revenue_usd,
       prize_money_revenue_usd,
       other_revenue_usd,
       total_revenue_usd,
       operating_baseline_usd,
       operating_baseline_ex_spares_usd,
       spare_parts_usd,
       e1_incremental_cost_usd,
       e1_overlap_variance_usd,
       total_cost_usd,
       ebitda_usd
     from tbr_overall_pnl_by_season
     order by season_number`
  );

  const pnlRows = rows.map((row) => {
    const sponsorship = numeric(row.sponsorship_revenue_usd);
    const prize = numeric(row.prize_money_revenue_usd);
    const other = numeric(row.other_revenue_usd);
    const revenue = numeric(row.total_revenue_usd);
    const baseline = numeric(row.operating_baseline_usd);
    const baselineExSpares = numeric(row.operating_baseline_ex_spares_usd);
    const spares = numeric(row.spare_parts_usd);
    const incremental = numeric(row.e1_incremental_cost_usd);
    const variance = numeric(row.e1_overlap_variance_usd);
    const cost = numeric(row.total_cost_usd);
    const ebitda = numeric(row.ebitda_usd);
    return {
      ...normalizeSeason(row),
      sponsorshipRevenueUsd: sponsorship,
      prizeMoneyRevenueUsd: prize,
      otherRevenueUsd: other,
      totalRevenueUsd: revenue,
      operatingBaselineUsd: baseline,
      operatingBaselineExSparesUsd: baselineExSpares,
      sparePartsUsd: spares,
      e1IncrementalCostUsd: incremental,
      e1OverlapVarianceUsd: variance,
      totalCostUsd: cost,
      ebitdaUsd: ebitda,
      sponsorshipRevenue: formatCurrency(sponsorship),
      prizeMoneyRevenue: formatCurrency(prize),
      otherRevenue: formatCurrency(other),
      totalRevenue: formatCurrency(revenue),
      operatingBaseline: formatCurrency(baseline),
      operatingBaselineExSpares: formatCurrency(baselineExSpares),
      spareParts: formatCurrency(spares),
      e1IncrementalCost: formatCurrency(incremental),
      e1OverlapVariance: formatCurrency(variance),
      totalCost: formatCurrency(cost),
      ebitda: formatCurrency(ebitda)
    } satisfies TbrOverallPnlRow;
  });
  const seasons = pnlRows.map((row) => ({
    seasonId: row.seasonId,
    seasonCode: row.seasonCode,
    seasonNumber: row.seasonNumber,
    seasonYear: row.seasonYear,
    seasonLabel: row.seasonLabel,
    status: row.status
  }));
  const resolvedSeasonCode =
    pnlRows.some((row) => row.seasonCode === selectedSeasonCode)
      ? selectedSeasonCode
      : defaultSeasonCode(seasons);

  const [groupRows, exceptionRows] = await Promise.all([
    queryRows<ReconciliationGroupRow>(
      `select distinct
         season_code,
         overlap_category_key,
         overlap_group_e1_amount_usd,
         overlap_group_baseline_usd,
         overlap_group_variance_usd
       from tbr_e1_reconciliation_view
       where season_code = $1
         and pnl_treatment = 'overlap_variance'
         and overlap_category_key is not null
       order by overlap_category_key`,
      [resolvedSeasonCode]
    ),
    queryRows<E1LineRow>(
      `select
         e1_line_id,
         season_code,
         invoice_number,
         item,
         normalized_status,
         line_type,
         pnl_treatment,
         overlap_category_key,
         reporting_amount_usd,
         due_amount_reporting_usd,
         overlap_group_e1_amount_usd,
         overlap_group_baseline_usd,
         overlap_group_variance_usd,
         comments
       from tbr_e1_reconciliation_view
       where season_code = $1
         and (pnl_treatment like 'excluded_%' or pnl_treatment = 'pending_review')
       order by pnl_treatment, invoice_number nulls last, item
       limit 20`,
      [resolvedSeasonCode]
    )
  ]);

  return {
    seasons,
    selectedSeasonCode: resolvedSeasonCode ?? "S2",
    selected: pnlRows.find((row) => row.seasonCode === resolvedSeasonCode) ?? null,
    rows: pnlRows,
    reconciliationGroups: groupRows.map((row) => {
      const e1Amount = numeric(row.overlap_group_e1_amount_usd);
      const baseline = numeric(row.overlap_group_baseline_usd);
      const variance = numeric(row.overlap_group_variance_usd);
      return {
        seasonCode: row.season_code,
        overlapCategoryKey: row.overlap_category_key,
        overlapGroupE1AmountUsd: e1Amount,
        overlapGroupBaselineUsd: baseline,
        overlapGroupVarianceUsd: variance,
        overlapGroupE1Amount: formatCurrency(e1Amount),
        overlapGroupBaseline: formatCurrency(baseline),
        overlapGroupVariance: formatCurrency(variance)
      };
    }),
    exceptions: exceptionRows.map((row) => {
      const amount = numeric(row.reporting_amount_usd);
      const dueAmount = numeric(row.due_amount_reporting_usd);
      return {
        e1LineId: row.e1_line_id,
        seasonCode: row.season_code,
        invoiceNumber: row.invoice_number,
        item: row.item,
        normalizedStatus: row.normalized_status,
        lineType: row.line_type,
        pnlTreatment: row.pnl_treatment,
        overlapCategoryKey: row.overlap_category_key,
        reportingAmountUsd: amount,
        dueAmountReportingUsd: dueAmount,
        amount: formatCurrency(amount),
        dueAmount: formatCurrency(dueAmount),
        overlapGroupE1Amount: formatCurrency(row.overlap_group_e1_amount_usd),
        overlapGroupBaseline: formatCurrency(row.overlap_group_baseline_usd),
        overlapGroupVariance: formatCurrency(row.overlap_group_variance_usd),
        comments: row.comments
      };
    })
  };
}
