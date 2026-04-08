import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

// ─── Types ─────────────────────────────────────────────────

export type FspEventRow = {
  id: string;
  sportName: string;
  eventName: string;
  city: string;
  venueName: string;
  eventDate: string;
  status: string;
  totalBudget: string;
  totalActual: string;
  variance: string;
  currency: string;
};

export type EventBudgetItemRow = {
  id: string;
  category: string;
  subCategory: string;
  description: string;
  vendorName: string;
  budgetAmount: string;
  actualAmount: string;
  status: string;
  isVerified: boolean;
};

export type EventChecklistRow = {
  id: string;
  category: string;
  requirement: string;
  whatToCheck: string;
  verificationProof: string;
  status: string;
  owner: string;
  dueDate: string;
};

export type EventBudgetSummary = {
  totalBudget: string;
  totalActual: string;
  variance: string;
  eventCount: number;
};

// ─── Source row types ──────────────────────────────────────

type FspEventSource = {
  id: string;
  sport_name: string;
  event_name: string;
  city: string;
  venue_name: string | null;
  event_date: string | null;
  status: string;
  total_budget: string;
  total_actual: string;
  currency_code: string;
};

type EventBudgetItemSource = {
  id: string;
  category: string;
  sub_category: string;
  description: string | null;
  vendor_name: string | null;
  budget_amount: string;
  actual_amount: string;
  status: string;
  is_verified: boolean;
};

type EventChecklistSource = {
  id: string;
  category: string;
  requirement: string;
  what_to_check: string | null;
  verification_proof_required: string | null;
  status: string;
  owner: string | null;
  due_date: string | null;
};

type EventBudgetSummarySource = {
  total_budget: string;
  total_actual: string;
  event_count: string;
};

// ─── Queries ───────────────────────────────────────────────

export async function getFspEvents(sportId?: string): Promise<FspEventRow[]> {
  if (getBackend() !== "database") return [];

  const where = sportId
    ? "where e.sport_id = $1"
    : "";
  const params = sportId ? [sportId] : [];

  const rows = await queryRows<FspEventSource>(
    `select e.id, fs.sport_name, e.event_name, e.city,
            e.venue_name, e.event_date::text, e.status,
            e.total_budget::text, e.total_actual::text, e.currency_code
     from fsp_events e
     join fsp_sports fs on fs.id = e.sport_id
     ${where}
     order by e.event_date desc nulls last, e.created_at desc`,
    params
  );

  return rows.map((r) => {
    const budget = Number(r.total_budget ?? 0);
    const actual = Number(r.total_actual ?? 0);
    return {
      id: r.id,
      sportName: r.sport_name,
      eventName: r.event_name,
      city: r.city,
      venueName: r.venue_name ?? "",
      eventDate: formatDateLabel(r.event_date),
      status: r.status,
      totalBudget: formatCurrency(budget),
      totalActual: formatCurrency(actual),
      variance: formatCurrency(budget - actual),
      currency: r.currency_code
    };
  });
}

export async function getEventBudgetItems(eventId: string): Promise<EventBudgetItemRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<EventBudgetItemSource>(
    `select id, category, sub_category, description, vendor_name,
            budget_amount::text, actual_amount::text, status, is_verified
     from fsp_event_budget_items
     where event_id = $1
     order by display_order, created_at`,
    [eventId]
  );

  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    subCategory: r.sub_category,
    description: r.description ?? "",
    vendorName: r.vendor_name ?? "",
    budgetAmount: formatCurrency(r.budget_amount),
    actualAmount: formatCurrency(r.actual_amount),
    status: r.status,
    isVerified: r.is_verified
  }));
}

export async function getEventChecklist(eventId: string): Promise<EventChecklistRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<EventChecklistSource>(
    `select id, category, requirement, what_to_check,
            verification_proof_required, status, owner, due_date::text
     from fsp_event_checklist
     where event_id = $1
     order by display_order, created_at`,
    [eventId]
  );

  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    requirement: r.requirement,
    whatToCheck: r.what_to_check ?? "",
    verificationProof: r.verification_proof_required ?? "",
    status: r.status,
    owner: r.owner ?? "",
    dueDate: formatDateLabel(r.due_date)
  }));
}

export async function getEventBudgetSummary(): Promise<EventBudgetSummary> {
  if (getBackend() !== "database") {
    return { totalBudget: "$0", totalActual: "$0", variance: "$0", eventCount: 0 };
  }

  const rows = await queryRows<EventBudgetSummarySource>(
    `select coalesce(sum(total_budget), 0)::text as total_budget,
            coalesce(sum(total_actual), 0)::text as total_actual,
            count(*)::text as event_count
     from fsp_events`
  );

  const row = rows[0];
  const budget = Number(row?.total_budget ?? 0);
  const actual = Number(row?.total_actual ?? 0);

  return {
    totalBudget: formatCurrency(budget),
    totalActual: formatCurrency(actual),
    variance: formatCurrency(budget - actual),
    eventCount: Number(row?.event_count ?? 0)
  };
}
