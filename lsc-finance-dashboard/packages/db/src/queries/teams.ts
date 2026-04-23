import "server-only";

import { queryRows } from "../query";
import { getBackend } from "./shared";

export type TeamSnapshotRow = {
  teamName: string;
  members: string;
  openSubmissions: string;
};

export type TeamDirectoryRow = {
  id: string;
  name: string;
  code: string;
  description: string;
  members: string;
  membershipCount: string;
};

export type UserOptionRow = {
  id: string;
  name: string;
  role: string;
};

export type TeamSnapshotSource = {
  team_name: string;
  member_count: string;
  open_submission_count: string;
};

export type TeamDirectorySource = {
  id: string;
  team_name: string;
  team_code: string;
  description: string | null;
  member_names: string | null;
  membership_count: string;
};

export type UserOptionSource = {
  id: string;
  full_name: string;
  role: string;
};

export async function getTeamStructureSnapshot() {
  if (getBackend() === "database") {
    const rows = await queryRows<TeamSnapshotSource>(
      `select
         t.team_name,
         count(distinct tm.app_user_id)::text as member_count,
         count(distinct es.id) filter (where es.submission_status in ('submitted', 'in_review'))::text as open_submission_count
       from app_teams t
       left join team_memberships tm on tm.team_id = t.id
       left join expense_submission_items esi on esi.team_id = t.id
       left join expense_submissions es on es.id = esi.submission_id
       group by t.id, t.team_name
       order by t.team_name`
    );

    return rows.map((row) => ({
      teamName: row.team_name,
      members: row.member_count,
      openSubmissions: row.open_submission_count
    })) satisfies TeamSnapshotRow[];
  }

  return [] satisfies TeamSnapshotRow[];
}

export async function getTeamDirectory() {
  if (getBackend() === "database") {
    const rows = await queryRows<TeamDirectorySource>(
      `select
         t.id,
         t.team_name,
         t.team_code,
         t.description,
         string_agg(distinct au.full_name, ', ' order by au.full_name) as member_names,
         count(distinct tm.app_user_id)::text as membership_count
       from app_teams t
       left join team_memberships tm on tm.team_id = t.id
       left join app_users au on au.id = tm.app_user_id
       group by t.id
       order by t.team_name`
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.team_name,
      code: row.team_code,
      description: row.description ?? "No team description yet.",
      members: row.member_names ?? "No members assigned",
      membershipCount: row.membership_count
    })) satisfies TeamDirectoryRow[];
  }

  return [] satisfies TeamDirectoryRow[];
}

export async function getUserOptions() {
  if (getBackend() === "database") {
    const rows = await queryRows<UserOptionSource>(
      `select id, full_name, role::text as role
       from app_users
       where is_active = true
       order by full_name`
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.full_name,
      role: row.role
    })) satisfies UserOptionRow[];
  }

  return [] satisfies UserOptionRow[];
}

export type UserContact = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

/** Look up one active user's email + name by id. Returns null if not found. */
export async function getUserContactById(userId: string): Promise<UserContact | null> {
  if (getBackend() !== "database") return null;
  const rows = await queryRows<{
    id: string;
    full_name: string;
    email: string;
    role: string;
  }>(
    `select id, full_name, email, role::text as role
     from app_users
     where id = $1 and is_active = true
     limit 1`,
    [userId]
  );
  const row = rows[0];
  if (!row || !row.email) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
  };
}

/** Return emails of all active finance_admin + super_admin users. */
export async function getFinanceAdminEmails(): Promise<string[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRows<{ email: string }>(
    `select email
     from app_users
     where is_active = true
       and role in ('super_admin', 'finance_admin')
       and email is not null
       and email <> ''`
  );
  return rows.map((r) => r.email);
}
