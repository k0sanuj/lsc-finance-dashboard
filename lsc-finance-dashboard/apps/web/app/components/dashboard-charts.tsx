import type { CashFlowRow } from "@lsc/db";

export type ChartTone = "good" | "secondary" | "warn" | "risk";

export type HorizontalBarRow = {
  label: string;
  value: number;
  displayValue?: string;
  sublabel?: string;
  tone?: ChartTone;
};

export function parseCurrency(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

export function formatCompactCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: Math.abs(value) >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000000 ? 1 : 0,
  }).format(value);
}

export function HorizontalMetricBars({ rows }: { rows: readonly HorizontalBarRow[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));

  if (rows.length === 0) {
    return <p className="muted">No derived data yet.</p>;
  }

  return (
    <div className="chart-list">
      {rows.map((row) => (
        <div className="chart-row" key={row.label}>
          <div className="chart-meta">
            <strong>{row.label}</strong>
            <span>{row.displayValue ?? formatCompactCurrency(row.value)}</span>
          </div>
          <div className="chart-track">
            <div
              className={`chart-fill ${row.tone ?? "secondary"}`}
              style={{ width: `${Math.max(6, (Math.abs(row.value) / max) * 100)}%` }}
            />
          </div>
          {row.sublabel ? <span className="subtle">{row.sublabel}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function CashTrendChart({ rows }: { rows: readonly CashFlowRow[] }) {
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [parseCurrency(row.cashIn), parseCurrency(row.cashOut)])
  );

  if (rows.length === 0) {
    return <p className="muted">No monthly cash movement available yet.</p>;
  }

  return (
    <div className="trend-bars">
      {rows.map((row) => {
        const cashIn = parseCurrency(row.cashIn);
        const cashOut = parseCurrency(row.cashOut);
        const inHeight = Math.max(16, (cashIn / max) * 160);
        const outHeight = Math.max(16, (cashOut / max) * 160);

        return (
          <div className="trend-column" key={row.month}>
            <div className="trend-stack">
              <div className="trend-bar" style={{ height: `${inHeight}px` }} />
              <div className="trend-bar secondary" style={{ height: `${outHeight}px` }} />
            </div>
            <div className="trend-meta">
              <strong>{row.month}</strong>
              <span className="subtle">{row.net}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
