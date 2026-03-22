import Link from "next/link";
import { getTbrRaceCards, getTbrSeasonSummaries, queryRows } from "@lsc/db";
import { requireRole } from "../../../lib/auth";

type TbrRacesPageProps = {
  searchParams?: Promise<{
    season?: string;
  }>;
};

/**
 * Find the season that contains the next upcoming race (event_start_date >= today).
 * Falls back to the latest season if no upcoming races exist.
 */
async function getDefaultSeasonYear(seasons: { seasonYear: number }[]): Promise<number> {
  if (seasons.length === 0) return 2025;

  try {
    const rows = await queryRows<{ season_year: number }>(
      `select re.season_year
       from race_events re
       join companies c on c.id = re.company_id
       where c.code = 'TBR'::company_code
         and re.season_year is not null
         and re.event_start_date >= current_date
       order by re.event_start_date asc
       limit 1`
    );

    if (rows.length > 0) {
      const match = seasons.find((s) => s.seasonYear === rows[0].season_year);
      if (match) return match.seasonYear;
    }
  } catch {
    // fall through to latest season
  }

  return seasons.at(-1)?.seasonYear ?? seasons[0]?.seasonYear ?? 2025;
}

export default async function TbrRacesPage({ searchParams }: TbrRacesPageProps) {
  await requireRole(["super_admin", "finance_admin", "team_member"]);
  const params = searchParams ? await searchParams : undefined;
  const seasons = await getTbrSeasonSummaries();

  const selectedSeason = params?.season
    ? Number(params.season)
    : await getDefaultSeasonYear(seasons);

  const [raceCards, selectedSeasonSummary] = await Promise.all([
    getTbrRaceCards(selectedSeason),
    Promise.resolve(seasons.find((season) => season.seasonYear === selectedSeason) ?? seasons.at(-1) ?? null)
  ]);

  return (
    <div className="page-grid">
      <section className="hero portfolio-hero tbr-hero">
        <div className="hero-copy">
          <span className="eyebrow">TBR races</span>
          <h2>Pick a season and open a race to submit bills.</h2>
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
              <p className="race-date-label">{race.eventDate}</p>
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
