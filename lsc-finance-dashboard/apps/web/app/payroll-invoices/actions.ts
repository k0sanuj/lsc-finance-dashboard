"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  executeAdmin,
  queryRowsAdmin,
  convertCurrency,
  XTZ_ISSUER,
  LSC_DUBAI_RECIPIENT,
  LSC_DUBAI_ISSUER
} from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";
import { normalizeCompanyCode } from "../lib/entities";

function redirectTo(
  status: "success" | "error",
  message: string,
  invoiceId?: string,
  month?: string
): never {
  const params = new URLSearchParams({ status, message });
  if (month) params.set("month", month);
  const target = invoiceId
    ? `/payroll-invoices/${invoiceId}?${params.toString()}`
    : `/payroll-invoices?${params.toString()}`;
  redirect(target as Route);
}

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function num(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Extract the working month from form to preserve across redirects */
function getMonth(formData: FormData): string {
  return clean(formData.get("month")) || "";
}

async function getCompanyIdByCode(code: string): Promise<string | null> {
  const normalizedCode = normalizeCompanyCode(code, "LSC");
  const rows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = $1::company_code limit 1`,
    [normalizedCode]
  );
  return rows[0]?.id ?? null;
}

// ── Add staging rows ─────────────────────────────────────────

export async function addMdgFeeAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const companyCode = clean(formData.get("companyCode")) || "XTZ";
  const feeMonth = clean(formData.get("feeMonth"));
  const description = clean(formData.get("description")) || "MDG Fees";
  const amount = num(formData.get("amount"));
  const currency = clean(formData.get("currency")) || "INR";
  const notes = clean(formData.get("notes"));

  if (!feeMonth || amount <= 0) {
    redirectTo("error", "Fee month and amount are required.");
  }
  const monthDate = feeMonth.length === 7 ? `${feeMonth}-01` : feeMonth;
  const companyId = await getCompanyIdByCode(companyCode);
  if (!companyId) redirectTo("error", `Company ${companyCode} not found.`);

  await executeAdmin(
    `insert into mdg_fees (company_id, fee_month, description, amount, currency_code, notes)
     values ($1, $2::date, $3, $4, $5, $6)
     on conflict (company_id, fee_month)
     do update set amount = excluded.amount, description = excluded.description,
                   currency_code = excluded.currency_code, notes = excluded.notes,
                   updated_at = now()`,
    [companyId, monthDate, description, amount, currency, notes || null]
  );

  revalidatePath("/payroll-invoices");
  redirectTo("success", `MDG fee for ${feeMonth} saved.`, undefined, getMonth(formData));
}

export async function updateMdgFeeAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const id = clean(formData.get("id"));
  const amount = num(formData.get("amount"));
  const description = clean(formData.get("description"));
  const status = clean(formData.get("status"));
  if (!id) redirectTo("error", "Missing id.");
  const sets: string[] = ["updated_at = now()"];
  const vals: (string | number)[] = [id];
  let p = 2;
  if (amount > 0) { sets.push(`amount = $${p}`); vals.push(amount); p++; }
  if (description) { sets.push(`description = $${p}`); vals.push(description); p++; }
  if (status) { sets.push(`status = $${p}`); vals.push(status); p++; }
  await executeAdmin(`update mdg_fees set ${sets.join(", ")} where id = $1`, vals);
  revalidatePath("/payroll-invoices");
  redirectTo("success", "MDG fee updated.", undefined, getMonth(formData));
}

export async function deleteMdgFeeAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const id = clean(formData.get("id"));
  if (!id) redirectTo("error", "Missing id.");
  await executeAdmin(`delete from mdg_fees where id = $1 and invoiced_item_id is null`, [id]);
  revalidatePath("/payroll-invoices");
  redirectTo("success", "MDG fee removed.", undefined, getMonth(formData));
}

export async function addReimbursementAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const companyCode = clean(formData.get("companyCode")) || "XTZ";
  const month = clean(formData.get("expenseMonth"));
  const description = clean(formData.get("description"));
  const vendor = clean(formData.get("vendorName"));
  const amount = num(formData.get("amount"));
  const currency = clean(formData.get("currency")) || "USD";
  const notes = clean(formData.get("notes"));

  if (!month || !description || amount <= 0) {
    redirectTo("error", "Month, description, and amount are required.");
  }
  const monthDate = month.length === 7 ? `${month}-01` : month;
  const companyId = await getCompanyIdByCode(companyCode);
  if (!companyId) redirectTo("error", `Company ${companyCode} not found.`);

  await executeAdmin(
    `insert into reimbursement_items
       (reimbursing_company_id, expense_month, description, vendor_name,
        amount, currency_code, notes)
     values ($1, $2::date, $3, $4, $5, $6, $7)`,
    [companyId, monthDate, description, vendor || null, amount, currency, notes || null]
  );

  revalidatePath("/payroll-invoices");
  redirectTo("success", "Reimbursement added.", undefined, getMonth(formData));
}

export async function updateReimbursementAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const id = clean(formData.get("id"));
  const amount = num(formData.get("amount"));
  const description = clean(formData.get("description"));
  const status = clean(formData.get("status"));
  if (!id) redirectTo("error", "Missing id.");
  const sets: string[] = ["updated_at = now()"];
  const vals: (string | number)[] = [id];
  let p = 2;
  if (amount > 0) { sets.push(`amount = $${p}`); vals.push(amount); p++; }
  if (description) { sets.push(`description = $${p}`); vals.push(description); p++; }
  if (status) { sets.push(`status = $${p}`); vals.push(status); p++; }
  await executeAdmin(`update reimbursement_items set ${sets.join(", ")} where id = $1`, vals);
  revalidatePath("/payroll-invoices");
  redirectTo("success", "Reimbursement updated.", undefined, getMonth(formData));
}

export async function deleteReimbursementAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const id = clean(formData.get("id"));
  if (!id) redirectTo("error", "Missing id.");
  await executeAdmin(
    `delete from reimbursement_items where id = $1 and invoiced_item_id is null`,
    [id]
  );
  revalidatePath("/payroll-invoices");
  redirectTo("success", "Reimbursement removed.", undefined, getMonth(formData));
}

export async function addProvisionAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const companyCode = clean(formData.get("companyCode")) || "XTZ";
  const month = clean(formData.get("provisionMonth"));
  const description = clean(formData.get("description"));
  const category = clean(formData.get("category")) || "other";
  const vendor = clean(formData.get("vendorName"));
  const amount = num(formData.get("amount"));
  const currency = clean(formData.get("currency")) || "USD";
  const notes = clean(formData.get("notes"));

  if (!month || !description || amount <= 0) {
    redirectTo("error", "Month, description, and amount are required.");
  }
  const monthDate = month.length === 7 ? `${month}-01` : month;
  const companyId = await getCompanyIdByCode(companyCode);
  if (!companyId) redirectTo("error", `Company ${companyCode} not found.`);

  await executeAdmin(
    `insert into provisions
       (company_id, provision_month, description, category, vendor_name,
        estimated_amount, currency_code, notes)
     values ($1, $2::date, $3, $4, $5, $6, $7, $8)`,
    [
      companyId,
      monthDate,
      description,
      category,
      vendor || null,
      amount,
      currency,
      notes || null
    ]
  );

  revalidatePath("/payroll-invoices");
  redirectTo("success", "Provision added.", undefined, getMonth(formData));
}

export async function updateProvisionAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const id = clean(formData.get("id"));
  const amount = num(formData.get("amount"));
  const description = clean(formData.get("description"));
  const status = clean(formData.get("status"));
  const notes = clean(formData.get("notes"));
  if (!id) redirectTo("error", "Missing id.");
  const sets: string[] = ["updated_at = now()"];
  const vals: (string | number)[] = [id];
  let p = 2;
  if (amount > 0) { sets.push(`estimated_amount = $${p}`); vals.push(amount); p++; }
  if (description) { sets.push(`description = $${p}`); vals.push(description); p++; }
  if (status) { sets.push(`status = $${p}`); vals.push(status); p++; }
  if (notes) { sets.push(`notes = $${p}`); vals.push(notes); p++; }
  await executeAdmin(`update provisions set ${sets.join(", ")} where id = $1`, vals);
  revalidatePath("/payroll-invoices");
  redirectTo("success", "Provision updated.", undefined, getMonth(formData));
}

export async function deleteProvisionAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const id = clean(formData.get("id"));
  if (!id) redirectTo("error", "Missing id.");
  await executeAdmin(
    `delete from provisions where id = $1 and invoiced_item_id is null`,
    [id]
  );
  revalidatePath("/payroll-invoices");
  redirectTo("success", "Provision removed.", undefined, getMonth(formData));
}

// ── Generate full XTZ invoice ────────────────────────────────

export async function generateXtzInvoiceAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);

  const fromCompanyCode = normalizeCompanyCode(clean(formData.get("fromCompanyCode")) || "XTZ", "XTZ");
  const toCompanyCode = normalizeCompanyCode(clean(formData.get("toCompanyCode")) || "LSC", "LSC");
  const payrollMonth = clean(formData.get("payrollMonth"));
  const invoiceCurrency = clean(formData.get("invoiceCurrency")) || "USD";
  const paymentMethod = clean(formData.get("paymentMethod")) || "Wire transfer (USD)";
  const notes = clean(formData.get("notes"));

  if (!payrollMonth) {
    redirectTo("error", "Payroll month is required.");
  }
  const monthDate = payrollMonth.length === 7 ? `${payrollMonth}-01` : payrollMonth;

  const fromCompanyId = await getCompanyIdByCode(fromCompanyCode);
  if (!fromCompanyId) redirectTo("error", `Company ${fromCompanyCode} not found.`);

  const toCompanyId = await getCompanyIdByCode(toCompanyCode);
  if (!toCompanyId) redirectTo("error", `Company ${toCompanyCode} not found.`);

  // ── Section 1: payroll lines from active employees
  type PayrollLine = {
    employeeId: string | null;
    description: string;
    convertedAmount: number;
    originalAmount: number;
    originalCurrency: string;
    fxRate: number;
    isProvision: boolean;
    referenceNote: string | null;
    section:
      | "payroll"
      | "mdg_fees"
      | "reimbursement"
      | "provision"
      | "software_expense"
      | "other";
    vendorName?: string | null;
  };

  const lines: PayrollLine[] = [];

  const activeEmployees = await queryRowsAdmin<{
    id: string;
    full_name: string;
    designation: string;
    base_salary: string;
    salary_currency: string;
    is_usd_salary: boolean;
    salary_usd: string;
    status: string;
    end_date: string | null;
  }>(
    `select e.id, e.full_name, e.designation, e.base_salary, e.salary_currency,
            e.is_usd_salary, e.salary_usd, e.status::text, e.end_date::text
     from employees e
     join companies c on c.id = e.company_id
     where c.code = $1::company_code
       and (e.status = 'active'
            or (e.status = 'terminated' and e.end_date >= $2::date - interval '60 days'))
       and e.full_name != 'Sayan Mukherjee'
     order by e.full_name`,
    [fromCompanyCode, monthDate]
  );

  for (const emp of activeEmployees) {
    let convertedAmount = 0;
    let originalAmount = 0;
    let originalCurrency = "INR";
    let fxRate = 1;
    if (emp.is_usd_salary && Number(emp.salary_usd) > 0) {
      originalAmount = Number(emp.salary_usd);
      originalCurrency = "USD";
      if (invoiceCurrency === "USD") {
        convertedAmount = originalAmount;
      } else {
        const fx = await convertCurrency(originalAmount, "USD", invoiceCurrency);
        convertedAmount = fx.converted;
        fxRate = fx.rate;
      }
    } else {
      originalAmount = Number(emp.base_salary);
      originalCurrency = emp.salary_currency;
      if (originalCurrency === invoiceCurrency) {
        convertedAmount = originalAmount;
      } else {
        const fx = await convertCurrency(originalAmount, originalCurrency, invoiceCurrency);
        convertedAmount = fx.converted;
        fxRate = fx.rate;
      }
    }

    lines.push({
      employeeId: emp.id,
      section: "payroll",
      description: `${emp.full_name} — ${emp.designation}`,
      convertedAmount,
      originalAmount,
      originalCurrency,
      fxRate,
      isProvision: false,
      referenceNote:
        emp.status === "terminated" ? "Final payroll — employee offboarded" : null
    });
  }

  // ── Section 2: MDG fees for the month
  const mdgRows = await queryRowsAdmin<{
    id: string;
    description: string;
    amount: string;
    currency_code: string;
  }>(
    `select m.id, m.description, m.amount, m.currency_code
     from mdg_fees m
     join companies c on c.id = m.company_id
     where c.code = $1::company_code
       and m.fee_month = $2::date
       and m.invoiced_item_id is null`,
    [fromCompanyCode, monthDate]
  );
  const mdgIds: string[] = [];
  for (const fee of mdgRows) {
    const orig = Number(fee.amount);
    let convertedAmount = orig;
    let fxRate = 1;
    if (fee.currency_code !== invoiceCurrency) {
      const fx = await convertCurrency(orig, fee.currency_code, invoiceCurrency);
      convertedAmount = fx.converted;
      fxRate = fx.rate;
    }
    lines.push({
      employeeId: null,
      section: "mdg_fees",
      description: fee.description,
      convertedAmount,
      originalAmount: orig,
      originalCurrency: fee.currency_code,
      fxRate,
      isProvision: false,
      referenceNote: null
    });
    mdgIds.push(fee.id);
  }

  // ── Section 3: reimbursements for the month
  const reimbRows = await queryRowsAdmin<{
    id: string;
    description: string;
    vendor_name: string | null;
    amount: string;
    currency_code: string;
  }>(
    `select r.id, r.description, r.vendor_name, r.amount, r.currency_code
     from reimbursement_items r
     join companies c on c.id = r.reimbursing_company_id
     where c.code = $1::company_code
       and r.expense_month = $2::date
       and r.invoiced_item_id is null`,
    [fromCompanyCode, monthDate]
  );
  const reimbIds: string[] = [];
  for (const r of reimbRows) {
    const orig = Number(r.amount);
    let convertedAmount = orig;
    let fxRate = 1;
    if (r.currency_code !== invoiceCurrency) {
      const fx = await convertCurrency(orig, r.currency_code, invoiceCurrency);
      convertedAmount = fx.converted;
      fxRate = fx.rate;
    }
    lines.push({
      employeeId: null,
      section: "reimbursement",
      description: r.description,
      convertedAmount,
      originalAmount: orig,
      originalCurrency: r.currency_code,
      fxRate,
      isProvision: false,
      referenceNote: null,
      vendorName: r.vendor_name
    });
    reimbIds.push(r.id);
  }

  // ── Section 4: software expenses paid by XTZ (rare) — only those owned/billed
  // Software expenses are typically LSC-owned per user instruction so we skip
  // unless explicitly tagged to XTZ. We still surface the LSC totals for visibility
  // but don't auto-bill them on the XTZ-to-LSC invoice.
  const softwareRows = await queryRowsAdmin<{
    id: string;
    vendor_name: string;
    description: string | null;
    amount: string;
    currency_code: string;
  }>(
    `select se.id, se.vendor_name, se.description, se.amount, se.currency_code
     from software_expenses se
     join companies c on c.id = se.paying_company_id
     where c.code = $1::company_code
       and se.expense_month = $2::date
       and se.invoiced_item_id is null`,
    [fromCompanyCode, monthDate]
  );
  const softwareIds: string[] = [];
  for (const s of softwareRows) {
    const orig = Number(s.amount);
    let convertedAmount = orig;
    let fxRate = 1;
    if (s.currency_code !== invoiceCurrency) {
      const fx = await convertCurrency(orig, s.currency_code, invoiceCurrency);
      convertedAmount = fx.converted;
      fxRate = fx.rate;
    }
    lines.push({
      employeeId: null,
      section: "software_expense",
      description: `${s.vendor_name}${s.description ? ` — ${s.description}` : ""}`,
      convertedAmount,
      originalAmount: orig,
      originalCurrency: s.currency_code,
      fxRate,
      isProvision: false,
      referenceNote: null,
      vendorName: s.vendor_name
    });
    softwareIds.push(s.id);
  }

  // ── Section 5: provisions (estimated, marked as provision)
  const provRows = await queryRowsAdmin<{
    id: string;
    description: string;
    vendor_name: string | null;
    estimated_amount: string;
    currency_code: string;
  }>(
    `select p.id, p.description, p.vendor_name, p.estimated_amount, p.currency_code
     from provisions p
     join companies c on c.id = p.company_id
     where c.code = $1::company_code
       and p.provision_month = $2::date
       and p.invoiced_item_id is null`,
    [fromCompanyCode, monthDate]
  );
  const provIds: string[] = [];
  for (const p of provRows) {
    const orig = Number(p.estimated_amount);
    let convertedAmount = orig;
    let fxRate = 1;
    if (p.currency_code !== invoiceCurrency) {
      const fx = await convertCurrency(orig, p.currency_code, invoiceCurrency);
      convertedAmount = fx.converted;
      fxRate = fx.rate;
    }
    lines.push({
      employeeId: null,
      section: "provision",
      description: `${p.description} (Provision — estimate)`,
      convertedAmount,
      originalAmount: orig,
      originalCurrency: p.currency_code,
      fxRate,
      isProvision: true,
      referenceNote: "Estimated — vendor invoice not yet received",
      vendorName: p.vendor_name
    });
    provIds.push(p.id);
  }

  if (lines.length === 0) {
    redirectTo(
      "error",
      `No payroll, MDG fees, reimbursements, or provisions found for ${payrollMonth}.`
    );
  }

  const subtotal = Number(
    lines.reduce((s, l) => s + l.convertedAmount, 0).toFixed(2)
  );
  const yyyymm = payrollMonth.replace("-", "");
  const rand4 = String(Math.floor(1000 + Math.random() * 9000));
  const invoiceNumber = `XTZ-${yyyymm}-${rand4}`;

  const invoiceRows = await queryRowsAdmin<{ id: string }>(
    `insert into payroll_invoices (
       invoice_number, invoice_date, payroll_month,
       from_company_id, to_company_id,
       subtotal, tax_amount, total_amount,
       currency_code, status, payment_method, notes, generated_at,
       issuer_legal_name, issuer_gstin, issuer_cin, issuer_pan, issuer_address,
       bank_name, bank_account_number, bank_ifsc, bank_swift, bank_ad_code,
       bank_branch, bank_branch_address,
       recipient_legal_name, recipient_address
     ) values (
       $1, current_date, $2::date, $3, $4,
       $5, 0, $5, $6, 'generated', $7, $8, now(),
       $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18,
       $19, $20,
       $21, $22
     )
     returning id`,
    [
      invoiceNumber,
      monthDate,
      fromCompanyId,
      toCompanyId,
      subtotal,
      invoiceCurrency,
      paymentMethod,
      notes || null,
      XTZ_ISSUER.legalName,
      XTZ_ISSUER.gstin,
      XTZ_ISSUER.cin,
      XTZ_ISSUER.pan,
      XTZ_ISSUER.address,
      XTZ_ISSUER.bank.name,
      XTZ_ISSUER.bank.accountNumber,
      XTZ_ISSUER.bank.ifsc,
      XTZ_ISSUER.bank.swift,
      XTZ_ISSUER.bank.adCode,
      XTZ_ISSUER.bank.branch,
      XTZ_ISSUER.bank.branchAddress,
      LSC_DUBAI_RECIPIENT.legalName,
      LSC_DUBAI_RECIPIENT.address
    ]
  );

  const invoiceId = invoiceRows[0]?.id;
  if (!invoiceId) redirectTo("error", "Failed to create invoice.");

  let order = 0;
  for (const line of lines) {
    order += 10;
    const itemRows = await queryRowsAdmin<{ id: string }>(
      `insert into payroll_invoice_items
         (payroll_invoice_id, employee_id, section, description, vendor_name,
          quantity, unit_price, amount,
          original_amount, original_currency, fx_rate,
          is_provision, reference_note, display_order)
       values ($1, $2, $3::xtz_invoice_section, $4, $5,
               1, $6, $6, $7, $8, $9, $10, $11, $12)
       returning id`,
      [
        invoiceId,
        line.employeeId,
        line.section,
        line.description,
        line.vendorName ?? null,
        line.convertedAmount,
        line.originalAmount,
        line.originalCurrency,
        line.fxRate,
        line.isProvision,
        line.referenceNote,
        order
      ]
    );
    const itemId = itemRows[0]?.id;
    if (!itemId) continue;

    // Mark source rows as invoiced
    if (line.section === "mdg_fees") {
      const mdgId = mdgIds.shift();
      if (mdgId) {
        await executeAdmin(
          `update mdg_fees set invoiced_item_id = $1, status = 'invoiced', updated_at = now() where id = $2`,
          [itemId, mdgId]
        );
      }
    } else if (line.section === "reimbursement") {
      const rid = reimbIds.shift();
      if (rid) {
        await executeAdmin(
          `update reimbursement_items set invoiced_item_id = $1, status = 'invoiced', updated_at = now() where id = $2`,
          [itemId, rid]
        );
      }
    } else if (line.section === "software_expense") {
      const sid = softwareIds.shift();
      if (sid) {
        await executeAdmin(
          `update software_expenses set invoiced_item_id = $1, status = 'invoiced', updated_at = now() where id = $2`,
          [itemId, sid]
        );
      }
    } else if (line.section === "provision") {
      const pid = provIds.shift();
      if (pid) {
        await executeAdmin(
          `update provisions set invoiced_item_id = $1, status = 'invoiced', updated_at = now() where id = $2`,
          [itemId, pid]
        );
      }
    }
  }

  revalidatePath("/payroll-invoices");
  revalidatePath(`/payroll-invoices/${invoiceId}`);
  redirectTo(
    "success",
    `Invoice ${invoiceNumber} generated: ${lines.length} lines, ${subtotal.toLocaleString("en-US", { style: "currency", currency: invoiceCurrency })}`,
    invoiceId
  );
}

// ── Update invoice status ────────────────────────────────────

export async function updateInvoiceStatusAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const invoiceId = clean(formData.get("invoiceId"));
  const newStatus = clean(formData.get("newStatus"));
  if (!invoiceId || !newStatus) redirectTo("error", "Missing fields.");

  await executeAdmin(
    `update payroll_invoices
       set status = $2::payroll_invoice_status,
           paid_at = case when $2 = 'paid' then now() else paid_at end,
           updated_at = now()
     where id = $1`,
    [invoiceId, newStatus]
  );

  await cascadeUpdate({
    trigger: "invoice:status:changed",
    entityType: "payroll_invoice",
    entityId: invoiceId,
    action: "status-change",
    after: { status: newStatus },
    performedBy: session.id,
    agentId: "payroll-agent",
  });

  revalidatePath("/payroll-invoices");
  revalidatePath(`/payroll-invoices/${invoiceId}`);
  redirectTo("success", `Status set to ${newStatus}.`, invoiceId);
}

export async function deleteInvoiceAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const invoiceId = clean(formData.get("invoiceId"));
  if (!invoiceId) redirectTo("error", "Missing id.");
  // Free the staging rows
  await executeAdmin(
    `update mdg_fees set invoiced_item_id = null, status = 'pending'
     where invoiced_item_id in (select id from payroll_invoice_items where payroll_invoice_id = $1)`,
    [invoiceId]
  );
  await executeAdmin(
    `update reimbursement_items set invoiced_item_id = null, status = 'pending'
     where invoiced_item_id in (select id from payroll_invoice_items where payroll_invoice_id = $1)`,
    [invoiceId]
  );
  await executeAdmin(
    `update provisions set invoiced_item_id = null, status = 'estimated'
     where invoiced_item_id in (select id from payroll_invoice_items where payroll_invoice_id = $1)`,
    [invoiceId]
  );
  await executeAdmin(
    `update software_expenses set invoiced_item_id = null, status = 'unpaid'
     where invoiced_item_id in (select id from payroll_invoice_items where payroll_invoice_id = $1)`,
    [invoiceId]
  );
  await executeAdmin(`delete from payroll_invoices where id = $1`, [invoiceId]);

  await cascadeUpdate({
    trigger: "payroll-invoice:deleted",
    entityType: "payroll_invoice",
    entityId: invoiceId,
    action: "delete",
    performedBy: session.id,
    agentId: "payroll-agent",
  });

  revalidatePath("/payroll-invoices");
  redirectTo("success", "Invoice deleted.", undefined, getMonth(formData));
}

// ── Record incoming invoice (vendor/contractor → company) ──
// The vendor is the ISSUER (their name + bank on the invoice header).
// The company (LSC/XTZ) is the RECIPIENT (billed to).

export async function createDirectInvoiceAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);

  const billedToEntity = normalizeCompanyCode(clean(formData.get("issuerEntity")), "LSC");
  const vendorName = clean(formData.get("recipientName")); // the vendor sending the invoice
  const vendorAddress = clean(formData.get("recipientAddress"));
  const invoiceMonth = clean(formData.get("invoiceMonth"));
  const invoiceCurrency = clean(formData.get("invoiceCurrency")) || "USD";
  const paymentMethod = clean(formData.get("paymentMethod")) || "Wire transfer (USD)";
  const notes = clean(formData.get("notes"));

  // Vendor bank details from VendorSelector hidden fields
  const vendorBankName = clean(formData.get("vendorBankName"));
  const vendorBankBranch = clean(formData.get("vendorBankBranch"));
  const vendorBankAccount = clean(formData.get("vendorBankAccount"));
  const vendorBankIfsc = clean(formData.get("vendorBankIfsc"));
  const vendorBankSwift = clean(formData.get("vendorBankSwift"));
  const vendorBankIban = clean(formData.get("vendorBankIban"));
  const vendorBankRouting = clean(formData.get("vendorBankRouting"));

  // Parse line items from form (up to 20 lines)
  const lineItems: { description: string; qty: number; unitPrice: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const desc = clean(formData.get(`lineDesc_${i}`));
    const qty = num(formData.get(`lineQty_${i}`));
    const price = num(formData.get(`linePrice_${i}`));
    if (desc && price > 0) {
      lineItems.push({ description: desc, qty: qty || 1, unitPrice: price });
    }
  }

  if (!vendorName || !invoiceMonth || lineItems.length === 0) {
    redirectTo("error", "Vendor name, month, and at least one line item are required.", undefined, getMonth(formData));
  }

  const monthDate = invoiceMonth.length === 7 ? `${invoiceMonth}-01` : invoiceMonth;
  const billedToCode = billedToEntity || "LSC";
  const billedToCompanyId = await getCompanyIdByCode(billedToCode);
  if (!billedToCompanyId) redirectTo("error", `Company ${billedToCode} not found.`, undefined, getMonth(formData));

  // The billed-to company's details go in the "recipient" fields
  const billedTo = billedToCode === "XTZ" ? XTZ_ISSUER : LSC_DUBAI_ISSUER;
  const billedToAddress = billedTo.address;
  const billedToLegalName = billedTo.legalName;

  const subtotal = Number(
    lineItems.reduce((s, l) => s + l.qty * l.unitPrice, 0).toFixed(2)
  );
  const yyyymm = invoiceMonth.replace("-", "");
  const rand4 = String(Math.floor(1000 + Math.random() * 9000));
  const invoiceNumber = `VND-${yyyymm}-${rand4}`;

  // issuer = vendor (who sends the invoice)
  // recipient = company (who pays)
  const invoiceRows = await queryRowsAdmin<{ id: string }>(
    `insert into payroll_invoices (
       invoice_number, invoice_date, payroll_month,
       from_company_id, to_company_id,
       subtotal, tax_amount, total_amount,
       currency_code, status, payment_method, notes, generated_at,
       issuer_legal_name, issuer_gstin, issuer_cin, issuer_pan, issuer_address,
       bank_name, bank_account_number, bank_ifsc, bank_swift, bank_ad_code,
       bank_branch, bank_branch_address,
       recipient_legal_name, recipient_address
     ) values (
       $1, current_date, $2::date, $3, $3,
       $4, 0, $4, $5, 'generated', $6, $7, now(),
       $8, null, null, null, $9,
       $10, $11, $12, $13, $14,
       $15, $16,
       $17, $18
     )
     returning id`,
    [
      invoiceNumber,
      monthDate,
      billedToCompanyId,
      subtotal,
      invoiceCurrency,
      paymentMethod,
      notes || null,
      vendorName,                                    // issuer_legal_name = vendor
      vendorAddress || null,                         // issuer_address = vendor address
      vendorBankName || null,                        // bank_name
      vendorBankAccount || null,                     // bank_account_number
      vendorBankIfsc || vendorBankIban || null,       // bank_ifsc (or IBAN)
      vendorBankSwift || null,                        // bank_swift
      vendorBankRouting || null,                      // bank_ad_code (routing)
      vendorBankBranch || null,                       // bank_branch
      null,                                           // bank_branch_address
      billedToLegalName,                             // recipient = the company
      billedToAddress                                // recipient address
    ]
  );

  const invoiceId = invoiceRows[0]?.id;
  if (!invoiceId) redirectTo("error", "Failed to create invoice.");

  let order = 0;
  for (const line of lineItems) {
    order += 10;
    await queryRowsAdmin<{ id: string }>(
      `insert into payroll_invoice_items
         (payroll_invoice_id, section, description,
          quantity, unit_price, amount,
          display_order)
       values ($1, 'other'::xtz_invoice_section, $2,
               $3, $4, $5, $6)
       returning id`,
      [
        invoiceId,
        line.description,
        line.qty,
        line.unitPrice,
        Number((line.qty * line.unitPrice).toFixed(2)),
        order
      ]
    );
  }

  revalidatePath("/payroll-invoices");
  revalidatePath(`/payroll-invoices/${invoiceId}`);
  redirectTo(
    "success",
    `Invoice ${invoiceNumber} created: ${lineItems.length} lines, ${subtotal.toLocaleString("en-US", { style: "currency", currency: invoiceCurrency })}`,
    invoiceId
  );
}
