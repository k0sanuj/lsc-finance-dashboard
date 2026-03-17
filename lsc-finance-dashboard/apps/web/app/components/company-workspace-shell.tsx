import type { Route } from "next";
import Link from "next/link";
import type { SharedCompanyCode } from "../lib/shared-workspace";
import { buildCompanyPath, formatSharedCompanyName } from "../lib/shared-workspace";

type WorkspaceCard = {
  key: string;
  title: string;
  description: string;
  badge?: string;
};

type CompanyWorkspaceShellProps = {
  basePath: string;
  companyCode: SharedCompanyCode;
  eyebrow: string;
  title: string;
  description: string;
  selectedView: string;
  workstreams: readonly WorkspaceCard[];
  preservedParams?: Record<string, string | null | undefined>;
};

export function CompanyWorkspaceShell({
  basePath,
  companyCode,
  eyebrow,
  title,
  description,
  selectedView,
  workstreams,
  preservedParams
}: CompanyWorkspaceShellProps) {
  const activeWorkspace =
    workstreams.find((workstream) => workstream.key === selectedView) ?? workstreams[0] ?? null;

  return (
    <>
      <section className="hero portfolio-hero">
        <div className="hero-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="hero-actions">
          <Link className="ghost-link" href={basePath as Route}>
            Choose company
          </Link>
        </div>
      </section>

      <section className="support-grid">
        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Active path</span>
              <h3>{formatSharedCompanyName(companyCode)} is now locked as the working company</h3>
            </div>
            <span className="pill">Step 1</span>
          </div>
          <div className="process-step compact-process-step">
            <span className="process-step-index">{companyCode}</span>
            <strong>Keep the company context fixed while you move through the workspace below</strong>
            <span className="muted">This prevents tables, AI comments, and selected detail from mixing two different business entities on the same screen.</span>
          </div>
        </article>

        <article className="card compact-section-card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Current workspace</span>
              <h3>{activeWorkspace?.title ?? "Workspace"}</h3>
            </div>
            <span className="pill">Step 2</span>
          </div>
          <div className="process-step compact-process-step">
            <span className="process-step-index">{activeWorkspace?.badge ?? "Active"}</span>
            <strong>{activeWorkspace?.description ?? "Choose a workspace to continue."}</strong>
            <span className="muted">Summary comes first. Working tables come next. Selected detail should only open when one row or run is intentionally chosen.</span>
          </div>
        </article>
      </section>

      <section className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Step 2</span>
            <h3>{formatSharedCompanyName(companyCode)} workspaces</h3>
          </div>
          <span className="pill">{companyCode}</span>
        </div>
        <div className="support-grid">
          {workstreams.map((workstream) => (
            <Link
              className={`workflow-tile ${workstream.key === selectedView ? "active" : ""}`}
              href={buildCompanyPath(basePath, companyCode, {
                ...preservedParams,
                view: workstream.key
              }) as Route}
              key={workstream.key}
            >
              <span className="process-step-index">{workstream.badge ?? "Workspace"}</span>
              <strong>{workstream.title}</strong>
              <span className="muted">{workstream.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
