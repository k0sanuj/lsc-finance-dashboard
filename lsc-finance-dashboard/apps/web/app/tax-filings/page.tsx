import { getTaxCalculations, getTaxFilings, getTaxSummary } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function formatAmount(value: number, currency = "USD"): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  });
}

function filingStatusClass(status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  switch (normalized) {
    case "draft":
      return "signal-pill signal-warn";
    case "prepared":
    case "filed":
    case "accepted":
      return "signal-pill signal-good";
    case "rejected":
      return "signal-pill signal-risk";
    default:
      return "subtle-pill";
  }
}

function taxTypeBadge(taxType: string): string {
  const upper = taxType.toUpperCase();
  if (upper === "GST") return "accent-brand";
  if (upper === "VAT") return "accent-warn";
  return "accent-accent";
}

export default async function TaxFilingsPage() {
  await requireRole(["super_admin", "finance_admin"]);

  const [calculations, filings, summary] = await Promise.all([
    getTaxCalculations(),
    getTaxFilings(),
    getTaxSummary()
  ]);

  return (
    <div className="page-grid">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Tax & compliance</span>
          <h1>Tax & Filing</h1>
          <p className="muted">GST (India), VAT (UAE), and tax filing preparation</p>
        </div>
      </header>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">GST payable</span>
          </div>
          <div className="metric-value">{formatAmount(summary.totalGst)}</div>
          <span className="metric-subvalue">India</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">VAT payable</span>
          </div>
          <div className="metric-value">{formatAmount(summary.totalVat)}</div>
          <span className="metric-subvalue">UAE</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Other tax</span>
          </div>
          <div className="metric-value">{formatAmount(summary.totalOther)}</div>
          <span className="metric-subvalue">Corporate / withholding</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Filings due</span>
          </div>
          <div className="metric-value">{summary.filingsDue}</div>
          <span className="metric-subvalue">Draft</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Filings prepared</span>
          </div>
          <div className="metric-value">{summary.filingsPrepared}</div>
          <span className="metric-subvalue">Ready to file</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Filings filed</span>
          </div>
          <div className="metric-value">{summary.filingsFiled}</div>
          <span className="metric-subvalue">Filed or accepted</span>
        </article>
      </section>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Filing register</span>
            <h3>Tax filings</h3>
          </div>
          <span className="pill">{filings.length} filings</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Tax Type</th>
                <th>Period</th>
                <th>Taxable Amount</th>
                <th>Tax Payable</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Filed At</th>
                <th>Entity</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filings.length > 0 ? (
                filings.map((filing) => (
                  <tr key={filing.id}>
                    <td>
                      <span className="badge">{filing.taxType}</span>
                    </td>
                    <td>
                      {filing.periodStart} &mdash; {filing.periodEnd}
                    </td>
                    <td>{filing.totalTaxable}</td>
                    <td>{filing.totalTaxPayable}</td>
                    <td>{filing.currency}</td>
                    <td>
                      <span className={`pill ${filingStatusClass(filing.status)}`}>
                        {filing.status}
                      </span>
                    </td>
                    <td>{filing.filedAt}</td>
                    <td>{filing.companyCode}</td>
                    <td className="muted">{filing.notes || "\u2014"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={9}>
                    No tax filings have been created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Calculation ledger</span>
            <h3>Tax calculations</h3>
          </div>
          <span className="pill">{calculations.length} calculations</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Tax Type</th>
                <th>Taxable Amount</th>
                <th>Rate %</th>
                <th>Tax Amount</th>
                <th>Currency</th>
                <th>Period</th>
                <th>Entity</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {calculations.length > 0 ? (
                calculations.map((calc) => (
                  <tr key={calc.id}>
                    <td>
                      <span className={`badge ${taxTypeBadge(calc.taxType)}`}>
                        {calc.taxType}
                      </span>
                    </td>
                    <td>{calc.taxableAmount}</td>
                    <td>{calc.taxRate}%</td>
                    <td>{calc.taxAmount}</td>
                    <td>{calc.currency}</td>
                    <td>
                      {calc.periodStart} &mdash; {calc.periodEnd}
                    </td>
                    <td>{calc.companyCode}</td>
                    <td className="muted">{calc.notes || "\u2014"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={8}>
                    No tax calculations have been recorded yet.
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
