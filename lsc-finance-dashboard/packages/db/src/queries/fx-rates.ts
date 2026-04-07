import "server-only";

import { queryRows } from "../query";
import { getBackend } from "./shared";

export type FxRate = {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  fetchedAt: string;
};

const FALLBACK_RATES: Record<string, number> = {
  "USD/INR": 84.5,
  "INR/USD": 0.01183,
  "USD/AED": 3.6725,
  "AED/USD": 0.2723,
  "INR/AED": 0.04347,
  "AED/INR": 23.01,
  "USD/KES": 129.5,
  "KES/USD": 0.00772
};

/**
 * Fetch live exchange rates from a free API.
 * Falls back to cached DB rates, then hardcoded fallbacks.
 */
export async function fetchLiveRate(
  base: string,
  target: string
): Promise<number> {
  if (base === target) return 1;

  // Try free API first
  try {
    const res = await fetch(
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`,
      { next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const data = await res.json() as Record<string, Record<string, number>>;
      const rates = data[base.toLowerCase()];
      if (rates && typeof rates[target.toLowerCase()] === "number") {
        return rates[target.toLowerCase()];
      }
    }
  } catch {
    // fall through
  }

  // Try DB cache
  if (getBackend() === "database") {
    const rows = await queryRows<{ rate: string }>(
      `select rate from fx_rates
       where base_currency = $1 and target_currency = $2
       order by fetched_at desc limit 1`,
      [base, target]
    );
    if (rows[0]) return Number(rows[0].rate);
  }

  // Hardcoded fallback
  const key = `${base}/${target}`;
  if (FALLBACK_RATES[key]) return FALLBACK_RATES[key];

  // Try inverse
  const inverseKey = `${target}/${base}`;
  if (FALLBACK_RATES[inverseKey]) return 1 / FALLBACK_RATES[inverseKey];

  return 1;
}

/**
 * Get multiple FX rates at once for dashboard display.
 */
export async function getFxRatesForDisplay(): Promise<FxRate[]> {
  const pairs = [
    ["USD", "INR"],
    ["USD", "AED"],
    ["USD", "KES"],
    ["INR", "USD"],
    ["AED", "USD"]
  ];

  const results: FxRate[] = [];
  for (const [base, target] of pairs) {
    const rate = await fetchLiveRate(base, target);
    results.push({
      baseCurrency: base,
      targetCurrency: target,
      rate,
      fetchedAt: new Date().toISOString()
    });
  }

  return results;
}

/**
 * Convert an amount between currencies using live rates.
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<{ converted: number; rate: number }> {
  const rate = await fetchLiveRate(from, to);
  return { converted: Number((amount * rate).toFixed(2)), rate };
}
