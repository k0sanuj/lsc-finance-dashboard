"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";

function clean(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

export async function addProjectionAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const projectionDate = clean(formData.get("projectionDate"));
  const projectedBalance = clean(formData.get("projectedBalance")) || "0";
  const committedOutflows = clean(formData.get("committedOutflows")) || "0";
  const expectedInflows = clean(formData.get("expectedInflows")) || "0";
  const projectionType = clean(formData.get("projectionType")) || "30_day";
  const currency = clean(formData.get("currency")) || "USD";

  if (!projectionDate) {
    redirect("/treasury?status=error&message=Projection+date+is+required." as Route);
  }

  const netPosition =
    Number(projectedBalance) + Number(expectedInflows) - Number(committedOutflows);

  const inserted = await queryRowsAdmin<{ id: string }>(
    `insert into treasury_projections
       (projection_date, projected_balance, committed_outflows, expected_inflows, net_position, projection_type, currency)
     values ($1::date, $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6, $7)
     returning id`,
    [projectionDate, projectedBalance, committedOutflows, expectedInflows, netPosition, projectionType, currency]
  );

  const projectionId = inserted[0]?.id;
  if (projectionId) {
    await cascadeUpdate({
      trigger: "treasury-projection:added",
      entityType: "treasury_projection",
      entityId: projectionId,
      action: "create",
      after: { projectionDate, projectedBalance, committedOutflows, expectedInflows, netPosition, projectionType, currency },
      performedBy: session.id,
      agentId: "treasury-agent",
    });
  }

  revalidatePath("/treasury");
  redirect(
    `/treasury?status=success&message=${encodeURIComponent(`Projection added for ${projectionDate}.`)}` as Route
  );
}
