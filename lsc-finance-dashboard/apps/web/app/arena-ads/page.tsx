import { getArenaFinancials, getAdsRevenue, getArenaAdsSummary } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function fmtUsd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function ArenaAdsPage() {
  await requireRole(["super_admin", "finance_admin"]);
  const [arena, ads, summary] = await Promise.all([
    getArenaFinancials(),
    getAdsRevenue(),
    getArenaAdsSummary()
  ]);

  const arenaNetMargin = summary.totalArenaRevenue - summary.totalArenaCost;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Revenue streams</span>
          <h3>Arena &amp; Ads Finance</h3>
          <p className="muted">
            Revenue and cost tracking for Arena partnerships and advertising.
          </p>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Arena revenue</span>
          </div>
          <div className="metric-value">{fmtUsd(summary.totalArenaRevenue)}</div>
          <span className="metric-subvalue">All arena agreements</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Arena cost</span>
          </div>
          <div className="metric-value">{fmtUsd(summary.totalArenaCost)}</div>
          <span className="metric-subvalue">Cost of services</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Ad revenue</span>
          </div>
          <div className="metric-value">{fmtUsd(summary.totalAdRevenue)}</div>
          <span className="metric-subvalue">All ad partners</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Ad payments</span>
          </div>
          <div className="metric-value">{fmtUsd(summary.totalAdPayments)}</div>
          <span className="metric-subvalue">Payments received</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Total participants</span>
          </div>
          <div className="metric-value">{summary.totalParticipants.toLocaleString("en-US")}</div>
          <span className="metric-subvalue">Arena agreements</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Arena partners</span>
          </div>
          <div className="metric-value">{summary.arenaPartners}</div>
          <span className="metric-subvalue">Distinct partners</span>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Ad partners</span>
          </div>
          <div className="metric-value">{summary.adPartners}</div>
          <span className="metric-subvalue">Distinct ad partners</span>
        </article>
      </section>

      <section className="grid-two">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Arena summary</span>
              <h3>Net arena margin</h3>
            </div>
            <span className={`pill signal-pill ${arenaNetMargin >= 0 ? "signal-good" : "signal-risk"}`}>
              {fmtUsd(arenaNetMargin)}
            </span>
          </div>
          <span className="muted">
            {summary.arenaPartners} arena partner{summary.arenaPartners !== 1 ? "s" : ""} contributing{" "}
            {fmtUsd(summary.totalArenaRevenue)} in revenue against {fmtUsd(summary.totalArenaCost)} in costs.
          </span>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Ads summary</span>
              <h3>Net ad revenue</h3>
            </div>
            <span className={`pill signal-pill ${summary.totalAdRevenue - summary.totalAdPayments >= 0 ? "signal-good" : "signal-risk"}`}>
              {fmtUsd(summary.totalAdRevenue - summary.totalAdPayments)}
            </span>
          </div>
          <span className="muted">
            {summary.adPartners} ad partner{summary.adPartners !== 1 ? "s" : ""} generating{" "}
            {fmtUsd(summary.totalAdRevenue)} in revenue with {fmtUsd(summary.totalAdPayments)} in payments.
          </span>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Arena agreements</span>
            <h3>Arena financials register</h3>
          </div>
          <span className="pill">{arena.length} agreements</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Partner</th>
                <th>Agreement Type</th>
                <th>Revenue</th>
                <th>Cost</th>
                <th>Net Margin</th>
                <th>Participants</th>
                <th>Period</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {arena.length > 0 ? (
                arena.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.partnerName}</strong></td>
                    <td><span className="pill">{row.agreementType}</span></td>
                    <td>{row.revenue}</td>
                    <td>{row.costOfServices}</td>
                    <td>{row.netMargin}</td>
                    <td>{row.participantCount.toLocaleString("en-US")}</td>
                    <td>{row.periodStart} &ndash; {row.periodEnd}</td>
                    <td><span className="subtle-pill">{row.companyCode}</span></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={8}>
                    No arena agreements recorded yet. Arena partnership data will appear once agreements are loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Advertising revenue</span>
            <h3>Ads revenue register</h3>
          </div>
          <span className="pill">{ads.length} records</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Ad Partner</th>
                <th>Revenue</th>
                <th>Payments</th>
                <th>Net Revenue</th>
                <th>Impressions</th>
                <th>Clicks</th>
                <th>Period</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {ads.length > 0 ? (
                ads.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.adPartner}</strong></td>
                    <td>{row.revenueAmount}</td>
                    <td>{row.paymentAmount}</td>
                    <td>{row.netRevenue}</td>
                    <td>{row.impressions.toLocaleString("en-US")}</td>
                    <td>{row.clicks.toLocaleString("en-US")}</td>
                    <td>{row.periodStart} &ndash; {row.periodEnd}</td>
                    <td><span className="subtle-pill">{row.companyCode}</span></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={8}>
                    No advertising revenue recorded yet. Ad partner data will appear once campaigns are loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
