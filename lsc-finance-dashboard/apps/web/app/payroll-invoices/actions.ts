"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { requireRole } from "../../lib/auth";

function redirectToPayrollInvoices(status: "success" | "error", message: string): never {
  redirect(
    `/payroll-invoices?status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}` as Route
  );
}

export async function generatePayrollInvoiceAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);

  const fromCompanyCode = String(formData.get("fromCompanyCode") ?? "XTZ").trim();
  const toCompanyCode = String(formData.get("toCompanyCode") ?? "XTE").trim();
  const payrollMonth = String(formData.get("payrollMonth") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!payrollMonth) {
    redirectToPayrollInvoices("error", "Payroll month is required.");
  }

  // Normalize month input (type="month" gives "YYYY-MM", need "YYYY-MM-01")
  const monthDate = payrollMonth.length === 7 ? `${payrollMonth}-01` : payrollMonth;

  // Look up from_company_id
  const fromCompanyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = $1::company_code limit 1`,
    [fromCompanyCode]
  );
  const fromCompanyId = fromCompanyRows[0]?.id;
  if (!fromCompanyId) {
    redirectToPayrollInvoices("error", `Company with code "${fromCompanyCode}" was not found.`);
  }

  // Look up to_company_id
  const toCompanyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = $1::company_code limit 1`,
    [toCompanyCode]
  );
  const toCompanyId = toCompanyRows[0]?.id;
  if (!toCompanyId) {
    redirectToPayrollInvoices("error", `Company with code "${toCompanyCode}" was not found.`);
  }

  // Fetch all salary_payroll records for that month and company
  const payrollRows = await queryRowsAdmin<{
    id: string;
    full_name: string;
    designation: string;
    base_salary: string;
    allowances: string;
    net_salary: string;
  }>(
    `select sp.id, e.full_name, e.designation, sp.base_salary, sp.allowances, sp.net_salary
     from salary_payroll sp
     join employees e on e.id = sp.employee_id
     join companies c on c.id = sp.company_id
     where c.code = $1::company_code
       and sp.payroll_month = $2::date`,
    [fromCompanyCode, monthDate]
  );

  if (payrollRows.length === 0) {
    redirectToPayrollInvoices("error", `No payroll records found for ${fromCompanyCode} in ${payrollMonth}.`);
  }

  // Compute totals
  const subtotal = payrollRows.reduce((sum, r) => sum + Number(r.net_salary), 0);
  const taxAmount = 0; // Will be set manually later
  const total = subtotal;

  // Generate invoice number: PAY-{YYYYMM}-{random 4 digits}
  const yyyymm = payrollMonth.replace("-", "");
  const rand4 = String(Math.floor(1000 + Math.random() * 9000));
  const invoiceNumber = `PAY-${yyyymm}-${rand4}`;

  // Insert the payroll invoice
  const invoiceRows = await queryRowsAdmin<{ id: string }>(
    `insert into payroll_invoices (
       invoice_number,
       invoice_date,
       payroll_month,
       from_company_id,
       to_company_id,
       subtotal,
       tax_amount,
       total_amount,
       currency_code,
       status,
       payment_method,
       notes
     )
     values ($1, current_date, $2::date, $3, $4, $5, $6, $7, 'INR', 'generated', $8, $9)
     returning id`,
    [invoiceNumber, monthDate, fromCompanyId, toCompanyId, subtotal, taxAmount, total, paymentMethod || null, notes || null]
  );

  const invoiceId = invoiceRows[0]?.id;
  if (!invoiceId) {
    redirectToPayrollInvoices("error", "Failed to create payroll invoice.");
  }

  // Insert line items for each payroll record
  for (const row of payrollRows) {
    const description = `${row.full_name} — ${row.designation}`;
    const amount = Number(row.net_salary);
    await executeAdmin(
      `insert into payroll_invoice_items (
         payroll_invoice_id,
         salary_payroll_id,
         description,
         quantity,
         unit_price,
         amount
       )
       values ($1, $2, $3, 1, $4, $4)`,
      [invoiceId, row.id, description, amount]
    );
  }

  revalidatePath("/payroll-invoices");
  redirectToPayrollInvoices(
    "success",
    `Invoice ${invoiceNumber} generated with ${payrollRows.length} line items totalling ${subtotal.toLocaleString("en-IN", { style: "currency", currency: "INR" })}.`
  );
}
