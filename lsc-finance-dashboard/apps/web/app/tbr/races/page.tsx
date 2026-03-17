import Link from "next/link";
import { getTbrRaceCards, getTbrSeasonSummaries } from "@lsc/db";
import { requireRole } from "../../../lib/auth";

type TbrRacesPageProps = {
  searchParams?: Promise<{
    season?: string;
  }>;
};

export default async function TbrRacesPage({ searchParams }: TbrRacesPageProps) {
  await requireRole(["super_admin", "finance_admin", "team_member"]);
  const params = searchParams ? await searchParams : undefined;
  const seasons = await getTbrSeasonSummaries();
  const selectedSeason =
    Number(params?.season) || seasons.at(-1)?.seasonYear || seasons[0]?.seasonYear || 2025;
  const [raceCards, selectedSeasonSummary] = await Promise.all([
    getTbrRaceCards(selectedSeason),
    Promise.resolve(seasons.find((season) => season.seasonYear === selectedSeason) ?? seasons.at(-1) ?? null)
  ]);

  return (
    <div className="page-grid">
      <section className="hero portfolio-hero tbr-hero">
        <div className="hero-copy">
          <span className="eyebrow">TBR races</span>
          <h2>Pick a season. Open one race.</h2>
          <p>
            This page is only for choosing the event context you are working in. Open one race card
            to submit bills and receipts there.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="solid-link" href="/tbr">
            Back to TBR
          </Link>
          <Link className="ghost-link" href="/tbr/my-expenses">
            My expenses
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-headline">
          <div>
            <span className="section-kicker">Season switcher</span>
            <h3>Pick a season</h3>
          </div>
        </div>
        <div className="segment-row">
          {seasons.map((season) => {
            const active = season.seasonYear === selectedSeason;
            return (
              <Link
                className={`segment-chip ${active ? "active" : ""}`}
                href={`/tbr/races?season=${season.seasonYear}`}
                key={season.seasonYear}
              >
                {season.seasonLabel}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-headline">
          <div>
            <span className="section-kicker">Race cards</span>
            <h3>{selectedSeasonSummary?.seasonLabel ?? "Selected season"} races</h3>
          </div>
          <span className="pill">
            {selectedSeasonSummary?.raceCount ?? "0"} races · {selectedSeasonSummary?.status ?? "In progress"}
          </span>
        </div>
        <div className="race-grid">
          {raceCards.map((race) => (
            <Link className="race-card user-race-card" href={`/tbr/races/${race.id}`} key={race.id}>
              <div className="race-card-top">
                <div>
                  <span className="section-kicker">Race</span>
                  <h3>{race.name}</h3>
                </div>
                <span className="flag-pill">
                  <span>{race.countryFlag}</span>
                  <span>{race.countryName}</span>
                </span>
              </div>
              <p>{race.location}</p>
              <div className="race-metrics compact-race-metrics">
                <div>
                  <span>Date</span>
                  <strong>{race.eventDate}</strong>
                </div>
                <div>
                  <span>Workflow</span>
                  <strong>Upload bills</strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
