import "server-only";

import { resolveDocumentPreview } from "../document-storage";
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
  sourceAmount: number;
  sourceCurrency: string;
  fxRate: number;
  reportingAmountUsd: number;
  dueAmountSource: number;
  dueAmountReportingUsd: number;
  sourceAmountDisplay: string;
  amount: string;
  dueAmountSourceDisplay: string;
  dueAmount: string;
  overlapGroupE1Amount: string;
  overlapGroupBaseline: string;
  overlapGroupVariance: string;
  comments: string | null;
  sourceDocumentId: string | null;
  sourceDocumentName: string | null;
};

export type TbrE1InvoiceTrackerRow = {
  seasonCode: string;
  invoiceNumber: string;
  invoiceNumberRaw: string | null;
  lineCount: number;
  rollupStatus: string;
  totalAmountUsd: number;
  dueAmountUsd: number;
  totalAmount: string;
  dueAmount: string;
  documentCount: number;
  sourceDocumentId: string | null;
  sourceDocumentName: string | null;
  sourcePreviewDataUrl: string | null;
  sourcePreviewMimeType: string | null;
  notes: string | null;
  primaryItem: string | null;
  documents: TbrE1InvoiceDocument[];
};

export type TbrE1InvoiceDocument = {
  sourceDocumentId: string;
  sourceDocumentName: string;
  previewDataUrl: string | null;
  previewMimeType: string | null;
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
  source_amount: string | null;
  source_currency: string;
  fx_rate: string;
  reporting_amount_usd: string;
  due_amount_source: string | null;
  due_amount_reporting_usd: string;
  overlap_group_e1_amount_usd: string;
  overlap_group_baseline_usd: string;
  overlap_group_variance_usd: string;
  comments: string | null;
  source_document_id: string | null;
  source_document_name: string | null;
};

type E1InvoiceTrackerSource = {
  season_code: string;
  invoice_number: string | null;
  line_count: number | string;
  total_amount_usd: string;
  due_amount_usd: string;
  rollup_status: string;
  document_count: number | string;
  source_document_id: string | null;
  source_document_name: string | null;
  source_document_metadata: Record<string, unknown> | null;
  notes: string | null;
  primary_item: string | null;
  document_refs: Array<{
    sourceDocumentId?: string | null;
    sourceDocumentName?: string | null;
    metadata?: Record<string, unknown> | null;
  }> | null;
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

function formatCurrencyCode(value: number | string | null | undefined, currencyCode: string | null | undefined) {
  const currency = /^[A-Z]{3}$/.test(currencyCode ?? "") ? currencyCode as string : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(numeric(value));
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

function invoiceDocumentRefs(row: E1InvoiceTrackerSource) {
  const refs = Array.isArray(row.document_refs)
    ? row.document_refs.filter((ref) => ref?.sourceDocumentId)
    : [];

  if (refs.length > 0) return refs;

  if (!row.source_document_id) return [];

  return [
    {
      sourceDocumentId: row.source_document_id,
      sourceDocumentName: row.source_document_name,
      metadata: row.source_document_metadata
    }
  ];
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
      invoiceTracker: [] as TbrE1InvoiceTrackerRow[],
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

  const [trackerRows, lineRows] = await Promise.all([
    queryRows<E1InvoiceTrackerSource>(
      `select
         season_code,
         invoice_number,
         line_count,
         total_amount_usd,
         due_amount_usd,
         rollup_status,
         document_count,
         source_document_id::text,
         source_document_name,
         source_document_metadata,
         notes,
         primary_item,
         document_refs
       from tbr_e1_invoice_tracker_by_season
       where season_code = $1
       order by
         case rollup_status
           when 'due' then 1
           when 'unpaid' then 2
           when 'partially_paid' then 3
           when 'issued' then 4
           when 'pending_review' then 5
           when 'paid' then 6
           else 7
         end,
         invoice_number nulls last`,
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
       source_amount,
       source_currency,
       fx_rate,
       reporting_amount_usd,
       due_amount_source,
       due_amount_reporting_usd,
       overlap_group_e1_amount_usd,
       overlap_group_baseline_usd,
       overlap_group_variance_usd,
       comments,
       source_document_id::text,
       source_document_name
     from tbr_e1_reconciliation_view
     where season_code = $1
     order by invoice_number nulls last, item`,
    [resolvedSeasonCode]
    )
  ]);

  const invoiceTracker = await Promise.all(trackerRows.map(async (row) => {
    const total = numeric(row.total_amount_usd);
    const due = numeric(row.due_amount_usd);
    const documents = await Promise.all(
      invoiceDocumentRefs(row).map(async (ref) => {
        const preview = await resolveDocumentPreview(ref.metadata);

        return {
          sourceDocumentId: String(ref.sourceDocumentId),
          sourceDocumentName: ref.sourceDocumentName ?? "Invoice document",
          previewDataUrl: preview.previewDataUrl,
          previewMimeType: preview.previewMimeType
        } satisfies TbrE1InvoiceDocument;
      })
    );
    const primaryDocument = documents[0] ?? null;

    return {
      seasonCode: row.season_code,
      invoiceNumber: row.invoice_number ?? "No invoice",
      invoiceNumberRaw: row.invoice_number,
      lineCount: Number(row.line_count),
      rollupStatus: row.rollup_status,
      totalAmountUsd: total,
      dueAmountUsd: due,
      totalAmount: formatCurrency(total),
      dueAmount: formatCurrency(due),
      documentCount: Number(row.document_count),
      sourceDocumentId: primaryDocument?.sourceDocumentId ?? row.source_document_id,
      sourceDocumentName: primaryDocument?.sourceDocumentName ?? row.source_document_name,
      sourcePreviewDataUrl: primaryDocument?.previewDataUrl ?? null,
      sourcePreviewMimeType: primaryDocument?.previewMimeType ?? null,
      notes: row.notes,
      primaryItem: row.primary_item,
      documents
    } satisfies TbrE1InvoiceTrackerRow;
  }));

  return {
    seasons,
    selectedSeasonCode: resolvedSeasonCode ?? "S2",
    summary: summaries.find((row) => row.seasonCode === resolvedSeasonCode) ?? null,
    summaries,
    invoiceTracker,
    lines: lineRows.map((row) => {
      const sourceAmount = numeric(row.source_amount);
      const amount = numeric(row.reporting_amount_usd);
      const dueSource = numeric(row.due_amount_source);
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
        sourceAmount,
        sourceCurrency: row.source_currency,
        fxRate: numeric(row.fx_rate),
        reportingAmountUsd: amount,
        dueAmountSource: dueSource,
        dueAmountReportingUsd: dueAmount,
        sourceAmountDisplay: formatCurrencyCode(sourceAmount, row.source_currency),
        amount: formatCurrency(amount),
        dueAmountSourceDisplay: formatCurrencyCode(dueSource, row.source_currency),
        dueAmount: formatCurrency(dueAmount),
        overlapGroupE1Amount: formatCurrency(row.overlap_group_e1_amount_usd),
        overlapGroupBaseline: formatCurrency(row.overlap_group_baseline_usd),
        overlapGroupVariance: formatCurrency(row.overlap_group_variance_usd),
        comments: row.comments,
        sourceDocumentId: row.source_document_id,
        sourceDocumentName: row.source_document_name
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
