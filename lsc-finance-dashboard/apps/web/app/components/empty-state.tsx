import type { Route } from "next";
import Link from "next/link";

type Props = {
  title: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: Route | string;
  /** If true, renders a subtle hint icon above the title. */
  muted?: boolean;
};

export function EmptyState({ title, description, ctaLabel, ctaHref, muted = false }: Props) {
  return (
    <div className={`empty-state ${muted ? "empty-state-muted" : ""}`}>
      <div className="empty-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h6M7 17h4" />
        </svg>
      </div>
      <strong className="empty-state-title">{title}</strong>
      {description ? <span className="empty-state-desc">{description}</span> : null}
      {ctaLabel && ctaHref ? (
        <Link href={ctaHref as Route} className="action-button primary">
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}
