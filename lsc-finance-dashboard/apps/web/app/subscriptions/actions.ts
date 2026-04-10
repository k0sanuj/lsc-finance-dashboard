"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function num(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function redirectToSubs(status: "success" | "error", message: string): never {
  redirect(
    `/subscriptions?status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}` as Route
  );
}

export async function addSubscriptionAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const name = clean(formData.get("name"));
  const provider = clean(formData.get("provider"));
  const companyCode = clean(formData.get("companyCode"));
  const monthlyCost = num(formData.get("monthlyCost"));
  const billingCycle = clean(formData.get("billingCycle")) || "monthly";
  const category = clean(formData.get("category")) || "other";
  const currency = clean(formData.get("currency")) || "USD";
  const nextBillingDate = clean(formData.get("nextBillingDate"));
  const notes = clean(formData.get("notes"));

  if (!name || !provider || monthlyCost <= 0) {
    redirectToSubs("error", "Name, provider, and monthly cost are required.");
  }

  let companyId: string | null = null;
  if (companyCode) {
    const rows = await queryRowsAdmin<{ id: string }>(
      `select id from companies where code = $1::company_code`,
      [companyCode]
    );
    companyId = rows[0]?.id ?? null;
  }

  const annualCost =
    billingCycle === "annual" ? monthlyCost : monthlyCost * 12;

  await executeAdmin(
    `insert into subscriptions
       (name, provider, company_id, is_shared, monthly_cost, annual_cost,
        currency_code, billing_cycle, category, status, auto_renew,
        next_billing_date, notes)
     values ($1, $2, $3, false, $4, $5, $6,
             $7::billing_cycle, $8::subscription_category,
             'active'::subscription_status, true,
             nullif($9, '')::date, $10)`,
    [
      name,
      provider,
      companyId,
      monthlyCost,
      annualCost,
      currency,
      billingCycle,
      category,
      nextBillingDate,
      notes || null
    ]
  );

  revalidatePath("/subscriptions");
  redirectToSubs("success", `${name} added.`);
}

export async function updateSubscriptionAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const id = clean(formData.get("id"));
  const monthlyCost = num(formData.get("monthlyCost"));
  const status = clean(formData.get("status"));
  if (!id) redirectToSubs("error", "Missing subscription id.");

  if (monthlyCost > 0) {
    await executeAdmin(
      `update subscriptions
         set monthly_cost = $2, annual_cost = case
           when billing_cycle = 'annual' then $2
           else $2 * 12
         end, updated_at = now()
       where id = $1`,
      [id, monthlyCost]
    );
  }
  if (status) {
    await executeAdmin(
      `update subscriptions set status = $2::subscription_status, updated_at = now() where id = $1`,
      [id, status]
    );
  }

  revalidatePath("/subscriptions");
  redirectToSubs("success", "Subscription updated.");
}

export async function deleteSubscriptionAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const id = clean(formData.get("id"));
  if (!id) redirectToSubs("error", "Missing id.");
  await executeAdmin(`delete from subscriptions where id = $1`, [id]);
  revalidatePath("/subscriptions");
  redirectToSubs("success", "Subscription removed.");
}

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
