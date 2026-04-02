import "server-only";

import { queryRows } from "../query";
import { getBackend } from "./shared";

export type ChecklistPriority = "critical" | "high" | "medium" | "low";
export type ChecklistStatus = "done" | "in_progress" | "blocked" | "pending";

export type ChecklistItemRow = {
  id: string;
  title: string;
  description: string;
  section: string;
  priority: ChecklistPriority;
  status: ChecklistStatus;
  route: string;
  dependsOnId: string;
  dependsOnTitle: string;
  sortOrder: number;
  completedAt: string;
};

export type ChecklistSectionSummary = {
  section: string;
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  pending: number;
};

export type ChecklistOverallSummary = {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  pending: number;
  pctComplete: number;
};

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<string, number> = { in_progress: 0, blocked: 1, pending: 2, done: 3 };

export async function getChecklistItems(): Promise<ChecklistItemRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    title: string;
    description: string | null;
    section: string;
    priority: string;
    status: string;
    route: string | null;
    depends_on: string | null;
    depends_on_title: string | null;
    sort_order: string;
    completed_at: string | null;
  }>(
    `select pc.id, pc.title, pc.description, pc.section,
            pc.priority::text, pc.status::text, pc.route,
            pc.depends_on, dep.title as depends_on_title,
            pc.sort_order::text, pc.completed_at::text
     from project_checklist pc
     left join project_checklist dep on dep.id = pc.depends_on
     order by pc.section, pc.sort_order, pc.priority`
  );

  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      section: r.section,
      priority: r.priority as ChecklistPriority,
      status: r.status as ChecklistStatus,
      route: r.route ?? "",
      dependsOnId: r.depends_on ?? "",
      dependsOnTitle: r.depends_on_title ?? "",
      sortOrder: Number(r.sort_order),
      completedAt: r.completed_at ?? ""
    }))
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2;
      const pb = PRIORITY_ORDER[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      const sa = STATUS_ORDER[a.status] ?? 2;
      const sb = STATUS_ORDER[b.status] ?? 2;
      return sa - sb;
    });
}

export async function getChecklistSections(): Promise<ChecklistSectionSummary[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    section: string;
    total: string;
    done: string;
    in_progress: string;
    blocked: string;
    pending: string;
  }>(
    `select section,
            count(*)::text as total,
            count(*) filter (where status = 'done')::text as done,
            count(*) filter (where status = 'in_progress')::text as in_progress,
            count(*) filter (where status = 'blocked')::text as blocked,
            count(*) filter (where status = 'pending')::text as pending
     from project_checklist
     group by section
     order by section`
  );

  return rows.map((r) => ({
    section: r.section,
    total: Number(r.total),
    done: Number(r.done),
    inProgress: Number(r.in_progress),
    blocked: Number(r.blocked),
    pending: Number(r.pending)
  }));
}

export async function getChecklistSummary(): Promise<ChecklistOverallSummary> {
  if (getBackend() !== "database") {
    return { total: 0, done: 0, inProgress: 0, blocked: 0, pending: 0, pctComplete: 0 };
  }

  const rows = await queryRows<{
    total: string;
    done: string;
    in_progress: string;
    blocked: string;
    pending: string;
  }>(
    `select count(*)::text as total,
            count(*) filter (where status = 'done')::text as done,
            count(*) filter (where status = 'in_progress')::text as in_progress,
            count(*) filter (where status = 'blocked')::text as blocked,
            count(*) filter (where status = 'pending')::text as pending
     from project_checklist`
  );

  const total = Number(rows[0]?.total ?? 0);
  const done = Number(rows[0]?.done ?? 0);

  return {
    total,
    done,
    inProgress: Number(rows[0]?.in_progress ?? 0),
    blocked: Number(rows[0]?.blocked ?? 0),
    pending: Number(rows[0]?.pending ?? 0),
    pctComplete: total > 0 ? Math.round((done / total) * 100) : 0
  };
}
