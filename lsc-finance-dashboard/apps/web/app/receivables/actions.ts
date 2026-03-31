"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { requireRole, requireSession } from "../../lib/auth";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAmount(value: string) {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

type TrancheDraft = {
  trancheLabel: string;
  tranchePercentage: string;
  triggerType: string;
  triggerRaceEventId: string;
  triggerDate: string;
  triggerOffsetDays: string;
  deliverableChecklistId: string;
  notes: string;
};

export async function createContractTranchesAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin", "commercial_user"]);

  const contractId = normalizeWhitespace(String(formData.get("contractId") ?? ""));
  const returnPath = normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/receivables/TBR?view=schedule";

  let tranches: TrancheDraft[] = [];
  try {
    tranches = JSON.parse(String(formData.get("tranchesJson") ?? "[]"));
  } catch {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Invalid tranche data.")}` as Route);
  }

  if (!contractId || tranches.length === 0) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Contract and at least one tranche required.")}` as Route);
  }

  const contractRows = await queryRowsAdmin<{
    company_id: string;
    sponsor_or_customer_id: string;
    contract_value: string;
  }>(
    `select company_id, sponsor_or_customer_id, contract_value
     from contracts where id = $1 limit 1`,
    [contractId]
  );
  const contract = contractRows[0];
  if (!contract) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Contract not found.")}` as Route);
  }

  const contractValue = Number(contract.contract_value);

  for (let i = 0; i < tranches.length; i++) {
    const t = tranches[i];
    const label = normalizeWhitespace(t.trancheLabel);
    if (!label) continue;

    const pct = parseAmount(t.tranchePercentage);
    const amount = Number((contractValue * pct / 100).toFixed(2));

    await executeAdmin(
      `insert into contract_tranches (
         contract_id, company_id, sponsor_or_customer_id,
         tranche_number, tranche_label, tranche_percentage, tranche_amount,
         trigger_type, trigger_race_event_id, trigger_date, trigger_offset_days,
         deliverable_checklist_id, notes
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8::tranche_trigger_type, $9, $10, $11, $12, $13)`,
      [
        contractId,
        contract.company_id,
        contract.sponsor_or_customer_id,
        i + 1,
        label,
        pct,
        amount,
        t.triggerType || "on_date",
        t.triggerRaceEventId || null,
        t.triggerDate || null,
        Number(t.triggerOffsetDays) || 0,
        t.deliverableChecklistId || null,
        normalizeWhitespace(t.notes) || null
      ]
    );
  }

  revalidatePath("/receivables");
  revalidatePath("/commercial-goals");
  redirect(`${returnPath}&status=success&message=${encodeURIComponent(`${tranches.length} tranches created.`)}` as Route);
}

export async function activateTrancheAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const trancheId = normalizeWhitespace(String(formData.get("trancheId") ?? ""));
  const returnPath = normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/receivables/TBR?view=schedule";

  if (!trancheId) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Missing tranche ID.")}` as Route);
  }

  // Check deliverable gate
  const gateRows = await queryRowsAdmin<{ blocked: boolean }>(
    `select coalesce(
       ct.deliverable_checklist_id is not null
       and exists(
         select 1 from deliverable_checklist_summary dcs
         where dcs.checklist_id = ct.deliverable_checklist_id
           and dcs.invoice_eligible = false
       ),
       false
     ) as blocked
     from contract_tranches ct where ct.id = $1`,
    [trancheId]
  );

  if (gateRows[0]?.blocked) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Deliverable gate is blocking this tranche. Complete all deliverables first.")}` as Route);
  }

  await executeAdmin(
    `update contract_tranches
     set tranche_status = 'active', activated_at = now(), updated_at = now()
     where id = $1 and tranche_status = 'scheduled'`,
    [trancheId]
  );

  revalidatePath("/receivables");
  redirect(`${returnPath}&status=success&message=${encodeURIComponent("Tranche activated.")}` as Route);
}

export async function generateTrancheInvoiceAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const trancheId = normalizeWhitespace(String(formData.get("trancheId") ?? ""));
  const returnPath = normalizeWhitespace(String(formData.get("returnPath") ?? "")) || "/receivables/TBR?view=schedule";

  if (!trancheId) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Missing tranche ID.")}` as Route);
  }

  const trancheRows = await queryRowsAdmin<{
    contract_id: string;
    company_id: string;
    sponsor_or_customer_id: string;
    tranche_amount: string;
    tranche_label: string;
    tranche_status: string;
  }>(
    `select contract_id, company_id, sponsor_or_customer_id,
            tranche_amount, tranche_label, tranche_status
     from contract_tranches where id = $1`,
    [trancheId]
  );
  const tranche = trancheRows[0];

  if (!tranche || tranche.tranche_status !== "active") {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Tranche must be active to generate invoice.")}` as Route);
  }

  // Create receivable invoice
  const invoiceRows = await queryRowsAdmin<{ id: string }>(
    `insert into invoices (
       company_id, contract_id, sponsor_or_customer_id,
       direction, invoice_number, invoice_status,
       issue_date, due_date, currency_code,
       total_amount, notes
     )
     values ($1, $2, $3, 'receivable',
       'TR-' || to_char(now(), 'YYYYMMDD') || '-' || left($7::text, 8),
       'issued', current_date, current_date + 30, 'USD', $4,
       $5 || ' — auto-generated from tranche')
     returning id`,
    [
      tranche.company_id,
      tranche.contract_id,
      tranche.sponsor_or_customer_id,
      tranche.tranche_amount,
      tranche.tranche_label,
      session.id,
      trancheId
    ]
  );

  const invoiceId = invoiceRows[0]?.id;
  if (!invoiceId) {
    return redirect(`${returnPath}&status=error&message=${encodeURIComponent("Invoice creation failed.")}` as Route);
  }

  await executeAdmin(
    `update contract_tranches
     set tranche_status = 'invoiced', invoiced_at = now(),
         linked_invoice_id = $1, updated_at = now()
     where id = $2`,
    [invoiceId, trancheId]
  );

  revalidatePath("/receivables");
  revalidatePath("/payments");
  redirect(`${returnPath}&status=success&message=${encodeURIComponent(`Invoice generated for ${tranche.tranche_label}.`)}` as Route);
}
