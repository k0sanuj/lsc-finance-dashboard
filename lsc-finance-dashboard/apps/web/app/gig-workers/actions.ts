"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function generatePayoutsAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const companyCode = normalizeWhitespace(String(formData.get("companyCode") ?? "XTZ"));

  // Get company ID
  const companies = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = $1::company_code`,
    [companyCode]
  );
  const companyId = companies[0]?.id;
  if (!companyId) {
    return redirect("/gig-workers?status=error&message=Company+not+found" as Route);
  }

  // Get active gig workers with approved tasks that don't have payouts yet this month
  const workers = await queryRowsAdmin<{
    id: string;
    name: string;
    rate_amount: string;
    rate_currency: string;
    payment_method: string;
    tax_withholding_rate: string;
    payment_frequency: string;
  }>(
    `select gw.id, gw.name, gw.rate_amount, gw.rate_currency,
            gw.payment_method, gw.tax_withholding_rate, gw.payment_frequency
     from gig_workers gw
     where gw.company_id = $1 and gw.is_active = true
       and not exists (
         select 1 from gig_worker_payouts gwp
         where gwp.gig_worker_id = gw.id
           and gwp.period_start >= date_trunc('month', current_date)
       )`,
    [companyId]
  );

  if (workers.length === 0) {
    return redirect("/gig-workers?status=info&message=All+workers+already+have+payouts+this+period" as Route);
  }

  let created = 0;
  const periodStart = new Date();
  periodStart.setDate(1);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  periodEnd.setDate(0);

  for (const w of workers) {
    const gross = Number(w.rate_amount);
    const taxRate = Number(w.tax_withholding_rate);
    const deductions = Number((gross * taxRate).toFixed(2));
    const net = Number((gross - deductions).toFixed(2));

    await executeAdmin(
      `insert into gig_worker_payouts (
         company_id, gig_worker_id, period_start, period_end,
         gross_amount, deductions, net_amount,
         currency_code, payment_method, status
       ) values ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9::gig_payment_method, 'pending')`,
      [
        companyId,
        w.id,
        periodStart.toISOString().slice(0, 10),
        periodEnd.toISOString().slice(0, 10),
        gross,
        deductions,
        net,
        w.rate_currency,
        w.payment_method
      ]
    );
    created++;
  }

  if (created > 0) {
    await cascadeUpdate({
      trigger: "gig-payout:generated",
      entityType: "gig_worker_payout",
      entityId: companyId,
      action: "generate-batch",
      after: { companyCode, periodStart: periodStart.toISOString().slice(0, 10), periodEnd: periodEnd.toISOString().slice(0, 10), count: created },
      performedBy: session.id,
      agentId: "gig-worker-agent",
    });
  }

  revalidatePath("/gig-workers");
  redirect(`/gig-workers?status=success&message=${encodeURIComponent(`${created} payouts generated for this period.`)}` as Route);
}

export async function processPayoutAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const payoutId = normalizeWhitespace(String(formData.get("payoutId") ?? ""));
  if (!payoutId) {
    return redirect("/gig-workers?status=error&message=Missing+payout+ID" as Route);
  }

  await executeAdmin(
    `update gig_worker_payouts
     set status = 'processing', updated_at = now()
     where id = $1 and status = 'pending'`,
    [payoutId]
  );

  await cascadeUpdate({
    trigger: "gig-payout:processed",
    entityType: "gig_worker_payout",
    entityId: payoutId,
    action: "process",
    after: { status: "processing" },
    performedBy: session.id,
    agentId: "gig-worker-agent",
  });

  revalidatePath("/gig-workers");
  redirect(`/gig-workers?view=payouts&status=success&message=${encodeURIComponent("Payout marked as processing.")}` as Route);
}

export async function confirmPayoutAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const payoutId = normalizeWhitespace(String(formData.get("payoutId") ?? ""));
  if (!payoutId) {
    return redirect("/gig-workers?status=error&message=Missing+payout+ID" as Route);
  }

  const before = await queryRowsAdmin<{ status: string; amount: string; currency_code: string }>(
    `select status, amount::text, currency_code from gig_worker_payouts where id = $1`,
    [payoutId]
  );

  await executeAdmin(
    `update gig_worker_payouts
     set status = 'paid', paid_at = now(), updated_at = now()
     where id = $1 and status in ('pending', 'processing')`,
    [payoutId]
  );

  await cascadeUpdate({
    trigger: "gig-payout:confirmed",
    entityType: "gig_worker_payout",
    entityId: payoutId,
    action: "confirm-paid",
    before: before[0] ? { status: before[0].status } : undefined,
    after: before[0]
      ? { status: "paid", amount: before[0].amount, currencyCode: before[0].currency_code }
      : { status: "paid" },
    performedBy: session.id,
    agentId: "gig-worker-agent",
  });

  revalidatePath("/gig-workers");
  redirect(`/gig-workers?view=payouts&status=success&message=${encodeURIComponent("Payout confirmed as paid.")}` as Route);
}
