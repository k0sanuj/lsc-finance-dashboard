/**
 * Insert items completed in the current session (and any from the past
 * 2-3 days of commits that weren't in the checklist yet) into the
 * project_checklist table with status='done' and completed_at=now().
 *
 * Uses ON CONFLICT (title, section) DO UPDATE — idempotent, safe to re-run.
 * If a matching title+section already exists, status is flipped to 'done'.
 */
import pg from "pg";
import fs from "node:fs/promises";

const { Client } = pg;
const env = await fs.readFile(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const c = new Client({
  connectionString: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL,
});
await c.connect();

const items = [
  // ─── Engine: orchestrator + agents ──────────────────────────
  {
    section: "AI Agents",
    title: "Provider-agnostic LLM client (Anthropic + Gemini)",
    description:
      "callLlm() in skills/shared/llm.ts routes by purpose → Anthropic Haiku/Sonnet/Opus or Gemini Flash. Single retry policy, JSON mode, inline parts, tokens tracked.",
    priority: "critical",
    route: "/agent-graph",
  },
  {
    section: "AI Agents",
    title: "Real Gemini/Anthropic-backed orchestrator",
    description:
      "classifyAndPlan() replaces the keyword stub with Claude Haiku that produces validated RoutingPlans, falls back safely on failure, and never throws.",
    priority: "critical",
    route: "/copilot",
  },
  {
    section: "AI Agents",
    title: "Skill dispatcher with 51 read-only handlers",
    description:
      "skills/dispatcher.ts maps (agentId, skill) → real query functions. POST /api/dispatch is the single routing surface. /agent-graph/dispatcher-status shows coverage.",
    priority: "critical",
    route: "/agent-graph/dispatcher-status",
  },
  {
    section: "AI Agents",
    title: "21-agent graph (3 autonomous + 7 HITL + 14 workflows)",
    description:
      "agents/agent-graph.ts encodes the Anthropic 'Should I build an agent' classification — each node tagged with kind + intelligence tier. Runtime invariant prevents workflow>T0.",
    priority: "critical",
    route: "/agent-graph",
  },
  {
    section: "AI Agents",
    title: "Finance Copilot chat UI",
    description:
      "/copilot — admin-only chat wired end-to-end through orchestrator → dispatcher. Shows intent, plan, step results, token/duration metadata. HITL re-run flow built in.",
    priority: "critical",
    route: "/copilot",
  },
  {
    section: "AI Agents",
    title: "5 HITL analyzer skills (cash-flow, receivables, margin, budget, goals)",
    description:
      "skills/analyzers/* — each reads canonical data, calls Claude Sonnet/Haiku with strict JSON schema, returns narrative + risks + recommendations. /analyzers page runs them.",
    priority: "critical",
    route: "/analyzers",
  },
  {
    section: "AI Agents",
    title: "Unified Gemini + Anthropic clients with per-purpose routing",
    description:
      "5 previously-scattered Gemini fetch call-sites migrated to the shared callLlm(). ~180 LOC of duplicated retry/parse/error handling removed.",
    priority: "high",
  },
  {
    section: "AI Agents",
    title: "Live agent graph visualization from AGENT_GRAPH",
    description:
      "/agent-graph rebuilt — 21 real agents laid out radially from code (orchestrator center, 7 HITL left, 14 workflows right). Kind/tier badges, canTalkTo edges. Auto-syncs with code.",
    priority: "high",
    route: "/agent-graph",
  },

  // ─── Audit + cascade engine ─────────────────────────────────
  {
    section: "Audit & Monitoring",
    title: "Audit log table + /audit-log page",
    description:
      "sql/028_audit_log.sql. /audit-log shows every mutation with before/after state, trigger, agent tag, cascade actions. Filter by entity/trigger/agent.",
    priority: "critical",
    route: "/audit-log",
  },
  {
    section: "Audit & Monitoring",
    title: "Cascade engine wired to real DB (skills/shared/cascade-update.ts)",
    description:
      "Every mutation that calls cascadeUpdate() now writes an audit_log row with the cascade result inline. Never throws — audit failures are logged but don't break mutations.",
    priority: "critical",
  },
  {
    section: "Audit & Monitoring",
    title: "52 mutations cascade-wired across 18 action files",
    description:
      "Every material financial mutation (vendors, subscriptions, employees, deals, tranches, gig payouts, invoices, expenses, FSP P&L, team, deliverables, documents) now emits an audit event tagged to its owning agent.",
    priority: "high",
  },

  // ─── UX foundation ──────────────────────────────────────────
  {
    section: "Core Infrastructure",
    title: "Dismissible toast notifications (global)",
    description:
      "components/toast-notice.tsx mounted in SessionShell. Reads ?status=&message= from URL, auto-dismisses success after 5s, errors sticky. Strips URL on close.",
    priority: "high",
  },
  {
    section: "Core Infrastructure",
    title: "SubmitButton with spinner + confirm dialogs",
    description:
      "components/submit-button.tsx — useFormStatus-powered loading state, configurable pendingLabel, confirmMessage for destructive ops. Rolled out across all major CRUD pages.",
    priority: "high",
  },
  {
    section: "Core Infrastructure",
    title: "Cmd+K command palette",
    description:
      "50 nav commands + fuzzy scoring (exact/startsWith/includes/in-order/keyword) + recent-5 in localStorage. Mac/Win keymap detected. Topbar '⌘K' chip for discovery.",
    priority: "high",
    route: "/",
  },
  {
    section: "Core Infrastructure",
    title: "Cmd+K server-side entity search (12 domains)",
    description:
      "GET /api/search fans out ILIKE queries across vendors, employees, races, invoice intakes, payroll invoices, deals, subscriptions, sponsors, documents, payments, FSP sports, race seasons. Debounced + aborted on keystroke.",
    priority: "high",
  },
  {
    section: "Core Infrastructure",
    title: "Row-highlight deep-link flash",
    description:
      "components/row-highlight.tsx — Cmd+K hits deep-link to list pages with ?highlight=<id>; target row scrolls into view + pulses copper for 2s. Wired on vendors/employees/invoice-hub.",
    priority: "medium",
  },
  {
    section: "Core Infrastructure",
    title: "EmptyState component with CTAs",
    description:
      "components/empty-state.tsx replaces 'No X yet' table rows with centered cards offering guidance + optional CTA links. Rolled out on vendors + employees.",
    priority: "medium",
  },
  {
    section: "Core Infrastructure",
    title: "Collapsible add-forms (table-first CRUD pattern)",
    description:
      "Vendors / Subscriptions / Employees / Deal Pipeline 'Add new' sections wrapped in <details> with animated +/× indicator. Cuts scroll-to-content in half.",
    priority: "medium",
  },
  {
    section: "Core Infrastructure",
    title: "Sticky workspace-topbar + responsive mobile layout",
    description:
      "Topbar stays visible across long scrolls. @media (max-width: 720px) collapses form-grid to one column, tables get touch-scroll, stats go 2-col, toast edge-to-edge.",
    priority: "medium",
  },
  {
    section: "Core Infrastructure",
    title: "UI utility class library (reduced ~83 inline styles)",
    description:
      "Globals.css adds .mono/.text-sm/.text-xs/.mt-sm-lg/.field-span-*/etc. FSP sport page alone went from 68 inline styles → 0. Accessibility fixes (aria-label, sr-only) across deal-pipeline + builders.",
    priority: "medium",
  },

  // ─── Provider / key rotation / ops ──────────────────────────
  {
    section: "Integrations",
    title: "Anthropic API key + Gemini API key rotated to active accounts",
    description:
      "ANTHROPIC_API_KEY funded + verified via direct smoke test. GEMINI_API_KEY active. Both in Vercel prod + .env.local. CSP updated to allow api.anthropic.com.",
    priority: "high",
  },
  {
    section: "Integrations",
    title: "Claude model tiering configured (Haiku/Sonnet/Opus)",
    description:
      "T1 = claude-haiku-4-5-20251001 (routing), T2 = claude-sonnet-4-6 (analysis), T3 = claude-opus-4-7 (audit). Each purpose mapped to a provider+tier.",
    priority: "medium",
  },

  // ─── Navigation bug fix ─────────────────────────────────────
  {
    section: "Core Infrastructure",
    title: "Sidebar auto-expand bug fix (TBR showing for FSP pages)",
    description:
      "Session-shell auto-expand useEffect rewrote to parse /[company] URL segments before falling through to the TBR catch-all. Breadcrumbs fixed the same way.",
    priority: "high",
  },

  // ─── 2-3 day backlog (pre-session but recent) ───────────────
  {
    section: "TBR Operations",
    title: "XTZ Invoice Generator — corporate PDF + vendor selector + month picker",
    description:
      "/payroll-invoices workspace with 4 sections (Payroll/Third Party Vendors/Reimbursements/Provisions). VendorSelector auto-fills bank details, MonthPicker auto-submits, corporate navy PDF via jsPDF at /api/invoice-pdf/[id].",
    priority: "high",
    route: "/payroll-invoices",
  },
  {
    section: "Vendors & Partners",
    title: "Vendors module with bank details (HDFC/IFSC/SWIFT/IBAN)",
    description:
      "/vendors — full CRUD, bank fields, VendorSelector exposed to XTZ invoice generator. Sayan seeded with HDFC 50100153694001.",
    priority: "high",
    route: "/vendors",
  },
];

let inserted = 0;
let updated = 0;

// Ensure unique (title, section) so we can upsert. Check for a pre-existing unique constraint,
// and if none, emulate upsert by checking first.
for (const item of items) {
  // Does this exact title+section already exist?
  const existing = await c.query(
    `select id, status::text as status from project_checklist
     where section = $1 and title = $2
     limit 1`,
    [item.section, item.title]
  );

  if (existing.rows.length > 0) {
    // Flip to done if not already
    if (existing.rows[0].status !== "done") {
      await c.query(
        `update project_checklist
         set status = 'done', completed_at = now(), updated_at = now(),
             description = coalesce($3, description)
         where id = $1`,
        [existing.rows[0].id, null, item.description]
      );
      updated++;
      console.log(`✓ flipped to done: [${item.section}] ${item.title}`);
    } else {
      console.log(`  already done: [${item.section}] ${item.title}`);
    }
  } else {
    // Insert fresh as done
    const sortOrderRows = await c.query(
      `select coalesce(max(sort_order), 0)::int + 10 as next_order
       from project_checklist where section = $1`,
      [item.section]
    );
    const nextOrder = sortOrderRows.rows[0]?.next_order ?? 10;

    await c.query(
      `insert into project_checklist
         (title, description, section, priority, status, route, sort_order, completed_at)
       values ($1, $2, $3, $4::checklist_priority, 'done'::checklist_status, $5, $6, now())`,
      [item.title, item.description, item.section, item.priority, item.route ?? null, nextOrder]
    );
    inserted++;
    console.log(`+ inserted: [${item.section}] ${item.title}`);
  }
}

console.log(`\nDone. Inserted ${inserted} new items, flipped ${updated} to done.`);
await c.end();
