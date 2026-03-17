import type { Route } from "next";
import Link from "next/link";
import type { SharedCompanyCode } from "../lib/shared-workspace";
import { buildCompanyPath, formatSharedCompanyName } from "../lib/shared-workspace";

type CompanySnapshot = {
  code: "LSC" | "TBR" | "FSP";
  name: string;
  revenue: string;
  cost: string;
  margin: string;
  status: string;
  note: string;
};

type CompanySelectionIndexProps = {
  basePath: string;
  eyebrow: string;
  title: string;
  description: string;
  companySnapshots: readonly CompanySnapshot[];
};

const companyOrder: SharedCompanyCode[] = ["TBR", "FSP"];

export function CompanySelectionIndex({
  basePath,
  eyebrow,
  title,
  description,
  companySnapshots
}: CompanySelectionIndexProps) {
  const lscSnapshot = companySnapshots.find((company) => company.code === "LSC");
  const indexedCompanies = companyOrder
    .map((code) => ({
      code,
      company: companySnapshots.find((company) => company.code === code)
    }))
    .filter(
      (entry): entry is { code: SharedCompanyCode; company: CompanySnapshot } => Boolean(entry.company)
    );

  return (
    <>
      <section className="hero portfolio-hero">
        <div className="hero-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </section>

      <section className="support-grid">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Portfolio context</span>
              <h3>LSC stays above the company branches</h3>
            </div>
            <span className="pill">Step 1</span>
          </div>
          <div className="mini-metric-grid">
            <div className="mini-metric">
              <span>Revenue</span>
              <strong>{lscSnapshot?.revenue ?? "$0"}</strong>
            </div>
            <div className="mini-metric">
              <span>Cost</span>
              <strong>{lscSnapshot?.cost ?? "$0"}</strong>
            </div>
            <div className="mini-metric">
              <span>Margin</span>
              <strong>{lscSnapshot?.margin ?? "$0"}</strong>
            </div>
          </div>
        </article>

        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Selection rule</span>
              <h3>Choose company first. Open one workspace second.</h3>
            </div>
            <span className="pill">Step 2</span>
          </div>
          <div className="info-grid">
            <div className="process-step">
              <span className="process-step-index">TBR</span>
              <strong>Active operating entity</strong>
              <span className="muted">Use this path for live race, expense, invoice, payment, and commercial workflows.</span>
            </div>
            <div className="process-step">
              <span className="process-step-index">FSP</span>
              <strong>Structured but intentionally lighter</strong>
              <span className="muted">Keep the same route shape without overloading the page before live operating data exists.</span>
            </div>
          </div>
        </article>
      </section>

      <section className="grid-two">
        {indexedCompanies.map(({ code, company }) => (
          <Link
            className={`entity-card ${code.toLowerCase()} flow-entry-card`}
            href={buildCompanyPath(basePath, code) as Route}
            key={code}
          >
            <div className="entity-card-top">
              <div>
                <span className="section-kicker">{code}</span>
                <h3>{formatSharedCompanyName(code)}</h3>
              </div>
              <span className="badge">{company.status}</span>
            </div>
            <p>{company.note}</p>
            <div className="process-list">
              <div className="process-step">
                <span className="process-step-index">1</span>
                <strong>Open {code} workspace</strong>
                <span className="muted">Choose this company before any tables, charts, or tools appear.</span>
              </div>
              <div className="process-step">
                <span className="process-step-index">2</span>
                <strong>Pick the exact workspace</strong>
                <span className="muted">Move into cost, payment, document, or commercial detail only after company selection.</span>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </>
  );
}
