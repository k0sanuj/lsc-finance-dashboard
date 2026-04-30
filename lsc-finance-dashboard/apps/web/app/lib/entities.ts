import type { Route } from "next";

export type VisibleEntityCode = "LSC" | "TBR" | "FSP" | "XTZ";
export type LegacyEntityCode = "XTE";
export type CompanyCodeInput = VisibleEntityCode | LegacyEntityCode | string;

export type EntityMetadata = {
  code: VisibleEntityCode;
  label: string;
  shortLabel: string;
  legalName: string;
  country: string;
  defaultCurrency: "USD" | "AED" | "INR";
  homeHref: Route;
  statusLabel: string;
  modules: string[];
};

export const VISIBLE_ENTITY_ORDER = ["LSC", "TBR", "FSP", "XTZ"] as const satisfies readonly VisibleEntityCode[];

export const ENTITY_REGISTRY: Record<VisibleEntityCode, EntityMetadata> = {
  LSC: {
    code: "LSC",
    label: "LSC / XTZ Esports Tech Ltd (Dubai)",
    shortLabel: "LSC",
    legalName: "XTZ Esports Tech Ltd",
    country: "United Arab Emirates",
    defaultCurrency: "USD",
    homeHref: "/" as Route,
    statusLabel: "Consolidated",
    modules: ["Holding company", "Portfolio metrics", "Legal sync", "Shared software"],
  },
  TBR: {
    code: "TBR",
    label: "Team Blue Rising",
    shortLabel: "TBR",
    legalName: "Team Blue Rising",
    country: "Global",
    defaultCurrency: "AED",
    homeHref: "/tbr" as Route,
    statusLabel: "Operating",
    modules: ["Race P&L", "Expenses", "Invoices", "Commercial goals"],
  },
  FSP: {
    code: "FSP",
    label: "Future of Sports",
    shortLabel: "FSP",
    legalName: "Future of Sports",
    country: "Global",
    defaultCurrency: "USD",
    homeHref: "/fsp" as Route,
    statusLabel: "Portfolio",
    modules: ["Sports assets", "Sponsorship", "Media revenue", "Scenario P&L"],
  },
  XTZ: {
    code: "XTZ",
    label: "XTZ India",
    shortLabel: "XTZ India",
    legalName: "XTZ India Private Limited",
    country: "India",
    defaultCurrency: "INR",
    homeHref: "/gig-workers" as Route,
    statusLabel: "Operating",
    modules: ["Payroll", "Gig workers", "Vendor invoices", "Payouts"],
  },
};

export function isVisibleEntityCode(value: string | null | undefined): value is VisibleEntityCode {
  return VISIBLE_ENTITY_ORDER.includes(String(value ?? "").toUpperCase() as VisibleEntityCode);
}

export function normalizeCompanyCode(
  value: CompanyCodeInput | null | undefined,
  fallback: VisibleEntityCode = "LSC"
): VisibleEntityCode {
  const upper = String(value ?? "").trim().toUpperCase();
  if (upper === "XTE") return "LSC";
  return isVisibleEntityCode(upper) ? upper : fallback;
}

export function getEntityMetadata(
  value: CompanyCodeInput | null | undefined,
  fallback: VisibleEntityCode = "LSC"
): EntityMetadata {
  return ENTITY_REGISTRY[normalizeCompanyCode(value, fallback)];
}

export function getVisibleEntities(codes: readonly VisibleEntityCode[] = VISIBLE_ENTITY_ORDER) {
  return codes.map((code) => ENTITY_REGISTRY[code]);
}

export function getCompanyOptions(codes: readonly VisibleEntityCode[] = VISIBLE_ENTITY_ORDER) {
  return getVisibleEntities(codes).map((entity) => ({
    value: entity.code,
    label: entity.label,
    shortLabel: entity.shortLabel,
    currency: entity.defaultCurrency,
  }));
}

export function formatEntityLabel(value: CompanyCodeInput | null | undefined, fallback: VisibleEntityCode = "LSC") {
  return getEntityMetadata(value, fallback).label;
}

export function formatEntityShortLabel(value: CompanyCodeInput | null | undefined, fallback: VisibleEntityCode = "LSC") {
  return getEntityMetadata(value, fallback).shortLabel;
}
