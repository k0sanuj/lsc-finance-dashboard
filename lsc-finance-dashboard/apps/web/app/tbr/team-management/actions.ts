"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../../lib/auth";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function redirectToTeamManagement(status: "success" | "error" | "info", message: string): never {
  redirect(
    `/tbr/team-management?status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}`
  );
}

export async function createTeamAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const teamName = normalizeWhitespace(String(formData.get("teamName") ?? ""));
  const teamCode = normalizeWhitespace(String(formData.get("teamCode") ?? "")).toUpperCase();
  const description = normalizeWhitespace(String(formData.get("description") ?? "")) || null;

  if (!teamName || !teamCode) {
    redirectToTeamManagement("error", "Team name and code are required.");
  }

  const companyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = 'TBR'::company_code limit 1`
  );
  const companyId = companyRows[0]?.id;

  if (!companyId) {
    redirectToTeamManagement("error", "TBR company record was not found.");
  }

  await executeAdmin(
    `insert into app_teams (company_id, team_code, team_name, description)
     values ($1, $2, $3, $4)
     on conflict (company_id, team_code) do update
       set team_name = excluded.team_name,
           description = excluded.description,
           updated_at = now()`,
    [companyId, teamCode, teamName, description]
  );

  await cascadeUpdate({
    trigger: "team:created",
    entityType: "app_team",
    entityId: teamCode,
    action: "create-or-update",
    after: { teamCode, teamName, description },
    performedBy: session.id,
    agentId: "finance-agent",
  });

  revalidatePath("/tbr/team-management");
  revalidatePath("/tbr");
  redirectToTeamManagement("success", "Team saved.");
}

export async function assignUserToTeamAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const teamId = normalizeWhitespace(String(formData.get("teamId") ?? ""));
  const userId = normalizeWhitespace(String(formData.get("userId") ?? ""));
  const membershipRole = normalizeWhitespace(String(formData.get("membershipRole") ?? "member"));

  if (!teamId || !userId) {
    redirectToTeamManagement("error", "Team and user are required for assignment.");
  }

  await executeAdmin(
    `insert into team_memberships (team_id, app_user_id, membership_role)
     values ($1, $2, $3::team_membership_role)
     on conflict (team_id, app_user_id) do update
       set membership_role = excluded.membership_role`,
    [teamId, userId, membershipRole]
  );

  await cascadeUpdate({
    trigger: "team:member:assigned",
    entityType: "team_membership",
    entityId: teamId,
    action: "assign",
    after: { teamId, userId, membershipRole },
    performedBy: session.id,
    agentId: "finance-agent",
  });

  revalidatePath("/tbr/team-management");
  redirectToTeamManagement("success", "User assigned to team.");
}
