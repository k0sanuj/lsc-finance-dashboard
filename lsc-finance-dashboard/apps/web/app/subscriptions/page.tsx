import {
  formatCurrency,
  getSubscriptionAlerts,
  getSubscriptions,
  getSubscriptionSummary
} from "@lsc/db";
import { requireRole } from "../../lib/auth";
import { generateSubscriptionAlertsAction, dismissAlertAction } from "./actions";

function statusAccent(status: string): string {
  switch (status) {
    case "active":
      return "signal-good";
    case "trial":
      return "signal-warn";
    case "paused":
      return "signal-warn";
    case "cancelled":
      return "signal-risk";
    default:
      return "";
  }
}

function alertTypeAccent(alertType: string): string {
  if (alertType.includes("overdue") || alertType.includes("cancel")) return "accent-risk";
  if (alertType.includes("renew") || alertType.includes("expir")) return "accent-warn";
  return "accent-brand";
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

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Recurring spend</span>
          <h3>Subscriptions &amp; Software</h3>
          <p className="muted">
            Track all recurring subscriptions, SaaS tools, and software costs across LSC entities.
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
            {summary.totalMonthly.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          </div>
          <span className="metric-subvalue">Active subscriptions</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Annualized cost</span>
          </div>
          <div className="metric-value">
            {summary.totalAnnualized.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
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
                      style={{ width: `${Math.max(8, (cat.monthlyTotal / categoryMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No active subscriptions with category data.</p>
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
                      style={{ width: `${Math.max(8, (ent.monthlyTotal / entityMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No active subscriptions with entity data.</p>
            )}
          </div>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">All subscriptions</span>
            <h3>Full subscription register</h3>
          </div>
          <span className="pill">{subs.length} subscriptions</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Provider</th>
                <th>Entity</th>
                <th>Monthly Cost</th>
                <th>Annual Cost</th>
                <th>Billing Cycle</th>
                <th>Next Billing</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subs.length > 0 ? (
                subs.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <strong>{sub.name}</strong>
                      {sub.autoRenew ? <span className="badge" style={{ marginLeft: 6 }}>auto</span> : null}
                    </td>
                    <td>{sub.provider}</td>
                    <td>
                      <span className="subtle-pill">{sub.isShared ? "Shared" : sub.companyCode}</span>
                    </td>
                    <td>{sub.monthlyCost}</td>
                    <td>{sub.annualCost}</td>
                    <td>{sub.billingCycle}</td>
                    <td>{sub.nextBillingDate}</td>
                    <td><span className="pill">{sub.category}</span></td>
                    <td>
                      <span className={`pill signal-pill ${statusAccent(sub.status)}`}>
                        {sub.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={9}>
                    No subscriptions are currently tracked. Add subscription records to see them here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
                    <td><strong>{alert.subscriptionName}</strong></td>
                    <td>
                      <span className={`pill ${
                        alert.alertType.includes("7d") ? "signal-pill signal-risk" :
                        alert.alertType.includes("15d") ? "signal-pill signal-warn" :
                        alert.alertType.includes("unused") ? "signal-pill signal-warn" :
                        "signal-pill signal-good"
                      }`}>
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
