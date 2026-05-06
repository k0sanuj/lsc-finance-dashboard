import Link from "next/link";
import { getTbrE1AccountingDashboard } from "@lsc/db";
import {
  HorizontalMetricBars,
  type HorizontalBarRow
} from "../../components/dashboard-charts";
import { requireRole } from "../../../lib/auth";

type PageProps = {
  searchParams?: Promise<{
    season?: string;
  }>;
};

function seasonHref(seasonCode: string) {
  return `/tbr/e1-accounting?season=${encodeURIComponent(seasonCode)}`;
}

function label(value: string | null | undefined) {
  return String(value ?? "pending_review").replace(/_/g, " ");
}

function treatmentTone(value: string) {
  if (value === "incremental") return "good-pill";
  if (value === "overlap_variance") return "warn-pill";
  if (value.startsWith("excluded")) return "risk-pill";
  return "";
}

export default async function TbrE1AccountingPage({ searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const params = searchParams ? await searchParams : {};
  const data = await getTbrE1AccountingDashboard(params.season?.toUpperCase());
  const summary = data.summary;

  const statusRows: HorizontalBarRow[] = summary
    ? [
        { label: "Paid", value: summary.paidAmountUsd, displayValue: summary.paidAmount, tone: "good" },
        { label: "Due / open", value: summary.dueAmountUsd, displayValue: summary.dueAmount, tone: "risk" },
        { label: "Credit notes", value: summary.creditNoteAmountUsd, displayValue: summary.creditNoteAmount, tone: "warn" },
        { label: "Overlap-visible", value: summary.overlapVisibleAmountUsd, displayValue: summary.overlapVisibleAmount, tone: "secondary" },
        { label: "Incremental-visible", value: summary.incrementalVisibleAmountUsd, displayValue: summary.incrementalVisibleAmount, tone: "good" }
      ]
    : [];

  return (
    <div className="page-grid finance-workspace">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">TBR E1 accounting</span>
          <h3>Invoice and payment status control</h3>
          <p>
            E1 ledger rows are preserved with status, due amount, comments, and P&amp;L treatment.
            Overlapping rows reconcile back to operating expense baselines.
          </p>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            <Link className="segment-chip" href="/tbr/operating-expenses">Operating Expenses</Link>
            <Link className="segment-chip" href="/tbr/overall-pnl">Overall P&amp;L</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-headline">
          <div>
            <span className="section-kicker">Season ledger</span>
            <h3>Switch E1 accounting season</h3>
          </div>
          <span className="pill">{summary?.lineCount ?? 0} source rows</span>
        </div>
        <div className="segment-row">
          {data.seasons.map((season) => (
            <Link
              className={`segment-chip ${season.seasonCode === data.selectedSeasonCode ? "active" : ""}`}
              href={seasonHref(season.seasonCode)}
              key={season.seasonCode}
            >
              {season.seasonLabel}
            </Link>
          ))}
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Gross E1 ledger</span>
          </div>
          <div className="metric-value">{summary?.grossE1Amount ?? "$0"}</div>
          <span className="metric-subvalue">Source-visible invoice/support amount</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Paid</span>
          </div>
          <div className="metric-value">{summary?.paidAmount ?? "$0"}</div>
          <span className="metric-subvalue">Rows marked paid in E1 workbook</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Due / open</span>
          </div>
          <div className="metric-value">{summary?.dueAmount ?? "$0"}</div>
          <span className="metric-subvalue">Due amount from source sheet</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Excluded / pending</span>
          </div>
          <div className="metric-value">{(summary?.excludedLineCount ?? 0) + (summary?.pendingReviewCount ?? 0)}</div>
          <span className="metric-subvalue">Not counted in P&amp;L yet</span>
        </article>
      </section>

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Accounting status</span>
              <h3>Paid, due, credit and treatment</h3>
            </div>
          </div>
          <HorizontalMetricBars rows={statusRows} />
        </article>
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">P&amp;L control</span>
              <h3>Variance-only reconciliation rule</h3>
            </div>
            <span className="badge">No double count</span>
          </div>
          <p>
            E1 rows mapped to catering, insurance, pilot training, spare parts, pre-season testing,
            or VIP support do not automatically add cost. The Overall P&amp;L only counts the excess
            over the operating baseline.
          </p>
        </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Invoice ledger</span>
            <h3>{summary?.seasonLabel ?? data.selectedSeasonCode} E1 rows</h3>
          </div>
          <span className="pill">Source status preserved</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Item</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Due</th>
                <th>P&amp;L treatment</th>
                <th>Reconciliation</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.e1LineId}>
                  <td><strong>{line.invoiceNumber ?? "No invoice"}</strong></td>
                  <td>
                    {line.item}
                    {line.comments ? <span className="table-note">{line.comments}</span> : null}
                  </td>
                  <td><span className="pill">{label(line.normalizedStatus)}</span></td>
                  <td>{line.amount}</td>
                  <td>{line.dueAmount}</td>
                  <td>
                    <span className={`pill ${treatmentTone(line.pnlTreatment)}`}>
                      {label(line.pnlTreatment)}
                    </span>
                  </td>
                  <td>
                    {line.pnlTreatment === "overlap_variance" ? (
                      <span className="table-note">
                        E1 {line.overlapGroupE1Amount} vs baseline {line.overlapGroupBaseline};
                        variance {line.overlapGroupVariance}
                      </span>
                    ) : (
                      <span className="table-note">{line.lineType === "source_check" ? "Source check only" : "Direct treatment"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.lines.length === 0 ? (
                <tr>
                  <td colSpan={7}>No E1 accounting rows are loaded for this season yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
