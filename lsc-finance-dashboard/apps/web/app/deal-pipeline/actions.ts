"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function redirectToPipeline(status: "success" | "error", message: string): never {
  const params = new URLSearchParams({ status, message });
  redirect(`/deal-pipeline?${params.toString()}` as Route);
}

export async function addDealAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const dealName = normalize(String(formData.get("dealName") ?? ""));
  const dealType = normalize(String(formData.get("dealType") ?? ""));
  const department = normalize(String(formData.get("department") ?? ""));
  const dealOwner = normalize(String(formData.get("dealOwner") ?? ""));
  const dealValue = normalize(String(formData.get("dealValue") ?? "0"));
  const revenueType = normalize(String(formData.get("revenueType") ?? ""));
  const stage = normalize(String(formData.get("stage") ?? "lead"));
  const expectedCloseDate = normalize(String(formData.get("expectedCloseDate") ?? ""));
  const riskLevel = normalize(String(formData.get("riskLevel") ?? "low"));
  const sportVertical = normalize(String(formData.get("sportVertical") ?? ""));
  const nextAction = normalize(String(formData.get("nextAction") ?? ""));
  const actionOwner = normalize(String(formData.get("actionOwner") ?? ""));
  const notes = normalize(String(formData.get("notes") ?? ""));

  if (!dealName || !department || !dealOwner) {
    redirectToPipeline("error", "Deal name, department, and owner are required.");
  }

  const inserted = await queryRowsAdmin<{ id: string }>(
    `INSERT INTO deals
       (deal_name, deal_type, department, deal_owner, deal_value, revenue_type,
        stage, expected_close_date, risk_level, sport_vertical, next_action,
        action_owner, notes, at_risk, last_activity_date)
     VALUES ($1, $2, $3, $4, $5::numeric, $6, $7, $8::date, $9, $10, $11, $12, $13, false, now())
     RETURNING id`,
    [
      dealName,
      dealType || null,
      department,
      dealOwner,
      dealValue,
      revenueType || null,
      stage,
      expectedCloseDate || null,
      riskLevel,
      sportVertical || null,
      nextAction || null,
      actionOwner || null,
      notes || null,
    ]
  );

  const dealId = inserted[0]?.id;
  if (dealId) {
    await cascadeUpdate({
      trigger: "deal:created",
      entityType: "deal",
      entityId: dealId,
      action: "create",
      after: { dealName, department, dealOwner, dealValue, stage, riskLevel },
      performedBy: session.id,
      agentId: "commercial-agent",
    });
  }

  revalidatePath("/deal-pipeline");
  redirectToPipeline("success", `Deal "${dealName}" created.`);
}

export async function updateDealStageAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const dealId = normalize(String(formData.get("dealId") ?? ""));
  const newStage = normalize(String(formData.get("newStage") ?? ""));

  if (!dealId || !newStage) {
    redirectToPipeline("error", "Deal ID and stage are required.");
  }

  const before = await queryRowsAdmin<{ stage: string }>(
    `SELECT stage FROM deals WHERE id = $1`,
    [dealId]
  );

  await executeAdmin(
    `UPDATE deals SET stage = $2, last_activity_date = now(), updated_at = now() WHERE id = $1`,
    [dealId, newStage]
  );

  await cascadeUpdate({
    trigger: "deal:stage:changed",
    entityType: "deal",
    entityId: dealId,
    action: "stage-change",
    before: before[0] ? { stage: before[0].stage } : undefined,
    after: { stage: newStage },
    performedBy: session.id,
    agentId: "commercial-agent",
  });

  revalidatePath("/deal-pipeline");
  redirectToPipeline("success", `Stage updated to "${newStage.replace(/_/g, " ")}".`);
}

export async function updateDealRiskAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const dealId = normalize(String(formData.get("dealId") ?? ""));
  const riskLevel = normalize(String(formData.get("riskLevel") ?? ""));

  if (!dealId || !riskLevel) {
    redirectToPipeline("error", "Deal ID and risk level are required.");
  }

  const atRisk = riskLevel === "high" || riskLevel === "critical";

  await executeAdmin(
    `UPDATE deals SET risk_level = $2, at_risk = $3, last_activity_date = now(), updated_at = now() WHERE id = $1`,
    [dealId, riskLevel, atRisk]
  );

  await cascadeUpdate({
    trigger: "deal:risk:changed",
    entityType: "deal",
    entityId: dealId,
    action: "risk-change",
    after: { riskLevel, atRisk },
    performedBy: session.id,
    agentId: "commercial-agent",
  });

  revalidatePath("/deal-pipeline");
  redirectToPipeline("success", `Risk updated to "${riskLevel}".`);
}
