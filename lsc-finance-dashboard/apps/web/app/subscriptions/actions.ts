"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { requireRole } from "../../lib/auth";

export async function generateSubscriptionAlertsAction() {
  await requireRole(["super_admin", "finance_admin"]);

  // Generate renewal alerts for subscriptions billing within 30 days
  const renewals = await queryRowsAdmin<{ id: string; name: string; next_billing_date: string }>(
    `select s.id, s.name, s.next_billing_date::text
     from subscriptions s
     where s.status = 'active'
       and s.next_billing_date is not null
       and s.next_billing_date <= current_date + 30
       and not exists (
         select 1 from subscription_alerts sa
         where sa.subscription_id = s.id
           and sa.alert_type in ('renewal_30d', 'renewal_15d', 'renewal_7d')
           and sa.triggered_at > current_date - 7
       )`
  );

  let created = 0;
  for (const sub of renewals) {
    const daysUntil = Math.ceil((new Date(sub.next_billing_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    let alertType: string;
    if (daysUntil <= 7) alertType = "renewal_7d";
    else if (daysUntil <= 15) alertType = "renewal_15d";
    else alertType = "renewal_30d";

    await executeAdmin(
      `insert into subscription_alerts (subscription_id, alert_type, message)
       values ($1, $2::subscription_alert_type, $3)`,
      [sub.id, alertType, `${sub.name} renews in ${daysUntil} days (${sub.next_billing_date}).`]
    );
    created++;
  }

  // Generate unused alerts for subscriptions not accessed in 60+ days
  const unused = await queryRowsAdmin<{ id: string; name: string }>(
    `select s.id, s.name
     from subscriptions s
     where s.status = 'active'
       and (s.last_accessed_at is null or s.last_accessed_at < current_date - 60)
       and not exists (
         select 1 from subscription_alerts sa
         where sa.subscription_id = s.id
           and sa.alert_type = 'unused_60d'
           and sa.triggered_at > current_date - 30
       )`
  );

  for (const sub of unused) {
    await executeAdmin(
      `insert into subscription_alerts (subscription_id, alert_type, message)
       values ($1, 'unused_60d'::subscription_alert_type, $2)`,
      [sub.id, `${sub.name} has not been accessed in 60+ days. Consider reviewing.`]
    );
    created++;
  }

  revalidatePath("/subscriptions");
  redirect(`/subscriptions?status=success&message=${encodeURIComponent(`${created} alerts generated.`)}` as Route);
}

export async function dismissAlertAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const alertId = String(formData.get("alertId") ?? "").trim();
  if (!alertId) return;

  await executeAdmin(
    `update subscription_alerts set is_dismissed = true where id = $1`,
    [alertId]
  );

  revalidatePath("/subscriptions");
  redirect("/subscriptions?status=success&message=Alert+dismissed" as Route);
}
