import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

async function loadEnvFile(envPath) {
  try {
    const content = await fs.readFile(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const sep = line.indexOf("=");
      if (sep === -1) continue;
      const k = line.slice(0, sep).trim();
      const v = line.slice(sep + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (e) {
    if (e?.code === "ENOENT") return;
    throw e;
  }
}

async function main() {
  await loadEnvFile(path.join(process.cwd(), ".env.local"));
  const connStr = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!connStr) throw new Error("DATABASE_URL_ADMIN or DATABASE_URL required.");

  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    await client.query("begin");

    // Clear existing checklist for idempotency
    await client.query("delete from project_checklist");

    const items = [
      // --- Core Infrastructure ---
      { s: "Core Infrastructure", t: "Database schema (SQL migrations 001-019)", d: "17+ migrations covering all entity types, views, enums, and indexes", p: "critical", st: "done", r: null, o: 10 },
      { s: "Core Infrastructure", t: "Auth system (HMAC-SHA256 sessions)", d: "Custom session tokens, password hashing, role-based access, middleware guard", p: "critical", st: "done", r: "/login", o: 20 },
      { s: "Core Infrastructure", t: "Role-based connection pooling", d: "Admin, app_read, and import DB roles with query.ts pool management", p: "critical", st: "done", r: null, o: 30 },
      { s: "Core Infrastructure", t: "Ontology layer (schema, relations, cascades)", d: "TypeScript types, entity relationship graph, cascade rules engine", p: "high", st: "done", r: null, o: 40 },
      { s: "Core Infrastructure", t: "Agent architecture (graph + orchestrator)", d: "11 agents, skill registry, routing validation, intent classification", p: "high", st: "done", r: "/agent-graph", o: 50 },
      { s: "Core Infrastructure", t: "Workflow graph visualization", d: "12-node workflow state machine with stage definitions", p: "medium", st: "done", r: "/workflow-graph", o: 60 },
      { s: "Core Infrastructure", t: "Pre-deploy audit script", d: "Env vars, DB connection, routes, build, Vercel parity checks", p: "high", st: "done", r: null, o: 70 },

      // --- Company & Team Management ---
      { s: "Company & Team", t: "Entity setup (LSC, TBR, FSP, XTZ)", d: "Four companies with seed data, cost categories, and owners", p: "critical", st: "done", r: "/", o: 10 },
      { s: "Company & Team", t: "Team management", d: "User admin, team memberships, role assignments", p: "high", st: "done", r: "/tbr/team-management", o: 20 },
      { s: "Company & Team", t: "Role-based sidebar navigation", d: "Expandable company sections, role filtering, breadcrumbs", p: "high", st: "done", r: null, o: 30 },

      // --- TBR Operations ---
      { s: "TBR Operations", t: "Race events & seasons", d: "Race listing, race detail with cost/revenue/budget breakdown", p: "critical", st: "done", r: "/tbr/races", o: 10 },
      { s: "TBR Operations", t: "Expense submissions (my-expenses)", d: "Personal expense creation, split methods, document attachment", p: "high", st: "done", r: "/tbr/my-expenses", o: 20 },
      { s: "TBR Operations", t: "Expense management (admin review)", d: "Approval queue, budget signal matching, clarification workflow", p: "high", st: "done", r: "/tbr/expense-management", o: 30 },
      { s: "TBR Operations", t: "Invoice hub", d: "Invoice intake, vendor submission, approval workflow", p: "high", st: "done", r: "/tbr/invoice-hub", o: 40 },
      { s: "TBR Operations", t: "Race budget rules", d: "Per-race per-category budget caps with threshold signals", p: "medium", st: "done", r: null, o: 50 },

      // --- Finance Core ---
      { s: "Finance Core", t: "Portfolio overview dashboard", d: "Consolidated metrics, entity snapshots, cash flow", p: "critical", st: "done", r: "/", o: 10 },
      { s: "Finance Core", t: "Costs breakdown by company", d: "Expense analysis, category breakdown, race cost summary", p: "high", st: "done", r: "/costs/TBR", o: 20 },
      { s: "Finance Core", t: "Payments tracking by company", d: "Payable aging, upcoming payments, vendor payments", p: "high", st: "done", r: "/payments/TBR", o: 30 },
      { s: "Finance Core", t: "Receivables aging & collection", d: "Aging buckets, invoice detail, sponsor breakdown", p: "high", st: "done", r: "/receivables/TBR", o: 40 },
      { s: "Finance Core", t: "Commercial goals", d: "Target vs actual revenue, partner performance tracking", p: "medium", st: "done", r: "/commercial-goals/TBR", o: 50 },

      // --- Contract Tranches ---
      { s: "Contract Tranches", t: "Tranche schedule view", d: "Per-contract tranche overview with lifecycle buttons", p: "high", st: "done", r: "/receivables/TBR?view=schedule", o: 10 },
      { s: "Contract Tranches", t: "Tranche calendar view", d: "Month-by-month payment milestone timeline", p: "high", st: "done", r: "/receivables/TBR?view=calendar", o: 20 },
      { s: "Contract Tranches", t: "Contract drill-down", d: "Per-contract tranche detail with actions", p: "high", st: "done", r: null, o: 30 },
      { s: "Contract Tranches", t: "Collection workflow", d: "Invoiced tranches tracking, overdue aging, mark collected", p: "high", st: "done", r: "/receivables/TBR?view=collection", o: 40 },
      { s: "Contract Tranches", t: "Aging integration", d: "Tranche pipeline summary on receivables overview", p: "medium", st: "done", r: "/receivables/TBR", o: 50 },
      { s: "Contract Tranches", t: "Legal platform API endpoint", d: "POST /api/tranches for cross-platform tranche creation", p: "high", st: "done", r: "/api/tranches", o: 60 },

      // --- Vendors & Partners ---
      { s: "Vendors & Partners", t: "Vendor registry", d: "All vendors with type, entity links, spend tracking", p: "high", st: "done", r: "/vendors", o: 10 },
      { s: "Vendors & Partners", t: "Venue agreements tracker", d: "Venue-specific financial tracking with deposits", p: "medium", st: "done", r: "/vendors", o: 20 },
      { s: "Vendors & Partners", t: "Production partner parameters", d: "Extended vendor records for production partners", p: "medium", st: "done", r: "/vendors", o: 30 },
      { s: "Vendors & Partners", t: "Vendor cross-check agent", d: "Auto-match incoming invoices to known vendors", p: "medium", st: "pending", r: null, o: 40 },

      // --- Subscriptions ---
      { s: "Subscriptions", t: "Subscription tracker", d: "All SaaS tools with cost, billing cycle, category", p: "high", st: "done", r: "/subscriptions", o: 10 },
      { s: "Subscriptions", t: "Cost breakdown by category/entity", d: "Horizontal bar charts showing spend distribution", p: "medium", st: "done", r: "/subscriptions", o: 20 },
      { s: "Subscriptions", t: "Alert generation system", d: "Renewal 7/15/30d, unused 60d detection, dismiss actions", p: "high", st: "done", r: "/subscriptions", o: 30 },

      // --- Gig Workers ---
      { s: "Gig Workers (XTZ)", t: "Worker roster", d: "All gig workers with India/Kenya split, rates, payment methods", p: "high", st: "done", r: "/gig-workers", o: 10 },
      { s: "Gig Workers (XTZ)", t: "Payout processing workflow", d: "Generate payouts, process, confirm paid actions", p: "high", st: "done", r: "/gig-workers?view=payouts", o: 20 },
      { s: "Gig Workers (XTZ)", t: "Cash flow forecaster", d: "Project upcoming payouts, alert if exceeds available cash", p: "medium", st: "pending", r: null, o: 30 },

      // --- Cap Table ---
      { s: "Cap Table", t: "Equity ownership table", d: "Holders, share classes, vesting, ownership percentages", p: "high", st: "done", r: "/cap-table", o: 10 },
      { s: "Cap Table", t: "Share class breakdown chart", d: "Horizontal bars showing class distribution", p: "medium", st: "done", r: "/cap-table", o: 20 },
      { s: "Cap Table", t: "Investors table", d: "Investment amounts, dates, rounds, ownership", p: "medium", st: "done", r: "/cap-table", o: 30 },
      { s: "Cap Table", t: "Equity events timeline", d: "Grants, exercises, transfers, rounds history", p: "medium", st: "done", r: "/cap-table", o: 40 },
      { s: "Cap Table", t: "Share grant processing from Legal", d: "Cross-dashboard intake for new share grants", p: "medium", st: "pending", r: null, o: 50 },
      { s: "Cap Table", t: "Dilution modeling", d: "What-if analysis for raises at different valuations", p: "low", st: "pending", r: null, o: 60 },

      // --- Tax & Compliance ---
      { s: "Tax & Compliance", t: "Tax calculations tracker", d: "GST (India), VAT (UAE), per-invoice tax breakdown", p: "high", st: "done", r: "/tax-filings", o: 10 },
      { s: "Tax & Compliance", t: "Tax filing status", d: "Filing preparation, status tracking, filed/accepted", p: "high", st: "done", r: "/tax-filings", o: 20 },
      { s: "Tax & Compliance", t: "Litigation finance", d: "Case costs, reserves, insurance coverage, exposure", p: "high", st: "done", r: "/litigation", o: 30 },
      { s: "Tax & Compliance", t: "Compliance cost tracking", d: "License fees, registrations, legal counsel from Legal dashboard", p: "medium", st: "done", r: "/litigation", o: 40 },
      { s: "Tax & Compliance", t: "Subsidies finance", d: "Grant tracking, disbursement, invoice generation", p: "medium", st: "done", r: "/litigation", o: 50 },
      { s: "Tax & Compliance", t: "Excel export for filing", d: "Monthly batch export of invoices for tax filing preparation", p: "medium", st: "pending", r: null, o: 60 },

      // --- FSP Specific ---
      { s: "FSP", t: "SP multiplier configuration", d: "Ratio rules, threshold triggers, active/inactive config", p: "medium", st: "done", r: "/fsp/sp-multiplier", o: 10 },
      { s: "FSP", t: "SP release log", d: "Release history with SP/revenue ratio tracking", p: "medium", st: "done", r: "/fsp/sp-multiplier", o: 20 },
      { s: "FSP", t: "Revenue tracking (post-launch)", d: "Subscription, ad, in-app purchase revenue", p: "low", st: "pending", r: null, o: 30 },

      // --- Arena & Ads ---
      { s: "Arena & Ads", t: "Arena partnership financials", d: "Revenue, cost, net margin per partner", p: "medium", st: "done", r: "/arena-ads", o: 10 },
      { s: "Arena & Ads", t: "Ads revenue tracking", d: "Ad partner revenue, payments, impressions, clicks", p: "medium", st: "done", r: "/arena-ads", o: 20 },

      // --- Document Intelligence ---
      { s: "Document Intelligence", t: "Document upload & storage", d: "S3 with inline fallback, per-company document management", p: "high", st: "done", r: "/documents/TBR", o: 10 },
      { s: "Document Intelligence", t: "Gemini AI document analysis", d: "Structured extraction, confidence scoring, field approval", p: "high", st: "done", r: "/documents/TBR", o: 20 },
      { s: "Document Intelligence", t: "AI analysis dashboard", d: "Entity-level narrative analysis powered by Gemini", p: "medium", st: "done", r: "/ai-analysis", o: 30 },

      // --- Cross-Platform ---
      { s: "Cross-Platform", t: "Cross-dashboard messaging table", d: "Shared table for Finance ↔ Legal communication", p: "high", st: "done", r: "/messaging", o: 10 },
      { s: "Cross-Platform", t: "Messaging inbox/outbox UI", d: "Inbound/outbound messages with priority and status", p: "high", st: "done", r: "/messaging", o: 20 },
      { s: "Cross-Platform", t: "Messaging polling API", d: "Auto-poll for new messages from Legal dashboard", p: "medium", st: "pending", r: null, o: 30 },

      // --- Audit & Monitoring ---
      { s: "Audit & Monitoring", t: "Audit reports page", d: "Monthly audit results, pass rates, discrepancy details", p: "high", st: "done", r: "/audit-reports", o: 10 },
      { s: "Audit & Monitoring", t: "Monthly audit cron endpoint", d: "/api/cron/monthly-audit — automated reconciliation checks", p: "high", st: "pending", r: null, o: 20 },
      { s: "Audit & Monitoring", t: "Agent activity log", d: "Table exists; needs agent-level logging wired in", p: "medium", st: "pending", r: null, o: 30 },

      // --- AI Agents ---
      { s: "AI Agents", t: "Invoice math verification agent", d: "Claude-powered line item sum, tax calculation verification", p: "high", st: "pending", r: null, o: 10 },
      { s: "AI Agents", t: "Financial analysis agent", d: "Cash flow forecasting, break-even analysis per entity", p: "high", st: "pending", r: null, o: 20 },
      { s: "AI Agents", t: "Vendor cross-check agent", d: "Auto-match incoming invoices to known vendors", p: "medium", st: "pending", r: null, o: 30 },
      { s: "AI Agents", t: "Invoice routing/tagging agent", d: "Auto-assign entity, category, priority to invoices", p: "medium", st: "pending", r: null, o: 40 },

      // --- Integrations ---
      { s: "Integrations", t: "QuickBooks MCP (Chart of Accounts)", d: "Connect GL/CoA via QuickBooks MCP — deferred by design", p: "high", st: "pending", r: null, o: 10 },
      { s: "Integrations", t: "Legal platform API key setup", d: "Set LSC_INTERNAL_API_KEY on Vercel for tranche API", p: "medium", st: "pending", r: null, o: 20 },
      { s: "Integrations", t: "Google Sheets sync layer", d: "Import from Google Sheets API v4 for live data sync", p: "low", st: "pending", r: null, o: 30 },

      // --- Project Tracking ---
      { s: "Project Tracking", t: "Project checklist", d: "Interactive build tracker with CRUD, priority sorting, section filtering", p: "medium", st: "done", r: "/project-checklist", o: 10 }
    ];

    for (const item of items) {
      await client.query(
        `insert into project_checklist (title, description, section, priority, status, route, sort_order, completed_at)
         values ($1, $2, $3, $4::checklist_priority, $5::checklist_status, $6, $7, ${item.st === "done" ? "now()" : "null"})`,
        [item.t, item.d, item.s, item.p, item.st, item.r, item.o]
      );
    }

    await client.query("commit");
    console.log(`Seeded ${items.length} checklist items.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
