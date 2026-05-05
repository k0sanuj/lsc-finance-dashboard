import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "../../../../lib/auth";
import { getXtzInvoiceById } from "@lsc/db";
import type { XtzInvoiceItemRow } from "@lsc/db";
import { AIIntakePanel } from "../../../components/ai-intake-panel";
import { AIIntakeReviewPanel } from "../../../components/ai-intake-review-panel";
import { SubmitButton } from "../../../components/submit-button";
import {
  cloneInvoiceAction,
  deleteInvoiceItemAction,
  updateInvoiceHeaderAction,
  upsertInvoiceItemAction,
} from "../../actions";

const SECTION_OPTIONS = [
  ["payroll", "Payroll"],
  ["mdg_fees", "Third Party Vendors"],
  ["reimbursement", "Reimbursement"],
  ["software_expense", "Software Expense"],
  ["provision", "Provision"],
  ["other", "Other"],
] as const;

const SECTION_LABELS = Object.fromEntries(SECTION_OPTIONS) as Record<string, string>;

const fmtMoney = (n: number, currency: string): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function SectionSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select name="section" defaultValue={defaultValue}>
      {SECTION_OPTIONS.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

function LineItemForm({
  invoiceId,
  item,
  currency,
  open,
}: {
  invoiceId: string;
  item: XtzInvoiceItemRow;
  currency: string;
  open: boolean;
}) {
  return (
    <details className="intake-section" open={open}>
      <summary
        style={{
          alignItems: "center",
          cursor: "pointer",
          display: "grid",
          gap: 12,
          gridTemplateColumns: "140px minmax(220px, 1fr) 140px",
        }}
      >
        <span className="pill subtle-pill">{SECTION_LABELS[item.section] ?? item.section}</span>
        <span>
          <strong>{item.description}</strong>
          <br />
          <span className="muted">
            {item.vendorName ?? item.employeeName ?? "No payee"} · order {item.displayOrder}
          </span>
        </span>
        <strong style={{ textAlign: "right" }}>{fmtMoney(item.amount, currency)}</strong>
      </summary>

      <form action={upsertInvoiceItemAction} className="stack-form compact-form" style={{ marginTop: 16 }}>
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="itemId" value={item.id} />
        <div className="form-grid">
          <label className="field">
            <span>Section</span>
            <SectionSelect defaultValue={item.section} />
          </label>
          <label className="field">
            <span>Display order</span>
            <input name="displayOrder" type="number" defaultValue={item.displayOrder} />
          </label>
          <label className="field" style={{ gridColumn: "span 2" }}>
            <span>Description</span>
            <input name="description" defaultValue={item.description} required />
          </label>
          <label className="field">
            <span>Vendor / payee</span>
            <input name="vendorName" defaultValue={item.vendorName ?? item.employeeName ?? ""} />
          </label>
          <label className="field">
            <span>Quantity</span>
            <input name="quantity" type="number" min="0" step="0.01" defaultValue={item.quantity} required />
          </label>
          <label className="field">
            <span>Unit price ({currency})</span>
            <input name="unitPrice" type="number" min="0" step="0.01" defaultValue={item.unitPrice} required />
          </label>
          <label className="field">
            <span>Original amount</span>
            <input name="originalAmount" type="number" min="0" step="0.01" defaultValue={item.originalAmount ?? ""} />
          </label>
          <label className="field">
            <span>Original currency</span>
            <input name="originalCurrency" defaultValue={item.originalCurrency ?? currency} />
          </label>
          <label className="field">
            <span>FX rate</span>
            <input name="fxRate" type="number" min="0" step="0.000001" defaultValue={item.fxRate ?? ""} />
          </label>
          <label className="field" style={{ gridColumn: "span 2" }}>
            <span>Reference note</span>
            <input name="referenceNote" defaultValue={item.referenceNote ?? ""} />
          </label>
          <label className="field">
            <span>Provision</span>
            <input name="isProvision" type="checkbox" defaultChecked={item.isProvision} />
          </label>
          <div>
            <span className="section-kicker">Lineage</span>
            <p className="muted" style={{ margin: 0 }}>
              {item.aiIntakeDraftId
                ? "AI draft attached"
                : item.sourceDocumentId
                  ? "Source document attached"
                  : "Manual or payroll-generated line"}
            </p>
          </div>
        </div>
        <div className="form-actions">
          <SubmitButton variant="primary" pendingLabel="Saving line...">
            Save line
          </SubmitButton>
          <button className="action-button secondary" formAction={deleteInvoiceItemAction} type="submit">
            Remove
          </button>
        </div>
      </form>
    </details>
  );
}

type PageProps = {
  params: Promise<{ invoiceId: string }>;
  searchParams?: Promise<{ status?: string; message?: string; aiDraftId?: string }>;
};

export default async function PayrollInvoiceEditPage({ params, searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const { invoiceId } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const status = sp?.status ?? null;
  const message = sp?.message ?? null;
  const aiDraftId = sp?.aiDraftId ?? null;

  const result = await getXtzInvoiceById(invoiceId);
  if (!result) notFound();
  const { header, items } = result;
  const editPath = `/payroll-invoices/${invoiceId}/edit`;

  return (
    <div className="page-grid">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <Link className="ghost-link" href={`/payroll-invoices/${invoiceId}` as Route}>
            &larr; Back to invoice
          </Link>
          <span className="section-kicker">Generated invoice editor</span>
          <h3>Edit {header.invoiceNumber}</h3>
          <p className="muted">
            Line items are the primary editing surface. Header, bank details, and AI intake are available below without crowding the first screen.
          </p>
        </div>
        <div className="inline-actions">
          <Link className="action-button secondary" href={"/payroll-invoices" as Route}>
            Dashboard
          </Link>
          <Link className="action-button secondary" href={`/payroll-invoices/${invoiceId}` as Route}>
            View / print
          </Link>
        </div>
      </header>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Saved"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      {!header.canEdit ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Locked</span>
              <h3>This invoice cannot be edited</h3>
            </div>
            <span className="pill">{header.status}</span>
          </div>
          <p className="muted">
            Only generated invoices are editable. Create a clone to revise this invoice without rewriting history.
          </p>
          {header.canClone ? (
            <form action={cloneInvoiceAction}>
              <input type="hidden" name="invoiceId" value={header.id} />
              <SubmitButton variant="primary" pendingLabel="Cloning...">
                Clone generated revision
              </SubmitButton>
            </form>
          ) : null}
        </section>
      ) : (
        <>
          <section className="stats-grid compact-stats">
            <article className="metric-card accent-brand">
              <div className="metric-topline">
                <span className="metric-label">Subtotal</span>
              </div>
              <div className="metric-value">{fmtMoney(header.subtotal, header.currency)}</div>
            </article>
            <article className="metric-card accent-good">
              <div className="metric-topline">
                <span className="metric-label">Total</span>
              </div>
              <div className="metric-value">{fmtMoney(header.totalAmount, header.currency)}</div>
              <span className="metric-subvalue">{items.length} line items</span>
            </article>
            <article className="metric-card">
              <div className="metric-topline">
                <span className="metric-label">Status</span>
              </div>
              <div className="metric-value">{header.status}</div>
              <span className="metric-subvalue">Editable until sent</span>
            </article>
          </section>

          <section className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Line items</span>
                <h3>Invoice line workbench</h3>
              </div>
              <span className="badge">Totals recalculate on save</span>
            </div>

            <div className="page-grid">
              {items.map((item) => (
                <LineItemForm
                  currency={header.currency}
                  invoiceId={invoiceId}
                  item={item}
                  key={item.id}
                  open={items.length <= 2}
                />
              ))}

              <details className="intake-section" open={items.length === 0}>
                <summary style={{ cursor: "pointer" }}>
                  <strong>Add manual line item</strong>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    Use AI intake below for document-backed lines.
                  </span>
                </summary>
                <form action={upsertInvoiceItemAction} className="stack-form compact-form" style={{ marginTop: 16 }}>
                  <input type="hidden" name="invoiceId" value={invoiceId} />
                  <div className="form-grid">
                    <label className="field">
                      <span>Section</span>
                      <SectionSelect defaultValue="other" />
                    </label>
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      <span>Description</span>
                      <input name="description" required />
                    </label>
                    <label className="field">
                      <span>Vendor / payee</span>
                      <input name="vendorName" />
                    </label>
                    <label className="field">
                      <span>Quantity</span>
                      <input name="quantity" type="number" min="0" step="0.01" defaultValue="1" required />
                    </label>
                    <label className="field">
                      <span>Unit price ({header.currency})</span>
                      <input name="unitPrice" type="number" min="0" step="0.01" required />
                    </label>
                    <label className="field">
                      <span>Original amount</span>
                      <input name="originalAmount" type="number" min="0" step="0.01" />
                    </label>
                    <label className="field">
                      <span>Original currency</span>
                      <input name="originalCurrency" defaultValue={header.currency} />
                    </label>
                    <label className="field">
                      <span>FX rate</span>
                      <input name="fxRate" type="number" min="0" step="0.000001" />
                    </label>
                    <label className="field" style={{ gridColumn: "span 2" }}>
                      <span>Reference note</span>
                      <input name="referenceNote" />
                    </label>
                    <label className="field">
                      <span>Provision</span>
                      <input name="isProvision" type="checkbox" />
                    </label>
                  </div>
                  <div className="form-actions">
                    <SubmitButton variant="primary" pendingLabel="Adding line...">
                      Add line
                    </SubmitButton>
                  </div>
                </form>
              </details>
            </div>
          </section>

          <AIIntakeReviewPanel
            draftId={aiDraftId}
            redirectPath={editPath}
            title="Review invoice line item intake"
          />

          <div className="grid-two">
            <AIIntakePanel
              title="AI invoice line item intake"
              description="Upload or paste support for a generated invoice line. Finance approval posts the edited preview directly into this invoice and keeps draft lineage."
              companyCode="XTZ"
              redirectPath={editPath}
              workflowContext={`xtz-invoice:${invoiceId}:line-item`}
              defaultTargetKind="xtz_payroll_vendor_invoice_support"
              targetOptions={[
                { value: "xtz_payroll_vendor_invoice_support", label: "XTZ invoice line item" },
              ]}
              targetEntityType="payroll_invoice"
              targetEntityId={invoiceId}
              notePlaceholder="Mention section, vendor/payee, quantity, amount, currency, and reference note."
              variant="plain"
            />

            <details className="card">
              <summary style={{ cursor: "pointer" }}>
                <strong>Header and bank details</strong>
                <span className="muted" style={{ marginLeft: 8 }}>
                  Invoice date, parties, notes, and bank fields.
                </span>
              </summary>
              <form action={updateInvoiceHeaderAction} className="stack-form compact-form" style={{ marginTop: 16 }}>
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <div className="form-grid">
                  <label className="field">
                    <span>Invoice date</span>
                    <input name="invoiceDate" type="date" defaultValue={header.invoiceDateRaw} />
                  </label>
                  <label className="field">
                    <span>Payroll month</span>
                    <input name="payrollMonth" type="month" defaultValue={header.payrollMonthRaw.slice(0, 7)} />
                  </label>
                  <label className="field">
                    <span>Payment method</span>
                    <input name="paymentMethod" defaultValue={header.paymentMethod} />
                  </label>
                  <label className="field">
                    <span>Issuer</span>
                    <input name="issuerLegalName" defaultValue={header.issuerLegalName} />
                  </label>
                  <label className="field">
                    <span>Recipient</span>
                    <input name="recipientLegalName" defaultValue={header.recipientLegalName} />
                  </label>
                  <label className="field">
                    <span>Bank name</span>
                    <input name="bankName" defaultValue={header.bankName} />
                  </label>
                  <label className="field">
                    <span>Account / IBAN</span>
                    <input name="bankAccountNumber" defaultValue={header.bankAccountNumber} />
                  </label>
                  <label className="field">
                    <span>IFSC / IBAN field</span>
                    <input name="bankIfsc" defaultValue={header.bankIfsc} />
                  </label>
                  <label className="field">
                    <span>SWIFT</span>
                    <input name="bankSwift" defaultValue={header.bankSwift} />
                  </label>
                  <label className="field">
                    <span>AD / routing code</span>
                    <input name="bankAdCode" defaultValue={header.bankAdCode} />
                  </label>
                  <label className="field">
                    <span>Bank branch</span>
                    <input name="bankBranch" defaultValue={header.bankBranch} />
                  </label>
                  <label className="field">
                    <span>Bank branch address</span>
                    <input name="bankBranchAddress" defaultValue={header.bankBranchAddress} />
                  </label>
                  <label className="field" style={{ gridColumn: "span 2" }}>
                    <span>Issuer address</span>
                    <textarea name="issuerAddress" defaultValue={header.issuerAddress} rows={3} />
                  </label>
                  <label className="field" style={{ gridColumn: "span 2" }}>
                    <span>Recipient address</span>
                    <textarea name="recipientAddress" defaultValue={header.recipientAddress} rows={3} />
                  </label>
                  <label className="field" style={{ gridColumn: "span 2" }}>
                    <span>Notes</span>
                    <textarea name="notes" defaultValue={header.notes} rows={3} />
                  </label>
                </div>
                <div className="form-actions">
                  <SubmitButton variant="primary" pendingLabel="Saving header...">
                    Save header
                  </SubmitButton>
                </div>
              </form>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
