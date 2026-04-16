import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "../../../lib/auth";
import { getXtzInvoiceById, XTZ_ISSUER, XTE_ISSUER } from "@lsc/db";
import type { XtzInvoiceItemRow } from "@lsc/db";
import { updateInvoiceStatusAction } from "../actions";
import { PrintButton, DownloadPdfButton } from "../../components/print-button";

const fmt = (n: number, currency: string): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const SECTION_LABELS: Record<string, string> = {
  payroll: "Payroll",
  mdg_fees: "Third Party Vendors",
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

  // Determine if the issuer is XTZ India or XTE (for bank details display)
  const isXteIssuer =
    header.issuerLegalName.includes("Esports Tech") ||
    header.issuerLegalName.includes("XTZ Esports");

  // For XTE invoices, detect if bank has IBAN (UAE) vs IFSC (India)
  const hasIban = isXteIssuer;

  // Flatten all items into a single numbered list (matching the XTE template)
  let globalLineNum = 0;

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
            {header.payrollMonth} &middot; {header.fromCompany} &rarr; {header.toCompany}
          </p>
        </div>
        <div className="inline-actions">
          <DownloadPdfButton invoiceId={header.id} />
          <PrintButton />
        </div>
      </header>

      {message ? (
        <section className={`notice ${status ?? "info"} no-print`}>
          <strong>{status === "error" ? "Error" : "Saved"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      {/* ── Printable invoice ─────────────────────────────── */}
      <article className="invoice-sheet">
        <div className="invoice-topbar" />

        {/* ── Header: company + INVOICE title ──────────────── */}
        <div className="invoice-header">
          <div>
            <div className="invoice-company-name">{header.issuerLegalName}</div>
            <div className="invoice-company-address">
              {header.issuerAddress.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < header.issuerAddress.split("\n").length - 1 ? <br /> : null}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="invoice-title">INVOICE</div>
            <div className="invoice-meta">
              <div className="invoice-meta-row">
                <span className="invoice-meta-label">Invoice No:</span>
                <span className="invoice-meta-value">{header.invoiceNumber}</span>
              </div>
              <div className="invoice-meta-row">
                <span className="invoice-meta-label">Date:</span>
                <span className="invoice-meta-value">{header.invoiceDate}</span>
              </div>
              <div className="invoice-meta-row">
                <span className="invoice-meta-label">Period:</span>
                <span className="invoice-meta-value">{header.payrollMonth}</span>
              </div>
              <div className="invoice-meta-row">
                <span className="invoice-meta-label">Payment Terms:</span>
                <span className="invoice-meta-value">Payable on Receipt</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bill To ──────────────────────────────────────── */}
        <div className="invoice-billto">
          <div className="invoice-billto-label">BILL TO</div>
          <div className="invoice-billto-name">
            {header.recipientLegalName}
            {header.recipientAddress ? (
              <>
                <br />
                <span style={{ fontWeight: 400, fontSize: "0.85rem", color: "#6b7280" }}>
                  {header.recipientAddress.split("\n").map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < header.recipientAddress.split("\n").length - 1 ? <br /> : null}
                    </span>
                  ))}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* ── Line items ───────────────────────────────────── */}
        <div className="invoice-lines">
          {SECTION_ORDER.filter((sec) => grouped[sec]).map((sec) => {
            const sectionItems = grouped[sec]!;
            const hasMultipleSections = SECTION_ORDER.filter((s) => grouped[s]).length > 1;

            return (
              <div className="invoice-section" key={sec}>
                {hasMultipleSections ? (
                  <div className="invoice-section-title">{SECTION_LABELS[sec]}</div>
                ) : null}
                <table className="invoice-line-table">
                  <thead>
                    <tr>
                      <th className="col-desc">DESCRIPTION</th>
                      <th className="col-qty">QTY</th>
                      <th className="col-unit-price">UNIT PRICE</th>
                      <th className="col-amt">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionItems.map((item) => {
                      globalLineNum++;
                      return (
                        <tr
                          key={item.id}
                          className={item.isProvision ? "provision-row" : ""}
                        >
                          <td className="col-desc">
                            <div>{item.description}</div>
                            {item.referenceNote ? (
                              <div className="invoice-line-note">
                                {item.referenceNote}
                              </div>
                            ) : null}
                          </td>
                          <td className="col-qty">{item.quantity}</td>
                          <td className="col-unit-price">
                            {fmt(item.unitPrice, header.currency)}
                          </td>
                          <td className="col-amt">
                            {fmt(item.amount, header.currency)}
                          </td>
                        </tr>
                      );
                    })}
                    {hasMultipleSections ? (
                      <tr className="invoice-section-subtotal">
                        <td colSpan={3}>
                          {SECTION_LABELS[sec]} subtotal
                        </td>
                        <td className="col-amt">
                          {fmt(sectionTotals[sec] ?? 0, header.currency)}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* ── Totals ───────────────────────────────────────── */}
        <div className="invoice-totals">
          <div className="invoice-totals-table">
            <div className="invoice-totals-row">
              <span>Subtotal</span>
              <span>{fmt(header.subtotal, header.currency)}</span>
            </div>
            <div className="invoice-totals-row">
              <span>Tax ({header.taxAmount > 0 ? "" : "0"}%)</span>
              <span>{fmt(header.taxAmount, header.currency)}</span>
            </div>
            <div className="invoice-totals-grand">
              <span>TOTAL DUE</span>
              <span>{fmt(header.totalAmount, header.currency)}</span>
            </div>
          </div>
        </div>

        {/* ── Bank Details ─────────────────────────────────── */}
        <div className="invoice-banking">
          <div className="invoice-banking-title">BANK DETAILS</div>
          <div className="invoice-banking-box">
            <div className="invoice-banking-row">
              <div className="invoice-banking-label">Beneficiary</div>
              <div className="invoice-banking-value">{header.issuerLegalName}</div>
            </div>
            <div className="invoice-banking-row">
              <div className="invoice-banking-label">Address</div>
              <div className="invoice-banking-value">
                {header.issuerAddress.split("\n").map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < header.issuerAddress.split("\n").length - 1 ? <br /> : null}
                  </span>
                ))}
              </div>
            </div>
            <div className="invoice-banking-row">
              <div className="invoice-banking-label">Bank Name</div>
              <div className="invoice-banking-value">{header.bankName}</div>
            </div>
            <div className="invoice-banking-row">
              <div className="invoice-banking-label">Branch Address</div>
              <div className="invoice-banking-value">{header.bankBranchAddress || header.bankBranch}</div>
            </div>
            <div className="invoice-banking-row">
              <div className="invoice-banking-label">Account No.</div>
              <div className="invoice-banking-value">{header.bankAccountNumber}</div>
            </div>
            {hasIban ? (
              <div className="invoice-banking-row">
                <div className="invoice-banking-label">IBAN</div>
                <div className="invoice-banking-value">{header.bankIfsc}</div>
              </div>
            ) : (
              <div className="invoice-banking-row">
                <div className="invoice-banking-label">IFSC</div>
                <div className="invoice-banking-value">{header.bankIfsc}</div>
              </div>
            )}
            {hasIban ? (
              <div className="invoice-banking-row">
                <div className="invoice-banking-label">Routing Code</div>
                <div className="invoice-banking-value">{header.bankAdCode}</div>
              </div>
            ) : (
              <div className="invoice-banking-row">
                <div className="invoice-banking-label">AD Code</div>
                <div className="invoice-banking-value">{header.bankAdCode}</div>
              </div>
            )}
            <div className="invoice-banking-row">
              <div className="invoice-banking-label">SWIFT Code</div>
              <div className="invoice-banking-value">{header.bankSwift}</div>
            </div>
            {!hasIban && header.issuerGstin ? (
              <>
                <div className="invoice-banking-row">
                  <div className="invoice-banking-label">GSTIN</div>
                  <div className="invoice-banking-value">{header.issuerGstin}</div>
                </div>
                <div className="invoice-banking-row">
                  <div className="invoice-banking-label">PAN</div>
                  <div className="invoice-banking-value">{header.issuerPan}</div>
                </div>
                <div className="invoice-banking-row">
                  <div className="invoice-banking-label">CIN</div>
                  <div className="invoice-banking-value">{header.issuerCin}</div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* ── Notes ────────────────────────────────────────── */}
        {header.notes ? (
          <div className="invoice-notes">
            <div className="invoice-notes-label">Notes</div>
            <div>{header.notes}</div>
          </div>
        ) : null}

        {/* ── Footer ───────────────────────────────────────── */}
        <div className="invoice-footer-text">
          {header.issuerLegalName} &bull;{" "}
          {header.issuerAddress.split("\n").join(", ")} &bull;{" "}
          Thank you for your business
        </div>
        <div className="invoice-footer-bar" />
      </article>
    </div>
  );
}
