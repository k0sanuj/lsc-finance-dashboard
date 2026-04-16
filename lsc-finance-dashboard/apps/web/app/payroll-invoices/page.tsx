import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "../../lib/auth";
import {
  getXtzInvoices,
  getXtzInvoiceSummary,
  getMdgFees,
  getProvisions,
  getReimbursementItems,
  getEmployees,
  getFxRatesForDisplay,
  getVendorsWithBank
} from "@lsc/db";
import {
  generateXtzInvoiceAction,
  addMdgFeeAction,
  addReimbursementAction,
  addProvisionAction,
  deleteMdgFeeAction,
  deleteReimbursementAction,
  deleteProvisionAction,
  updateMdgFeeAction,
  updateReimbursementAction,
  updateProvisionAction,
  updateInvoiceStatusAction,
  deleteInvoiceAction,
  createDirectInvoiceAction
} from "./actions";
import { BillUploader } from "../components/bill-uploader";
import { VendorSelector } from "../components/vendor-selector";
import { MonthPicker } from "../components/month-picker";
import { AutoFormSelect } from "../components/auto-form-select";

const fmtUsd = (n: number): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });

const fmtNum = (n: number, currency: string): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  });

function statusPill(status: string): string {
  switch (status) {
    case "paid":
      return "signal-pill signal-good";
    case "generated":
    case "sent":
      return "signal-pill signal-warn";
    case "draft":
      return "subtle-pill";
    case "cancelled":
      return "signal-pill signal-risk";
    default:
      return "subtle-pill";
  }
}

const PROVISION_CATEGORIES = [
  "travel",
  "software",
  "professional_services",
  "infrastructure",
  "marketing",
  "other"
];

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    month?: string;
  }>;
};

function defaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function PayrollInvoicesPage({ searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const params = searchParams ? await searchParams : undefined;
  const status = params?.status ?? null;
  const message = params?.message ?? null;
  const selectedMonth = params?.month ?? defaultMonth();

  const [
    invoices,
    summary,
    mdgFees,
    reimbs,
    provs,
    xtzEmployees,
    fxRates,
    allVendors
  ] = await Promise.all([
    getXtzInvoices(),
    getXtzInvoiceSummary(),
    getMdgFees("XTZ"),
    getReimbursementItems("XTZ"),
    getProvisions("XTZ"),
    getEmployees("XTZ"),
    getFxRatesForDisplay(),
    getVendorsWithBank()
  ]);

  // Find current FX (USD-from-INR) for live preview
  const liveInrUsd = fxRates.find(
    (f) => f.baseCurrency === "INR" && f.targetCurrency === "USD"
  );
  const liveInrUsdRate = liveInrUsd?.rate ?? 0.01183;

  // Pre-compute live preview of payroll for the selected month
  // Sayan is invoiced separately (directly by XTE) — excluded from XTZ India invoice
  const activeEmps = xtzEmployees.filter(
    (e) =>
      e.fullName !== "Sayan Mukherjee" &&
      (e.status === "active" ||
        (e.status === "terminated" && e.endDate))
  );

  let payrollPreviewUsd = 0;
  const previewLines = activeEmps.map((emp) => {
    let usdAmount = 0;
    let label = "";
    if (emp.isUsdSalary && emp.salaryUsd > 0) {
      usdAmount = emp.salaryUsd;
      label = `Fixed USD $${emp.salaryUsd.toLocaleString()}`;
    } else {
      usdAmount = Number((emp.rawBaseSalary * liveInrUsdRate).toFixed(2));
      label = `${emp.rawBaseSalary.toLocaleString("en-IN")} ${emp.salaryCurrency} → live FX`;
    }
    payrollPreviewUsd += usdAmount;
    return { id: emp.id, name: emp.fullName, designation: emp.designation, label, usdAmount };
  });

  const monthMdg = mdgFees.filter((f) => f.feeMonthRaw.startsWith(selectedMonth));
  const monthReimbs = reimbs.filter((r) => r.expenseMonthRaw.startsWith(selectedMonth));
  const monthProvs = provs.filter((p) => p.provisionMonthRaw.startsWith(selectedMonth));

  // Approximate non-USD amounts to USD for the preview total
  function approxUsd(amount: number, currency: string): number {
    if (currency === "USD") return amount;
    if (currency === "INR") return Number((amount * liveInrUsdRate).toFixed(2));
    if (currency === "AED") return Number((amount * 0.2723).toFixed(2));
    return amount;
  }

  const previewMdgUsd = monthMdg.reduce(
    (s, f) => s + approxUsd(f.amount, f.currency),
    0
  );
  const previewReimbUsd = monthReimbs.reduce(
    (s, r) => s + approxUsd(r.amount, r.currency),
    0
  );
  const previewProvUsd = monthProvs.reduce(
    (s, p) => s + approxUsd(p.estimatedAmount, p.currency),
    0
  );
  const previewTotalUsd =
    payrollPreviewUsd + previewMdgUsd + previewReimbUsd + previewProvUsd;

  return (
    <div className="page-grid">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">
            XTZ India Private Limited &rarr; XTZ Dubai
          </span>
          <h3>XTZ Invoice Generator</h3>
          <p className="muted">
            Monthly invoice from XTZ India to XTZ Dubai — payroll, third party vendors,
            reimbursements, software expenses, and provisions in one unified invoice. Live INR→USD rate
            applied to Anuj &amp; Sayan; everyone else uses fixed USD salaries.
          </p>
        </div>
      </header>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Saved"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      {/* ── Top stats ────────────────────────────────────────── */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Invoices generated</span>
          </div>
          <div className="metric-value">{summary.totalInvoices}</div>
          <span className="metric-subvalue">Lifetime</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Total invoiced (USD)</span>
          </div>
          <div className="metric-value">{fmtUsd(summary.totalInvoicedUsd)}</div>
          <span className="metric-subvalue">USD invoices only</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Pending</span>
          </div>
          <div className="metric-value">{summary.pendingCount}</div>
          <span className="metric-subvalue">Generated &amp; sent</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Paid</span>
          </div>
          <div className="metric-value">{summary.paidCount}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Live INR → USD</span>
          </div>
          <div className="metric-value">
            {liveInrUsdRate.toFixed(5)}
          </div>
          <span className="metric-subvalue">Auto-refreshed every hour</span>
        </article>
      </section>

      {/* ── Month selector ───────────────────────────────────── */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">
              {new Date(`${selectedMonth}-01`).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric"
              })}
            </span>
            <h3>Invoice month</h3>
          </div>
          <MonthPicker value={selectedMonth} />
        </div>
      </section>

      {/* ── Live preview of what will be invoiced ────────────── */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Live preview</span>
            <h3>What will be invoiced for {selectedMonth}</h3>
          </div>
          <span className="badge">Estimated total ≈ {fmtUsd(previewTotalUsd)}</span>
        </div>

        <div className="grid-two">
          <article>
            <h4 style={{ marginTop: 0 }}>Payroll lines</h4>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Salary basis</th>
                    <th style={{ textAlign: "right" }}>USD equivalent</th>
                  </tr>
                </thead>
                <tbody>
                  {previewLines.length > 0 ? (
                    previewLines.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <br />
                          <span className="muted">{p.designation}</span>
                        </td>
                        <td>
                          <span className="pill subtle-pill">{p.label}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <strong>{fmtUsd(p.usdAmount)}</strong>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="muted" colSpan={3}>
                        No active employees on XTZ India.
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={2} style={{ textAlign: "right" }}>
                      <strong>Payroll subtotal</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{fmtUsd(payrollPreviewUsd)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article>
            <h4 style={{ marginTop: 0 }}>Other sections (this month)</h4>
            <div className="table-wrapper clean-table">
              <table>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Items</th>
                    <th style={{ textAlign: "right" }}>USD ≈</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Third Party Vendors</td>
                    <td>{monthMdg.length}</td>
                    <td style={{ textAlign: "right" }}>
                      {fmtUsd(previewMdgUsd)}
                    </td>
                  </tr>
                  <tr>
                    <td>Reimbursements</td>
                    <td>{monthReimbs.length}</td>
                    <td style={{ textAlign: "right" }}>
                      {fmtUsd(previewReimbUsd)}
                    </td>
                  </tr>
                  <tr>
                    <td>Provisions (estimates)</td>
                    <td>{monthProvs.length}</td>
                    <td style={{ textAlign: "right" }}>
                      {fmtUsd(previewProvUsd)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ textAlign: "right" }}>
                      <strong>Grand total estimate</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{fmtUsd(previewTotalUsd)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              Approximate USD totals shown for non-USD items use the live INR/USD
              rate above. Final invoice uses live rate at the moment of generation.
            </p>
          </article>
        </div>

        <form action={generateXtzInvoiceAction} className="inline-actions" style={{ marginTop: 16 }}>
          <input type="hidden" name="fromCompanyCode" value="XTZ" />
          <input type="hidden" name="toCompanyCode" value="XTE" />
          <input type="hidden" name="payrollMonth" value={selectedMonth} />
          <input type="hidden" name="invoiceCurrency" value="USD" />
          <input type="hidden" name="paymentMethod" value="Wire transfer (USD)" />
          <input
            name="notes"
            type="text"
            placeholder="Optional invoice notes (e.g. 'February 2026 — payroll due Feb–April')"
            style={{ flex: 1, minWidth: 280 }}
          />
          <button className="action-button primary" type="submit">
            Generate XTZ India → XTZ Dubai invoice for {selectedMonth}
          </button>
        </form>
      </section>

      {/* ── Third Party Vendors ─────────────────────────────────────────── */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Section 2 — Third party vendors</span>
            <h3>Third Party Vendors</h3>
          </div>
          <span className="badge">{monthMdg.length} for {selectedMonth}</span>
        </div>

        <form action={addMdgFeeAction}>
          <input type="hidden" name="companyCode" value="XTZ" />
          <input type="hidden" name="month" value={selectedMonth} />
          <div className="form-grid">
            <label className="field">
              <span>Month</span>
              <input
                type="month"
                name="feeMonth"
                defaultValue={selectedMonth}
                required
              />
            </label>
            <label className="field">
              <span>Description</span>
              <input
                type="text"
                name="description"
                placeholder="e.g. MDG Fees, Consulting, Legal services"
                required
              />
            </label>
            <label className="field">
              <span>Amount</span>
              <input type="number" name="amount" min="0" step="0.01" required />
            </label>
            <label className="field">
              <span>Currency</span>
              <select name="currency" defaultValue="INR">
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="field" style={{ gridColumn: "span 2" }}>
              <span>Notes</span>
              <input type="text" name="notes" />
            </label>
            <div className="form-actions">
              <button className="action-button primary" type="submit">
                Add vendor expense
              </button>
            </div>
          </div>
        </form>

        <div className="table-wrapper clean-table" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mdgFees.length > 0 ? (
                mdgFees.map((f) => (
                  <tr key={f.id}>
                    <td>{f.feeMonth}</td>
                    <td>{f.description}</td>
                    <td>{fmtNum(f.amount, f.currency)}</td>
                    <td>
                      <form action={updateMdgFeeAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="month" value={selectedMonth} />
                        <AutoFormSelect
                          name="status"
                          defaultValue={f.status}
                          label="Status"
                          options={[
                            { value: "pending", label: "Pending" },
                            { value: "approved", label: "Approved" },
                            { value: "invoiced", label: "Invoiced" }
                          ]}
                        />
                      </form>
                    </td>
                    <td>
                      {f.status !== "invoiced" ? (
                        <form action={deleteMdgFeeAction}>
                          <input type="hidden" name="id" value={f.id} />
                          <input type="hidden" name="month" value={selectedMonth} />
                          <button className="action-button secondary" type="submit">Remove</button>
                        </form>
                      ) : (
                        <span className="muted">locked</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={5}>
                    No third party vendor expenses yet. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Reimbursements ───────────────────────────────────── */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Section 3 — Reimbursements</span>
            <h3>Software &amp; expense reimbursements</h3>
          </div>
          <span className="badge">{monthReimbs.length} for {selectedMonth}</span>
        </div>

        <BillUploader
          formId="reimbursement-form"
          fieldMap={{
            vendor: "vendorName",
            description: "description",
            amount: "amount",
            currency: "currency",
            monthInput: "expenseMonth"
          }}
          label="Upload receipt — AI auto-fill"
          helperText="Drop a receipt image/PDF and we'll fill vendor, amount, currency, and month."
        />

        <form id="reimbursement-form" action={addReimbursementAction}>
          <input type="hidden" name="companyCode" value="XTZ" />
          <input type="hidden" name="month" value={selectedMonth} />
          <div className="form-grid">
            <label className="field">
              <span>Month</span>
              <input
                type="month"
                name="expenseMonth"
                defaultValue={selectedMonth}
                required
              />
            </label>
            <label className="field">
              <span>Description</span>
              <input
                type="text"
                name="description"
                placeholder="e.g. Domain repurchase reimbursement"
                required
              />
            </label>
            <label className="field">
              <span>Vendor</span>
              <input type="text" name="vendorName" placeholder="GoDaddy" />
            </label>
            <label className="field">
              <span>Amount</span>
              <input type="number" name="amount" min="0" step="0.01" required />
            </label>
            <label className="field">
              <span>Currency</span>
              <select name="currency" defaultValue="USD">
                <option value="USD">USD</option>
                <option value="INR">INR</option>
                <option value="AED">AED</option>
              </select>
            </label>
            <label className="field" style={{ gridColumn: "span 2" }}>
              <span>Notes</span>
              <input type="text" name="notes" />
            </label>
            <div className="form-actions">
              <button className="action-button primary" type="submit">
                Add reimbursement
              </button>
            </div>
          </div>
        </form>

        <div className="table-wrapper clean-table" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Description</th>
                <th>Vendor</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reimbs.length > 0 ? (
                reimbs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.expenseMonth}</td>
                    <td>{r.description}</td>
                    <td>{r.vendorName || <span className="muted">—</span>}</td>
                    <td>{fmtNum(r.amount, r.currency)}</td>
                    <td>
                      <form action={updateReimbursementAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="month" value={selectedMonth} />
                        <AutoFormSelect
                          name="status"
                          defaultValue={r.status}
                          label="Status"
                          options={[
                            { value: "pending", label: "Pending" },
                            { value: "approved", label: "Approved" },
                            { value: "invoiced", label: "Invoiced" }
                          ]}
                        />
                      </form>
                    </td>
                    <td>
                      {r.status !== "invoiced" ? (
                        <form action={deleteReimbursementAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="month" value={selectedMonth} />
                          <button className="action-button secondary" type="submit">Remove</button>
                        </form>
                      ) : (
                        <span className="muted">locked</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={6}>
                    No reimbursements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Provisions ───────────────────────────────────────── */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Section 4 — Provisions (estimates)</span>
            <h3>Provisions for items without final invoices</h3>
          </div>
          <span className="badge">{monthProvs.length} for {selectedMonth}</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Use this section for items where the vendor invoice hasn't arrived yet
          (e.g. TBR travel that still needs reconciliation, expected payroll dues).
          Each line is flagged as a provision on the printed invoice.
        </p>

        <form action={addProvisionAction}>
          <input type="hidden" name="companyCode" value="XTZ" />
          <input type="hidden" name="month" value={selectedMonth} />
          <div className="form-grid">
            <label className="field">
              <span>Month</span>
              <input
                type="month"
                name="provisionMonth"
                defaultValue={selectedMonth}
                required
              />
            </label>
            <label className="field">
              <span>Description</span>
              <input
                type="text"
                name="description"
                placeholder="e.g. TBR Travel Expenses (estimate)"
                required
              />
            </label>
            <label className="field">
              <span>Vendor / counterparty</span>
              <input type="text" name="vendorName" />
            </label>
            <label className="field">
              <span>Category</span>
              <select name="category" defaultValue="other">
                {PROVISION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Estimated amount</span>
              <input type="number" name="amount" min="0" step="0.01" required />
            </label>
            <label className="field">
              <span>Currency</span>
              <select name="currency" defaultValue="USD">
                <option value="USD">USD</option>
                <option value="INR">INR</option>
                <option value="AED">AED</option>
              </select>
            </label>
            <label className="field" style={{ gridColumn: "span 2" }}>
              <span>Notes</span>
              <input type="text" name="notes" />
            </label>
            <div className="form-actions">
              <button className="action-button primary" type="submit">
                Add provision
              </button>
            </div>
          </div>
        </form>

        <div className="table-wrapper clean-table" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Description</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {provs.length > 0 ? (
                provs.map((p) => (
                  <tr key={p.id}>
                    <td>{p.provisionMonth}</td>
                    <td>{p.description}</td>
                    <td>
                      <span className="pill subtle-pill">{p.category.replace(/_/g, " ")}</span>
                    </td>
                    <td>{p.vendorName || <span className="muted">—</span>}</td>
                    <td>{fmtNum(p.estimatedAmount, p.currency)}</td>
                    <td>
                      <form action={updateProvisionAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="month" value={selectedMonth} />
                        <AutoFormSelect
                          name="status"
                          defaultValue={p.status}
                          label="Status"
                          options={[
                            { value: "estimated", label: "Estimated" },
                            { value: "approved", label: "Approved" },
                            { value: "document_pending", label: "Doc pending" },
                            { value: "invoiced", label: "Invoiced" }
                          ]}
                        />
                      </form>
                    </td>
                    <td>
                      {p.notes ? (
                        <span className="muted" style={{ fontSize: "0.74rem" }}>{p.notes}</span>
                      ) : null}
                      {p.status !== "invoiced" ? (
                        <form action={deleteProvisionAction} style={{ marginTop: p.notes ? 4 : 0 }}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="month" value={selectedMonth} />
                          <button className="action-button secondary" type="submit">Remove</button>
                        </form>
                      ) : (
                        <span className="muted">locked</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={7}>
                    No provisions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Direct / custom invoice (XTE→anyone, XTZ→anyone) ── */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Custom invoice</span>
            <h3>Create direct invoice (any issuer → any recipient)</h3>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Use this for invoices from XTE Dubai or XTZ India to individuals (e.g. Sayan Mukherjee payroll due)
          or external parties. Supports up to 5 line items.
        </p>
        <VendorSelector vendors={allVendors} formId="direct-invoice-form" />
        <form id="direct-invoice-form" action={createDirectInvoiceAction}>
          <div className="form-grid">
            <label className="field">
              <span>Issuing entity</span>
              <select name="issuerEntity" defaultValue="XTE" required>
                <option value="XTE">XTZ Esports Tech Ltd (Dubai / XTE)</option>
                <option value="XTZ">XTZ India Private Limited</option>
              </select>
            </label>
            <label className="field">
              <span>Recipient name</span>
              <input type="text" name="recipientName" placeholder="e.g. Sayan Mukherjee" required />
            </label>
            <label className="field">
              <span>Recipient address (optional)</span>
              <input type="text" name="recipientAddress" placeholder="City, Country" />
            </label>
            <label className="field">
              <span>Invoice month</span>
              <input type="month" name="invoiceMonth" defaultValue={selectedMonth} required />
            </label>
            <label className="field">
              <span>Currency</span>
              <select name="invoiceCurrency" defaultValue="USD">
                <option value="USD">USD</option>
                <option value="AED">AED</option>
                <option value="INR">INR</option>
              </select>
            </label>
            <label className="field">
              <span>Notes</span>
              <input type="text" name="notes" placeholder="e.g. Payroll Due Feb to April 2026" />
            </label>
          </div>

          <div style={{ marginTop: 16 }}>
            <strong style={{ fontSize: "0.82rem" }}>Line items</strong>
          </div>
          <div className="table-wrapper clean-table" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <input type="text" name={`lineDesc_${i}`} placeholder="Description" style={{ width: "100%" }} />
                    </td>
                    <td>
                      <input type="number" name={`lineQty_${i}`} defaultValue="1" min="1" step="1" style={{ width: 60 }} />
                    </td>
                    <td>
                      <input type="number" name={`linePrice_${i}`} min="0" step="0.01" placeholder="0.00" style={{ width: 120 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="action-button primary" type="submit">
              Create direct invoice
            </button>
          </div>
        </form>
      </section>

      {/* ── Generated invoices ───────────────────────────────── */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">History</span>
            <h3>Generated invoices</h3>
          </div>
          <span className="badge">{invoices.length} invoices</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Month</th>
                <th>Total</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Status</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length > 0 ? (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <strong>{inv.invoiceNumber}</strong>
                    </td>
                    <td>{inv.invoiceDate}</td>
                    <td>{inv.payrollMonth}</td>
                    <td>
                      <strong>{fmtNum(inv.totalAmount, inv.currency)}</strong>
                    </td>
                    <td>{inv.currency}</td>
                    <td>
                      <span className={`pill ${statusPill(inv.status)}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>
                      <form action={updateInvoiceStatusAction}>
                        <input type="hidden" name="invoiceId" value={inv.id} />
                        <input type="hidden" name="month" value={selectedMonth} />
                        <AutoFormSelect
                          name="newStatus"
                          defaultValue={inv.status}
                          label="Invoice status"
                          options={[
                            { value: "generated", label: "Generated" },
                            { value: "sent", label: "Sent" },
                            { value: "paid", label: "Paid" }
                          ]}
                        />
                      </form>
                    </td>
                    <td>
                      <Link
                        className="action-button primary"
                        href={`/payroll-invoices/${inv.id}` as Route}
                      >
                        View / print
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={8}>
                    No invoices generated yet. Add vendor expenses, reimbursements, or
                    provisions above and click "Generate" to create your first invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {invoices.length > 0 ? (
          <details style={{ marginTop: 12 }}>
            <summary className="muted">Danger zone — delete invoice</summary>
            <div style={{ marginTop: 12 }}>
              <form action={deleteInvoiceAction} className="inline-actions">
                <select name="invoiceId" defaultValue="" aria-label="Invoice to delete">
                  <option value="" disabled>
                    Select invoice…
                  </option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {fmtNum(inv.totalAmount, inv.currency)}
                    </option>
                  ))}
                </select>
                <button className="action-button secondary" type="submit">
                  Delete invoice (unlocks staged items)
                </button>
              </form>
            </div>
          </details>
        ) : null}
      </article>
    </div>
  );
}
