/**
 * Static command registry for the Cmd+K palette.
 *
 * Mirrors the nav links in session-shell so users can jump anywhere by
 * keystroke. Adding a new page? Add it here too.
 *
 * Client-side only (pure data, no server imports).
 */
import type { Route } from "next";

export type PaletteCommand = {
  id: string;
  label: string;
  group: string;
  href?: Route | string;
  hint?: string;
  keywords?: string;
};

export const PALETTE_COMMANDS: PaletteCommand[] = [
  // ── Portfolio ──
  { id: "nav-home", label: "Overview", group: "Navigation", href: "/", keywords: "home dashboard portfolio" },
  { id: "nav-sports-dashboard", label: "Sports Dashboard", group: "Navigation", href: "/sports-dashboard" },
  { id: "nav-checklist", label: "Project Checklist", group: "Navigation", href: "/project-checklist", keywords: "todo tasks" },
  { id: "nav-copilot", label: "Finance Copilot", group: "AI", href: "/copilot", hint: "Ask anything", keywords: "chat ai assistant" },
  { id: "nav-analyzers", label: "AI Analyzers", group: "AI", href: "/analyzers", hint: "Cash, margin, risk, goals", keywords: "insights analysis" },

  // ── TBR ──
  { id: "nav-tbr", label: "TBR Overview", group: "TBR", href: "/tbr" },
  { id: "nav-tbr-races", label: "TBR Races", group: "TBR", href: "/tbr/races" },
  { id: "nav-tbr-my-expenses", label: "My Expenses", group: "TBR", href: "/tbr/my-expenses" },
  { id: "nav-tbr-expense-review", label: "Expense Review", group: "TBR", href: "/tbr/expense-management" },
  { id: "nav-tbr-invoice-hub", label: "Invoice Hub", group: "TBR", href: "/tbr/invoice-hub" },
  { id: "nav-tbr-team", label: "Team Management", group: "TBR", href: "/tbr/team-management" },
  { id: "nav-tbr-costs", label: "TBR Costs", group: "TBR", href: "/costs/TBR" },
  { id: "nav-tbr-payments", label: "TBR Payments", group: "TBR", href: "/payments/TBR" },
  { id: "nav-tbr-receivables", label: "TBR Receivables", group: "TBR", href: "/receivables/TBR" },
  { id: "nav-tbr-documents", label: "TBR Documents", group: "TBR", href: "/documents/TBR" },
  { id: "nav-tbr-goals", label: "TBR Commercial Goals", group: "TBR", href: "/commercial-goals/TBR" },

  // ── Shared finance / ops (TBR-linked nav but platform-wide features) ──
  { id: "nav-vendors", label: "Vendors & Beneficiaries", group: "Finance", href: "/vendors", keywords: "suppliers bank details" },
  { id: "nav-subscriptions", label: "Subscriptions", group: "Finance", href: "/subscriptions", keywords: "software saas recurring" },
  { id: "nav-cap-table", label: "Cap Table", group: "Finance", href: "/cap-table", keywords: "equity shares esop" },
  { id: "nav-litigation", label: "Litigation & Compliance", group: "Finance", href: "/litigation", keywords: "legal reserves" },
  { id: "nav-arena-ads", label: "Arena & Ads", group: "Finance", href: "/arena-ads" },
  { id: "nav-tax", label: "Tax & Filing", group: "Finance", href: "/tax-filings", keywords: "gst vat" },
  { id: "nav-deal-pipeline", label: "Deal Pipeline", group: "Intelligence", href: "/deal-pipeline", keywords: "sponsors crm" },
  { id: "nav-treasury", label: "Treasury & Cash Flow", group: "Intelligence", href: "/treasury", keywords: "liquidity" },
  { id: "nav-event-budgets", label: "Event Budgets", group: "Intelligence", href: "/event-budgets" },
  { id: "nav-ai-ingest", label: "AI Data Ingestion", group: "Intelligence", href: "/ai-ingest" },

  // ── People (shared between TBR + XTZ) ──
  { id: "nav-employees-tbr", label: "Employees (TBR)", group: "People", href: "/employees?company=TBR" },
  { id: "nav-employees-xtz", label: "Employees (XTZ)", group: "People", href: "/employees?company=XTZ" },
  { id: "nav-salary-tbr", label: "Salary Payable (TBR)", group: "People", href: "/salary-payable?company=TBR" },
  { id: "nav-salary-xtz", label: "Salary Payable (XTZ)", group: "People", href: "/salary-payable?company=XTZ" },
  { id: "nav-payroll-invoices", label: "XTZ Invoice Generator", group: "People", href: "/payroll-invoices", keywords: "payroll invoice" },
  { id: "nav-gig-workers", label: "Gig Workers", group: "People", href: "/gig-workers", keywords: "contractors freelancers" },

  // ── XTZ India ──
  { id: "nav-xtz-expenses-submit", label: "Submit Expense (XTZ)", group: "XTZ India", href: "/xtz-expenses?view=submit" },
  { id: "nav-xtz-expenses-review", label: "Expense Review (XTZ)", group: "XTZ India", href: "/xtz-expenses?view=review" },

  // ── FSP ──
  { id: "nav-fsp", label: "FSP Overview", group: "FSP", href: "/fsp" },
  { id: "nav-fsp-sports", label: "All Sports", group: "FSP", href: "/fsp/sports" },
  { id: "nav-fsp-consolidated", label: "FSP Consolidated P&L", group: "FSP", href: "/fsp/consolidated" },
  { id: "nav-fsp-squash", label: "Squash (WPS)", group: "FSP", href: "/fsp/sports/squash" },
  { id: "nav-fsp-bowling", label: "Bowling (WBL)", group: "FSP", href: "/fsp/sports/bowling" },
  { id: "nav-fsp-basketball", label: "Basketball", group: "FSP", href: "/fsp/sports/basketball" },
  { id: "nav-fsp-worldpong", label: "World Pong", group: "FSP", href: "/fsp/sports/world_pong" },
  { id: "nav-fsp-foundation", label: "Foundation", group: "FSP", href: "/fsp/sports/foundation" },
  { id: "nav-fsp-sp-multiplier", label: "SP Multiplier", group: "FSP", href: "/fsp/sp-multiplier" },
  { id: "nav-fsp-goals", label: "FSP Commercial Goals", group: "FSP", href: "/commercial-goals/FSP" },
  { id: "nav-fsp-documents", label: "FSP Documents", group: "FSP", href: "/documents/FSP" },

  // ── System (admin) ──
  { id: "nav-agent-graph", label: "Agent Graph", group: "System", href: "/agent-graph", keywords: "topology" },
  { id: "nav-dispatcher-status", label: "Dispatcher Status", group: "System", href: "/agent-graph/dispatcher-status", keywords: "skills registered" },
  { id: "nav-workflow-graph", label: "Workflow Graph", group: "System", href: "/workflow-graph" },
  { id: "nav-messaging", label: "Cross-Dashboard Messages", group: "System", href: "/messaging", keywords: "legal inbound" },
  { id: "nav-audit-reports", label: "Audit Reports", group: "System", href: "/audit-reports", keywords: "monthly reconciliation" },
  { id: "nav-audit-log", label: "Audit Log", group: "System", href: "/audit-log", keywords: "mutation trail history" },
];
