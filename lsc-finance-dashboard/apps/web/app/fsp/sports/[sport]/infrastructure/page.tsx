import { notFound } from "next/navigation";
import { requireRole } from "../../../../../lib/auth";
import { getSportIdByCode, getSportInfrastructure, getBroadcastSpecs } from "@lsc/db";
import { addInfrastructureAction, addBroadcastSpecAction } from "./actions";

type InfrastructurePageProps = {
  params: Promise<{ sport: string }>;
  searchParams?: Promise<{
    tab?: string;
    status?: string;
    message?: string;
  }>;
};

const TABS = [
  { key: "infrastructure", label: "Infrastructure" },
  { key: "broadcast", label: "Broadcast Specs" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function statusPillClass(s: string): string {
  if (s === "verified" || s === "complete") return "signal-pill signal-good";
  if (s === "in_progress" || s === "partial") return "signal-pill signal-warn";
  if (s === "pending" || s === "not_started") return "signal-pill signal-risk";
  return "pill";
}

export default async function SportInfrastructurePage({ params, searchParams }: InfrastructurePageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const { sport } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const activeTab = (sp?.tab ?? "infrastructure") as TabKey;
  const status = sp?.status ?? null;
  const message = sp?.message ?? null;

  const sportId = await getSportIdByCode(sport);
  if (!sportId) notFound();

  const sportLabel = sport
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const [infraItems, broadcastItems] = await Promise.all([
    getSportInfrastructure(sportId),
    getBroadcastSpecs(sportId)
  ]);

  const totalInfraCost = infraItems.reduce(
    (sum, r) => sum + Number(String(r.estimatedCost).replace(/[^0-9.-]/g, "")),
    0
  );
  const totalBroadcastCost = broadcastItems.reduce(
    (sum, r) => sum + Number(String(r.estimatedCost).replace(/[^0-9.-]/g, "")),
    0
  );
  const verifiedCount = infraItems.filter((r) => r.status === "verified" || r.status === "complete").length;

  return (
    <div className="page-grid">
      {/* Header */}
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Technical specs</span>
          <h3>{sportLabel} Infrastructure</h3>
          <p className="muted">Sport-specific infrastructure and broadcast production requirements</p>
        </div>
      </section>

      {/* Status banner */}
      {status && message && (
        <div className={`notice ${status === "error" ? "notice-risk" : "notice-good"}`}>
          {decodeURIComponent(message)}
        </div>
      )}

      {/* Stats */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline"><span className="metric-label">Infrastructure items</span></div>
          <div className="metric-value">{infraItems.length}</div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline"><span className="metric-label">Verified</span></div>
          <div className="metric-value">{verifiedCount}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline"><span className="metric-label">Infra est. cost</span></div>
          <div className="metric-value">
            {totalInfraCost.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-topline"><span className="metric-label">Broadcast est. cost</span></div>
          <div className="metric-value">
            {totalBroadcastCost.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-topline"><span className="metric-label">Broadcast specs</span></div>
          <div className="metric-value">{broadcastItems.length}</div>
        </article>
      </section>

      {/* Tabs */}
      <nav className="inline-actions">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={`/fsp/sports/${sport}/infrastructure?tab=${tab.key}`}
            className={`segment-chip${tab.key === activeTab ? " active" : ""}`}
          >
            {tab.label}
          </a>
        ))}
      </nav>

      {/* Infrastructure Tab */}
      {activeTab === "infrastructure" && (
        <>
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Sport infrastructure</span>
                <h3>Components &amp; requirements</h3>
              </div>
              <span className="badge">{infraItems.length} item{infraItems.length !== 1 ? "s" : ""}</span>
            </div>

            {infraItems.length === 0 ? (
              <p className="muted">No infrastructure items yet. Use the form below to add one.</p>
            ) : (
              <div className="table-wrapper">
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Requirement</th>
                      <th>What to Check</th>
                      <th>Verification</th>
                      <th>Est. Cost</th>
                      <th>Vendor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {infraItems.map((row) => (
                      <tr key={row.id}>
                        <td>{row.component}</td>
                        <td>{row.criticalRequirement || <span className="muted">--</span>}</td>
                        <td>{row.whatToCheck || <span className="muted">--</span>}</td>
                        <td>{row.verificationProof || <span className="muted">--</span>}</td>
                        <td>{row.estimatedCost}</td>
                        <td>{row.vendorName || <span className="muted">--</span>}</td>
                        <td><span className={statusPillClass(row.status)}>{row.status.replace(/_/g, " ")}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          {/* Add infrastructure form */}
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">New entry</span>
                <h3>Add infrastructure item</h3>
              </div>
            </div>
            <form action={addInfrastructureAction}>
              <input type="hidden" name="sport" value={sport} />
              <div className="form-grid">
                <label className="field">
                  <span>Component</span>
                  <input type="text" name="component" required placeholder="e.g. Track surface" />
                </label>
                <label className="field">
                  <span>Critical requirement</span>
                  <input type="text" name="criticalRequirement" placeholder="e.g. FIA Grade 2" />
                </label>
                <label className="field">
                  <span>What to check</span>
                  <input type="text" name="whatToCheck" placeholder="e.g. Surface grip coefficient" />
                </label>
                <label className="field">
                  <span>Verification proof</span>
                  <input type="text" name="verificationProof" placeholder="e.g. Certification document" />
                </label>
                <label className="field">
                  <span>Estimated cost ($)</span>
                  <input type="number" name="estimatedCost" step="0.01" placeholder="0.00" />
                </label>
                <label className="field">
                  <span>Vendor name</span>
                  <input type="text" name="vendorName" placeholder="e.g. TrackTech Inc" />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select name="status">
                    <option value="pending">Pending</option>
                    <option value="in_progress">In progress</option>
                    <option value="verified">Verified</option>
                    <option value="complete">Complete</option>
                  </select>
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="action-button">Add item</button>
              </div>
            </form>
          </article>
        </>
      )}

      {/* Broadcast Specs Tab */}
      {activeTab === "broadcast" && (
        <>
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Broadcast production</span>
                <h3>Technical specifications</h3>
              </div>
              <span className="badge">{broadcastItems.length} spec{broadcastItems.length !== 1 ? "s" : ""}</span>
            </div>

            {broadcastItems.length === 0 ? (
              <p className="muted">No broadcast specs yet. Use the form below to add one.</p>
            ) : (
              <div className="table-wrapper">
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Spec</th>
                      <th>Technical Requirement</th>
                      <th>What to Check</th>
                      <th>Est. Cost</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {broadcastItems.map((row) => (
                      <tr key={row.id}>
                        <td><span className="pill">{row.category}</span></td>
                        <td>{row.specName}</td>
                        <td>{row.technicalRequirement || <span className="muted">--</span>}</td>
                        <td>{row.whatToCheck || <span className="muted">--</span>}</td>
                        <td>{row.estimatedCost}</td>
                        <td><span className={statusPillClass(row.status)}>{row.status.replace(/_/g, " ")}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          {/* Add broadcast spec form */}
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">New entry</span>
                <h3>Add broadcast spec</h3>
              </div>
            </div>
            <form action={addBroadcastSpecAction}>
              <input type="hidden" name="sport" value={sport} />
              <div className="form-grid">
                <label className="field">
                  <span>Category</span>
                  <input type="text" name="category" placeholder="e.g. Camera systems" />
                </label>
                <label className="field">
                  <span>Spec name</span>
                  <input type="text" name="specName" required placeholder="e.g. 4K broadcast cameras" />
                </label>
                <label className="field">
                  <span>Technical requirement</span>
                  <input type="text" name="technicalRequirement" placeholder="e.g. Minimum 4K @ 60fps" />
                </label>
                <label className="field">
                  <span>What to check</span>
                  <input type="text" name="whatToCheck" placeholder="e.g. Resolution test footage" />
                </label>
                <label className="field">
                  <span>Estimated cost ($)</span>
                  <input type="number" name="estimatedCost" step="0.01" placeholder="0.00" />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select name="status">
                    <option value="pending">Pending</option>
                    <option value="in_progress">In progress</option>
                    <option value="verified">Verified</option>
                    <option value="complete">Complete</option>
                  </select>
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="action-button">Add spec</button>
              </div>
            </form>
          </article>
        </>
      )}
    </div>
  );
}
