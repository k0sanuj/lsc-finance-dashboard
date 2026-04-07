import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "../../../../lib/auth";
import {
  getSportIdByCode, getSportPnlLineItems, getSportSponsorships,
  getSportLeaguePayroll, getSportTechPayroll, getSportRevenueShare,
  getSportEventConfig, getFspSports
} from "@lsc/db";

const TABS = [
  { key: "summary", label: "P&L Summary" },
  { key: "sponsorship", label: "Sponsorship Revenue" },
  { key: "media", label: "Media Revenue" },
  { key: "opex", label: "OPEX Detailed" },
  { key: "production", label: "Event Production" },
  { key: "league-payroll", label: "League Payroll" },
  { key: "tech", label: "Tech Services" },
  { key: "revenue-share", label: "Central Pool / Revenue Share" },
  { key: "config", label: "Sport Configuration" },
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

/* ─── P&L Summary Tab ──────────────────────────────────────── */

async function PnlSummaryTab({ sportId }: { sportId: string }): Promise<React.ReactElement> {
  const items = await getSportPnlLineItems(sportId, "base");

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

  const renderSectionTable = (title: string, sectionKey: string, total: { y1: number; y2: number; y3: number }): React.ReactElement => {
    const rows = grouped[sectionKey] ?? [];
    return (
      <article className="card" key={sectionKey}>
        <div className="card-title-row">
          <h3>{title}</h3>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Line Item</th>
                <th style={{ textAlign: "right" }}>Year 1</th>
                <th style={{ textAlign: "right" }}>Year 2</th>
                <th style={{ textAlign: "right" }}>Year 3</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.subCategory || row.category}</td>
                  <td style={{ textAlign: "right" }}>{fmt(row.y1Budget)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(row.y2Budget)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(row.y3Budget)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td>Total {title}</td>
                <td style={{ textAlign: "right" }}>{fmt(total.y1)}</td>
                <td style={{ textAlign: "right" }}>{fmt(total.y2)}</td>
                <td style={{ textAlign: "right" }}>{fmt(total.y3)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    );
  };

  const ebitdaSignal = (val: number): string =>
    val >= 0 ? "signal-pill signal-good" : "signal-pill signal-risk";

  return (
    <>
      {renderSectionTable("Revenue", "revenue", revenue)}
      {renderSectionTable("COGS", "cogs", cogs)}
      {renderSectionTable("OPEX", "opex", opex)}

      <article className="card">
        <div className="card-title-row">
          <h3>EBITDA</h3>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th style={{ textAlign: "right" }}>Year 1</th>
                <th style={{ textAlign: "right" }}>Year 2</th>
                <th style={{ textAlign: "right" }}>Year 3</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ fontWeight: 700 }}>
                <td>EBITDA</td>
                <td style={{ textAlign: "right" }}>
                  <span className={ebitdaSignal(ebitda.y1)}>{fmt(ebitda.y1)}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className={ebitdaSignal(ebitda.y2)}>{fmt(ebitda.y2)}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className={ebitdaSignal(ebitda.y3)}>{fmt(ebitda.y3)}</span>
                </td>
              </tr>
              <tr>
                <td>EBITDA Margin</td>
                <td style={{ textAlign: "right" }}>
                  <span className={ebitdaSignal(ebitda.y1)}>{fmtPct(margin.y1)}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className={ebitdaSignal(ebitda.y2)}>{fmtPct(margin.y2)}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className={ebitdaSignal(ebitda.y3)}>{fmtPct(margin.y3)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}

/* ─── Sponsorship Tab ──────────────────────────────────────── */

async function SponsorshipTab({ sportId }: { sportId: string }): Promise<React.ReactElement> {
  const rows = await getSportSponsorships(sportId);

  return (
    <article className="card">
      <div className="card-title-row">
        <h3>Sponsorship Revenue</h3>
      </div>
      <div className="table-wrapper clean-table">
        <table>
          <thead>
            <tr>
              <th>Segment</th>
              <th>Sponsor</th>
              <th>Tier</th>
              <th style={{ textAlign: "right" }}>Year 1</th>
              <th style={{ textAlign: "right" }}>Year 2</th>
              <th style={{ textAlign: "right" }}>Year 3</th>
              <th>Status</th>
              <th>Contract Period</th>
              <th>Payment Schedule</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.segment}</td>
                <td>{r.sponsorName || <span className="muted">TBD</span>}</td>
                <td><span className="pill">{r.tier}</span></td>
                <td style={{ textAlign: "right" }}>{r.y1Value}</td>
                <td style={{ textAlign: "right" }}>{r.y2Value}</td>
                <td style={{ textAlign: "right" }}>{r.y3Value}</td>
                <td>
                  <span className={
                    r.contractStatus === "signed" ? "signal-pill signal-good"
                    : r.contractStatus === "in negotiation" ? "signal-pill signal-warn"
                    : "signal-pill signal-risk"
                  }>
                    {r.contractStatus}
                  </span>
                </td>
                <td>{r.contractStart && r.contractEnd ? `${r.contractStart} - ${r.contractEnd}` : <span className="muted">--</span>}</td>
                <td>{r.paymentSchedule || <span className="muted">--</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ textAlign: "center" }}>No sponsorship data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/* ─── League Payroll Tab ───────────────────────────────────── */

async function LeaguePayrollTab({ sportId }: { sportId: string }): Promise<React.ReactElement> {
  const rows = await getSportLeaguePayroll(sportId);

  return (
    <article className="card">
      <div className="card-title-row">
        <h3>League Payroll</h3>
      </div>
      <div className="table-wrapper clean-table">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Type</th>
              <th style={{ textAlign: "right" }}>Year 1</th>
              <th style={{ textAlign: "right" }}>Year 2</th>
              <th style={{ textAlign: "right" }}>Year 3</th>
              <th style={{ textAlign: "right" }}>Annual Raise %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.roleTitle}</td>
                <td><span className="subtle-pill">{r.employmentType}</span></td>
                <td style={{ textAlign: "right" }}>{r.y1Salary}</td>
                <td style={{ textAlign: "right" }}>{r.y2Salary}</td>
                <td style={{ textAlign: "right" }}>{r.y3Salary}</td>
                <td style={{ textAlign: "right" }}>{fmtPct(r.annualRaisePct)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center" }}>No payroll data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/* ─── Tech Services Tab ────────────────────────────────────── */

async function TechServicesTab({ sportId }: { sportId: string }): Promise<React.ReactElement> {
  const rows = await getSportTechPayroll(sportId);

  return (
    <article className="card">
      <div className="card-title-row">
        <h3>Tech Services</h3>
      </div>
      <div className="table-wrapper clean-table">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th style={{ textAlign: "right" }}>Allocation %</th>
              <th style={{ textAlign: "right" }}>Year 1</th>
              <th style={{ textAlign: "right" }}>Year 2</th>
              <th style={{ textAlign: "right" }}>Year 3</th>
              <th style={{ textAlign: "right" }}>Raise %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.roleTitle}</td>
                <td style={{ textAlign: "right" }}>{fmtPct(r.allocationPct)}</td>
                <td style={{ textAlign: "right" }}>{r.y1Salary}</td>
                <td style={{ textAlign: "right" }}>{r.y2Salary}</td>
                <td style={{ textAlign: "right" }}>{r.y3Salary}</td>
                <td style={{ textAlign: "right" }}>{fmtPct(r.annualRaisePct)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center" }}>No tech payroll data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/* ─── Revenue Share Tab ────────────────────────────────────── */

async function RevenueShareTab({ sportId }: { sportId: string }): Promise<React.ReactElement> {
  const rows = await getSportRevenueShare(sportId);

  return (
    <article className="card">
      <div className="card-title-row">
        <h3>Central Pool / Revenue Share</h3>
      </div>
      <div className="table-wrapper clean-table">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th style={{ textAlign: "right" }}>Teams</th>
              <th style={{ textAlign: "right" }}>License Fee</th>
              <th style={{ textAlign: "right" }}>Teams Share %</th>
              <th>Governing Body</th>
              <th style={{ textAlign: "right" }}>GB Share %</th>
              <th style={{ textAlign: "right" }}>Total Franchise Revenue</th>
              <th style={{ textAlign: "right" }}>Amount to Teams</th>
              <th style={{ textAlign: "right" }}>Amount to GB</th>
              <th style={{ textAlign: "right" }}>Retained</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const feeNum = Number(r.teamLicensingFee.replace(/[^0-9.-]/g, ""));
              const totalFranchise = r.teamCount * feeNum;
              const toTeams = totalFranchise * (r.teamsSharePct / 100);
              const toGb = totalFranchise * (r.governingBodySharePct / 100);
              const retained = totalFranchise - toTeams - toGb;
              return (
                <tr key={r.yearNumber}>
                  <td>Year {r.yearNumber}</td>
                  <td style={{ textAlign: "right" }}>{r.teamCount}</td>
                  <td style={{ textAlign: "right" }}>{r.teamLicensingFee}</td>
                  <td style={{ textAlign: "right" }}>{fmtPct(r.teamsSharePct)}</td>
                  <td>{r.governingBodyName || <span className="muted">--</span>}</td>
                  <td style={{ textAlign: "right" }}>{fmtPct(r.governingBodySharePct)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(totalFranchise)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(toTeams)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(toGb)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(retained)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="muted" style={{ textAlign: "center" }}>No revenue share data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/* ─── Config Tab ───────────────────────────────────────────── */

async function ConfigTab({ sportId }: { sportId: string }): Promise<React.ReactElement> {
  const config = await getSportEventConfig(sportId);

  if (!config) {
    return (
      <article className="card">
        <div className="card-title-row">
          <h3>Sport Configuration</h3>
        </div>
        <p className="muted">No event configuration data yet</p>
      </article>
    );
  }

  return (
    <article className="card">
      <div className="card-title-row">
        <h3>Sport Configuration</h3>
      </div>
      <div className="stats-grid compact-stats">
        <div className="metric-card accent-brand">
          <span className="metric-label">Segments per Event</span>
          <span className="metric-value">{config.segmentsPerEvent}</span>
        </div>
        <div className="metric-card accent-good">
          <span className="metric-label">Events Year 1</span>
          <span className="metric-value">{config.eventsY1}</span>
        </div>
        <div className="metric-card accent-good">
          <span className="metric-label">Events Year 2</span>
          <span className="metric-value">{config.eventsY2}</span>
        </div>
        <div className="metric-card accent-good">
          <span className="metric-label">Events Year 3</span>
          <span className="metric-value">{config.eventsY3}</span>
        </div>
        <div className="metric-card accent-warn">
          <span className="metric-label">Venue Cost per Event</span>
          <span className="metric-value">{config.venueCostPerEvent}</span>
        </div>
      </div>
    </article>
  );
}

/* ─── Placeholder Tab ──────────────────────────────────────── */

function PlaceholderTab({ title }: { title: string }): React.ReactElement {
  return (
    <article className="card">
      <div className="card-title-row">
        <h3>{title}</h3>
      </div>
      <p className="muted">{title} module — data entry coming soon</p>
    </article>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */

export default async function SportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string }>;
  searchParams: Promise<{ tab?: string }>;
}): Promise<React.ReactElement> {
  await requireRole(["super_admin", "finance_admin", "commercial_user", "viewer"]);

  const { sport: sportCode } = await params;
  const { tab: rawTab } = await searchParams;

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

      {activeTab === "summary" && <PnlSummaryTab sportId={sportId} />}
      {activeTab === "sponsorship" && <SponsorshipTab sportId={sportId} />}
      {activeTab === "media" && <PlaceholderTab title="Media Revenue" />}
      {activeTab === "opex" && <PlaceholderTab title="OPEX Detailed" />}
      {activeTab === "production" && <PlaceholderTab title="Event Production" />}
      {activeTab === "league-payroll" && <LeaguePayrollTab sportId={sportId} />}
      {activeTab === "tech" && <TechServicesTab sportId={sportId} />}
      {activeTab === "revenue-share" && <RevenueShareTab sportId={sportId} />}
      {activeTab === "config" && <ConfigTab sportId={sportId} />}
    </div>
  );
}
