import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "../../../../lib/auth";
import {
  getSportIdByCode, getSportPnlLineItems, getSportSponsorships,
  getSportLeaguePayroll, getSportTechPayroll, getSportRevenueShare,
  getSportEventConfig, getFspSports, getSportOpexItems, getSportEventProduction,
  getFspSportBudgetVariance,
  getSportMediaRevenue, getSportInfluencerEconomics
} from "@lsc/db";
import { BudgetVarianceTable } from "../../../components/budget-variance-table";
import {
  addPnlLineItemAction, updatePnlLineItemAction, deletePnlLineItemAction,
  addSponsorshipAction, updateSponsorshipStatusAction,
  updateSponsorshipAction, archiveSponsorshipAction, uploadSponsorshipContractAction,
  addLeagueRoleAction, addTechRoleAction,
  updateRevenueShareAction, updateEventConfigAction,
  addOpexItemAction, addProductionItemAction,
  upsertMediaRevenueAction, addInfluencerAction, deleteInfluencerAction
} from "./actions";

const TABS = [
  { key: "summary", label: "P&L Summary" },
  { key: "sponsorship", label: "Sponsorship" },
  { key: "media", label: "Media Revenue" },
  { key: "opex", label: "OPEX Detailed" },
  { key: "production", label: "Event Production" },
  { key: "league-payroll", label: "League Payroll" },
  { key: "tech", label: "Tech Services" },
  { key: "revenue-share", label: "Revenue Share" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function fmt(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function parseNum(v: string): number {
  return Number(String(v).replace(/[^0-9.\-]/g, "")) || 0;
}

/* ─── P&L Summary Tab ──────────────────────────────────────── */

async function PnlSummaryTab({ sportId, sportCode }: { sportId: string; sportCode: string }): Promise<React.ReactElement> {
  const [items, variance] = await Promise.all([
    getSportPnlLineItems(sportId, "base"),
    getFspSportBudgetVariance(sportId),
  ]);

  const varianceRows = variance.map((v) => ({
    label: v.category,
    sublabel: `${v.section}`,
    approved: v.y1Budget,
    actual: v.y1Actual,
    variance: v.y1Variance,
    variancePct: v.y1VariancePct,
    signal: v.signal,
  }));

  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    const section = item.section.toLowerCase();
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(item);
  }

  const sectionTotal = (section: string): { y1: number; y2: number; y3: number } => {
    const rows = grouped[section] ?? [];
    return {
      y1: rows.reduce((s, r) => s + r.y1Budget, 0),
      y2: rows.reduce((s, r) => s + r.y2Budget, 0),
      y3: rows.reduce((s, r) => s + r.y3Budget, 0),
    };
  };

  const revenue = sectionTotal("revenue");
  const cogs = sectionTotal("cogs");
  const opex = sectionTotal("opex");

  const ebitda = {
    y1: revenue.y1 - cogs.y1 - opex.y1,
    y2: revenue.y2 - cogs.y2 - opex.y2,
    y3: revenue.y3 - cogs.y3 - opex.y3,
  };

  const margin = {
    y1: revenue.y1 ? (ebitda.y1 / revenue.y1) * 100 : 0,
    y2: revenue.y2 ? (ebitda.y2 / revenue.y2) * 100 : 0,
    y3: revenue.y3 ? (ebitda.y3 / revenue.y3) * 100 : 0,
  };

  const sections = [
    { title: "Revenue", key: "revenue", total: revenue },
    { title: "COGS", key: "cogs", total: cogs },
    { title: "OPEX", key: "opex", total: opex },
  ];

  const ebitdaSignal = (val: number): string =>
    val >= 0 ? "signal-pill signal-good" : "signal-pill signal-risk";

  return (
    <>
      {sections.map(({ title, key, total }) => {
        const rows = grouped[key] ?? [];
        return (
          <article className="card" key={key}>
            <div className="card-title-row">
              <h3>{title}</h3>
            </div>
            {rows.length === 0 ? (
              <p className="notice">No {title.toLowerCase()} line items yet. Use the form below to add one.</p>
            ) : (
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Line Item</th>
                      <th className="text-right">Y1 Budget</th>
                      <th className="text-right">Y2 Budget</th>
                      <th className="text-right">Y3 Budget</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.subCategory || row.category}</td>
                        <td className="text-right" colSpan={3}>
                          <form action={updatePnlLineItemAction} className="inline-actions">
                            <input type="hidden" name="itemId" value={row.id} />
                            <input type="hidden" name="sport" value={sportCode} />
                            <input name="y1Budget" type="number" defaultValue={row.y1Budget} step="0.01" className="input-budget" />
                            <input name="y2Budget" type="number" defaultValue={row.y2Budget} step="0.01" className="input-budget" />
                            <input name="y3Budget" type="number" defaultValue={row.y3Budget} step="0.01" className="input-budget" />
                            <button className="action-button secondary" type="submit">Save</button>
                          </form>
                        </td>
                        <td>
                          <form action={deletePnlLineItemAction} className="inline-actions">
                            <input type="hidden" name="itemId" value={row.id} />
                            <input type="hidden" name="sport" value={sportCode} />
                            <button className="action-button secondary" type="submit" title="Delete line item">&times;</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                    <tr className="row-total">
                      <td>Total {title}</td>
                      <td className="text-right">{fmt(total.y1)}</td>
                      <td className="text-right">{fmt(total.y2)}</td>
                      <td className="text-right">{fmt(total.y3)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <form action={addPnlLineItemAction}>
              <input type="hidden" name="sport" value={sportCode} />
              <input type="hidden" name="section" value={key} />
              <div className="form-grid">
                <div className="field">
                  <label>Category Name</label>
                  <input name="category" type="text" required placeholder={`New ${title.toLowerCase()} item`} />
                </div>
                <div className="field">
                  <label>Y1 Budget</label>
                  <input name="y1Budget" type="number" step="0.01" defaultValue="0" />
                </div>
                <div className="field">
                  <label>Y2 Budget</label>
                  <input name="y2Budget" type="number" step="0.01" defaultValue="0" />
                </div>
                <div className="field">
                  <label>Y3 Budget</label>
                  <input name="y3Budget" type="number" step="0.01" defaultValue="0" />
                </div>
                <div className="form-actions">
                  <button className="action-button primary" type="submit">Add Line Item</button>
                </div>
              </div>
            </form>
          </article>
        );
      })}

      {/* EBITDA Summary */}
      <article className="card">
        <div className="card-title-row">
          <h3>EBITDA</h3>
        </div>
        <div className="stats-grid compact-stats">
          <div className="metric-card accent-brand">
            <span className="metric-label">Y1 EBITDA</span>
            <span className="metric-value">
              <span className={ebitdaSignal(ebitda.y1)}>{fmt(ebitda.y1)}</span>
            </span>
            <span className="metric-subvalue">Margin: {fmtPct(margin.y1)}</span>
          </div>
          <div className="metric-card accent-brand">
            <span className="metric-label">Y2 EBITDA</span>
            <span className="metric-value">
              <span className={ebitdaSignal(ebitda.y2)}>{fmt(ebitda.y2)}</span>
            </span>
            <span className="metric-subvalue">Margin: {fmtPct(margin.y2)}</span>
          </div>
          <div className="metric-card accent-brand">
            <span className="metric-label">Y3 EBITDA</span>
            <span className="metric-value">
              <span className={ebitdaSignal(ebitda.y3)}>{fmt(ebitda.y3)}</span>
            </span>
            <span className="metric-subvalue">Margin: {fmtPct(margin.y3)}</span>
          </div>
        </div>
      </article>

      {/* Budget vs Actual (Y1) */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Budget vs Actual — Y1</span>
            <h3>Line-item variance</h3>
          </div>
        </div>
        <BudgetVarianceTable
          rows={varianceRows}
          labelHeader="Line item"
          emptyMessage="No Y1 actuals posted yet — variance tracking activates once actuals begin."
        />
      </article>
    </>
  );
}

/* ─── Sponsorship Tab ──────────────────────────────────────── */

async function SponsorshipTab({ sportId, sportCode }: { sportId: string; sportCode: string }): Promise<React.ReactElement> {
  const rows = await getSportSponsorships(sportId);

  const totalY1 = rows.reduce((s, r) => s + parseNum(r.y1Value), 0);
  const totalY2 = rows.reduce((s, r) => s + parseNum(r.y2Value), 0);
  const totalY3 = rows.reduce((s, r) => s + parseNum(r.y3Value), 0);

  const statusPill = (status: string): string => {
    if (status === "signed") return "signal-pill signal-good";
    if (status === "in negotiation") return "signal-pill signal-warn";
    return "signal-pill signal-risk";
  };

  return (
    <>
      <article className="card">
        <div className="card-title-row">
          <h3>Sponsorship Revenue</h3>
        </div>
        {rows.length === 0 ? (
          <p className="notice">No sponsorship deals yet. Add your first sponsorship below.</p>
        ) : (
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Segment</th>
                  <th>Sponsor</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th className="text-right">Y1</th>
                  <th className="text-right">Y2</th>
                  <th className="text-right">Y3</th>
                  <th>Contract</th>
                  <th>Payment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const statusLower = r.contractStatus.replace(/ /g, "_").toLowerCase();
                  const isArchived = statusLower === "archived";
                  return (
                  <tr key={r.id} className={isArchived ? "row-archived" : undefined}>
                    <td>{r.segment}</td>
                    <td>{r.sponsorName || <span className="muted">TBD</span>}</td>
                    <td><span className="pill">{r.tier}</span></td>
                    <td><span className={statusPill(r.contractStatus)}>{r.contractStatus}</span></td>
                    <td className="text-right">{r.y1Value}</td>
                    <td className="text-right">{r.y2Value}</td>
                    <td className="text-right">{r.y3Value}</td>
                    <td>
                      {r.contractStart && r.contractEnd
                        ? `${r.contractStart} - ${r.contractEnd}`
                        : <span className="muted">--</span>}
                    </td>
                    <td>{r.paymentSchedule || <span className="muted">--</span>}</td>
                    <td>
                      <details className="sponsorship-edit">
                        <summary className="btn-inline">Manage</summary>
                        <div className="sponsorship-edit-body">
                          <form action={updateSponsorshipStatusAction} className="inline-actions mb-sm">
                            <input type="hidden" name="sponsorshipId" value={r.id} />
                            <input type="hidden" name="sport" value={sportCode} />
                            <select
                              name="newStatus"
                              defaultValue={statusLower}
                              aria-label={`Update status for ${r.segment}`}
                              className="inline-select"
                            >
                              <option value="pipeline">Pipeline</option>
                              <option value="loi">LOI</option>
                              <option value="signed">Signed</option>
                              <option value="active">Active</option>
                              <option value="expired">Expired</option>
                              <option value="archived">Archived</option>
                            </select>
                            <button className="btn-inline" type="submit">Save status</button>
                          </form>

                          <form action={updateSponsorshipAction} className="form-grid mt-sm">
                            <input type="hidden" name="sponsorshipId" value={r.id} />
                            <input type="hidden" name="sport" value={sportCode} />
                            <label className="field">
                              <span>Segment</span>
                              <input name="segment" type="text" defaultValue={r.segment} required />
                            </label>
                            <label className="field">
                              <span>Sponsor name</span>
                              <input name="sponsorName" type="text" defaultValue={r.sponsorName ?? ""} />
                            </label>
                            <label className="field">
                              <span>Tier</span>
                              <select name="tier" defaultValue={r.tier}>
                                <option value="title">Title</option>
                                <option value="presenting">Presenting</option>
                                <option value="official">Official</option>
                                <option value="associate">Associate</option>
                              </select>
                            </label>
                            <label className="field">
                              <span>Status</span>
                              <select name="contractStatus" defaultValue={statusLower}>
                                <option value="pipeline">Pipeline</option>
                                <option value="loi">LOI</option>
                                <option value="signed">Signed</option>
                                <option value="active">Active</option>
                                <option value="expired">Expired</option>
                                <option value="archived">Archived</option>
                              </select>
                            </label>
                            <label className="field">
                              <span>Y1 value</span>
                              <input name="y1Value" type="number" step="0.01" defaultValue={r.y1Value} />
                            </label>
                            <label className="field">
                              <span>Y2 value</span>
                              <input name="y2Value" type="number" step="0.01" defaultValue={r.y2Value} />
                            </label>
                            <label className="field">
                              <span>Y3 value</span>
                              <input name="y3Value" type="number" step="0.01" defaultValue={r.y3Value} />
                            </label>
                            <label className="field">
                              <span>Contract start</span>
                              <input name="contractStart" type="date" defaultValue={r.contractStart ?? ""} />
                            </label>
                            <label className="field">
                              <span>Contract end</span>
                              <input name="contractEnd" type="date" defaultValue={r.contractEnd ?? ""} />
                            </label>
                            <label className="field field-span-2">
                              <span>Payment schedule</span>
                              <input name="paymentSchedule" type="text" defaultValue={r.paymentSchedule ?? ""} placeholder="e.g. Quarterly" />
                            </label>
                            <label className="field field-span-full">
                              <span>Deliverables</span>
                              <textarea name="deliverables" rows={2} defaultValue={r.deliverablesSummary ?? ""} />
                            </label>
                            <div className="form-actions">
                              <button className="action-button primary" type="submit">Save changes</button>
                            </div>
                          </form>

                          <form
                            action={uploadSponsorshipContractAction}
                            className="mt-md"
                            encType="multipart/form-data"
                          >
                            <input type="hidden" name="sponsorshipId" value={r.id} />
                            <input type="hidden" name="sport" value={sportCode} />
                            <label className="field">
                              <span>Upload / replace contract</span>
                              <input name="contract" type="file" accept="application/pdf,image/*,.doc,.docx" />
                            </label>
                            <div className="form-actions mt-sm">
                              <button className="btn-inline" type="submit">Link contract</button>
                              {r.documentId ? (
                                <span className="muted text-xs">contract on file</span>
                              ) : null}
                            </div>
                          </form>

                          {!isArchived ? (
                            <form action={archiveSponsorshipAction} className="mt-md">
                              <input type="hidden" name="sponsorshipId" value={r.id} />
                              <input type="hidden" name="sport" value={sportCode} />
                              <button className="action-button secondary" type="submit">
                                Archive sponsorship
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </details>
                    </td>
                  </tr>
                  );
                })}
                <tr className="row-total">
                  <td colSpan={4}>Total Sponsorship Revenue</td>
                  <td className="text-right">{fmt(totalY1)}</td>
                  <td className="text-right">{fmt(totalY2)}</td>
                  <td className="text-right">{fmt(totalY3)}</td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="card">
        <div className="card-title-row">
          <h3>Add Sponsorship</h3>
        </div>
        <form action={addSponsorshipAction}>
          <input type="hidden" name="sport" value={sportCode} />
          <div className="form-grid">
            <div className="field">
              <label>Segment</label>
              <input name="segment" type="text" required placeholder="e.g. Title Sponsor" />
            </div>
            <div className="field">
              <label>Sponsor Name</label>
              <input name="sponsorName" type="text" placeholder="Company name (or leave blank for TBD)" />
            </div>
            <div className="field">
              <label>Tier</label>
              <select name="tier">
                <option value="title">Title</option>
                <option value="presenting">Presenting</option>
                <option value="official">Official</option>
                <option value="media">Media</option>
                <option value="supporting">Supporting</option>
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select name="contractStatus">
                <option value="pipeline">Pipeline</option>
                <option value="in_negotiation">In Negotiation</option>
                <option value="signed">Signed</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div className="field">
              <label>Y1 Value</label>
              <input name="y1Value" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Y2 Value</label>
              <input name="y2Value" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Y3 Value</label>
              <input name="y3Value" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Contract Start</label>
              <input name="contractStart" type="date" />
            </div>
            <div className="field">
              <label>Contract End</label>
              <input name="contractEnd" type="date" />
            </div>
            <div className="field">
              <label>Payment Schedule</label>
              <input name="paymentSchedule" type="text" placeholder="e.g. Quarterly" />
            </div>
            <div className="field field-span-full">
              <label>Deliverables</label>
              <textarea name="deliverables" rows={2} placeholder="Sponsorship deliverables summary" />
            </div>
            <div className="form-actions">
              <button className="action-button primary" type="submit">Add Sponsorship</button>
            </div>
          </div>
        </form>
      </article>
    </>
  );
}

/* ─── Media Revenue Tab ───────────────────────────────────── */

async function MediaRevenueTab({
  sportId,
  sportCode,
}: {
  sportId: string;
  sportCode: string;
}): Promise<React.ReactElement> {
  const [media, influencers] = await Promise.all([
    getSportMediaRevenue(sportId),
    getSportInfluencerEconomics(sportId),
  ]);

  const nonLinear = media.find((m) => m.channel === "non_linear");
  const linear = media.find((m) => m.channel === "linear");

  const totalMediaY1 = (nonLinear?.revenueY1 ?? 0) + (linear?.revenueY1 ?? 0);
  const totalMediaY2 = (nonLinear?.revenueY2 ?? 0) + (linear?.revenueY2 ?? 0);
  const totalMediaY3 = (nonLinear?.revenueY3 ?? 0) + (linear?.revenueY3 ?? 0);

  const totalInfluencerAnnualValue = influencers.reduce(
    (s, r) => s + r.estAnnualValue,
    0
  );

  function renderChannel(
    label: string,
    channel: "non_linear" | "linear",
    row: typeof nonLinear
  ) {
    return (
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">CPM model</span>
            <h3>{label}</h3>
          </div>
          <span className="muted text-xs">
            Revenue = impressions / 1000 × CPM
          </span>
        </div>
        <form action={upsertMediaRevenueAction}>
          <input type="hidden" name="sport" value={sportCode} />
          <input type="hidden" name="channel" value={channel} />
          <div className="form-grid">
            <label className="field">
              <span>Avg viewership</span>
              <input
                name="avgViewership"
                type="number"
                step="1"
                defaultValue={row?.avgViewership ?? 0}
              />
            </label>
            <label className="field">
              <span>Ad impressions Y1</span>
              <input name="impressionsY1" type="number" step="1" defaultValue={row?.impressionsY1 ?? 0} />
            </label>
            <label className="field">
              <span>Ad impressions Y2</span>
              <input name="impressionsY2" type="number" step="1" defaultValue={row?.impressionsY2 ?? 0} />
            </label>
            <label className="field">
              <span>Ad impressions Y3</span>
              <input name="impressionsY3" type="number" step="1" defaultValue={row?.impressionsY3 ?? 0} />
            </label>
            <label className="field">
              <span>CPM Y1 ($)</span>
              <input name="cpmY1" type="number" step="0.01" defaultValue={row?.cpmY1 ?? 0} />
            </label>
            <label className="field">
              <span>CPM Y2 ($)</span>
              <input name="cpmY2" type="number" step="0.01" defaultValue={row?.cpmY2 ?? 0} />
            </label>
            <label className="field">
              <span>CPM Y3 ($)</span>
              <input name="cpmY3" type="number" step="0.01" defaultValue={row?.cpmY3 ?? 0} />
            </label>
            <label className="field field-span-full">
              <span>Notes</span>
              <input name="notes" type="text" defaultValue={row?.notes ?? ""} placeholder="Optional commentary" />
            </label>
            <div className="form-actions">
              <button className="action-button primary" type="submit">Save {label}</button>
            </div>
          </div>
        </form>

        <div className="stats-grid compact-stats mt-md">
          <div className="metric-card accent-good">
            <span className="metric-label">Y1 revenue</span>
            <span className="metric-value">{fmt(row?.revenueY1 ?? 0)}</span>
          </div>
          <div className="metric-card accent-good">
            <span className="metric-label">Y2 revenue</span>
            <span className="metric-value">{fmt(row?.revenueY2 ?? 0)}</span>
          </div>
          <div className="metric-card accent-good">
            <span className="metric-label">Y3 revenue</span>
            <span className="metric-value">{fmt(row?.revenueY3 ?? 0)}</span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <>
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Media revenue — totals</span>
            <h3>Combined CPM revenue ({sportCode})</h3>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <div className="metric-card accent-brand">
            <span className="metric-label">Y1</span>
            <span className="metric-value">{fmt(totalMediaY1)}</span>
          </div>
          <div className="metric-card accent-brand">
            <span className="metric-label">Y2</span>
            <span className="metric-value">{fmt(totalMediaY2)}</span>
          </div>
          <div className="metric-card accent-brand">
            <span className="metric-label">Y3</span>
            <span className="metric-value">{fmt(totalMediaY3)}</span>
          </div>
          <div className="metric-card accent-warn">
            <span className="metric-label">Influencer value / yr</span>
            <span className="metric-value">{fmt(totalInfluencerAnnualValue)}</span>
          </div>
        </div>
      </article>

      {renderChannel("Non-Linear (OTT / Streaming)", "non_linear", nonLinear)}
      {renderChannel("Linear (Traditional TV)", "linear", linear)}

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Influencer economics</span>
            <h3>Creator tier mix</h3>
          </div>
          <span className="muted text-xs">
            Value = creators × posts × cost × brand-deal split
          </span>
        </div>
        {influencers.length === 0 ? (
          <p className="muted">No creator tiers configured yet. Add one below.</p>
        ) : (
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Creators</th>
                  <th>Avg followers</th>
                  <th>Posts / yr</th>
                  <th className="text-right">Cost / post</th>
                  <th className="text-right">Engagement</th>
                  <th className="text-right">Brand split</th>
                  <th className="text-right">Annual cost</th>
                  <th className="text-right">Est. annual value</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {influencers.map((r) => (
                  <tr key={r.id}>
                    <td><span className="pill">{r.creatorTier}</span></td>
                    <td>{r.creatorsCount}</td>
                    <td>{r.avgFollowers.toLocaleString("en-US")}</td>
                    <td>{r.postsPerYear}</td>
                    <td className="text-right">{fmt(r.costPerPostUsd)}</td>
                    <td className="text-right">{r.engagementRatePct.toFixed(1)}%</td>
                    <td className="text-right">{r.brandDealSplitPct.toFixed(0)}%</td>
                    <td className="text-right">{fmt(r.annualCost)}</td>
                    <td className="text-right"><strong>{fmt(r.estAnnualValue)}</strong></td>
                    <td>
                      <form action={deleteInfluencerAction} className="inline-actions">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="sport" value={sportCode} />
                        <button className="btn-inline" type="submit">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={addInfluencerAction} className="mt-lg">
          <input type="hidden" name="sport" value={sportCode} />
          <div className="form-grid">
            <label className="field">
              <span>Creator tier</span>
              <select name="creatorTier" defaultValue="micro">
                <option value="nano">Nano (1K–10K)</option>
                <option value="micro">Micro (10K–100K)</option>
                <option value="mid">Mid (100K–500K)</option>
                <option value="macro">Macro (500K–1M)</option>
                <option value="mega">Mega (1M+)</option>
              </select>
            </label>
            <label className="field">
              <span>Creators count</span>
              <input name="creatorsCount" type="number" step="1" defaultValue="5" />
            </label>
            <label className="field">
              <span>Avg followers</span>
              <input name="avgFollowers" type="number" step="1" defaultValue="50000" />
            </label>
            <label className="field">
              <span>Posts / year</span>
              <input name="postsPerYear" type="number" step="1" defaultValue="24" />
            </label>
            <label className="field">
              <span>Cost / post (USD)</span>
              <input name="costPerPostUsd" type="number" step="0.01" defaultValue="250" />
            </label>
            <label className="field">
              <span>Engagement rate (%)</span>
              <input name="engagementRatePct" type="number" step="0.1" defaultValue="3.5" />
            </label>
            <label className="field">
              <span>Brand-deal split (%)</span>
              <input name="brandDealSplitPct" type="number" step="1" defaultValue="50" />
            </label>
            <label className="field field-span-full">
              <span>Notes</span>
              <input name="notes" type="text" placeholder="Optional commentary" />
            </label>
            <div className="form-actions">
              <button className="action-button primary" type="submit">Add creator tier</button>
            </div>
          </div>
        </form>
      </article>
    </>
  );
}

/* ─── OPEX Detailed Tab ───────────────────────────────────── */

async function OpexDetailedTab({ sportId, sportCode }: { sportId: string; sportCode: string }): Promise<React.ReactElement> {
  const items = await getSportOpexItems(sportId);

  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    if (!grouped[item.opexCategory]) grouped[item.opexCategory] = [];
    grouped[item.opexCategory].push(item);
  }
  const categories = Object.keys(grouped).sort();

  const opexCategoryOptions = [
    "Social Media Marketing", "PR", "Media & Entertainment",
    "Legal & Compliance", "Insurance", "Merchandising", "Other",
  ];

  return (
    <>
      {categories.length === 0 ? (
        <article className="card">
          <div className="card-title-row">
            <h3>OPEX Items</h3>
          </div>
          <p className="notice">No OPEX items yet. Use the form below to add your first item.</p>
        </article>
      ) : (
        categories.map((cat) => {
          const rows = grouped[cat];
          const catY1 = rows.reduce((s, r) => s + r.y1Budget, 0);
          const catY2 = rows.reduce((s, r) => s + r.y2Budget, 0);
          const catY3 = rows.reduce((s, r) => s + r.y3Budget, 0);
          return (
            <article className="card" key={cat}>
              <div className="card-title-row">
                <h3>{cat}</h3>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Sub-Category</th>
                      <th className="text-right">Y1</th>
                      <th className="text-right">Y2</th>
                      <th className="text-right">Y3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.subCategory}</td>
                        <td className="text-right">{fmt(r.y1Budget)}</td>
                        <td className="text-right">{fmt(r.y2Budget)}</td>
                        <td className="text-right">{fmt(r.y3Budget)}</td>
                      </tr>
                    ))}
                    <tr className="row-total">
                      <td>{cat} Sub-Total</td>
                      <td className="text-right">{fmt(catY1)}</td>
                      <td className="text-right">{fmt(catY2)}</td>
                      <td className="text-right">{fmt(catY3)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          );
        })
      )}

      <article className="card">
        <div className="card-title-row">
          <h3>Add OPEX Item</h3>
        </div>
        <form action={addOpexItemAction}>
          <input type="hidden" name="sport" value={sportCode} />
          <div className="form-grid">
            <div className="field">
              <label>Category</label>
              <select name="opexCategory" required>
                <option value="">Select category</option>
                {opexCategoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Sub-Category</label>
              <input name="subCategory" type="text" required placeholder="e.g. Facebook Ads" />
            </div>
            <div className="field">
              <label>Y1 Budget</label>
              <input name="y1Budget" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Y2 Budget</label>
              <input name="y2Budget" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Y3 Budget</label>
              <input name="y3Budget" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="form-actions">
              <button className="action-button primary" type="submit">Add OPEX Item</button>
            </div>
          </div>
        </form>
      </article>
    </>
  );
}

/* ─── Event Production Tab ────────────────────────────────── */

async function EventProductionTab({ sportId, sportCode }: { sportId: string; sportCode: string }): Promise<React.ReactElement> {
  const prodItems = await getSportEventProduction(sportId);
  const config = await getSportEventConfig(sportId);

  const productionCategoryOptions = [
    "Fabrication", "AV", "Print", "Staffing", "Miscellaneous",
    "Permissions & Insurance", "Multimedia", "Fees", "DJ Booth",
  ];

  const prodTotal = prodItems.reduce((s, r) => s + r.lineTotal, 0);
  const segmentCount = config?.segmentsPerEvent ?? 1;
  const perSegmentTotal = prodTotal;
  const allSegmentsTotal = perSegmentTotal * segmentCount;
  const venueCost = config ? parseNum(config.venueCostPerEvent) : 0;
  const grandTotal = allSegmentsTotal + venueCost;

  return (
    <>
      {/* Event Config Card */}
      <article className="card">
        <div className="card-title-row">
          <h3>Event Configuration</h3>
        </div>
        <form action={updateEventConfigAction}>
          <input type="hidden" name="sport" value={sportCode} />
          <div className="form-grid">
            <div className="field">
              <label>Segments per Event</label>
              <input name="segments" type="number" defaultValue={config?.segmentsPerEvent ?? 4} min="1" />
            </div>
            <div className="field">
              <label>Events / Year 1</label>
              <input name="eventsY1" type="number" defaultValue={config?.eventsY1 ?? 1} min="0" />
            </div>
            <div className="field">
              <label>Events / Year 2</label>
              <input name="eventsY2" type="number" defaultValue={config?.eventsY2 ?? 2} min="0" />
            </div>
            <div className="field">
              <label>Events / Year 3</label>
              <input name="eventsY3" type="number" defaultValue={config?.eventsY3 ?? 4} min="0" />
            </div>
            <div className="field">
              <label>Venue Cost per Event</label>
              <input name="venueCost" type="number" step="0.01" defaultValue={venueCost} />
            </div>
            <div className="form-actions">
              <button className="action-button primary" type="submit">Save Config</button>
            </div>
          </div>
        </form>
      </article>

      {/* Production Items Table */}
      <article className="card">
        <div className="card-title-row">
          <h3>Production Items</h3>
        </div>
        {prodItems.length === 0 ? (
          <p className="notice">No production items yet. Add items using the form below.</p>
        ) : (
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Item</th>
                  <th className="text-right">Unit Cost</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {prodItems.map((r) => (
                  <tr key={r.id}>
                    <td><span className="subtle-pill">{r.costCategory}</span></td>
                    <td>{r.subCategory}</td>
                    <td className="text-right">{fmt(r.unitCost)}</td>
                    <td className="text-right">{r.quantity}</td>
                    <td className="text-right">{fmt(r.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {prodItems.length > 0 && (
          <div className="stats-grid compact-stats mt-lg">
            <div className="metric-card accent-brand">
              <span className="metric-label">Per-Segment Total</span>
              <span className="metric-value">{fmt(perSegmentTotal)}</span>
            </div>
            <div className="metric-card accent-warn">
              <span className="metric-label">All Segments ({segmentCount})</span>
              <span className="metric-value">{fmt(allSegmentsTotal)}</span>
            </div>
            <div className="metric-card accent-risk">
              <span className="metric-label">Grand Total (incl. Venue)</span>
              <span className="metric-value">{fmt(grandTotal)}</span>
            </div>
          </div>
        )}
      </article>

      {/* Add Production Item */}
      <article className="card">
        <div className="card-title-row">
          <h3>Add Production Item</h3>
        </div>
        <form action={addProductionItemAction}>
          <input type="hidden" name="sport" value={sportCode} />
          <div className="form-grid">
            <div className="field">
              <label>Category</label>
              <select name="costCategory" required>
                <option value="">Select category</option>
                {productionCategoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Item</label>
              <input name="subCategory" type="text" required placeholder="e.g. LED Screens" />
            </div>
            <div className="field">
              <label>Unit Cost</label>
              <input name="unitCost" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Quantity</label>
              <input name="quantity" type="number" defaultValue="1" min="1" />
            </div>
            <div className="form-actions">
              <button className="action-button primary" type="submit">Add Item</button>
            </div>
          </div>
        </form>
      </article>
    </>
  );
}

/* ─── League Payroll Tab ──────────────────────────────────── */

async function LeaguePayrollTab({ sportId, sportCode }: { sportId: string; sportCode: string }): Promise<React.ReactElement> {
  const rows = await getSportLeaguePayroll(sportId);

  const totalY1 = rows.reduce((s, r) => s + parseNum(r.y1Salary), 0);
  const totalY2 = rows.reduce((s, r) => s + parseNum(r.y2Salary), 0);
  const totalY3 = rows.reduce((s, r) => s + parseNum(r.y3Salary), 0);

  return (
    <>
      <article className="card">
        <div className="card-title-row">
          <h3>League Payroll</h3>
        </div>
        {rows.length === 0 ? (
          <p className="notice">No league payroll roles yet. Add your first role below.</p>
        ) : (
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Type</th>
                  <th className="text-right">Y1 Salary</th>
                  <th className="text-right">Y2 Salary</th>
                  <th className="text-right">Y3 Salary</th>
                  <th className="text-right">Raise %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.roleTitle}</td>
                    <td>{r.department || <span className="muted">--</span>}</td>
                    <td><span className="subtle-pill">{r.employmentType}</span></td>
                    <td className="text-right">{r.y1Salary}</td>
                    <td className="text-right">{r.y2Salary}</td>
                    <td className="text-right">{r.y3Salary}</td>
                    <td className="text-right">{fmtPct(r.annualRaisePct)}</td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td>Total ({rows.length} roles)</td>
                  <td colSpan={2} />
                  <td className="text-right">{fmt(totalY1)}</td>
                  <td className="text-right">{fmt(totalY2)}</td>
                  <td className="text-right">{fmt(totalY3)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="card">
        <div className="card-title-row">
          <h3>Add Role</h3>
        </div>
        <form action={addLeagueRoleAction}>
          <input type="hidden" name="sport" value={sportCode} />
          <div className="form-grid">
            <div className="field">
              <label>Role Title</label>
              <input name="roleTitle" type="text" required placeholder="e.g. League Commissioner" />
            </div>
            <div className="field">
              <label>Department</label>
              <input name="department" type="text" placeholder="e.g. Operations" />
            </div>
            <div className="field">
              <label>Employment Type</label>
              <select name="employmentType">
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contractor">Contractor</option>
              </select>
            </div>
            <div className="field">
              <label>Y1 Salary</label>
              <input name="y1Salary" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Y2 Salary</label>
              <input name="y2Salary" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Y3 Salary</label>
              <input name="y3Salary" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Annual Raise %</label>
              <input name="annualRaise" type="number" step="0.1" defaultValue="5" />
            </div>
            <div className="form-actions">
              <button className="action-button primary" type="submit">Add Role</button>
            </div>
          </div>
        </form>
      </article>
    </>
  );
}

/* ─── Tech Services Tab ───────────────────────────────────── */

async function TechServicesTab({ sportId, sportCode }: { sportId: string; sportCode: string }): Promise<React.ReactElement> {
  const rows = await getSportTechPayroll(sportId);

  const allocatedRows = rows.map((r) => {
    const y1Raw = parseNum(r.y1Salary);
    const y2Raw = parseNum(r.y2Salary);
    const y3Raw = parseNum(r.y3Salary);
    return {
      ...r,
      y1Allocated: y1Raw * (r.allocationPct / 100),
      y2Allocated: y2Raw * (r.allocationPct / 100),
      y3Allocated: y3Raw * (r.allocationPct / 100),
    };
  });

  const totalY1 = allocatedRows.reduce((s, r) => s + r.y1Allocated, 0);
  const totalY2 = allocatedRows.reduce((s, r) => s + r.y2Allocated, 0);
  const totalY3 = allocatedRows.reduce((s, r) => s + r.y3Allocated, 0);

  return (
    <>
      <article className="card">
        <div className="card-title-row">
          <h3>Tech Services</h3>
        </div>
        {rows.length === 0 ? (
          <p className="notice">No tech service roles yet. Add your first role below.</p>
        ) : (
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th className="text-right">Alloc %</th>
                  <th className="text-right">Y1 (Allocated)</th>
                  <th className="text-right">Y2 (Allocated)</th>
                  <th className="text-right">Y3 (Allocated)</th>
                  <th className="text-right">Raise %</th>
                </tr>
              </thead>
              <tbody>
                {allocatedRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.roleTitle}</td>
                    <td className="text-right">{fmtPct(r.allocationPct)}</td>
                    <td className="text-right">{fmt(r.y1Allocated)}</td>
                    <td className="text-right">{fmt(r.y2Allocated)}</td>
                    <td className="text-right">{fmt(r.y3Allocated)}</td>
                    <td className="text-right">{fmtPct(r.annualRaisePct)}</td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td>Total ({rows.length} roles)</td>
                  <td />
                  <td className="text-right">{fmt(totalY1)}</td>
                  <td className="text-right">{fmt(totalY2)}</td>
                  <td className="text-right">{fmt(totalY3)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="card">
        <div className="card-title-row">
          <h3>Add Tech Role</h3>
        </div>
        <form action={addTechRoleAction}>
          <input type="hidden" name="sport" value={sportCode} />
          <div className="form-grid">
            <div className="field">
              <label>Role Title</label>
              <input name="roleTitle" type="text" required placeholder="e.g. Platform Engineer" />
            </div>
            <div className="field">
              <label>Allocation %</label>
              <input name="allocationPct" type="number" step="0.1" defaultValue="100" min="0" max="100" />
            </div>
            <div className="field">
              <label>Y1 Salary</label>
              <input name="y1Salary" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Y2 Salary</label>
              <input name="y2Salary" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Y3 Salary</label>
              <input name="y3Salary" type="number" step="0.01" defaultValue="0" />
            </div>
            <div className="field">
              <label>Annual Raise %</label>
              <input name="annualRaise" type="number" step="0.1" defaultValue="10" />
            </div>
            <div className="form-actions">
              <button className="action-button primary" type="submit">Add Role</button>
            </div>
          </div>
        </form>
      </article>
    </>
  );
}

/* ─── Revenue Share Tab ───────────────────────────────────── */

async function RevenueShareTab({ sportId, sportCode }: { sportId: string; sportCode: string }): Promise<React.ReactElement> {
  const rows = await getSportRevenueShare(sportId);

  const yearData: Record<number, (typeof rows)[number] | null> = { 1: null, 2: null, 3: null };
  for (const r of rows) {
    yearData[r.yearNumber] = r;
  }

  return (
    <>
      {[1, 2, 3].map((yearNum) => {
        const r = yearData[yearNum];
        const teamCount = r?.teamCount ?? 0;
        const feeNum = r ? parseNum(r.teamLicensingFee) : 0;
        const teamsPct = r?.teamsSharePct ?? 40;
        const gbPct = r?.governingBodySharePct ?? 5;
        const totalFranchise = teamCount * feeNum;
        const toTeams = totalFranchise * (teamsPct / 100);
        const toGb = totalFranchise * (gbPct / 100);
        const retained = totalFranchise - toTeams - toGb;

        return (
          <article className="card" key={yearNum}>
            <div className="card-title-row">
              <h3>Year {yearNum} Revenue Share</h3>
              {!r && <span className="badge">Setup Required</span>}
            </div>
            <form action={updateRevenueShareAction}>
              <input type="hidden" name="sport" value={sportCode} />
              <input type="hidden" name="yearNumber" value={yearNum} />
              <div className="form-grid">
                <div className="field">
                  <label>Team Count</label>
                  <input name="teamCount" type="number" defaultValue={r?.teamCount ?? 6} min="0" />
                </div>
                <div className="field">
                  <label>License Fee per Team</label>
                  <input name="licenseFee" type="number" step="0.01" defaultValue={feeNum} />
                </div>
                <div className="field">
                  <label>Teams Share %</label>
                  <input name="teamsPct" type="number" step="0.1" defaultValue={teamsPct} min="0" max="100" />
                </div>
                <div className="field">
                  <label>Governing Body Name</label>
                  <input name="gbName" type="text" defaultValue={r?.governingBodyName ?? ""} placeholder="e.g. National Federation" />
                </div>
                <div className="field">
                  <label>GB Share %</label>
                  <input name="gbPct" type="number" step="0.1" defaultValue={gbPct} min="0" max="100" />
                </div>
                <div className="form-actions">
                  <button className="action-button primary" type="submit">
                    {r ? "Update" : "Create"} Year {yearNum}
                  </button>
                </div>
              </div>
            </form>

            {r && (
              <div className="stats-grid compact-stats mt-lg">
                <div className="metric-card accent-brand">
                  <span className="metric-label">Total Franchise Revenue</span>
                  <span className="metric-value">{fmt(totalFranchise)}</span>
                </div>
                <div className="metric-card accent-good">
                  <span className="metric-label">Amount to Teams</span>
                  <span className="metric-value">{fmt(toTeams)}</span>
                </div>
                <div className="metric-card accent-warn">
                  <span className="metric-label">Amount to GB</span>
                  <span className="metric-value">{fmt(toGb)}</span>
                </div>
                <div className="metric-card accent-brand">
                  <span className="metric-label">Retained by League</span>
                  <span className="metric-value">{fmt(retained)}</span>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */

export default async function SportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ tab?: string; status?: string; message?: string }>;
}): Promise<React.ReactElement> {
  await requireRole(["super_admin", "finance_admin", "commercial_user", "viewer"]);

  const { sport: sportCode } = await params;
  const { tab: rawTab, status, message } = await searchParams;

  const sportId = await getSportIdByCode(sportCode);
  if (!sportId) notFound();

  const allSports = await getFspSports();
  const sportEntry = allSports.find((s) => s.sportCode === sportCode);
  const sportName = sportEntry?.displayName ?? sportCode;

  const activeTab: TabKey = TABS.some((t) => t.key === rawTab)
    ? (rawTab as TabKey)
    : "summary";

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">FSP &middot; {sportName}</span>
          <h3>{sportName} — Financial Module</h3>
        </div>
      </section>

      {status && message && (
        <div className={`notice${status === "error" ? " signal-risk" : ""}`}>
          {decodeURIComponent(message)}
        </div>
      )}

      <nav className="inline-actions">
        {TABS.map((t) => (
          <Link
            key={t.key}
            className={`segment-chip${activeTab === t.key ? " active" : ""}`}
            href={`/fsp/sports/${sportCode}?tab=${t.key}` as Route}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {activeTab === "summary" && <PnlSummaryTab sportId={sportId} sportCode={sportCode} />}
      {activeTab === "sponsorship" && <SponsorshipTab sportId={sportId} sportCode={sportCode} />}
      {activeTab === "media" && <MediaRevenueTab sportId={sportId} sportCode={sportCode} />}
      {activeTab === "opex" && <OpexDetailedTab sportId={sportId} sportCode={sportCode} />}
      {activeTab === "production" && <EventProductionTab sportId={sportId} sportCode={sportCode} />}
      {activeTab === "league-payroll" && <LeaguePayrollTab sportId={sportId} sportCode={sportCode} />}
      {activeTab === "tech" && <TechServicesTab sportId={sportId} sportCode={sportCode} />}
      {activeTab === "revenue-share" && <RevenueShareTab sportId={sportId} sportCode={sportCode} />}
    </div>
  );
}
