import Link from "next/link";
import { getSponsorBreakdown, getTbrSeasonSummaries } from "@lsc/db";
import { requireSession } from "../../lib/auth";

function parseCurrency(value: string) {
  return Number(value.replace(/[^0-9.-]/g, "")) || 0;
}

export default async function TbrPage() {
  const session = await requireSession();
  const [seasons, sponsorBreakdown] = await Promise.all([
    getTbrSeasonSummaries(),
    getSponsorBreakdown()
  ]);
  const latestSeason = seasons.at(-1) ?? null;
  const recognizedRevenue = sponsorBreakdown.reduce(
    (sum, row) => sum + parseCurrency(row.recognizedRevenue),
    0
  );
  const isAdmin = session.role === "super_admin" || session.role === "finance_admin";

  if (!isAdmin) {
    return (
      <div className="page-grid">
        <section className="hero portfolio-hero tbr-hero">
          <div className="hero-copy">
            <span className="eyebrow">TBR user console</span>
            <h2>Submit expenses and track your race reimbursements.</h2>
          </div>
          <div className="hero-actions">
            <Link className="solid-link" href="/tbr/my-expenses">
              My expenses
            </Link>
            <Link className="ghost-link" href="/tbr/races">
              Open races
            </Link>
          </div>
        </section>

        <section className="tool-grid workflow-grid">
          <article className="tool-card primary-tool-card">
            <span className="section-kicker">Primary path</span>
            <h3>My Expenses</h3>
            <p>Track your expense reports and submission statuses.</p>
            <Link className="solid-link" href="/tbr/my-expenses">
              Open my expenses
            </Link>
          </article>

          <article className="tool-card">
            <span className="section-kicker">Race entry</span>
            <h3>Races</h3>
            <p>Browse races and submit bills or receipts.</p>
            <Link className="ghost-link" href="/tbr/races">
              Browse races
            </Link>
          </article>
        </section>

        <section className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Current seasons</span>
              <h3>Jump straight into a race</h3>
            </div>
            <Link className="ghost-link" href="/tbr/races">
              Open race browser
            </Link>
          </div>
          <div className="season-grid compact-season-grid">
            {seasons.map((season) => (
              <Link className="season-card compact-season-card" href={`/tbr/races?season=${season.seasonYear}`} key={season.seasonYear}>
                <div className="season-card-top">
                  <span className="season-tag">{season.seasonLabel}</span>
                  <span className="badge">{season.status}</span>
                </div>
                <div className="season-metrics">
                  <div>
                    <span>Races</span>
                    <strong>{season.raceCount}</strong>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>
    );
  }

  return (
    <div className="page-grid">
      <section className="hero portfolio-hero tbr-hero">
          <div className="hero-copy">
            <span className="eyebrow">TBR admin console</span>
            <h2>TBR finance and operations dashboard.</h2>
          </div>
        <div className="hero-actions">
          <Link className="solid-link" href="/tbr/expense-management">
            Review console
          </Link>
          <Link className="ghost-link" href="/tbr/invoice-hub">
            Invoice hub
          </Link>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">TBR overview</span>
            <span className="badge">Recognized revenue</span>
          </div>
          <div className="metric-value">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0
            }).format(recognizedRevenue)}
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">{latestSeason?.seasonLabel ?? "Current season"}</span>
            <span className="badge">Approved cost</span>
          </div>
          <div className="metric-value">{latestSeason?.cost ?? "$0"}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">{latestSeason?.seasonLabel ?? "Current season"}</span>
            <span className="badge">Open payables</span>
          </div>
          <div className="metric-value">{latestSeason?.openPayables ?? "$0"}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">Operating scope</span>
            <span className="badge">Seasons</span>
          </div>
          <div className="metric-value">{seasons.length}</div>
        </article>
      </section>

      <section className="tool-grid workflow-grid">
          <article className="tool-card">
            <span className="section-kicker">User-facing branch</span>
            <h3>User console</h3>
            <p>View the operator workspace for races and submissions.</p>
            <Link className="ghost-link" href="/tbr/my-expenses">
              Open user console
            </Link>
          </article>

          <article className="tool-card">
            <span className="section-kicker">Finance admin</span>
            <h3>Review console</h3>
            <p>Review and approve submitted expense reports.</p>
            <Link className="ghost-link" href="/tbr/expense-management">
              Open review console
            </Link>
          </article>

          <article className="tool-card">
            <span className="section-kicker">Finance admin</span>
            <h3>Invoice hub</h3>
            <p>Capture and process vendor invoices.</p>
            <Link className="ghost-link" href="/tbr/invoice-hub">
              Open invoice hub
            </Link>
          </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Race context</span>
            <h3>Season drilldown stays available to admins too</h3>
          </div>
          <Link className="ghost-link" href="/tbr/races">
            Open race browser
          </Link>
        </div>
        <div className="season-grid compact-season-grid">
          {seasons.map((season) => (
            <Link className="season-card" href={`/tbr/races?season=${season.seasonYear}`} key={season.seasonYear}>
              <div className="season-card-top">
                <span className="season-tag">{season.seasonLabel}</span>
                <span className="badge">{season.status}</span>
              </div>
              <div className="season-metrics">
                <div>
                  <span>Races</span>
                  <strong>{season.raceCount}</strong>
                </div>
                <div>
                  <span>Revenue</span>
                  <strong>{season.revenue}</strong>
                </div>
                <div>
                  <span>Cost</span>
                  <strong>{season.cost}</strong>
                </div>
              </div>
            </Link>
            ))}
        </div>
      </section>
    </div>
  );
}
