import { requireRole } from "../../lib/auth";
import { getPayrollInvoices } from "@lsc/db";
import { generatePayrollInvoiceAction } from "./actions";

type PayrollInvoicesPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

function parseCurrency(value: string): number {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

function statusPillClass(status: string): string {
  switch (status) {
    case "paid":
      return "signal-pill signal-good";
    case "generated":
    case "sent":
      return "signal-pill signal-warn";
    case "cancelled":
    case "voided":
      return "signal-pill signal-risk";
    default:
      return "subtle-pill";
  }
}

export default async function PayrollInvoicesPage({ searchParams }: PayrollInvoicesPageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const params = searchParams ? await searchParams : undefined;
  const status = params?.status ?? null;
  const message = params?.message ?? null;

  const invoices = await getPayrollInvoices();

  const totalInvoices = invoices.length;
  const totalValue = invoices.reduce((s, inv) => s + parseCurrency(inv.totalAmount), 0);
  const paidCount = invoices.filter((inv) => inv.status === "paid").length;
  const pendingCount = invoices.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled" && inv.status !== "voided").length;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">XTZ India &rarr; XTZ Esports Tech Ltd</span>
          <h3>Payroll Invoices</h3>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total invoices</span>
          </div>
          <div className="metric-value">{totalInvoices}</div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Total invoiced value</span>
          </div>
          <div className="metric-value">
            {totalValue.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
          </div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Paid</span>
          </div>
          <div className="metric-value">{paidCount}</div>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Pending</span>
          </div>
          <div className="metric-value">{pendingCount}</div>
        </article>
      </section>

      {/* Generate invoice form */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Generate</span>
            <h3>Create payroll invoice</h3>
          </div>
        </div>
        <form action={generatePayrollInvoiceAction} className="stack-form">
          <input type="hidden" name="fromCompanyCode" value="XTZ" />
          <input type="hidden" name="toCompanyCode" value="XTE" />
          <div className="grid-two">
            <label className="field">
              <span>Payroll month</span>
              <input name="payrollMonth" type="month" required />
            </label>
            <label className="field">
              <span>Payment method</span>
              <input name="paymentMethod" type="text" placeholder="e.g. Bank transfer, Wire" />
            </label>
          </div>
          <label className="field">
            <span>Notes</span>
            <input name="notes" type="text" placeholder="Optional notes for this invoice" />
          </label>
          <button className="action-button primary" type="submit">
            Generate invoice
          </button>
        </form>
      </section>

      {/* Invoice table */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">History</span>
            <h3>All payroll invoices</h3>
          </div>
          <span className="badge">{totalInvoices} invoices</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Month</th>
                <th>From</th>
                <th>To</th>
                <th>Subtotal</th>
                <th>Tax</th>
                <th>Total</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Payment method</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length > 0 ? (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td><strong>{inv.invoiceNumber}</strong></td>
                    <td>{inv.invoiceDate}</td>
                    <td>{inv.payrollMonth}</td>
                    <td>{inv.fromCompany}</td>
                    <td>{inv.toCompany}</td>
                    <td>{inv.subtotal}</td>
                    <td>{inv.taxAmount}</td>
                    <td><strong>{inv.totalAmount}</strong></td>
                    <td>{inv.currency}</td>
                    <td>
                      <span className={`pill ${statusPillClass(inv.status)}`}>
                        {inv.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td><span className="muted">{inv.paymentMethod || "—"}</span></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={11}>
                    No payroll invoices yet. Use the form above to generate your first invoice from payroll data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
