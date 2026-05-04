import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "../../lib/auth";
import { getXtzInvoices, getXtzInvoiceSummary } from "@lsc/db";
import {
  cloneInvoiceAction,
  updateInvoiceStatusAction,
  voidInvoiceAction,
} from "./actions";
import { AutoFormSelect } from "../components/auto-form-select";
import { SubmitButton } from "../components/submit-button";

const fmtMoney = (n: number, currency: string): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });

function defaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function statusPill(status: string): string {
  switch (status) {
    case "paid":
      return "signal-pill signal-good";
    case "generated":
    case "sent":
      return "signal-pill signal-warn";
    case "void":
      return "signal-pill signal-risk";
    default:
      return "subtle-pill";
  }
}

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    month?: string;
    invoiceStatus?: string;
    search?: string;
    includeVoided?: string;
  }>;
};

export default async function PayrollInvoiceDashboardPage({ searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const params = searchParams ? await searchParams : undefined;
  const status = params?.status ?? null;
  const message = params?.message ?? null;
  const selectedMonth = params?.month ?? "";
  const invoiceStatus = params?.invoiceStatus ?? "all";
  const search = params?.search ?? "";
  const includeVoided = params?.includeVoided === "true" || invoiceStatus === "void";

  const [summary, invoices] = await Promise.all([
    getXtzInvoiceSummary(),
    getXtzInvoices({
      search,
      month: selectedMonth || null,
      status: invoiceStatus === "all" ? null : invoiceStatus,
      includeVoided,
    }),
  ]);

  return (
    <div className="page-grid">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">XTZ India invoice lifecycle</span>
          <h3>XTZ Invoice Dashboard</h3>
          <p className="muted">
            Search, edit generated invoices, clone revisions, and void draft-like records without deleting audit history.
          </p>
        </div>
        <div className="inline-actions">
          <Link
            className="action-button primary"
            href={`/payroll-invoices/generator?month=${selectedMonth || defaultMonth()}` as Route}
          >
            Generate XTZ invoice
          </Link>
        </div>
      </header>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Saved"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Active invoices</span>
          </div>
          <div className="metric-value">{summary.activeInvoices}</div>
          <span className="metric-subvalue">{summary.voidCount} voided hidden by default</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Total invoiced</span>
          </div>
          <div className="metric-value">{fmtMoney(summary.totalInvoicedUsd, "USD")}</div>
          <span className="metric-subvalue">USD active invoices</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Needs action</span>
          </div>
          <div className="metric-value">{summary.pendingCount}</div>
          <span className="metric-subvalue">Generated and sent</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Paid</span>
          </div>
          <div className="metric-value">{summary.paidCount}</div>
          <span className="metric-subvalue">{summary.sentCount} sent</span>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Filters</span>
            <h3>Invoice register</h3>
          </div>
          <span className="badge">{invoices.length} matching</span>
        </div>
        <form className="form-grid" action="/payroll-invoices">
          <label className="field">
            <span>Search</span>
            <input name="search" placeholder="Invoice, issuer, recipient, note" defaultValue={search} />
          </label>
          <label className="field">
            <span>Month</span>
            <input name="month" type="month" defaultValue={selectedMonth} />
          </label>
          <label className="field">
            <span>Status</span>
            <select name="invoiceStatus" defaultValue={invoiceStatus}>
              <option value="all">All active</option>
              <option value="generated">Generated</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </select>
          </label>
          <label className="field">
            <span>Void visibility</span>
            <select name="includeVoided" defaultValue={includeVoided ? "true" : "false"}>
              <option value="false">Hide voided</option>
              <option value="true">Include voided</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="action-button primary" type="submit">
              Apply filters
            </button>
            <Link className="action-button secondary" href={"/payroll-invoices" as Route}>
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Month</th>
                <th>Issuer / recipient</th>
                <th>Total</th>
                <th>Status</th>
                <th>Lifecycle</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length > 0 ? (
                invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{invoice.invoiceNumber}</strong>
                      <br />
                      <span className="muted">{invoice.invoiceDate}</span>
                      {invoice.clonedFromInvoiceId ? (
                        <>
                          <br />
                          <span className="pill subtle-pill">clone</span>
                        </>
                      ) : null}
                    </td>
                    <td>{invoice.payrollMonth}</td>
                    <td>
                      <strong>{invoice.issuerLegalName || invoice.fromCompany}</strong>
                      <br />
                      <span className="muted">{invoice.recipientLegalName || invoice.toCompany}</span>
                    </td>
                    <td>
                      <strong>{fmtMoney(invoice.totalAmount, invoice.currency)}</strong>
                      <br />
                      <span className="muted">{invoice.currency}</span>
                    </td>
                    <td>
                      <span className={`pill ${statusPill(invoice.status)}`}>
                        {invoice.status}
                      </span>
                      {invoice.voidReason ? (
                        <>
                          <br />
                          <span className="muted">{invoice.voidReason}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {invoice.status !== "void" && invoice.status !== "paid" ? (
                        <form action={updateInvoiceStatusAction}>
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <AutoFormSelect
                            name="newStatus"
                            defaultValue={invoice.status}
                            label="Invoice status"
                            options={[
                              { value: "generated", label: "Generated" },
                              { value: "sent", label: "Sent" },
                              { value: "paid", label: "Paid" },
                            ]}
                          />
                        </form>
                      ) : (
                        <span className="muted">locked</span>
                      )}
                    </td>
                    <td>
                      <div className="inline-actions">
                        <Link
                          className="action-button secondary"
                          href={`/payroll-invoices/${invoice.id}` as Route}
                        >
                          View / print
                        </Link>
                        {invoice.canEdit ? (
                          <Link
                            className="action-button primary"
                            href={`/payroll-invoices/${invoice.id}/edit` as Route}
                          >
                            Edit
                          </Link>
                        ) : null}
                        {invoice.canClone ? (
                          <form action={cloneInvoiceAction}>
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <SubmitButton variant="secondary" pendingLabel="Cloning…">
                              Clone
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                      {invoice.canVoid ? (
                        <details style={{ marginTop: 8 }}>
                          <summary className="muted">Void</summary>
                          <form action={voidInvoiceAction} className="stack-form compact-form" style={{ marginTop: 8 }}>
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <label className="field">
                              <span>Reason</span>
                              <input name="voidReason" placeholder="Why is this invoice being voided?" required />
                            </label>
                            <SubmitButton
                              variant="secondary"
                              pendingLabel="Voiding…"
                              confirmMessage="Void this invoice and unlock staged source rows? The record will stay in history."
                            >
                              Void invoice
                            </SubmitButton>
                          </form>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={7}>
                    No invoices match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
