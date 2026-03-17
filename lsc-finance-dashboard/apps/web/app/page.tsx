import Link from "next/link";
import {
  getEntitySnapshots,
  getMonthlyCashFlow,
  getOverviewMetrics,
  getTbrSeasonSummaries
} from "@lsc/db";

function parseCurrency(value: string) {
  return Number(value.replace(/[^0-9.-]/g, "")) || 0;
}

export default async function OverviewPage() {
  const [entitySnapshots, overviewMetrics, monthlyCashFlow, tbrSeasons] = await Promise.all([
    getEntitySnapshots(),
    getOverviewMetrics(),
    getMonthlyCashFlow(),
    getTbrSeasonSummaries()
  ]);

  const chartMax = Math.max(
    1,
    ...monthlyCashFlow.flatMap((row) => [parseCurrency(row.cashIn), parseCurrency(row.cashOut)])
  );
  const tbrEntity = entitySnapshots.find((entity) => entity.code === "TBR");
  const fspEntity = entitySnapshots.find((entity) => entity.code === "FSP");

  return (
    <div className="page-grid">
      <section className="hero portfolio-hero">
        <div className="hero-copy">
          <span className="eyebrow">Portfolio overview</span>
          <h2>LSC at a glance. TBR and FSP beneath it.</h2>
          <p>
            This is the holding-company layer. Keep the numbers clear by business unit, then move
            into TBR for season, race, invoice, and expense operations.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="solid-link" href="/tbr">
            Open TBR
          </Link>
          <Link className="ghost-link" href="/fsp">
            Open FSP
          </Link>
        </div>
      </section>

      <section className="entity-grid">
        {entitySnapshots.map((entity) => (
          <article className={`entity-card ${entity.code.toLowerCase()}`} key={entity.code}>
            <div className="entity-card-top">
              <div>
                <span className="section-kicker">{entity.code}</span>
                <h3>{entity.name}</h3>
              </div>
              <span className="pill">{entity.status}</span>
            </div>
            <p>{entity.note}</p>
            <div className="entity-stats">
              <div>
                <span>Revenue</span>
                <strong>{entity.revenue}</strong>
              </div>
              <div>
                <span>Cost</span>
                <strong>{entity.cost}</strong>
              </div>
              <div>
                <span>Margin</span>
                <strong>{entity.margin}</strong>
              </div>
            </div>
            <div className="entity-actions">
              <Link className="ghost-link" href={entity.code === "TBR" ? "/tbr" : entity.code === "FSP" ? "/fsp" : "/"}>
                {entity.code === "LSC" ? "Stay here" : `View ${entity.code}`}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="stats-grid compact-stats">
        {overviewMetrics
          .filter((metric) => metric.label !== "Upcoming Payments")
          .map((metric) => (
            <article className="metric-card" key={metric.label}>
              <div className="metric-topline">
                <span className="metric-label">{metric.scope}</span>
                <span className="badge">{metric.label}</span>
              </div>
              <div className="metric-value">{metric.value}</div>
            </article>
          ))}
      </section>

      <section className="grid-two portfolio-panels">
        <article className="card trend-chart">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Consolidated trend</span>
              <h3>Cash movement by period</h3>
            </div>
            <span className="pill">LSC</span>
          </div>
          <div className="trend-bars">
            {monthlyCashFlow.map((row) => {
              const cashIn = parseCurrency(row.cashIn);
              const cashOut = parseCurrency(row.cashOut);
              const inHeight = Math.max(16, (cashIn / chartMax) * 160);
              const outHeight = Math.max(16, (cashOut / chartMax) * 160);

              return (
                <div className="trend-column" key={row.month}>
                  <div className="trend-stack">
                    <div className="trend-bar" style={{ height: `${inHeight}px` }} />
                    <div className="trend-bar secondary" style={{ height: `${outHeight}px` }} />
                  </div>
                  <div className="trend-meta">
                    <strong>{row.month}</strong>
                    <span className="subtle">{row.net}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Operating split</span>
              <h3>How to read the portfolio</h3>
            </div>
          </div>
          <div className="info-grid">
            <div className="process-step">
              <span className="process-step-index">TBR</span>
              <strong>{tbrEntity?.revenue ?? "$0"} revenue</strong>
              <span className="muted">
                Live race-linked cost, invoices, payments, and expense operations are active here.
              </span>
            </div>
            <div className="process-step">
              <span className="process-step-index">FSP</span>
              <strong>{fspEntity?.status ?? "Schema ready"}</strong>
              <span className="muted">
                Keep the category visible and structured, but do not overload it before launch data exists.
              </span>
            </div>
            <div className="process-step">
              <span className="process-step-index">Next move</span>
              <strong>Go one level deeper</strong>
              <span className="muted">
                Use TBR for seasonal and race-level finance operations. Use FSP for placeholder structure and future planning.
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">TBR season sequence</span>
            <h3>Season cards before race-level detail</h3>
          </div>
          <Link className="ghost-link" href="/tbr">
            Open season cockpit
          </Link>
        </div>
        <div className="season-grid compact-season-grid">
          {tbrSeasons.map((season) => (
            <Link className="season-card" href={`/tbr/races?season=${season.seasonYear}`} key={season.seasonYear}>
              <div className="season-card-top">
                <span className="badge">{season.status}</span>
                <span className="season-tag">{season.seasonLabel}</span>
              </div>
              <h3>{season.raceCount} races</h3>
              <div className="season-metrics">
                <div>
                  <span>Revenue</span>
                  <strong>{season.revenue}</strong>
                </div>
                <div>
                  <span>Cost</span>
                  <strong>{season.cost}</strong>
                </div>
                <div>
                  <span>Open payables</span>
                  <strong>{season.openPayables}</strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
