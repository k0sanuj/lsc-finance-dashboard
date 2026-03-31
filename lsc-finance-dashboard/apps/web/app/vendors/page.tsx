import { getVendors, getVenueAgreements } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function statusSignal(status: string): string {
  switch (status) {
    case "active":
      return "signal-pill signal-good";
    case "under_review":
    case "pending":
      return "signal-pill signal-warn";
    case "inactive":
    case "suspended":
      return "signal-pill signal-risk";
    default:
      return "subtle-pill";
  }
}

function depositSignal(status: string): string {
  switch (status) {
    case "paid":
    case "returned":
      return "signal-pill signal-good";
    case "partial":
    case "pending":
      return "signal-pill signal-warn";
    case "overdue":
    case "forfeited":
      return "signal-pill signal-risk";
    default:
      return "subtle-pill";
  }
}

function parseCurrency(value: string): number {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

export default async function VendorsPage() {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const [vendors, venues] = await Promise.all([getVendors(), getVenueAgreements()]);

  const totalVendors = vendors.length;
  const activeVendors = vendors.filter((v) => v.status === "active").length;
  const underReview = vendors.filter((v) => v.status === "under_review" || v.status === "pending").length;
  const venueCount = venues.length;

  const totalSpendAll = vendors.reduce((sum, v) => sum + parseCurrency(v.totalSpend), 0);
  const totalYtdAll = vendors.reduce((sum, v) => sum + parseCurrency(v.ytdSpend), 0);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Vendor operations</span>
          <h3>Vendor Management</h3>
          <p className="muted">
            Centralized vendor registry across all LSC entities. Track spend, payment terms,
            and venue agreements.
          </p>
        </div>
        <div className="workspace-header-right">
          <span className="pill">{totalVendors} vendors</span>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Total vendors</span>
            <span className="badge">Registry</span>
          </div>
          <div className="metric-value">{totalVendors}</div>
          <span className="metric-subvalue">All entities combined</span>
        </article>

        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Active vendors</span>
            <span className="badge">Current</span>
          </div>
          <div className="metric-value">{activeVendors}</div>
          <span className="metric-subvalue">
            {totalVendors > 0
              ? `${Math.round((activeVendors / totalVendors) * 100)}% of total`
              : "No vendors registered"}
          </span>
        </article>

        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Under review</span>
            <span className="badge">Pending</span>
          </div>
          <div className="metric-value">{underReview}</div>
          <span className="metric-subvalue">Awaiting approval or verification</span>
        </article>

        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Venue agreements</span>
            <span className="badge">Contracts</span>
          </div>
          <div className="metric-value">{venueCount}</div>
          <span className="metric-subvalue">Active venue contracts on file</span>
        </article>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Total lifetime spend</span>
            <span className="badge">All time</span>
          </div>
          <div className="metric-value">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0
            }).format(totalSpendAll)}
          </div>
          <span className="metric-subvalue">Across all vendors</span>
        </article>

        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">YTD spend</span>
            <span className="badge">This year</span>
          </div>
          <div className="metric-value">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0
            }).format(totalYtdAll)}
          </div>
          <span className="metric-subvalue">Year-to-date vendor payments</span>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Vendor registry</span>
            <h3>All vendors</h3>
          </div>
          <span className="pill">{totalVendors} total</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Entity</th>
                <th>Payment Terms</th>
                <th>Total Spend</th>
                <th>YTD Spend</th>
                <th>Invoices</th>
                <th>Last Invoice</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length > 0 ? (
                vendors.map((vendor) => (
                  <tr key={vendor.id}>
                    <td><strong>{vendor.name}</strong></td>
                    <td>{vendor.vendorType}</td>
                    <td>{vendor.entityCodes || <span className="muted">Unlinked</span>}</td>
                    <td>{vendor.paymentTerms || <span className="muted">Not set</span>}</td>
                    <td>{vendor.totalSpend}</td>
                    <td>{vendor.ytdSpend}</td>
                    <td>{vendor.invoiceCount}</td>
                    <td>{vendor.lastInvoiceDate}</td>
                    <td>
                      <span className={`pill ${statusSignal(vendor.status)}`}>
                        {vendor.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={9}>
                    No vendors have been registered yet. Vendors are created when payable
                    invoices or contracts reference a counterparty.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {venues.length > 0 ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Venue contracts</span>
              <h3>Venue Agreements</h3>
            </div>
            <span className="pill">{venueCount} agreements</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Location</th>
                  <th>Vendor</th>
                  <th>Rental Cost</th>
                  <th>Deposit</th>
                  <th>Deposit Status</th>
                  <th>Outstanding</th>
                  <th>Event Dates</th>
                  <th>Start</th>
                  <th>End</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((venue) => (
                  <tr key={venue.id}>
                    <td><strong>{venue.venueName}</strong></td>
                    <td>{venue.location || <span className="muted">TBD</span>}</td>
                    <td>{venue.vendorName}</td>
                    <td>{venue.rentalCost}</td>
                    <td>{venue.depositAmount}</td>
                    <td>
                      <span className={`pill ${depositSignal(venue.depositStatus)}`}>
                        {venue.depositStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>{venue.outstandingBalance}</td>
                    <td>{venue.eventDates || <span className="muted">TBD</span>}</td>
                    <td>{venue.agreementStart}</td>
                    <td>{venue.agreementEnd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
