import { requireRole } from "../../../lib/auth";
import { queryRows } from "@lsc/db";
import { formatCurrency, formatDateLabel, getBackend } from "@lsc/db";

type SpMultiplierRow = {
  id: string;
  multiplierRatio: number;
  triggerThreshold: string;
  isActive: boolean;
  notes: string;
  updatedAt: string;
};

type SpReleaseRow = {
  id: string;
  spAmount: string;
  revenueAmount: string;
  spRevenueRatio: number;
  releaseReason: string;
  createdAt: string;
};

async function getSpMultipliers(): Promise<SpMultiplierRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    multiplier_ratio: string;
    trigger_threshold: string;
    is_active: boolean;
    notes: string | null;
    updated_at: string;
  }>(
    `select spm.id, spm.multiplier_ratio, spm.trigger_threshold,
            spm.is_active, spm.notes, spm.updated_at::text
     from sp_multipliers spm
     join companies c on c.id = spm.company_id
     where c.code = 'FSP'::company_code
     order by spm.updated_at desc`
  );

  return rows.map((r) => ({
    id: r.id,
    multiplierRatio: Number(r.multiplier_ratio),
    triggerThreshold: formatCurrency(r.trigger_threshold),
    isActive: r.is_active,
    notes: r.notes ?? "",
    updatedAt: formatDateLabel(r.updated_at)
  }));
}

async function getSpReleaseLog(): Promise<SpReleaseRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    sp_amount: string;
    revenue_amount: string;
    sp_revenue_ratio: string | null;
    release_reason: string | null;
    created_at: string;
  }>(
    `select srl.id, srl.sp_amount, srl.revenue_amount,
            srl.sp_revenue_ratio, srl.release_reason, srl.created_at::text
     from sp_release_log srl
     join companies c on c.id = srl.company_id
     where c.code = 'FSP'::company_code
     order by srl.created_at desc
     limit 50`
  );

  return rows.map((r) => ({
    id: r.id,
    spAmount: formatCurrency(r.sp_amount),
    revenueAmount: formatCurrency(r.revenue_amount),
    spRevenueRatio: Number(r.sp_revenue_ratio ?? 0),
    releaseReason: r.release_reason ?? "",
    createdAt: formatDateLabel(r.created_at)
  }));
}

export default async function SpMultiplierPage() {
  await requireRole(["super_admin", "finance_admin"]);

  const [multipliers, releaseLog] = await Promise.all([
    getSpMultipliers(),
    getSpReleaseLog()
  ]);

  const activeConfig = multipliers.find((m) => m.isActive);
  const totalReleased = releaseLog.reduce((sum, r) => {
    const n = Number(r.spAmount.replace(/[^0-9.-]/g, ""));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <div className="page-grid">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">FSP finance</span>
          <h3>SP Multiplier System</h3>
          <p className="muted">Sports Points configuration, release controls, and circulation tracking.</p>
        </div>
      </header>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Current multiplier</span>
          </div>
          <div className="metric-value">
            {activeConfig ? `${activeConfig.multiplierRatio}x` : "Not set"}
          </div>
          <span className="metric-subvalue">
            {activeConfig ? `Threshold: ${activeConfig.triggerThreshold}` : "No active config"}
          </span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Configurations</span>
          </div>
          <div className="metric-value">{multipliers.length}</div>
          <span className="metric-subvalue">{multipliers.filter((m) => m.isActive).length} active</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Total SP released</span>
          </div>
          <div className="metric-value">
            {totalReleased.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          </div>
          <span className="metric-subvalue">{releaseLog.length} releases</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Release history</span>
          </div>
          <div className="metric-value">{releaseLog.length}</div>
          <span className="metric-subvalue">All-time events</span>
        </article>
      </section>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Multiplier configuration</span>
            <h3>SP ratio rules</h3>
          </div>
          <span className="pill">FSP</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Ratio</th>
                <th>Threshold</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {multipliers.length > 0 ? (
                multipliers.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.multiplierRatio}x</strong></td>
                    <td>{m.triggerThreshold}</td>
                    <td>
                      {m.isActive ? (
                        <span className="pill signal-pill signal-good">Active</span>
                      ) : (
                        <span className="pill subtle-pill">Inactive</span>
                      )}
                    </td>
                    <td className="muted">{m.notes || "—"}</td>
                    <td>{m.updatedAt}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={5}>No SP multiplier configurations found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Release log</span>
            <h3>SP release history</h3>
          </div>
          <span className="badge">{releaseLog.length} events</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>SP Amount</th>
                <th>Revenue</th>
                <th>SP/Revenue ratio</th>
                <th>Reason</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {releaseLog.length > 0 ? (
                releaseLog.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.spAmount}</strong></td>
                    <td>{r.revenueAmount}</td>
                    <td>
                      <span className={`pill ${
                        r.spRevenueRatio > 2 ? "signal-pill signal-risk" :
                        r.spRevenueRatio > 1 ? "signal-pill signal-warn" :
                        "signal-pill signal-good"
                      }`}>
                        {r.spRevenueRatio.toFixed(2)}x
                      </span>
                    </td>
                    <td className="muted">{r.releaseReason || "—"}</td>
                    <td>{r.createdAt}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={5}>No SP releases recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
