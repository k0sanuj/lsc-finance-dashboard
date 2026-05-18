import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type LscBlueTone = "brand" | "iris" | "amber" | "ruby" | "slate" | "good";

type PanelProps = {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

type MetricTileProps = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  icon: LucideIcon;
  tone?: LscBlueTone;
  className?: string;
};

type HeaderSelectProps = {
  label: string;
  icon: LucideIcon;
  value: string;
  options: readonly { value: string; label: string }[];
  name?: string;
  ariaLabel?: string;
};

type DataFreshnessProps = {
  label?: string;
  value: string;
};

export function Panel({
  title,
  subtitle,
  trailing,
  children,
  className,
  bodyClassName,
}: PanelProps) {
  return (
    <section className={["lsc-panel", className].filter(Boolean).join(" ")}>
      <header className="lsc-panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {trailing ? <div className="lsc-panel-trailing">{trailing}</div> : null}
      </header>
      <div className={["lsc-panel-body", bodyClassName].filter(Boolean).join(" ")}>{children}</div>
    </section>
  );
}

export function MetricTile({
  label,
  value,
  helper,
  icon: Icon,
  tone = "brand",
  className,
}: MetricTileProps) {
  return (
    <article className={["lsc-metric-tile", `tone-${tone}`, className].filter(Boolean).join(" ")}>
      <div className="lsc-metric-topline">
        <span>{label}</span>
        <span className="lsc-metric-icon" aria-hidden="true">
          <Icon size={16} strokeWidth={2.2} />
        </span>
      </div>
      <div className="lsc-metric-value">{value}</div>
      {helper ? <div className="lsc-metric-helper">{helper}</div> : null}
    </article>
  );
}

export function HeaderSelect({ label, icon: Icon, value, options, name, ariaLabel }: HeaderSelectProps) {
  return (
    <label className="lsc-header-select">
      <span className="lsc-header-select-label">
        <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
        {label}
      </span>
      <select name={name ?? label.toLowerCase()} defaultValue={value} aria-label={ariaLabel ?? label}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DataFreshness({ label = "Period", value }: DataFreshnessProps) {
  return (
    <span className="lsc-data-freshness">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

export function ChartFrame({ children }: { children: ReactNode }) {
  return <div className="lsc-chart-frame">{children}</div>;
}

export function CompactLedgerTable({ children }: { children: ReactNode }) {
  return <div className="table-wrapper clean-table compact-ledger-table">{children}</div>;
}
