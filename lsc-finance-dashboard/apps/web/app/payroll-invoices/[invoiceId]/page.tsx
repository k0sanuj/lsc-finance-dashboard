import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "../../../lib/auth";
import { getXtzInvoiceById } from "@lsc/db";
import type { XtzInvoiceItemRow } from "@lsc/db";
import { updateInvoiceStatusAction } from "../actions";

const fmt = (n: number, currency: string): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const SECTION_LABELS: Record<string, string> = {
  payroll: "Payroll",
  mdg_fees: "MDG Fees",
  reimbursement: "Reimbursements",
  software_expense: "Software Expenses",
  provision: "Provisions",
  other: "Other"
};

const SECTION_ORDER = [
  "payroll",
  "mdg_fees",
  "reimbursement",
  "software_expense",
  "provision",
  "other"
];

type PageProps = {
  params: Promise<{ invoiceId: string }>;
  searchParams?: Promise<{ status?: string; message?: string }>;
};

export default async function InvoiceDetailPage({ params, searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const { invoiceId } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const status = sp?.status ?? null;
  const message = sp?.message ?? null;

  const result = await getXtzInvoiceById(invoiceId);
  if (!result) notFound();
  const { header, items } = result;

  // Group items by section
  const grouped: Record<string, XtzInvoiceItemRow[]> = {};
  for (const item of items) {
    if (!grouped[item.section]) grouped[item.section] = [];
    grouped[item.section]!.push(item);
  }

  const sectionTotals: Record<string, number> = {};
  for (const sec of Object.keys(grouped)) {
    sectionTotals[sec] = grouped[sec]!.reduce((s, i) => s + i.amount, 0);
  }

  return (
    <div className="page-grid invoice-page">
      {/* ── Toolbar (hidden on print) ───────────────────────── */}
      <header className="workspace-header no-print">
        <div className="workspace-header-left">
          <Link className="ghost-link" href={"/payroll-invoices" as Route}>
            &larr; Back to invoices
          </Link>
          <h3>Invoice {header.invoiceNumber}</h3>
          <p className="muted">
            {header.payrollMonth} · {header.fromCompany} → {header.toCompany}
          </p>
        </div>
        <div className="inline-actions">
          <a className="action-button primary" href="javascript:window.print()">
            Print / Save PDF
          </a>
          <form action={updateInvoiceStatusAction} className="inline-actions">
            <input type="hidden" name="invoiceId" value={header.id} />
            <select name="newStatus" defaultValue={header.status}>
              <option value="generated">Generated</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
            </select>
            <button className="action-button secondary" type="submit">
              Update status
            </button>
          </form>
        </div>
      </header>

      {message ? (
        <section className={`notice ${status ?? "info"} no-print`}>
          <strong>{status === "error" ? "Error" : "Saved"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      {/* ── Printable invoice template ─────────────────────── */}
      <article className="invoice-sheet">
        {/* Header band */}
        <div className="invoice-header">
          <div className="invoice-brand">
            <div className="invoice-brand-mark">XTZ</div>
            <div>
              <div className="invoice-brand-name">{header.issuerLegalName}</div>
              <div className="invoice-brand-tag">Tax Invoice</div>
            </div>
          </div>
          <div className="invoice-meta">
            <div className="invoice-meta-row">
              <span className="invoice-meta-label">Invoice #</span>
              <span className="invoice-meta-value">{header.invoiceNumber}</span>
            </div>
            <div className="invoice-meta-row">
              <span className="invoice-meta-label">Issue date</span>
              <span className="invoice-meta-value">{header.invoiceDate}</span>
            </div>
            <div className="invoice-meta-row">
              <span className="invoice-meta-label">Period</span>
              <span className="invoice-meta-value">{header.payrollMonth}</span>
            </div>
            <div className="invoice-meta-row">
              <span className="invoice-meta-label">Status</span>
              <span className="invoice-meta-value">{header.status.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* From / To band */}
        <div className="invoice-parties">
          <div className="invoice-party">
            <div className="invoice-party-label">From</div>
            <div className="invoice-party-name">{header.issuerLegalName}</div>
            <div className="invoice-party-detail">{header.issuerAddress}</div>
            <div className="invoice-party-detail">
              GSTIN: <strong>{header.issuerGstin}</strong>
            </div>
            <div className="invoice-party-detail">
              CIN: {header.issuerCin}
            </div>
            <div className="invoice-party-detail">
              PAN: {header.issuerPan}
            </div>
          </div>
          <div className="invoice-party">
            <div className="invoice-party-label">Bill to</div>
            <div className="invoice-party-name">{header.recipientLegalName}</div>
            <div className="invoice-party-detail">{header.recipientAddress}</div>
          </div>
        </div>

        {/* Line items */}
        <div className="invoice-lines">
          {SECTION_ORDER.filter((sec) => grouped[sec]).map((sec) => (
            <div className="invoice-section" key={sec}>
              <div className="invoice-section-title">{SECTION_LABELS[sec]}</div>
              <table className="invoice-line-table">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th className="col-desc">Description</th>
                    <th className="col-orig">Original</th>
                    <th className="col-fx">FX rate</th>
                    <th className="col-amt">Amount ({header.currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[sec]!.map((item, idx) => (
                    <tr key={item.id} className={item.isProvision ? "provision-row" : ""}>
                      <td className="col-num">{idx + 1}</td>
                      <td className="col-desc">
                        <div>{item.description}</div>
                        {item.referenceNote ? (
                          <div className="invoice-line-note">{item.referenceNote}</div>
                        ) : null}
                      </td>
                      <td className="col-orig">
                        {item.originalAmount != null && item.originalCurrency ? (
                          <>
                            {item.originalAmount.toLocaleString("en-IN")}{" "}
                            {item.originalCurrency}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="col-fx">
                        {item.fxRate != null && item.fxRate !== 1 ? (
                          item.fxRate.toFixed(5)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="col-amt">
                        <strong>{fmt(item.amount, header.currency)}</strong>
                      </td>
                    </tr>
                  ))}
                  <tr className="invoice-section-subtotal">
                    <td colSpan={4}>{SECTION_LABELS[sec]} subtotal</td>
                    <td className="col-amt">
                      <strong>{fmt(sectionTotals[sec] ?? 0, header.currency)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="invoice-totals">
          <div className="invoice-totals-table">
            <div className="invoice-totals-row">
              <span>Subtotal</span>
              <span>{fmt(header.subtotal, header.currency)}</span>
            </div>
            {header.taxAmount > 0 ? (
              <div className="invoice-totals-row">
                <span>Tax</span>
                <span>{fmt(header.taxAmount, header.currency)}</span>
              </div>
            ) : null}
            <div className="invoice-totals-row invoice-totals-grand">
              <span>Total due</span>
              <span>{fmt(header.totalAmount, header.currency)}</span>
            </div>
          </div>
        </div>

        {/* Banking details */}
        <div className="invoice-banking">
          <div className="invoice-banking-title">Wire transfer details (international)</div>
          <div className="invoice-banking-grid">
            <div>
              <div className="invoice-banking-label">Beneficiary</div>
              <div className="invoice-banking-value">{header.issuerLegalName}</div>
            </div>
            <div>
              <div className="invoice-banking-label">Bank</div>
              <div className="invoice-banking-value">{header.bankName}</div>
            </div>
            <div>
              <div className="invoice-banking-label">Account number</div>
              <div className="invoice-banking-value">{header.bankAccountNumber}</div>
            </div>
            <div>
              <div className="invoice-banking-label">SWIFT / BIC</div>
              <div className="invoice-banking-value">{header.bankSwift}</div>
            </div>
            <div>
              <div className="invoice-banking-label">IFSC</div>
              <div className="invoice-banking-value">{header.bankIfsc}</div>
            </div>
            <div>
              <div className="invoice-banking-label">AD code</div>
              <div className="invoice-banking-value">{header.bankAdCode}</div>
            </div>
            <div className="invoice-banking-wide">
              <div className="invoice-banking-label">Branch</div>
              <div className="invoice-banking-value">{header.bankBranch}</div>
              <div className="invoice-banking-detail">{header.bankBranchAddress}</div>
            </div>
          </div>
        </div>

        {header.notes ? (
          <div className="invoice-notes">
            <div className="invoice-notes-label">Notes</div>
            <div>{header.notes}</div>
          </div>
        ) : null}

        <div className="invoice-footer">
          <div>Payment method: {header.paymentMethod || "Wire transfer"}</div>
          <div>This is a computer generated invoice and does not require a signature.</div>
        </div>
      </article>
    </div>
  );
}
