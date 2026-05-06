import Link from "next/link";
import { Fragment } from "react";
import { getTbrE1AccountingDashboard } from "@lsc/db";
import {
  HorizontalMetricBars,
  type HorizontalBarRow
} from "../../components/dashboard-charts";
import { requireRole } from "../../../lib/auth";
import {
  attachTbrE1InvoiceDocumentAction,
  updateTbrE1InvoiceStatusAction,
  updateTbrE1LineAction
} from "./actions";

type PageProps = {
  searchParams?: Promise<{
    season?: string;
    status?: string;
    message?: string;
  }>;
};

const STATUS_OPTIONS = [
  "paid",
  "issued",
  "partially_paid",
  "due",
  "unpaid",
  "credit_note",
  "void",
  "not_applicable",
  "pending_review",
  "source_check"
];

const LINE_TYPE_OPTIONS = ["invoice", "credit_note", "support", "source_check"];

const PNL_OPTIONS = [
  "overlap_variance",
  "incremental",
  "excluded_duplicate",
  "excluded_inapplicable",
  "excluded_contingent",
  "source_check",
  "pending_review"
];

const OVERLAP_OPTIONS = [
  "",
  "food_beverages",
  "team_insurance",
  "pilot_training",
  "spare_parts",
  "pre_season_testing_fee",
  "vip_passes"
];

function seasonHref(seasonCode: string) {
  return `/tbr/e1-accounting?season=${encodeURIComponent(seasonCode)}`;
}

function label(value: string | null | undefined) {
  return String(value ?? "pending_review").replace(/_/g, " ");
}

function optionLabel(value: string) {
  return value ? label(value) : "none";
}

function statusTone(value: string) {
  if (value === "paid") return "good-pill";
  if (value === "due" || value === "unpaid" || value === "partially_paid") return "risk-pill";
  if (value === "issued" || value === "pending_review") return "warn-pill";
  if (value === "void" || value === "not_applicable") return "risk-pill";
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
      {params.status && params.message ? (
        <section className={`notice ${params.status === "error" ? "error" : "success"}`}>
          <strong>{params.status === "error" ? "Action failed" : "Saved"}</strong>
          <span>{params.message}</span>
        </section>
      ) : null}

      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">TBR E1 accounting</span>
          <h3>Invoice and payment status control</h3>
          <p>
            E1 ledger rows are editable finance control records. Status changes feed the E1 invoice
            tracker and derived TBR cost views, while Overall P&amp;L still uses the variance-only rule.
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
          <span className="metric-subvalue">Rows marked paid</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Due / open</span>
          </div>
          <div className="metric-value">{summary?.dueAmount ?? "$0"}</div>
          <span className="metric-subvalue">Due amount from source sheet or platform edits</span>
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
            or VIP support do not automatically add cost in Overall P&amp;L. Costs can still show the
            invoice ledger as active payable evidence based on row status.
          </p>
        </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Invoice tracker</span>
            <h3>{summary?.seasonLabel ?? data.selectedSeasonCode} invoice status dashboard</h3>
          </div>
          <span className="pill">Status updates feed Costs</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Rows</th>
                <th>Documents</th>
                <th>Update status</th>
                <th>Add document</th>
              </tr>
            </thead>
            <tbody>
              {data.invoiceTracker.map((invoice) => (
                <tr key={`${invoice.seasonCode}-${invoice.invoiceNumber}`}>
                  <td>
                    <strong>{invoice.invoiceNumber}</strong>
                    {invoice.notes ? <span className="table-note">{invoice.notes}</span> : null}
                  </td>
                  <td>
                    <span className={`pill ${statusTone(invoice.rollupStatus)}`}>
                      {label(invoice.rollupStatus)}
                    </span>
                  </td>
                  <td>{invoice.totalAmount}</td>
                  <td>{invoice.dueAmount}</td>
                  <td>{invoice.lineCount}</td>
                  <td>
                    {invoice.sourceDocumentName ? (
                      <span className="table-note">{invoice.sourceDocumentName}</span>
                    ) : (
                      <span className="table-note">No document attached</span>
                    )}
                    <span className="pill subtle-pill">{invoice.documentCount} linked</span>
                  </td>
                  <td>
                    <form action={updateTbrE1InvoiceStatusAction} className="inline-actions e1-inline-form">
                      <input type="hidden" name="seasonCode" value={data.selectedSeasonCode} />
                      <input type="hidden" name="invoiceNumber" value={invoice.invoiceNumberRaw ?? ""} />
                      <select className="table-select" name="normalizedStatus" defaultValue={invoice.rollupStatus}>
                        {STATUS_OPTIONS.filter((value) => value !== "source_check").map((value) => (
                          <option key={value} value={value}>{optionLabel(value)}</option>
                        ))}
                      </select>
                      <input
                        className="table-input"
                        name="statusNote"
                        placeholder="Status note"
                        aria-label={`Status note for ${invoice.invoiceNumber}`}
                      />
                      <button className="action-button compact-button" type="submit">Update</button>
                    </form>
                  </td>
                  <td>
                    <form action={attachTbrE1InvoiceDocumentAction} className="inline-actions e1-inline-form">
                      <input type="hidden" name="seasonCode" value={data.selectedSeasonCode} />
                      <input type="hidden" name="invoiceNumber" value={invoice.invoiceNumberRaw ?? ""} />
                      <input className="table-input" type="file" name="document" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" />
                      <input
                        className="table-input"
                        name="documentNote"
                        placeholder="Document note"
                        aria-label={`Document note for ${invoice.invoiceNumber}`}
                      />
                      <button className="action-button compact-button" type="submit">Attach</button>
                    </form>
                  </td>
                </tr>
              ))}
              {data.invoiceTracker.length === 0 ? (
                <tr>
                  <td colSpan={8}>No invoice groups are loaded for this season yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Invoice ledger</span>
            <h3>{summary?.seasonLabel ?? data.selectedSeasonCode} editable E1 rows</h3>
          </div>
          <span className="pill">Editable with notes</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Item</th>
                <th>Status</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Due</th>
                <th>P&amp;L treatment</th>
                <th>Reconciliation</th>
                <th>Save</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => {
                const formId = `e1-line-${line.e1LineId}`;

                return (
                  <Fragment key={line.e1LineId}>
                    <tr>
                      <td>
                        <input form={formId} type="hidden" name="lineId" value={line.e1LineId} />
                        <input form={formId} type="hidden" name="seasonCode" value={data.selectedSeasonCode} />
                        <input
                          form={formId}
                          className="table-input"
                          name="invoiceNumber"
                          defaultValue={line.invoiceNumber ?? ""}
                          aria-label={`Invoice number for ${line.item}`}
                        />
                        {line.sourceDocumentName ? <span className="table-note">Doc: {line.sourceDocumentName}</span> : null}
                      </td>
                      <td>
                        <input
                          form={formId}
                          className="table-input"
                          name="item"
                          defaultValue={line.item}
                          aria-label={`Item for ${line.invoiceNumber ?? "E1 row"}`}
                        />
                      </td>
                      <td>
                        <select form={formId} className="table-select" name="normalizedStatus" defaultValue={line.normalizedStatus}>
                          {STATUS_OPTIONS.map((value) => (
                            <option key={value} value={value}>{optionLabel(value)}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select form={formId} className="table-select" name="lineType" defaultValue={line.lineType}>
                          {LINE_TYPE_OPTIONS.map((value) => (
                            <option key={value} value={value}>{optionLabel(value)}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input form={formId} type="hidden" name="sourceCurrency" value={line.sourceCurrency} />
                        <input form={formId} type="hidden" name="fxRate" value={String(line.fxRate)} />
                        <input
                          form={formId}
                          className="table-input input-amount"
                          name="sourceAmount"
                          defaultValue={String(line.sourceAmount)}
                          aria-label={`Source amount for ${line.invoiceNumber ?? "E1 row"}`}
                        />
                        <span className="table-note">{line.sourceCurrency} source</span>
                        <input
                          form={formId}
                          className="table-input input-amount"
                          name="reportingAmountUsd"
                          defaultValue={String(line.reportingAmountUsd)}
                          aria-label={`USD amount for ${line.invoiceNumber ?? "E1 row"}`}
                        />
                      </td>
                      <td>
                        <input
                          form={formId}
                          className="table-input input-amount"
                          name="dueAmountSource"
                          defaultValue={String(line.dueAmountSource)}
                          aria-label={`Source due amount for ${line.invoiceNumber ?? "E1 row"}`}
                        />
                        <span className="table-note">{line.dueAmountSourceDisplay} source</span>
                        <input
                          form={formId}
                          className="table-input input-amount"
                          name="dueAmountReportingUsd"
                          defaultValue={String(line.dueAmountReportingUsd)}
                          aria-label={`USD due amount for ${line.invoiceNumber ?? "E1 row"}`}
                        />
                      </td>
                      <td>
                        <select form={formId} className="table-select" name="pnlTreatment" defaultValue={line.pnlTreatment}>
                          {PNL_OPTIONS.map((value) => (
                            <option key={value} value={value}>{optionLabel(value)}</option>
                          ))}
                        </select>
                        <select
                          form={formId}
                          className="table-select"
                          name="overlapCategoryKey"
                          defaultValue={line.overlapCategoryKey ?? ""}
                          aria-label={`Overlap category for ${line.invoiceNumber ?? "E1 row"}`}
                        >
                          {OVERLAP_OPTIONS.map((value) => (
                            <option key={value || "none"} value={value}>{optionLabel(value)}</option>
                          ))}
                        </select>
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
                      <td>
                        <form id={formId} action={updateTbrE1LineAction} />
                        <button form={formId} className="action-button compact-button" type="submit">Save</button>
                      </td>
                    </tr>
                    <tr className="note-row">
                      <td colSpan={9}>
                        <label className="field">
                          <span>Row notes</span>
                          <textarea
                            form={formId}
                            name="comments"
                            defaultValue={line.comments ?? ""}
                            placeholder="Add finance notes, E1 comments, dispute context, payment reference, or document follow-up."
                          />
                        </label>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
              {data.lines.length === 0 ? (
                <tr>
                  <td colSpan={9}>No E1 accounting rows are loaded for this season yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
