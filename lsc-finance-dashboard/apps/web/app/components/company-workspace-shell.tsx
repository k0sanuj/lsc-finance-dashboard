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
  return (
    <section className="workspace-header">
      <div className="workspace-header-left">
        <span className="section-kicker">{eyebrow}</span>
        <h3>{title}</h3>
        <p className="muted">{description}</p>
      </div>
      <div className="workspace-header-right">
        <div className="segment-row">
          {workstreams.map((workstream) => (
            <Link
              className={`segment-chip ${workstream.key === selectedView ? "active" : ""}`}
              href={buildCompanyPath(basePath, companyCode, {
                ...preservedParams,
                view: workstream.key
              }) as Route}
              key={workstream.key}
            >
              {workstream.title}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
