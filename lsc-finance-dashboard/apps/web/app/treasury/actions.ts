"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function clean(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

export async function addProjectionAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

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

  await executeAdmin(
    `insert into treasury_projections
       (projection_date, projected_balance, committed_outflows, expected_inflows, net_position, projection_type, currency)
     values ($1::date, $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6, $7)`,
    [projectionDate, projectedBalance, committedOutflows, expectedInflows, netPosition, projectionType, currency]
  );

  revalidatePath("/treasury");
  redirect(
    `/treasury?status=success&message=${encodeURIComponent(`Projection added for ${projectionDate}.`)}` as Route
  );
}
