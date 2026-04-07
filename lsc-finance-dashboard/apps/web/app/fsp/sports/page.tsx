import Link from "next/link";
import { requireRole } from "../../../lib/auth";
import { getFspSports } from "@lsc/db";

const fallbackSports = [
  { id: "fb-1", sportCode: "basketball", displayName: "Basketball", leagueName: "FSP Basketball League", isActive: true },
  { id: "fb-2", sportCode: "bowling", displayName: "Bowling", leagueName: "World Bowling League", isActive: true },
  { id: "fb-3", sportCode: "squash", displayName: "Squash", leagueName: "FSP Squash Series", isActive: true },
  { id: "fb-4", sportCode: "beerpong", displayName: "Beer Pong", leagueName: "FSP Beer Pong Championship", isActive: false },
];

const plannedModules = [
  "Revenue tracking",
  "Event/tournament costs",
  "Sponsorship management",
  "Player/team payouts",
  "P&L per season",
];

export default async function FspSportsPage(): Promise<React.ReactElement> {
  await requireRole(["super_admin", "finance_admin", "commercial_user", "viewer"]);

  const dbSports = await getFspSports();
  const sports = dbSports.length > 0 ? dbSports : fallbackSports;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Future of Sports</span>
          <h3>FSP Sports</h3>
          <p className="muted">
            Sports verticals under the FSP umbrella — each sport will have its
            own financial tracking
          </p>
        </div>
      </section>

      <section className="card-grid">
        {sports.map((sport) => (
          <article className="card" key={sport.id}>
            <div className="card-title-row">
              <div>
                <h3>{sport.displayName}</h3>
                <span className="muted">{sport.leagueName}</span>
              </div>
              <span
                className={
                  sport.isActive
                    ? "signal-pill signal-good"
                    : "signal-pill signal-risk"
                }
              >
                {sport.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Financial schema coming soon — awaiting database schema upload
            </p>
          </article>
        ))}
      </section>

      <article className="card">
        <div className="card-title-row">
          <div>
            <h3>Planned financial modules per sport</h3>
          </div>
        </div>
        <ul style={{ paddingLeft: "1.25rem", margin: "0.75rem 0 0" }}>
          {plannedModules.map((mod) => (
            <li key={mod} style={{ marginBottom: "0.35rem" }}>
              {mod}
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}
