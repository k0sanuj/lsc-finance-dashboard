import type { Route } from "next";
import Link from "next/link";
import type { SharedCompanyCode } from "../lib/shared-workspace";
import { buildPageHref } from "../lib/shared-workspace";

type CompanySnapshot = {
  code: "LSC" | "TBR" | "FSP";
  name: string;
  revenue: string;
  cost: string;
  margin: string;
  status: string;
  note: string;
};

type WorkstreamCard = {
  key: string;
  title: string;
  description: string;
  badge?: string;
};

type CompanyWorkspaceIndexProps = {
  basePath: string;
  companyQueryKey?: string;
  viewQueryKey?: string;
  selectedCompany: SharedCompanyCode;
  selectedView: string;
  companySnapshots: readonly CompanySnapshot[];
  workstreams: readonly WorkstreamCard[];
  eyebrow: string;
  title: string;
  description: string;
};

export function CompanyWorkspaceIndex({
  basePath,
  companyQueryKey = "company",
  viewQueryKey = "view",
  selectedCompany,
  selectedView,
  companySnapshots,
  workstreams,
  eyebrow,
  title,
  description
}: CompanyWorkspaceIndexProps) {
  const indexedCompanies = companySnapshots.filter(
    (company) => company.code === "TBR" || company.code === "FSP"
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

      <section className="grid-two">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Step 1</span>
              <h3>Choose the company first</h3>
            </div>
          </div>
          <div className="entity-grid compact-entity-grid">
            {indexedCompanies.map((company) => {
              const isActive = company.code === selectedCompany;

              return (
                <Link
                  className={`entity-card ${company.code.toLowerCase()} ${isActive ? "active-card" : ""}`}
                  href={buildPageHref(basePath, {
                    [companyQueryKey]: company.code,
                    [viewQueryKey]: selectedView
                  }) as Route}
                  key={company.code}
                >
                  <div className="entity-card-top">
                    <div>
                      <span className="section-kicker">{company.code}</span>
                      <h3>{company.name}</h3>
                    </div>
                    <span className="badge">{company.status}</span>
                  </div>
                  <p>{company.note}</p>
                  <div className="entity-stats">
                    <div>
                      <span>Revenue</span>
                      <strong>{company.revenue}</strong>
                    </div>
                    <div>
                      <span>Cost</span>
                      <strong>{company.cost}</strong>
                    </div>
                    <div>
                      <span>Margin</span>
                      <strong>{company.margin}</strong>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </article>

        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Step 2</span>
              <h3>Choose one workspace inside {selectedCompany}</h3>
            </div>
          </div>
          <div className="support-grid">
            {workstreams.map((workstream) => (
              <Link
                className={`workflow-tile ${workstream.key === selectedView ? "active" : ""}`}
                href={buildPageHref(basePath, {
                  [companyQueryKey]: selectedCompany,
                  [viewQueryKey]: workstream.key
                }) as Route}
                key={workstream.key}
              >
                <span className="process-step-index">{workstream.badge ?? "Workspace"}</span>
                <strong>{workstream.title}</strong>
                <span className="muted">{workstream.description}</span>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
