import { getVendorsWithBank } from "@lsc/db";
import { requireRole } from "../../lib/auth";
import { EmptyState } from "../components/empty-state";
import { RowHighlight } from "../components/row-highlight";
import { SubmitButton } from "../components/submit-button";
import { addVendorAction, deleteVendorAction } from "./actions";

const VENDOR_TYPES = [
  "production_partner", "venue", "saas", "service_provider",
  "equipment", "catering", "travel", "legal", "other"
];

const COMPANIES = ["LSC", "TBR", "XTZ", "XTE", "FSP"];

function statusSignal(status: string): string {
  switch (status) {
    case "active": return "signal-pill signal-good";
    case "under_review": case "pending": return "signal-pill signal-warn";
    case "inactive": case "suspended": return "signal-pill signal-risk";
    default: return "subtle-pill";
  }
}

export default async function VendorsPage() {
  await requireRole(["super_admin", "finance_admin", "viewer"]);

  const vendorsBank = await getVendorsWithBank();

  const activeCount = vendorsBank.filter((v) => v.status === "active").length;
  const withBankCount = vendorsBank.filter((v) => v.bankAccountNumber).length;

  return (
    <div className="page-grid">
      <RowHighlight />
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Finance operations</span>
          <h3>Vendors &amp; Beneficiaries</h3>
          <p className="muted">
            Manage all vendors, contractors, and payment beneficiaries with bank details.
            These are used by the invoice generator to auto-populate recipient banking info.
          </p>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline"><span className="metric-label">Total vendors</span></div>
          <div className="metric-value">{vendorsBank.length}</div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline"><span className="metric-label">Active</span></div>
          <div className="metric-value">{activeCount}</div>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline"><span className="metric-label">With bank details</span></div>
          <div className="metric-value">{withBankCount}</div>
          <span className="metric-subvalue">Ready for invoicing</span>
        </article>
      </section>

      {/* ── Add vendor form (collapsed by default) ────────── */}
      <section className="card collapsible-card">
        <details>
          <summary className="card-title-row collapsible-summary">
            <div>
              <span className="section-kicker">Add</span>
              <h3>New vendor / beneficiary</h3>
            </div>
            <span className="collapsible-indicator" aria-hidden="true">+</span>
          </summary>
        <form action={addVendorAction}>
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input type="text" name="name" placeholder="e.g. Sayan Mukherjee" required />
            </label>
            <label className="field">
              <span>Type</span>
              <select name="vendorType" defaultValue="service_provider">
                {VENDOR_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Linked entity</span>
              <select name="companyCode" defaultValue="XTZ">
                <option value="">None</option>
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Payment terms</span>
              <input type="text" name="paymentTerms" placeholder="Payable on Receipt" />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" name="email" placeholder="email@example.com" />
            </label>
            <label className="field">
              <span>Phone</span>
              <input type="text" name="phone" placeholder="+91 9204384567" />
            </label>
            <label className="field">
              <span>Address</span>
              <input type="text" name="address" placeholder="Street address" />
            </label>
            <label className="field">
              <span>City</span>
              <input type="text" name="city" placeholder="City, Postal code" />
            </label>
            <label className="field">
              <span>Country</span>
              <input type="text" name="country" placeholder="India" />
            </label>
            <label className="field">
              <span>Currency</span>
              <select name="currencyCode" defaultValue="USD">
                <option value="USD">USD</option>
                <option value="INR">INR</option>
                <option value="AED">AED</option>
              </select>
            </label>
            <label className="field">
              <span>Tax ID / PAN</span>
              <input type="text" name="taxId" />
            </label>
          </div>

          <details className="mt-lg mb-lg">
            <summary><strong>Bank / payment details</strong></summary>
            <div className="form-grid mt-md">
              <label className="field">
                <span>Bank name</span>
                <input type="text" name="bankName" placeholder="HDFC Bank" />
              </label>
              <label className="field">
                <span>Bank branch</span>
                <input type="text" name="bankBranch" placeholder="Branch address" />
              </label>
              <label className="field">
                <span>Account number</span>
                <input type="text" name="bankAccountNumber" placeholder="50100153694001" />
              </label>
              <label className="field">
                <span>IFSC</span>
                <input type="text" name="bankIfsc" placeholder="HDFC0009081" />
              </label>
              <label className="field">
                <span>SWIFT</span>
                <input type="text" name="bankSwift" placeholder="HDFCINBBXXX" />
              </label>
              <label className="field">
                <span>IBAN (if international)</span>
                <input type="text" name="bankIban" />
              </label>
              <label className="field">
                <span>Routing code</span>
                <input type="text" name="bankRoutingCode" />
              </label>
            </div>
          </details>

          <label className="field">
            <span>Notes</span>
            <input type="text" name="notes" />
          </label>

          <div className="form-actions mt-md">
            <SubmitButton pendingLabel="Adding vendor…">Add vendor</SubmitButton>
          </div>
        </form>
        </details>
      </section>

      {/* ── Vendor directory with bank details ────────────── */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Directory</span>
            <h3>All vendors &amp; beneficiaries</h3>
          </div>
          <span className="badge">{vendorsBank.length} vendors</span>
        </div>
        {vendorsBank.length === 0 ? (
          <EmptyState
            title="No vendors yet"
            description="Add your first vendor to auto-fill recipient banking info when creating invoices. Vendors with bank details appear in the VendorSelector on the XTZ invoice generator."
          />
        ) : (
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Bank</th>
                <th>Account</th>
                <th>IFSC / IBAN</th>
                <th>SWIFT</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendorsBank.map((v) => (
                  <tr key={v.id} data-row-id={v.id}>
                    <td>
                      <strong>{v.name}</strong>
                      {v.email ? <><br /><span className="muted">{v.email}</span></> : null}
                    </td>
                    <td><span className="pill subtle-pill">{v.vendorType}</span></td>
                    <td>{v.entityCodes || <span className="muted">—</span>}</td>
                    <td>{v.bankName || <span className="muted">—</span>}</td>
                    <td>
                      {v.bankAccountNumber ? (
                        <span className="mono">{v.bankAccountNumber}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {v.bankIfsc || v.bankIban || <span className="muted">—</span>}
                    </td>
                    <td>{v.bankSwift || <span className="muted">—</span>}</td>
                    <td>
                      <span className={`pill ${statusSignal(v.status)}`}>
                        {v.status}
                      </span>
                    </td>
                    <td>
                      <form action={deleteVendorAction}>
                        <input type="hidden" name="id" value={v.id} />
                        <SubmitButton
                          variant="secondary"
                          pendingLabel="Deleting…"
                          confirmMessage={`Delete vendor "${v.name}"? This cannot be undone.`}
                        >
                          Delete
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </article>
    </div>
  );
}
