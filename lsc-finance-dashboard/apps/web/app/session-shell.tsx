"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect, Suspense } from "react";
import {
  BarChart3,
  BrainCircuit,
  Building2,
  CircleDollarSign,
  CreditCard,
  FileText,
  FolderOpen,
  Layers3,
  LogOut,
  Menu,
  Settings2,
  Trophy,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AppUserRole } from "../lib/auth";
import { ToastNotice } from "./components/toast-notice";
import { CommandPalette } from "./components/command-palette";
import { PALETTE_COMMANDS } from "./components/command-list";
import { CmdKTrigger } from "./components/cmdk-trigger";
import { ENTITY_REGISTRY, getEntityMetadata, normalizeCompanyCode } from "./lib/entities";

type NavSubLink = {
  href: Route;
  label: string;
};

type NavLink = {
  href: Route;
  label: string;
  roles: AppUserRole[];
  /**
   * Optional sub-links shown only when the parent link's path is the
   * current pathname (exact or prefix). Used for per-sport tab shortcuts.
   */
  subLinks?: NavSubLink[];
};

type NavSection = {
  label: string;
  links: NavLink[];
};

type CompanyNav = {
  href: Route;
  label: string;
  roles: AppUserRole[];
  sections: NavSection[];
};

type SessionShellProps = {
  children: React.ReactNode;
  user: {
    fullName: string;
    role: AppUserRole;
  } | null;
};

const ALL_ADMIN: AppUserRole[] = ["super_admin", "finance_admin"];
const ALL_ROLES: AppUserRole[] = ["super_admin", "finance_admin", "commercial_user", "viewer"];

/** Routes that appear in multiple company navs — use ?company= to disambiguate */
const SHARED_PEOPLE_ROUTES = ["/employees", "/salary-payable"];

/** Map a company code in URL to sidebar section label */
function companyCodeToLabel(code: string | undefined | null): string | null {
  if (!code) return null;
  return getEntityMetadata(code).shortLabel;
}

function companyCodeToHref(code: string | undefined | null): Route {
  const normalized = normalizeCompanyCode(code, "TBR");
  return ENTITY_REGISTRY[normalized].homeHref;
}

function getLscNav(): CompanyNav {
  return {
    href: "/",
    label: "LSC",
    roles: ALL_ROLES,
    sections: [
      {
        label: "Command Center",
        links: [
          { href: "/costs/LSC" as Route, label: "Costs", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/payments/LSC" as Route, label: "Payments", roles: ALL_ADMIN },
          { href: "/receivables/LSC" as Route, label: "Receivables", roles: ALL_ADMIN },
          { href: "/documents/LSC" as Route, label: "Documents", roles: ALL_ADMIN },
          { href: "/commercial-goals/LSC" as Route, label: "Commercial Goals", roles: ALL_ROLES },
        ],
      },
      {
        label: "Shared Finance",
        links: [
          { href: "/subscriptions" as Route, label: "Subscriptions", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/vendors" as Route, label: "Vendors", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/treasury" as Route, label: "Treasury & Cash Flow", roles: ALL_ADMIN },
          { href: "/deal-pipeline" as Route, label: "Deal Pipeline", roles: ALL_ADMIN },
          { href: "/event-budgets" as Route, label: "Event Budgets", roles: ALL_ADMIN },
        ],
      },
      {
        label: "Control",
        links: [
          { href: "/ai-ingest" as Route, label: "AI Data Ingestion", roles: ALL_ADMIN },
          { href: "/ai-analysis" as Route, label: "AI Analysis", roles: ALL_ADMIN },
          { href: "/cap-table" as Route, label: "Cap Table", roles: ALL_ADMIN },
          { href: "/litigation" as Route, label: "Litigation & Compliance", roles: ALL_ADMIN },
          { href: "/tax-filings" as Route, label: "Tax & Filing", roles: ALL_ADMIN },
          { href: "/arena-ads" as Route, label: "Arena & Ads", roles: ALL_ADMIN },
        ],
      },
    ],
  };
}

function getTbrNav(): CompanyNav {
  return {
    href: "/tbr",
    label: "TBR",
    roles: ALL_ROLES,
    sections: [
      {
        label: "Operations",
        links: [
          { href: "/tbr/my-expenses", label: "My Expenses", roles: ALL_ADMIN },
          { href: "/tbr/races", label: "Races", roles: ALL_ADMIN },
          { href: "/tbr/expense-management", label: "Expense Review", roles: ALL_ADMIN },
          { href: "/tbr/invoice-hub", label: "Invoice Hub", roles: ALL_ADMIN },
          { href: "/tbr/team-management", label: "Team Management", roles: ALL_ADMIN },
        ],
      },
      {
        label: "Finance",
        links: [
          { href: "/tbr/operating-expenses", label: "Operating Expenses", roles: ALL_ADMIN },
          { href: "/tbr/e1-accounting", label: "E1 Accounting", roles: ALL_ADMIN },
          { href: "/tbr/overall-pnl", label: "Overall P&L", roles: ALL_ADMIN },
          { href: "/costs/TBR" as Route, label: "Costs", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/payments/TBR" as Route, label: "Payments", roles: ALL_ADMIN },
          { href: "/receivables/TBR" as Route, label: "Receivables", roles: ALL_ADMIN },
          { href: "/documents/TBR" as Route, label: "Documents", roles: ALL_ADMIN },
          { href: "/vendors" as Route, label: "Vendors", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/subscriptions" as Route, label: "Subscriptions", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/cap-table" as Route, label: "Cap Table", roles: ALL_ADMIN },
          { href: "/litigation" as Route, label: "Litigation & Compliance", roles: ALL_ADMIN },
          { href: "/arena-ads" as Route, label: "Arena & Ads", roles: ALL_ADMIN },
          { href: "/tax-filings" as Route, label: "Tax & Filing", roles: ALL_ADMIN },
        ],
      },
      {
        label: "People",
        links: [
          { href: "/employees?company=TBR" as Route, label: "Employees", roles: ALL_ADMIN },
          { href: "/salary-payable?company=TBR" as Route, label: "Salary Payable", roles: ALL_ADMIN },
        ],
      },
      {
        label: "Intelligence",
        links: [
          { href: "/deal-pipeline" as Route, label: "Deal Pipeline", roles: ALL_ADMIN },
          { href: "/treasury" as Route, label: "Treasury & Cash Flow", roles: ALL_ADMIN },
          { href: "/event-budgets" as Route, label: "Event Budgets", roles: ALL_ADMIN },
          { href: "/ai-ingest" as Route, label: "AI Data Ingestion", roles: ALL_ADMIN },
        ],
      },
      {
        label: "Strategy",
        links: [
          { href: "/commercial-goals/TBR" as Route, label: "Commercial Goals", roles: ALL_ROLES },
          { href: "/ai-analysis", label: "AI Analysis", roles: ALL_ADMIN },
        ],
      },
    ],
  };
}

/**
 * Shared sub-tabs rendered under each sport link in the FSP sidebar when
 * the user is on that sport's page. Keep short — too many sub-links
 * clutters the sidebar.
 */
function sportSubLinks(sportCode: string): NavSubLink[] {
  return [
    { href: `/fsp/sports/${sportCode}?tab=overview` as Route, label: "Overview" },
    { href: `/fsp/sports/${sportCode}?tab=summary` as Route, label: "P&L" },
    { href: `/fsp/sports/${sportCode}?tab=sponsorship` as Route, label: "Sponsorship" },
    { href: `/fsp/sports/${sportCode}?tab=media` as Route, label: "Media" },
    { href: `/fsp/sports/${sportCode}?tab=opex` as Route, label: "OPEX" },
    { href: `/fsp/sports/${sportCode}?tab=league-payroll` as Route, label: "Payroll" },
  ];
}

function getFspNav(): CompanyNav {
  return {
    href: "/fsp",
    label: "FSP",
    roles: ALL_ROLES,
    sections: [
      {
        label: "Sports",
        links: [
          { href: "/fsp/sports" as Route, label: "All Sports", roles: ALL_ADMIN },
          { href: "/fsp/consolidated" as Route, label: "Consolidated P&L", roles: ALL_ADMIN },
          {
            href: "/fsp/sports/squash" as Route,
            label: "Squash (WPS)",
            roles: ALL_ADMIN,
            subLinks: sportSubLinks("squash"),
          },
          {
            href: "/fsp/sports/bowling" as Route,
            label: "Bowling (WBL)",
            roles: ALL_ADMIN,
            subLinks: sportSubLinks("bowling"),
          },
          {
            href: "/fsp/sports/basketball" as Route,
            label: "Basketball",
            roles: ALL_ADMIN,
            subLinks: sportSubLinks("basketball"),
          },
          {
            href: "/fsp/sports/world_pong" as Route,
            label: "World Pong",
            roles: ALL_ADMIN,
            subLinks: sportSubLinks("world_pong"),
          },
          {
            href: "/fsp/sports/foundation" as Route,
            label: "Foundation",
            roles: ALL_ADMIN,
            subLinks: sportSubLinks("foundation"),
          },
        ],
      },
      {
        label: "Finance",
        links: [
          { href: "/costs/FSP" as Route, label: "Costs", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/commercial-goals/FSP" as Route, label: "Commercial Goals", roles: ALL_ROLES },
          { href: "/documents/FSP" as Route, label: "Documents", roles: ALL_ADMIN },
          { href: "/fsp/sp-multiplier" as Route, label: "SP Multiplier", roles: ALL_ADMIN },
        ],
      },
    ],
  };
}

function getXtzNav(): CompanyNav {
  return {
    href: "/xtz" as Route,
    label: "XTZ India",
    roles: ALL_ADMIN,
    sections: [
      {
        label: "People",
        links: [
          { href: "/costs/XTZ" as Route, label: "Costs", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/employees?company=XTZ" as Route, label: "Employees", roles: ALL_ADMIN },
          { href: "/salary-payable?company=XTZ" as Route, label: "Salary Payable", roles: ALL_ADMIN },
          { href: "/payroll-invoices" as Route, label: "XTZ Invoice Dashboard", roles: ALL_ADMIN },
          { href: "/payroll-invoices/generator" as Route, label: "Generate XTZ Invoice", roles: ALL_ADMIN },
          { href: "/gig-workers" as Route, label: "Gig Workers", roles: ALL_ADMIN },
        ],
      },
      {
        label: "Expenses",
        links: [
          { href: "/xtz-expenses?view=submit" as Route, label: "Submit Expense", roles: [...ALL_ADMIN, "team_member"] },
          { href: "/xtz-expenses?view=review" as Route, label: "Expense Review", roles: ALL_ADMIN },
        ],
      },
    ],
  };
}

function getTeamMemberNav(): CompanyNav {
  return {
    href: "/tbr",
    label: "TBR",
    roles: ["team_member"],
    sections: [
      {
        label: "My Work",
        links: [
          { href: "/tbr/my-expenses", label: "My Expenses", roles: ["team_member"] },
          { href: "/tbr/races", label: "Races", roles: ["team_member"] },
        ],
      },
    ],
  };
}

function getWorkspaceLabel(pathname: string) {
  if (pathname.startsWith("/tbr/races/")) return "Race Workspace";
  if (pathname.startsWith("/tbr/races")) return "Races";
  if (pathname.startsWith("/tbr/my-expenses")) return "My Expenses";
  if (pathname.startsWith("/tbr/expense-management/")) return "Submission Review";
  if (pathname.startsWith("/tbr/expense-management")) return "Expense Review";
  if (pathname.startsWith("/tbr/invoice-hub")) return "Invoice Hub";
  if (pathname.startsWith("/tbr/operating-expenses")) return "Operating Expenses";
  if (pathname.startsWith("/tbr/e1-accounting")) return "E1 Accounting";
  if (pathname.startsWith("/tbr/overall-pnl")) return "Overall P&L";
  if (pathname.startsWith("/tbr/team-management")) return "Team Management";
  if (pathname.startsWith("/tbr")) return "TBR Overview";
  if (pathname === "/xtz" || pathname.startsWith("/xtz/")) return "XTZ Overview";
  if (pathname.startsWith("/fsp")) return "FSP";
  if (pathname.startsWith("/commercial-goals")) return "Commercial Goals";
  if (pathname.startsWith("/costs")) return "Costs";
  if (pathname.startsWith("/payments")) return "Payments";
  if (pathname.startsWith("/receivables")) return "Receivables";
  if (pathname.startsWith("/subscriptions")) return "Subscriptions";
  if (pathname.startsWith("/vendors")) return "Vendors";
  if (pathname.startsWith("/cap-table")) return "Cap Table";
  if (pathname.startsWith("/litigation")) return "Litigation & Compliance";
  if (pathname.startsWith("/xtz-expenses")) return "XTZ Expenses";
  if (pathname.startsWith("/gig-workers")) return "Gig Workers";
  if (pathname.startsWith("/deal-pipeline")) return "Deal Pipeline";
  if (pathname.startsWith("/treasury")) return "Treasury & Cash Flow";
  if (pathname.startsWith("/event-budgets")) return "Event Budgets";
  if (pathname.startsWith("/ai-ingest")) return "AI Data Ingestion";
  if (pathname.startsWith("/sports-dashboard")) return "Sports Dashboard";
  if (pathname.startsWith("/fsp/consolidated")) return "FSP Consolidated P&L";
  if (pathname.startsWith("/fsp/sports/")) return "Sport Module";
  if (pathname.startsWith("/fsp/sp-multiplier")) return "SP Multiplier";
  if (pathname.startsWith("/tax-filings")) return "Tax & Filing";
  if (pathname.startsWith("/arena-ads")) return "Arena & Ads";
  if (pathname.startsWith("/employees")) return "Employees";
  if (pathname.startsWith("/salary-payable")) return "Salary Payable";
  if (pathname.startsWith("/payroll-invoices/generator")) return "Generate XTZ Invoice";
  if (pathname.endsWith("/edit") && pathname.startsWith("/payroll-invoices/")) return "Edit Invoice";
  if (pathname.startsWith("/payroll-invoices/")) return "Invoice Detail";
  if (pathname.startsWith("/payroll-invoices")) return "XTZ Invoice Dashboard";
  if (pathname.startsWith("/fsp/sports")) return "FSP Sports";
  if (pathname.startsWith("/messaging")) return "Cross-Dashboard Messages";
  if (pathname.startsWith("/audit-reports")) return "Audit Reports";
  if (pathname.startsWith("/audit-log")) return "Audit Log";
  if (pathname.startsWith("/qb")) return "QuickBooks";
  if (pathname.startsWith("/legal-integration")) return "Legal Integration";
  if (pathname.startsWith("/project-checklist")) return "Project Checklist";
  if (pathname.startsWith("/copilot")) return "Finance Copilot";
  if (pathname.startsWith("/analyzers")) return "AI Analyzers";
  if (pathname.startsWith("/documents")) return "Documents";
  if (pathname.startsWith("/ai-analysis")) return "AI Analysis";
  if (pathname.startsWith("/agent-graph")) return "Agent Graph";
  if (pathname.startsWith("/workflow-graph")) return "Workflow Graph";
  return "Portfolio Overview";
}

function getBreadcrumbs(pathname: string): Array<{ label: string; href?: string }> {
  if (pathname === "/" || pathname === "/login") return [];

  const crumbs: Array<{ label: string; href?: string }> = [];

  if (pathname.startsWith("/tbr/races/")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "Races", href: "/tbr/races" }, { label: "Race Detail" });
  } else if (pathname.startsWith("/tbr/expense-management/")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "Expense Review", href: "/tbr/expense-management" }, { label: "Submission" });
  } else if (pathname.startsWith("/tbr/")) {
    crumbs.push({ label: "TBR", href: "/tbr" });
    const sub = pathname.replace("/tbr/", "").split("/")[0];
    const labels: Record<string, string> = {
      races: "Races", "my-expenses": "My Expenses", "expense-management": "Expense Review",
      "invoice-hub": "Invoice Hub", "team-management": "Team Management",
      "operating-expenses": "Operating Expenses", "e1-accounting": "E1 Accounting",
      "overall-pnl": "Overall P&L",
    };
    if (labels[sub]) crumbs.push({ label: labels[sub] });
  } else if (pathname.startsWith("/costs/")) {
    const c = companyCodeToLabel(pathname.slice("/costs/".length).split("/")[0]) ?? "TBR";
    crumbs.push({ label: c, href: companyCodeToHref(pathname.slice("/costs/".length).split("/")[0]) }, { label: "Costs" });
  } else if (pathname.startsWith("/payments/")) {
    const c = companyCodeToLabel(pathname.slice("/payments/".length).split("/")[0]) ?? "TBR";
    crumbs.push({ label: c, href: companyCodeToHref(pathname.slice("/payments/".length).split("/")[0]) }, { label: "Payments" });
  } else if (pathname.startsWith("/receivables/")) {
    const c = companyCodeToLabel(pathname.slice("/receivables/".length).split("/")[0]) ?? "TBR";
    crumbs.push({ label: c, href: companyCodeToHref(pathname.slice("/receivables/".length).split("/")[0]) }, { label: "Receivables" });
  } else if (pathname.startsWith("/documents/")) {
    const c = companyCodeToLabel(pathname.slice("/documents/".length).split("/")[0]) ?? "TBR";
    crumbs.push({ label: c, href: companyCodeToHref(pathname.slice("/documents/".length).split("/")[0]) }, { label: "Documents" });
  } else if (pathname.startsWith("/commercial-goals/")) {
    const c = companyCodeToLabel(pathname.slice("/commercial-goals/".length).split("/")[0]) ?? "TBR";
    crumbs.push({ label: c, href: companyCodeToHref(pathname.slice("/commercial-goals/".length).split("/")[0]) }, { label: "Commercial Goals" });
  } else if (pathname.startsWith("/subscriptions")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Subscriptions" });
  } else if (pathname.startsWith("/vendors")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Vendors" });
  } else if (pathname.startsWith("/cap-table")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Cap Table" });
  } else if (pathname.startsWith("/litigation")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Litigation & Compliance" });
  } else if (pathname.startsWith("/xtz-expenses")) {
    crumbs.push({ label: "XTZ India", href: "/xtz" }, { label: "Expenses" });
  } else if (pathname.startsWith("/gig-workers")) {
    crumbs.push({ label: "XTZ India", href: "/xtz" }, { label: "Gig Workers" });
  } else if (pathname === "/xtz" || pathname.startsWith("/xtz/")) {
    crumbs.push({ label: "XTZ India" });
  } else if (pathname.startsWith("/deal-pipeline")) {
    crumbs.push({ label: "Intelligence" }, { label: "Deal Pipeline" });
  } else if (pathname.startsWith("/treasury")) {
    crumbs.push({ label: "Intelligence" }, { label: "Treasury & Cash Flow" });
  } else if (pathname.startsWith("/event-budgets")) {
    crumbs.push({ label: "Intelligence" }, { label: "Event Budgets" });
  } else if (pathname.startsWith("/ai-ingest")) {
    crumbs.push({ label: "Intelligence" }, { label: "AI Data Ingestion" });
  } else if (pathname.startsWith("/sports-dashboard")) {
    crumbs.push({ label: "Sports Dashboard" });
  } else if (pathname.startsWith("/fsp/consolidated")) {
    crumbs.push({ label: "FSP", href: "/fsp" }, { label: "Consolidated P&L" });
  } else if (pathname.startsWith("/fsp/sports/")) {
    crumbs.push({ label: "FSP", href: "/fsp" }, { label: "Sports", href: "/fsp/sports" }, { label: "Module" });
  } else if (pathname.startsWith("/fsp/sports")) {
    crumbs.push({ label: "FSP", href: "/fsp" }, { label: "Sports" });
  } else if (pathname.startsWith("/fsp/sp-multiplier")) {
    crumbs.push({ label: "FSP", href: "/fsp" }, { label: "SP Multiplier" });
  } else if (pathname.startsWith("/employees")) {
    crumbs.push({ label: "People" }, { label: "Employees" });
  } else if (pathname.startsWith("/salary-payable")) {
    crumbs.push({ label: "People" }, { label: "Salary Payable" });
  } else if (pathname.startsWith("/payroll-invoices")) {
    crumbs.push({ label: "People" }, { label: "Payroll Invoices" });
  } else if (pathname.startsWith("/tax-filings")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Tax & Filing" });
  } else if (pathname.startsWith("/arena-ads")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Arena & Ads" });
  } else if (pathname.startsWith("/messaging")) {
    crumbs.push({ label: "System" }, { label: "Cross-Dashboard Messages" });
  } else if (pathname.startsWith("/audit-reports")) {
    crumbs.push({ label: "System" }, { label: "Audit Reports" });
  } else if (pathname.startsWith("/audit-log")) {
    crumbs.push({ label: "System" }, { label: "Audit Log" });
  } else if (pathname.startsWith("/qb")) {
    crumbs.push({ label: "System" }, { label: "QuickBooks" });
  } else if (pathname.startsWith("/legal-integration")) {
    crumbs.push({ label: "System" }, { label: "Legal Integration" });
  } else if (pathname.startsWith("/project-checklist")) {
    crumbs.push({ label: "Project Checklist" });
  } else if (pathname.startsWith("/copilot")) {
    crumbs.push({ label: "Portfolio" }, { label: "Finance Copilot" });
  } else if (pathname.startsWith("/analyzers")) {
    crumbs.push({ label: "Portfolio" }, { label: "AI Analyzers" });
  } else if (pathname.startsWith("/ai-analysis")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "AI Analysis" });
  }

  return crumbs;
}

type PrimaryNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  roles: AppUserRole[];
  isActive: (pathname: string, searchParams: URLSearchParams) => boolean;
};

const SYSTEM_PATHS = [
  "/agent-graph",
  "/workflow-graph",
  "/messaging",
  "/audit-reports",
  "/audit-log",
  "/qb",
  "/legal-integration",
  "/project-checklist",
];

const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  {
    href: "/" as Route,
    label: "Overview",
    icon: BarChart3,
    roles: ALL_ROLES,
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/costs/LSC" as Route,
    label: "LSC",
    icon: Building2,
    roles: ALL_ROLES,
    isActive: (pathname, searchParams) =>
      pathname.startsWith("/costs/LSC") ||
      pathname.startsWith("/payments/LSC") ||
      pathname.startsWith("/receivables/LSC") ||
      pathname.startsWith("/documents/LSC") ||
      pathname.startsWith("/commercial-goals/LSC") ||
      pathname.startsWith("/subscriptions") ||
      pathname.startsWith("/vendors") ||
      pathname.startsWith("/treasury") ||
      pathname.startsWith("/deal-pipeline") ||
      pathname.startsWith("/event-budgets") ||
      pathname.startsWith("/cap-table") ||
      pathname.startsWith("/litigation") ||
      pathname.startsWith("/tax-filings") ||
      pathname.startsWith("/arena-ads") ||
      (pathname.startsWith("/employees") && searchParams.get("company") === "LSC") ||
      (pathname.startsWith("/salary-payable") && searchParams.get("company") === "LSC"),
  },
  {
    href: "/tbr" as Route,
    label: "TBR",
    icon: Trophy,
    roles: ALL_ROLES,
    isActive: (pathname) =>
      pathname.startsWith("/tbr") ||
      pathname.startsWith("/costs/TBR") ||
      pathname.startsWith("/payments/TBR") ||
      pathname.startsWith("/receivables/TBR") ||
      pathname.startsWith("/documents/TBR") ||
      pathname.startsWith("/commercial-goals/TBR"),
  },
  {
    href: "/fsp" as Route,
    label: "FSP",
    icon: Layers3,
    roles: ALL_ROLES,
    isActive: (pathname) =>
      pathname.startsWith("/fsp") ||
      pathname.startsWith("/costs/FSP") ||
      pathname.startsWith("/documents/FSP") ||
      pathname.startsWith("/commercial-goals/FSP"),
  },
  {
    href: "/xtz" as Route,
    label: "XTZ",
    icon: WalletCards,
    roles: ALL_ADMIN,
    isActive: (pathname, searchParams) =>
      pathname === "/xtz" ||
      pathname.startsWith("/xtz/") ||
      pathname.startsWith("/gig-workers") ||
      pathname.startsWith("/xtz-expenses") ||
      pathname.startsWith("/costs/XTZ") ||
      pathname.startsWith("/payroll-invoices") ||
      (pathname.startsWith("/employees") && searchParams.get("company") === "XTZ") ||
      (pathname.startsWith("/salary-payable") && searchParams.get("company") === "XTZ"),
  },
  {
    href: "/costs/LSC" as Route,
    label: "Costs",
    icon: CircleDollarSign,
    roles: [...ALL_ADMIN, "viewer"],
    isActive: (pathname) => pathname.startsWith("/costs"),
  },
  {
    href: "/payments/LSC" as Route,
    label: "Payments",
    icon: CreditCard,
    roles: ALL_ADMIN,
    isActive: (pathname) => pathname.startsWith("/payments") || pathname.startsWith("/treasury"),
  },
  {
    href: "/documents/LSC" as Route,
    label: "Documents",
    icon: FolderOpen,
    roles: ALL_ADMIN,
    isActive: (pathname) => pathname.startsWith("/documents"),
  },
  {
    href: "/ai-analysis" as Route,
    label: "AI",
    icon: BrainCircuit,
    roles: ALL_ADMIN,
    isActive: (pathname) =>
      pathname.startsWith("/ai-analysis") ||
      pathname.startsWith("/ai-ingest") ||
      pathname.startsWith("/copilot") ||
      pathname.startsWith("/analyzers"),
  },
  {
    href: "/agent-graph" as Route,
    label: "System",
    icon: Settings2,
    roles: ALL_ADMIN,
    isActive: (pathname) => SYSTEM_PATHS.some((path) => pathname.startsWith(path)),
  },
];

function getSystemNav(): NavSection[] {
  return [
    {
      label: "System",
      links: [
        { href: "/agent-graph" as Route, label: "Agent Graph", roles: ALL_ADMIN },
        { href: "/agent-graph/dispatcher-status" as Route, label: "Dispatcher Status", roles: ALL_ADMIN },
        { href: "/workflow-graph" as Route, label: "Workflow Graph", roles: ALL_ADMIN },
        { href: "/messaging" as Route, label: "Messages", roles: ALL_ADMIN },
        { href: "/audit-reports" as Route, label: "Audit Reports", roles: ALL_ADMIN },
        { href: "/audit-log" as Route, label: "Audit Log", roles: ALL_ADMIN },
        { href: "/qb" as Route, label: "QuickBooks", roles: ALL_ADMIN },
        { href: "/legal-integration" as Route, label: "Legal Integration", roles: ALL_ADMIN },
      ],
    },
  ];
}

function getInitials(fullName?: string) {
  if (!fullName) return "LS";
  const parts = fullName.split(/\s+/).map((p) => p.trim()).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function SessionShellInner({ children, user }: SessionShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const role = user?.role ?? null;

  const companies: CompanyNav[] = role === "team_member"
    ? [getTeamMemberNav()]
    : [getLscNav(), getTbrNav(), getFspNav(), getXtzNav()];

  const visiblePrimaryNav = PRIMARY_NAV_ITEMS.filter((item) => !role || item.roles.includes(role));

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";

    const [hrefPath, hrefQuery] = href.split("?");

    // Path must match
    if (pathname !== hrefPath && !pathname.startsWith(`${hrefPath}/`)) return false;

    if (hrefQuery) {
      // Href has query params — all must be present in current URL
      const hrefParams = new URLSearchParams(hrefQuery);
      for (const [key, val] of hrefParams) {
        if (searchParams.get(key) !== val) return false;
      }
    } else {
      // Href has NO query params — if this is a shared route and the URL
      // has a company param, don't match (the company-specific link should match instead)
      const isShared = SHARED_PEOPLE_ROUTES.some((r) => hrefPath.startsWith(r));
      if (isShared && searchParams.has("company")) return false;
    }

    return true;
  };

  const isCompanyActive = (company: CompanyNav) => {
    if (isActive(company.href)) return true;
    return company.sections.some((s) => s.links.some((l) => isActive(l.href)));
  };

  const breadcrumbs = getBreadcrumbs(pathname);
  const activeCompany = companies.find(isCompanyActive);
  const contextSections =
    activeCompany?.sections ??
    (role && ALL_ADMIN.includes(role) && SYSTEM_PATHS.some((path) => pathname.startsWith(path))
      ? getSystemNav()
      : []);
  const contextLinks = contextSections
    .flatMap((section) => section.links)
    .filter((link) => !role || link.roles.includes(role));
  const topbarSubtitle = activeCompany
    ? `${activeCompany.label} workspace · ${contextLinks.length} linked modules`
    : "4 entities · live finance data · canonical metrics only";
  const selectedEntity = activeCompany?.label === "XTZ India" ? "XTZ" : activeCompany?.label ?? "LSC";
  const topbarEntityOptions =
    role === "team_member"
      ? [{ value: "TBR", label: "TBR" }]
      : [
          { value: "LSC", label: "LSC" },
          { value: "TBR", label: "TBR" },
          { value: "FSP", label: "FSP" },
          { value: "XTZ", label: "XTZ" },
        ];
  const entityHomeRoutes: Record<string, Route> = {
    LSC: "/" as Route,
    TBR: "/tbr" as Route,
    FSP: "/fsp" as Route,
    XTZ: "/xtz" as Route,
  };

  return (
    <div className="app-shell lsc-blue-shell">
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        type="button"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div
        className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`}
        onClick={closeSidebar}
        role="presentation"
      />

      <aside className={`sidebar rail-sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Main navigation">
        <Link className="rail-brand" href="/">
          <span className="rail-brand-mark">LSC</span>
          <span className="rail-brand-copy">Finance</span>
        </Link>

        <nav className="rail-nav" aria-label="Primary workspaces">
          {visiblePrimaryNav.map(({ href, label, icon: Icon, isActive: activeCheck }) => {
            const active = activeCheck(pathname, searchParams);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`rail-nav-item${active ? " active" : ""}`}
                href={href}
                key={label}
              >
                <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="rail-session">
          <span className="rail-session-avatar">{getInitials(user?.fullName)}</span>
          <form action="/logout" method="post">
            <button className="rail-logout" type="submit" aria-label="Sign out">
              <LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </form>
        </div>
      </aside>

      <main className="main" id="main-content">
        <ToastNotice />
        <CommandPalette commands={PALETTE_COMMANDS} />
        <div className="workspace-topbar lsc-command-topbar">
          <div className="workspace-title-block">
            {breadcrumbs.length > 0 && (
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                {breadcrumbs.map((crumb, i) => (
                  <span key={i}>
                    <span className="breadcrumb-sep">/</span>
                    {crumb.href ? (
                      <Link href={crumb.href as Route}>{crumb.label}</Link>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            <strong>{getWorkspaceLabel(pathname)}</strong>
            <span>{topbarSubtitle}</span>
          </div>
          <div className="topbar-right">
            <label className="topbar-select">
              <span>Entity</span>
              <select
                aria-label="Entity context"
                onChange={(event) => router.push(entityHomeRoutes[event.currentTarget.value] ?? "/")}
                value={selectedEntity}
              >
                {topbarEntityOptions.map((entity) => (
                  <option key={entity.value} value={entity.value}>
                    {entity.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="topbar-period">
              <FileText size={14} strokeWidth={2.2} aria-hidden="true" />
              Live finance view
            </span>
            <CmdKTrigger />
            <div className="profile-chip">
              <span className="profile-avatar">{getInitials(user?.fullName)}</span>
              <span className="profile-copy">
                <strong>{user?.fullName ?? "Signed in user"}</strong>
                <span>{user ? user.role.replace(/_/g, " ") : "Authenticated session"}</span>
              </span>
            </div>
          </div>
        </div>
        <nav className="mobile-primary-nav" aria-label="Primary workspaces">
          {visiblePrimaryNav.map(({ href, label, icon: Icon, isActive: activeCheck }) => {
            const active = activeCheck(pathname, searchParams);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`mobile-primary-nav-item${active ? " active" : ""}`}
                href={href}
                key={label}
              >
                <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        {contextLinks.length > 0 ? (
          <nav className="workspace-context-nav" aria-label="Workspace modules">
            {activeCompany ? (
              <Link className={pathname === activeCompany.href ? "active" : ""} href={activeCompany.href}>
                {activeCompany.label} overview
              </Link>
            ) : null}
            {contextLinks.map((link) => (
              <Link className={isActive(link.href) ? "active" : ""} href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export function SessionShell(props: SessionShellProps) {
  return (
    <Suspense fallback={null}>
      <SessionShellInner {...props} />
    </Suspense>
  );
}
