"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import {
  executeAdmin,
  getAdminPool,
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
  month?: string,
  path?: string
): never {
  const params = new URLSearchParams({ status, message });
  if (month) params.set("month", month);
  const basePath = path || (invoiceId ? `/payroll-invoices/${invoiceId}` : "/payroll-invoices/generator");
  const target = `${basePath}?${params.toString()}`;
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

function revalidateInvoicePaths(invoiceId?: string) {
  revalidatePath("/payroll-invoices");
  revalidatePath("/payroll-invoices/generator");
  if (invoiceId) {
    revalidatePath(`/payroll-invoices/${invoiceId}`);
    revalidatePath(`/payroll-invoices/${invoiceId}/edit`);
  }
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getAdminPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function getCompanyIdByCode(code: string): Promise<string | null> {
  const normalizedCode = normalizeCompanyCode(code, "LSC");
  const rows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = $1::company_code limit 1`,
    [normalizedCode]
  );
  return rows[0]?.id ?? null;
}

async function generateUniqueInvoiceNumber(client: PoolClient, prefix: string, month: string) {
  const yyyymm = month.replace("-", "").slice(0, 6);
  for (let attempt = 0; attempt < 20; attempt++) {
    const rand4 = String(Math.floor(1000 + Math.random() * 9000));
    const invoiceNumber = `${prefix}-${yyyymm}-${rand4}`;
    const { rows } = await client.query<{ id: string }>(
      `select id from payroll_invoices where invoice_number = $1 limit 1`,
      [invoiceNumber]
    );
    if (!rows[0]) return invoiceNumber;
  }
  throw new Error("Could not allocate a unique invoice number.");
}

async function recalculateInvoiceTotals(client: PoolClient, invoiceId: string) {
  const { rows } = await client.query<{ subtotal: string; total_amount: string }>(
    `with totals as (
       select coalesce(sum(amount), 0)::numeric(14,2) as subtotal
       from payroll_invoice_items
       where payroll_invoice_id = $1::uuid
     )
     update payroll_invoices pi
     set subtotal = totals.subtotal,
         total_amount = (totals.subtotal + pi.tax_amount)::numeric(14,2),
         updated_at = now()
     from totals
     where pi.id = $1::uuid
     returning pi.subtotal::text, pi.total_amount::text`,
    [invoiceId]
  );
  return rows[0] ?? null;
}

async function assertGeneratedInvoice(client: PoolClient, invoiceId: string) {
  const { rows } = await client.query<{ id: string; status: string }>(
    `select id, status::text from payroll_invoices where id = $1::uuid for update`,
    [invoiceId]
  );
  const invoice = rows[0];
  if (!invoice) throw new Error("Invoice was not found.");
  if (invoice.status !== "generated") {
    throw new Error("Only generated invoices can be edited. Clone this invoice to revise it.");
  }
  return invoice;
}

async function unlockSourceRowsForInvoice(client: PoolClient, invoiceId: string) {
  await client.query(
    `update mdg_fees set invoiced_item_id = null, status = 'pending', updated_at = now()
     where invoiced_item_id in (select id from payroll_invoice_items where payroll_invoice_id = $1::uuid)`,
    [invoiceId]
  );
  await client.query(
    `update reimbursement_items set invoiced_item_id = null, status = 'pending', updated_at = now()
     where invoiced_item_id in (select id from payroll_invoice_items where payroll_invoice_id = $1::uuid)`,
    [invoiceId]
  );
  await client.query(
    `update provisions set invoiced_item_id = null, status = 'estimated', updated_at = now()
     where invoiced_item_id in (select id from payroll_invoice_items where payroll_invoice_id = $1::uuid)`,
    [invoiceId]
  );
  await client.query(
    `update software_expenses set invoiced_item_id = null, status = 'unpaid', updated_at = now()
     where invoiced_item_id in (select id from payroll_invoice_items where payroll_invoice_id = $1::uuid)`,
    [invoiceId]
  );
}

async function unlockSourceRowsForItem(client: PoolClient, itemId: string) {
  await client.query(
    `update mdg_fees set invoiced_item_id = null, status = 'pending', updated_at = now()
     where invoiced_item_id = $1::uuid`,
    [itemId]
  );
  await client.query(
    `update reimbursement_items set invoiced_item_id = null, status = 'pending', updated_at = now()
     where invoiced_item_id = $1::uuid`,
    [itemId]
  );
  await client.query(
    `update provisions set invoiced_item_id = null, status = 'estimated', updated_at = now()
     where invoiced_item_id = $1::uuid`,
    [itemId]
  );
  await client.query(
    `update software_expenses set invoiced_item_id = null, status = 'unpaid', updated_at = now()
     where invoiced_item_id = $1::uuid`,
    [itemId]
  );
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

  revalidateInvoicePaths();
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
  revalidateInvoicePaths();
  redirectTo("success", "MDG fee updated.", undefined, getMonth(formData));
}

export async function deleteMdgFeeAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const id = clean(formData.get("id"));
  if (!id) redirectTo("error", "Missing id.");
  await executeAdmin(`delete from mdg_fees where id = $1 and invoiced_item_id is null`, [id]);
  revalidateInvoicePaths();
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

  revalidateInvoicePaths();
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
  revalidateInvoicePaths();
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
  revalidateInvoicePaths();
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

  revalidateInvoicePaths();
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
  revalidateInvoicePaths();
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
  revalidateInvoicePaths();
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
       and e.status = 'active'
       and e.full_name != 'Sayan Mukherjee'
     order by e.full_name`,
    [fromCompanyCode]
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
      referenceNote: null
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
  const result = await withTransaction(async (client) => {
    const invoiceNumber = await generateUniqueInvoiceNumber(client, "XTZ", payrollMonth);
    const invoiceRows = await client.query<{ id: string }>(
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

    const invoiceId = invoiceRows.rows[0]?.id;
    if (!invoiceId) throw new Error("Failed to create invoice.");

    let order = 0;
    for (const line of lines) {
      order += 10;
      const itemRows = await client.query<{ id: string }>(
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
      const itemId = itemRows.rows[0]?.id;
      if (!itemId) continue;

      if (line.section === "mdg_fees") {
        const mdgId = mdgIds.shift();
        if (mdgId) {
          await client.query(
            `update mdg_fees set invoiced_item_id = $1, status = 'invoiced', updated_at = now() where id = $2`,
            [itemId, mdgId]
          );
        }
      } else if (line.section === "reimbursement") {
        const rid = reimbIds.shift();
        if (rid) {
          await client.query(
            `update reimbursement_items set invoiced_item_id = $1, status = 'invoiced', updated_at = now() where id = $2`,
            [itemId, rid]
          );
        }
      } else if (line.section === "software_expense") {
        const sid = softwareIds.shift();
        if (sid) {
          await client.query(
            `update software_expenses set invoiced_item_id = $1, status = 'invoiced', updated_at = now() where id = $2`,
            [itemId, sid]
          );
        }
      } else if (line.section === "provision") {
        const pid = provIds.shift();
        if (pid) {
          await client.query(
            `update provisions set invoiced_item_id = $1, status = 'invoiced', updated_at = now() where id = $2`,
            [itemId, pid]
          );
        }
      }
    }

    return { invoiceId, invoiceNumber };
  });

  revalidateInvoicePaths(result.invoiceId);
  redirectTo(
    "success",
    `Invoice ${result.invoiceNumber} generated: ${lines.length} lines, ${subtotal.toLocaleString("en-US", { style: "currency", currency: invoiceCurrency })}`,
    result.invoiceId
  );
}

// ── Update invoice status ────────────────────────────────────

export async function updateInvoiceStatusAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const invoiceId = clean(formData.get("invoiceId"));
  const newStatus = clean(formData.get("newStatus"));
  if (!invoiceId || !newStatus) redirectTo("error", "Missing fields.");
  if (!["generated", "sent", "paid"].includes(newStatus)) {
    redirectTo("error", "Unsupported invoice status.", invoiceId);
  }

  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ status: string }>(
        `select status::text from payroll_invoices where id = $1::uuid for update`,
        [invoiceId]
      );
      const current = rows[0]?.status;
      if (!current) throw new Error("Invoice was not found.");
      if (current === "paid" || current === "void") {
        throw new Error("Paid and void invoices are locked.");
      }
      await client.query(
        `update payroll_invoices
           set status = $2::payroll_invoice_status,
               paid_at = case when $2 = 'paid' then now() else paid_at end,
               updated_at = now()
         where id = $1::uuid`,
        [invoiceId, newStatus]
      );
    });
  } catch (error) {
    redirectTo("error", error instanceof Error ? error.message : "Could not update invoice status.", invoiceId);
  }

  await cascadeUpdate({
    trigger: "invoice:status:changed",
    entityType: "payroll_invoice",
    entityId: invoiceId,
    action: "status-change",
    after: { status: newStatus },
    performedBy: session.id,
    agentId: "payroll-agent",
  });

  revalidateInvoicePaths(invoiceId);
  redirectTo("success", `Status set to ${newStatus}.`, invoiceId);
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const invoiceId = clean(formData.get("invoiceId"));
  const reason = clean(formData.get("voidReason")) || "Voided by finance.";
  if (!invoiceId) redirectTo("error", "Missing id.");

  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ status: string }>(
        `select status::text from payroll_invoices where id = $1::uuid for update`,
        [invoiceId]
      );
      const current = rows[0]?.status;
      if (!current) throw new Error("Invoice was not found.");
      if (current === "paid") throw new Error("Paid invoices are locked in v1.");
      if (current === "void") throw new Error("Invoice is already void.");
      if (current !== "generated" && current !== "sent") {
        throw new Error("Only generated or sent invoices can be voided.");
      }
      await unlockSourceRowsForInvoice(client, invoiceId);
      await client.query(
        `update payroll_invoices
         set status = 'void'::payroll_invoice_status,
             voided_at = now(),
             voided_by_user_id = $2::uuid,
             void_reason = $3,
             updated_at = now()
         where id = $1::uuid`,
        [invoiceId, session.id, reason]
      );
    });
  } catch (error) {
    redirectTo("error", error instanceof Error ? error.message : "Could not void invoice.", invoiceId);
  }

  await cascadeUpdate({
    trigger: "payroll-invoice:voided",
    entityType: "payroll_invoice",
    entityId: invoiceId,
    action: "void",
    after: { status: "void", reason },
    performedBy: session.id,
    agentId: "payroll-agent",
  });

  revalidateInvoicePaths(invoiceId);
  redirectTo("success", "Invoice voided and staged source rows unlocked.", invoiceId);
}

export async function deleteInvoiceAction(formData: FormData): Promise<void> {
  return voidInvoiceAction(formData);
}

export async function cloneInvoiceAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const invoiceId = clean(formData.get("invoiceId"));
  if (!invoiceId) redirectTo("error", "Missing id.");

  let cloneId = "";
  let cloneNumber = "";
  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        invoice_number: string;
        payroll_month: string;
      }>(
        `select invoice_number, payroll_month::text
         from payroll_invoices
         where id = $1::uuid and status <> 'void'::payroll_invoice_status
         for update`,
        [invoiceId]
      );
      const source = rows[0];
      if (!source) throw new Error("Source invoice was not found or is void.");
      const prefix = source.invoice_number.startsWith("VND-") ? "VND" : "XTZ";
      const invoiceNumber = await generateUniqueInvoiceNumber(client, prefix, source.payroll_month.slice(0, 7));
      const cloneRows = await client.query<{ id: string }>(
        `insert into payroll_invoices (
           invoice_number, invoice_date, payroll_month,
           from_company_id, to_company_id,
           subtotal, tax_amount, total_amount,
           currency_code, status, payment_method, notes, generated_at,
           issuer_legal_name, issuer_gstin, issuer_cin, issuer_pan, issuer_address,
           bank_name, bank_account_number, bank_ifsc, bank_swift, bank_ad_code,
           bank_branch, bank_branch_address,
           recipient_legal_name, recipient_address,
           cloned_from_invoice_id
         )
         select
           $2, current_date, payroll_month,
           from_company_id, to_company_id,
           subtotal, tax_amount, total_amount,
           currency_code, 'generated'::payroll_invoice_status, payment_method,
           concat(coalesce(notes, ''), case when coalesce(notes, '') = '' then '' else E'\\n' end, 'Cloned from ', invoice_number),
           now(),
           issuer_legal_name, issuer_gstin, issuer_cin, issuer_pan, issuer_address,
           bank_name, bank_account_number, bank_ifsc, bank_swift, bank_ad_code,
           bank_branch, bank_branch_address,
           recipient_legal_name, recipient_address,
           id
         from payroll_invoices
         where id = $1::uuid
         returning id`,
        [invoiceId, invoiceNumber]
      );
      const newInvoiceId = cloneRows.rows[0]?.id;
      if (!newInvoiceId) throw new Error("Failed to clone invoice.");
      await client.query(
        `insert into payroll_invoice_items (
           payroll_invoice_id, employee_id, section, description, vendor_name,
           quantity, unit_price, amount,
           original_amount, original_currency, fx_rate,
           source_document_id, reference_note, is_provision, display_order,
           ai_intake_draft_id
         )
         select
           $2::uuid, employee_id, section, description, vendor_name,
           quantity, unit_price, amount,
           original_amount, original_currency, fx_rate,
           source_document_id, reference_note, is_provision, display_order,
           ai_intake_draft_id
         from payroll_invoice_items
         where payroll_invoice_id = $1::uuid
         order by display_order, created_at`,
        [invoiceId, newInvoiceId]
      );
      await recalculateInvoiceTotals(client, newInvoiceId);
      return { invoiceId: newInvoiceId, invoiceNumber };
    });
    cloneId = result.invoiceId;
    cloneNumber = result.invoiceNumber;
  } catch (error) {
    redirectTo("error", error instanceof Error ? error.message : "Could not clone invoice.", invoiceId);
  }

  await cascadeUpdate({
    trigger: "payroll-invoice:cloned",
    entityType: "payroll_invoice",
    entityId: cloneId,
    action: "clone",
    before: { sourceInvoiceId: invoiceId },
    after: { invoiceNumber: cloneNumber },
    performedBy: session.id,
    agentId: "payroll-agent",
  });

  revalidateInvoicePaths(cloneId);
  redirectTo("success", `Cloned invoice as ${cloneNumber}.`, cloneId, undefined, `/payroll-invoices/${cloneId}/edit`);
}

const INVOICE_SECTIONS = new Set([
  "payroll",
  "mdg_fees",
  "reimbursement",
  "software_expense",
  "provision",
  "other",
]);

function invoiceSection(value: string) {
  return INVOICE_SECTIONS.has(value) ? value : "other";
}

function checked(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

export async function updateInvoiceHeaderAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const invoiceId = clean(formData.get("invoiceId"));
  if (!invoiceId) redirectTo("error", "Missing invoice id.");

  const invoiceDate = clean(formData.get("invoiceDate"));
  const payrollMonth = clean(formData.get("payrollMonth"));
  const paymentMethod = clean(formData.get("paymentMethod"));
  const notes = clean(formData.get("notes"));
  const issuerLegalName = clean(formData.get("issuerLegalName"));
  const issuerAddress = clean(formData.get("issuerAddress"));
  const recipientLegalName = clean(formData.get("recipientLegalName"));
  const recipientAddress = clean(formData.get("recipientAddress"));
  const bankName = clean(formData.get("bankName"));
  const bankAccountNumber = clean(formData.get("bankAccountNumber"));
  const bankIfsc = clean(formData.get("bankIfsc"));
  const bankSwift = clean(formData.get("bankSwift"));
  const bankAdCode = clean(formData.get("bankAdCode"));
  const bankBranch = clean(formData.get("bankBranch"));
  const bankBranchAddress = clean(formData.get("bankBranchAddress"));
  const redirectPath = `/payroll-invoices/${invoiceId}/edit`;

  try {
    await withTransaction(async (client) => {
      await assertGeneratedInvoice(client, invoiceId);
      await client.query(
        `update payroll_invoices
         set invoice_date = coalesce(nullif($2, '')::date, invoice_date),
             payroll_month = coalesce(nullif($3, '')::date, payroll_month),
             payment_method = nullif($4, ''),
             notes = nullif($5, ''),
             issuer_legal_name = nullif($6, ''),
             issuer_address = nullif($7, ''),
             recipient_legal_name = nullif($8, ''),
             recipient_address = nullif($9, ''),
             bank_name = nullif($10, ''),
             bank_account_number = nullif($11, ''),
             bank_ifsc = nullif($12, ''),
             bank_swift = nullif($13, ''),
             bank_ad_code = nullif($14, ''),
             bank_branch = nullif($15, ''),
             bank_branch_address = nullif($16, ''),
             updated_at = now()
         where id = $1::uuid`,
        [
          invoiceId,
          invoiceDate,
          payrollMonth.length === 7 ? `${payrollMonth}-01` : payrollMonth,
          paymentMethod,
          notes,
          issuerLegalName,
          issuerAddress,
          recipientLegalName,
          recipientAddress,
          bankName,
          bankAccountNumber,
          bankIfsc,
          bankSwift,
          bankAdCode,
          bankBranch,
          bankBranchAddress,
        ]
      );
    });
  } catch (error) {
    redirectTo("error", error instanceof Error ? error.message : "Could not update invoice header.", invoiceId, undefined, redirectPath);
  }

  await cascadeUpdate({
    trigger: "payroll-invoice:edited",
    entityType: "payroll_invoice",
    entityId: invoiceId,
    action: "edit-header",
    performedBy: session.id,
    agentId: "payroll-agent",
  });
  revalidateInvoicePaths(invoiceId);
  redirectTo("success", "Invoice header updated.", invoiceId, undefined, redirectPath);
}

export async function upsertInvoiceItemAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const invoiceId = clean(formData.get("invoiceId"));
  const itemId = clean(formData.get("itemId"));
  if (!invoiceId) redirectTo("error", "Missing invoice id.");

  const section = invoiceSection(clean(formData.get("section")));
  const description = clean(formData.get("description"));
  const vendorName = clean(formData.get("vendorName"));
  const quantity = num(formData.get("quantity")) || 1;
  const unitPrice = num(formData.get("unitPrice"));
  const amount = Number((quantity * unitPrice).toFixed(2));
  const originalAmount = num(formData.get("originalAmount")) || null;
  const originalCurrency = clean(formData.get("originalCurrency")) || null;
  const fxRate = num(formData.get("fxRate")) || null;
  const referenceNote = clean(formData.get("referenceNote"));
  const displayOrder = Math.trunc(num(formData.get("displayOrder"))) || null;
  const isProvision = checked(formData.get("isProvision"));
  const redirectPath = `/payroll-invoices/${invoiceId}/edit`;

  if (!description || unitPrice < 0) {
    redirectTo("error", "Description and non-negative unit price are required.", invoiceId, undefined, redirectPath);
  }

  try {
    await withTransaction(async (client) => {
      await assertGeneratedInvoice(client, invoiceId);
      if (itemId) {
        await client.query(
          `update payroll_invoice_items
           set section = $3::xtz_invoice_section,
               description = $4,
               vendor_name = nullif($5, ''),
               quantity = $6,
               unit_price = $7,
               amount = $8,
               original_amount = $9,
               original_currency = $10,
               fx_rate = $11,
               reference_note = nullif($12, ''),
               is_provision = $13,
               display_order = coalesce($14, display_order),
               updated_at = now()
           where id = $2::uuid and payroll_invoice_id = $1::uuid`,
          [
            invoiceId,
            itemId,
            section,
            description,
            vendorName,
            quantity,
            unitPrice,
            amount,
            originalAmount,
            originalCurrency,
            fxRate,
            referenceNote,
            isProvision,
            displayOrder,
          ]
        );
      } else {
        const orderRows = await client.query<{ display_order: number }>(
          `select coalesce(max(display_order), 0) + 10 as display_order
           from payroll_invoice_items
           where payroll_invoice_id = $1::uuid`,
          [invoiceId]
        );
        await client.query(
          `insert into payroll_invoice_items (
             payroll_invoice_id, section, description, vendor_name,
             quantity, unit_price, amount,
             original_amount, original_currency, fx_rate,
             reference_note, is_provision, display_order
           )
           values ($1, $2::xtz_invoice_section, $3, nullif($4, ''),
                   $5, $6, $7, $8, $9, $10,
                   nullif($11, ''), $12, $13)`,
          [
            invoiceId,
            section,
            description,
            vendorName,
            quantity,
            unitPrice,
            amount,
            originalAmount,
            originalCurrency,
            fxRate,
            referenceNote,
            isProvision,
            displayOrder ?? orderRows.rows[0]?.display_order ?? 10,
          ]
        );
      }
      await recalculateInvoiceTotals(client, invoiceId);
    });
  } catch (error) {
    redirectTo("error", error instanceof Error ? error.message : "Could not save invoice item.", invoiceId, undefined, redirectPath);
  }

  await cascadeUpdate({
    trigger: "payroll-invoice:item-saved",
    entityType: "payroll_invoice",
    entityId: invoiceId,
    action: itemId ? "edit-item" : "add-item",
    after: { itemId: itemId || null, section, amount },
    performedBy: session.id,
    agentId: "payroll-agent",
  });
  revalidateInvoicePaths(invoiceId);
  redirectTo("success", itemId ? "Line item updated." : "Line item added.", invoiceId, undefined, redirectPath);
}

export async function deleteInvoiceItemAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const invoiceId = clean(formData.get("invoiceId"));
  const itemId = clean(formData.get("itemId"));
  const redirectPath = `/payroll-invoices/${invoiceId}/edit`;
  if (!invoiceId || !itemId) redirectTo("error", "Missing invoice or item id.", invoiceId, undefined, redirectPath);

  try {
    await withTransaction(async (client) => {
      await assertGeneratedInvoice(client, invoiceId);
      await unlockSourceRowsForItem(client, itemId);
      await client.query(
        `delete from payroll_invoice_items
         where id = $2::uuid and payroll_invoice_id = $1::uuid`,
        [invoiceId, itemId]
      );
      await recalculateInvoiceTotals(client, invoiceId);
    });
  } catch (error) {
    redirectTo("error", error instanceof Error ? error.message : "Could not remove invoice item.", invoiceId, undefined, redirectPath);
  }

  await cascadeUpdate({
    trigger: "payroll-invoice:item-removed",
    entityType: "payroll_invoice",
    entityId: invoiceId,
    action: "remove-item",
    before: { itemId },
    performedBy: session.id,
    agentId: "payroll-agent",
  });
  revalidateInvoicePaths(invoiceId);
  redirectTo("success", "Line item removed and source staging row unlocked if applicable.", invoiceId, undefined, redirectPath);
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
  const result = await withTransaction(async (client) => {
    const invoiceNumber = await generateUniqueInvoiceNumber(client, "VND", invoiceMonth);
    const invoiceRows = await client.query<{ id: string }>(
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
        vendorName,
        vendorAddress || null,
        vendorBankName || null,
        vendorBankAccount || null,
        vendorBankIfsc || vendorBankIban || null,
        vendorBankSwift || null,
        vendorBankRouting || null,
        vendorBankBranch || null,
        null,
        billedToLegalName,
        billedToAddress
      ]
    );

    const invoiceId = invoiceRows.rows[0]?.id;
    if (!invoiceId) throw new Error("Failed to create invoice.");

    let order = 0;
    for (const line of lineItems) {
      order += 10;
      await client.query(
        `insert into payroll_invoice_items
           (payroll_invoice_id, section, description,
            quantity, unit_price, amount,
            display_order)
         values ($1, 'other'::xtz_invoice_section, $2,
                 $3, $4, $5, $6)`,
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

    return { invoiceId, invoiceNumber };
  });

  revalidateInvoicePaths(result.invoiceId);
  redirectTo(
    "success",
    `Invoice ${result.invoiceNumber} created: ${lineItems.length} lines, ${subtotal.toLocaleString("en-US", { style: "currency", currency: invoiceCurrency })}`,
    result.invoiceId
  );
}
