import "server-only";

import { isDatabaseConfigured } from "../connection";

export type DataBackend = "seed" | "database";

export type OverviewMetric = {
  label: string;
  value: string;
  scope: string;
};

export type EntitySnapshotRow = {
  code: "LSC" | "TBR" | "FSP";
  name: string;
  revenue: string;
  cost: string;
  margin: string;
  status: string;
  note: string;
};

export type CashFlowRow = {
  month: string;
  cashIn: string;
  cashOut: string;
  net: string;
};

export type PaymentRow = {
  vendor: string;
  race: string;
  category: string;
  dueDate: string;
  amount: string;
  status: string;
};

export type SponsorRow = {
  name: string;
  contractValue: string;
  recognizedRevenue: string;
  cashCollected: string;
};

export type TotalsAccumulator = {
  revenue: number;
  expenses: number;
  margin: number;
};

export type EntitySnapshotSource = {
  company_code: "LSC" | "TBR" | "FSP";
  company_name: string;
  recognized_revenue: string;
  approved_expenses: string;
  margin: string;
};

export type PaymentRowSource = {
  invoice_number: string | null;
  due_date: string | null;
  total_amount: string;
  invoice_status: string;
  race_name: string | null;
  description: string | null;
};

export type SponsorRowSource = {
  sponsor_name: string;
  total_contract_value: string;
  recognized_revenue: string;
  cash_collected: string;
};

export function getBackend(): DataBackend {
  return process.env.LSC_DATA_BACKEND === "database" ? "database" : "seed";
}

export function formatCurrency(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(numeric);
}

export function formatMonthLabel(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

export function formatDateLabel(value: string | null) {
  if (!value) {
    return "TBD";
  }

  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

export function formatDateValue(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function formatStatusLabel(value: string | null | undefined) {
  if (!value) {
    return "pending_review";
  }

  return value.replace(/_/g, " ");
}

export function formatExpenseSubmissionStatusLabel(value: string | null | undefined) {
  if (!value) {
    return "pending review";
  }

  if (value === "approved") {
    return "invoice ready";
  }

  return value.replace(/_/g, " ");
}

export function getBudgetSignalFromRank(rank: number | string | null | undefined) {
  const numeric = Number(rank ?? 0);
  if (numeric >= 3) {
    return "above_budget";
  }

  if (numeric === 2) {
    return "close_to_budget";
  }

  if (numeric === 1) {
    return "below_budget";
  }

  return "no_rule";
}

export function formatBudgetSignalLabel(value: string | null | undefined) {
  switch (value) {
    case "above_budget":
      return "above budget";
    case "close_to_budget":
      return "close to budget";
    case "below_budget":
      return "below budget";
    default:
      return "no budget rule";
  }
}

export function formatBudgetSignalTone(value: string | null | undefined) {
  switch (value) {
    case "above_budget":
      return "risk";
    case "close_to_budget":
      return "warn";
    case "below_budget":
      return "good";
    default:
      return "muted";
  }
}

export function formatBudgetUnitLabel(value: string | null | undefined) {
  switch (value) {
    case "per_day":
      return "per day";
    case "per_person":
      return "per person";
    case "per_race":
      return "per race";
    case "total":
      return "total";
    default:
      return "per race";
  }
}

export function formatDecimalAmount(value: number | string | null | undefined, currencyCode = "USD") {
  const numeric = Number(value ?? 0);
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    return numeric.toFixed(2);
  }

  const safeCurrency = currencyCode;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: 2
  }).format(numeric);
}

export function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function countryCodeToFlag(countryCode: string) {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

export function inferRaceGeography(raceName: string, location: string | null) {
  const haystack = normalizeText(`${raceName} ${location ?? ""}`);

  const knownMappings = [
    { match: ["jeddah", "saudi"], countryCode: "SA", countryName: "Saudi Arabia" },
    { match: ["doha", "qatar"], countryCode: "QA", countryName: "Qatar" },
    { match: ["dubrovnik", "croatia"], countryCode: "HR", countryName: "Croatia" },
    { match: ["lagos", "nigeria"], countryCode: "NG", countryName: "Nigeria" },
    { match: ["miami", "united states", "usa"], countryCode: "US", countryName: "United States" },
    { match: ["monaco"], countryCode: "MC", countryName: "Monaco" },
    { match: ["venice", "italy"], countryCode: "IT", countryName: "Italy" },
    { match: ["milan", "italy"], countryCode: "IT", countryName: "Italy" }
  ];

  for (const mapping of knownMappings) {
    if (mapping.match.some((token) => haystack.includes(token))) {
      return {
        countryCode: mapping.countryCode,
        countryName: mapping.countryName,
        countryFlag: countryCodeToFlag(mapping.countryCode)
      };
    }
  }

  return {
    countryCode: "UN",
    countryName: "Unknown",
    countryFlag: "\u{1F3C1}"
  };
}

export function getSeasonLabel(seasonYear: number, orderedYears: number[]) {
  const seasonNumber = orderedYears.findIndex((year) => year === seasonYear) + 1;
  return seasonNumber > 0 ? `Season ${seasonNumber} \u00B7 ${seasonYear}` : `Season \u00B7 ${seasonYear}`;
}

export function parseMoney(value: string) {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

export function formatHumanLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function parseIntakeFields(summary: Record<string, unknown> | null) {
  const intakePayload =
    summary && typeof summary.intakePayload === "object" && summary.intakePayload
      ? (summary.intakePayload as Record<string, unknown>)
      : null;
  const operatorFields =
    intakePayload && typeof intakePayload.operatorFields === "object" && intakePayload.operatorFields
      ? (intakePayload.operatorFields as Record<string, unknown>)
      : {};

  return Object.entries(operatorFields)
    .filter((entry) => Boolean(String(entry[1] ?? "").trim()))
    .map((entry) => ({
      label: formatHumanLabel(entry[0]),
      value: String(entry[1])
    }));
}

export function parsePlatformUpdates(summary: Record<string, unknown> | null) {
  const updates = Array.isArray(summary?.platformUpdates) ? summary.platformUpdates : [];

  return updates
    .filter(
      (entry): entry is { area: unknown; effect: unknown } =>
        Boolean(entry && typeof entry === "object")
    )
    .map((entry) => ({
      area: String(entry.area ?? "Platform"),
      effect: String(entry.effect ?? "No effect recorded yet.")
    }));
}

export function getDataBackendStatus() {
  return {
    backend: getBackend(),
    databaseConfigured: isDatabaseConfigured()
  } as const;
}
