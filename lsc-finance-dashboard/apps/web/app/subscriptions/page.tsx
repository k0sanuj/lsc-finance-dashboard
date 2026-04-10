import {
  formatCurrency,
  getSubscriptionAlerts,
  getSubscriptions,
  getSubscriptionSummary
} from "@lsc/db";
import { requireRole } from "../../lib/auth";
import {
  generateSubscriptionAlertsAction,
  dismissAlertAction,
  addSubscriptionAction,
  updateSubscriptionAction,
  deleteSubscriptionAction
} from "./actions";
import { BillUploader } from "../components/bill-uploader";

const COMPANIES = ["LSC", "TBR", "XTZ", "XTE", "FSP"];

const CATEGORIES = [
  "infrastructure",
  "communication",
  "design",
  "analytics",
  "legal",
  "hr",
  "finance",
  "marketing",
  "security",
  "other"
];

function statusAccent(status: string): string {
  switch (status) {
    case "active":
      return "signal-good";
    case "trial":
      return "signal-warn";
    case "paused":
    case "pending_cancellation":
      return "signal-warn";
    case "cancelled":
      return "signal-risk";
    default:
      return "";
  }
}

type SubscriptionsPageProps = {
  searchParams?: Promise<{ status?: string; message?: string }>;
};

export default async function SubscriptionsPage({ searchParams }: SubscriptionsPageProps) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const pageParams = searchParams ? await searchParams : undefined;
  const status = pageParams?.status ?? null;
  const message = pageParams?.message ?? null;
  const [subs, summary, alerts] = await Promise.all([
    getSubscriptions(),
    getSubscriptionSummary(),
    getSubscriptionAlerts()
  ]);

  const activeCount = subs.filter((s) => s.status === "active").length;
  const categoryMax = Math.max(1, ...summary.byCategory.map((c) => c.monthlyTotal));
  const entityMax = Math.max(1, ...summary.byEntity.map((e) => e.monthlyTotal));

  // Group by entity for the org-wide dashboard breakdown
  const byEntity = COMPANIES.map((code) => {
    const list = subs.filter((s) => s.companyCode === code);
    const monthly = list.reduce(
      (sum, s) => sum + Number(String(s.monthlyCost).replace(/[^0-9.-]/g, "")),
      0
    );
    return { code, count: list.length, monthly, list };
  }).filter((g) => g.count > 0);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Software dashboard</span>
          <h3>Subscriptions &amp; Software</h3>
          <p className="muted">
            Org-wide register of every recurring software bill across LSC, TBR, XTZ,
            and FSP. Track who owns the bill, monthly run-rate, and renewal alerts.
          </p>
        </div>
        <div>
          <form action={generateSubscriptionAlertsAction}>
            <button className="action-button primary" type="submit">
              Generate alerts
            </button>
          </form>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Error" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Monthly spend</span>
          </div>
          <div className="metric-value">
            {summary.totalMonthly.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0
            })}
          </div>
          <span className="metric-subvalue">Active subscriptions</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Annualized cost</span>
          </div>
          <div className="metric-value">
            {summary.totalAnnualized.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0
            })}
          </div>
          <span className="metric-subvalue">Projected annual</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Active subscriptions</span>
          </div>
          <div className="metric-value">{activeCount}</div>
          <span className="metric-subvalue">{subs.length} total tracked</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Renewing soon</span>
          </div>
          <div className="metric-value">{summary.renewingSoon}</div>
          <span className="metric-subvalue">Within 30 days</span>
        </article>
      </section>

      {/* Org-wide entity breakdown */}
      <section className="grid-two">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Cost breakdown</span>
              <h3>Monthly spend by category</h3>
            </div>
            <span className="pill">{summary.byCategory.length} categories</span>
          </div>
          <div className="chart-list">
            {summary.byCategory.length > 0 ? (
              summary.byCategory.map((cat) => (
                <div className="chart-row" key={cat.category}>
                  <div className="chart-meta">
                    <strong>{cat.category}</strong>
                    <span>{formatCurrency(cat.monthlyTotal)}</span>
                  </div>
                  <div className="chart-track">
                    <div
                      className="chart-fill good"
                      style={{
                        width: `${Math.max(8, (cat.monthlyTotal / categoryMax) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No active subscriptions yet.</p>
            )}
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Entity breakdown</span>
              <h3>Monthly spend by entity</h3>
            </div>
            <span className="pill">{summary.byEntity.length} entities</span>
          </div>
          <div className="chart-list">
            {summary.byEntity.length > 0 ? (
              summary.byEntity.map((ent) => (
                <div className="chart-row" key={ent.companyCode}>
                  <div className="chart-meta">
                    <strong>{ent.companyCode}</strong>
                    <span>{formatCurrency(ent.monthlyTotal)}</span>
                  </div>
                  <div className="chart-track">
                    <div
                      className="chart-fill secondary"
                      style={{
                        width: `${Math.max(8, (ent.monthlyTotal / entityMax) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No active subscriptions yet.</p>
            )}
          </div>
        </article>
      </section>

      {/* Add new subscription form */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Add</span>
            <h3>New software / subscription</h3>
          </div>
        </div>
        <BillUploader
          formId="add-subscription-form"
          fieldMap={{
            vendor: "name",
            description: "notes",
            amount: "monthlyCost",
            currency: "currency",
            category: "category",
            date: "nextBillingDate"
          }}
          label="Upload software bill — AI auto-fill"
          helperText="Drop a bill (Stripe receipt, vendor invoice) and we'll pre-fill the form."
        />
        <form id="add-subscription-form" action={addSubscriptionAction}>
          <div className="form-grid">
            <label className="field">
              <span>Software name</span>
              <input
                type="text"
                name="name"
                placeholder="e.g. Linear"
                required
              />
            </label>
            <label className="field">
              <span>Provider</span>
              <input
                type="text"
                name="provider"
                placeholder="e.g. Linear Inc."
                required
              />
            </label>
            <label className="field">
              <span>Owning entity (who pays)</span>
              <select name="companyCode" defaultValue="LSC" required>
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Category</span>
              <select name="category" defaultValue="infrastructure">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Monthly cost</span>
              <input
                type="number"
                name="monthlyCost"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label className="field">
              <span>Currency</span>
              <select name="currency" defaultValue="USD">
                <option value="USD">USD</option>
                <option value="INR">INR</option>
                <option value="AED">AED</option>
              </select>
            </label>
            <label className="field">
              <span>Billing cycle</span>
              <select name="billingCycle" defaultValue="monthly">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="one_time">One-time</option>
              </select>
            </label>
            <label className="field">
              <span>Next billing date</span>
              <input type="date" name="nextBillingDate" />
            </label>
            <label className="field" style={{ gridColumn: "span 2" }}>
              <span>Notes</span>
              <input type="text" name="notes" />
            </label>
            <div className="form-actions">
              <button className="action-button primary" type="submit">
                Add subscription
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Per-entity software list */}
      {byEntity.map((group) => (
        <article className="card" key={group.code}>
          <div className="card-title-row">
            <div>
              <span className="section-kicker">{group.code}</span>
              <h3>
                {group.code} software stack
              </h3>
            </div>
            <span className="badge">
              {group.count} tools · {formatCurrency(group.monthly)} / mo
            </span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Provider</th>
                  <th>Category</th>
                  <th>Monthly</th>
                  <th>Cycle</th>
                  <th>Status</th>
                  <th>Update cost</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {group.list.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <strong>{sub.name}</strong>
                    </td>
                    <td>{sub.provider}</td>
                    <td>
                      <span className="pill subtle-pill">{sub.category}</span>
                    </td>
                    <td>
                      <strong>{sub.monthlyCost}</strong>
                    </td>
                    <td>{sub.billingCycle}</td>
                    <td>
                      <span className={`pill signal-pill ${statusAccent(sub.status)}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td>
                      <form action={updateSubscriptionAction} className="inline-actions">
                        <input type="hidden" name="id" value={sub.id} />
                        <input
                          type="number"
                          name="monthlyCost"
                          min="0"
                          step="0.01"
                          placeholder="New cost"
                          aria-label="Monthly cost"
                        />
                        <button className="action-button secondary" type="submit">
                          Set
                        </button>
                      </form>
                    </td>
                    <td>
                      <form action={updateSubscriptionAction} className="inline-actions">
                        <input type="hidden" name="id" value={sub.id} />
                        <select name="status" defaultValue="" aria-label="Status">
                          <option value="" disabled>
                            Set...
                          </option>
                          <option value="active">Active</option>
                          <option value="trial">Trial</option>
                          <option value="pending_cancellation">Cancelling</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        <button className="action-button secondary" type="submit">
                          Set
                        </button>
                      </form>
                    </td>
                    <td>
                      <form action={deleteSubscriptionAction}>
                        <input type="hidden" name="id" value={sub.id} />
                        <button className="action-button secondary" type="submit">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}

      {alerts.length > 0 ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Alerts</span>
              <h3>Subscription alerts</h3>
            </div>
            <span className="pill">{alerts.length} active</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Subscription</th>
                  <th>Alert Type</th>
                  <th>Message</th>
                  <th>Triggered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <strong>{alert.subscriptionName}</strong>
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          alert.alertType.includes("7d")
                            ? "signal-pill signal-risk"
                            : alert.alertType.includes("15d")
                              ? "signal-pill signal-warn"
                              : alert.alertType.includes("unused")
                                ? "signal-pill signal-warn"
                                : "signal-pill signal-good"
                        }`}
                      >
                        {alert.alertType}
                      </span>
                    </td>
                    <td>{alert.message}</td>
                    <td>{alert.triggeredAt}</td>
                    <td>
                      <form action={dismissAlertAction}>
                        <input name="alertId" type="hidden" value={alert.id} />
                        <button className="action-button secondary" type="submit">
                          Dismiss
                        </button>
                      </form>
                    </td>
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
