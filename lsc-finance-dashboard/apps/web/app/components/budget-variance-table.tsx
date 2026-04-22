/**
 * BudgetVarianceTable — shared component that renders a budget/actual/variance
 * grid with color-coded signals. Used on TBR cost breakdowns + FSP sport pages.
 *
 * Signals:
 *   under       — actual < 95% of approved (green)
 *   approaching — 95-99.9% of approved (amber)
 *   on_track    — exactly on budget or no approved baseline
 *   over        — actual > approved (red)
 */
type VarianceSignal = "under" | "on_track" | "approaching" | "over";

type Row = {
  label: string;
  sublabel?: string;
  approved: number;
  actual: number;
  variance: number;
  variancePct: number;
  signal: VarianceSignal;
};

function fmtCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtVariance(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPct(p: number): string {
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function signalClass(signal: VarianceSignal): string {
  switch (signal) {
    case "under":
      return "variance-under";
    case "approaching":
      return "variance-approaching";
    case "over":
      return "variance-over";
    default:
      return "variance-on-track";
  }
}

function signalLabel(signal: VarianceSignal): string {
  switch (signal) {
    case "under":
      return "Under";
    case "approaching":
      return "Approaching";
    case "over":
      return "Over";
    default:
      return "On track";
  }
}

export function BudgetVarianceTable({
  rows,
  labelHeader = "Category",
  emptyMessage = "No budget rules defined yet — variance can't be computed.",
}: {
  rows: Row[];
  labelHeader?: string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.approved += r.approved;
      acc.actual += r.actual;
      return acc;
    },
    { approved: 0, actual: 0 }
  );
  const totalVariance = Number((totals.actual - totals.approved).toFixed(2));
  const totalPct =
    totals.approved > 0
      ? Number(((totals.actual / totals.approved - 1) * 100).toFixed(1))
      : 0;
  const totalSignal: VarianceSignal =
    totals.approved <= 0
      ? "on_track"
      : totals.actual / totals.approved > 1
        ? "over"
        : totals.actual / totals.approved > 0.95
          ? "approaching"
          : "under";

  return (
    <div className="table-wrapper clean-table">
      <table>
        <thead>
          <tr>
            <th>{labelHeader}</th>
            <th className="text-right">Budget</th>
            <th className="text-right">Actual</th>
            <th className="text-right">Variance</th>
            <th className="text-right">Variance %</th>
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={signalClass(r.signal)}>
              <td>
                <strong>{r.label}</strong>
                {r.sublabel ? (
                  <>
                    <br />
                    <span className="muted text-xs">{r.sublabel}</span>
                  </>
                ) : null}
              </td>
              <td className="text-right">{fmtCurrency(r.approved)}</td>
              <td className="text-right">{fmtCurrency(r.actual)}</td>
              <td className="text-right">{fmtVariance(r.variance)}</td>
              <td className="text-right">{fmtPct(r.variancePct)}</td>
              <td>
                <span className={`pill signal-pill signal-${signalBadgeTone(r.signal)}`}>
                  {signalLabel(r.signal)}
                </span>
              </td>
            </tr>
          ))}
          <tr className={`row-total ${signalClass(totalSignal)}`}>
            <td>Total</td>
            <td className="text-right">{fmtCurrency(totals.approved)}</td>
            <td className="text-right">{fmtCurrency(totals.actual)}</td>
            <td className="text-right">{fmtVariance(totalVariance)}</td>
            <td className="text-right">{fmtPct(totalPct)}</td>
            <td>
              <span className={`pill signal-pill signal-${signalBadgeTone(totalSignal)}`}>
                {signalLabel(totalSignal)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function signalBadgeTone(signal: VarianceSignal): string {
  switch (signal) {
    case "under":
      return "good";
    case "approaching":
      return "warn";
    case "over":
      return "risk";
    default:
      return "good";
  }
}
