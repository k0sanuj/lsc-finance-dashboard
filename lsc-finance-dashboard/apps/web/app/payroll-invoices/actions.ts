"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { executeAdmin, queryRowsAdmin, convertCurrency } from "@lsc/db";
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
  const invoiceCurrency = String(formData.get("invoiceCurrency") ?? "USD").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!payrollMonth) {
    redirectToPayrollInvoices("error", "Payroll month is required.");
  }

  const monthDate = payrollMonth.length === 7 ? `${payrollMonth}-01` : payrollMonth;

  const fromCompanyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = $1::company_code limit 1`,
    [fromCompanyCode]
  );
  const fromCompanyId = fromCompanyRows[0]?.id;
  if (!fromCompanyId) {
    redirectToPayrollInvoices("error", `Company "${fromCompanyCode}" not found.`);
  }

  const toCompanyRows = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = $1::company_code limit 1`,
    [toCompanyCode]
  );
  const toCompanyId = toCompanyRows[0]?.id;
  if (!toCompanyId) {
    redirectToPayrollInvoices("error", `Company "${toCompanyCode}" not found.`);
  }

  // Fetch payroll for the month
  const payrollRows = await queryRowsAdmin<{
    id: string;
    employee_id: string;
    full_name: string;
    designation: string;
    net_salary: string;
    currency_code: string;
  }>(
    `select sp.id, sp.employee_id, e.full_name, e.designation, sp.net_salary, sp.currency_code
     from salary_payroll sp
     join employees e on e.id = sp.employee_id
     join companies c on c.id = sp.company_id
     where c.code = $1::company_code
       and sp.payroll_month = $2::date`,
    [fromCompanyCode, monthDate]
  );

  if (payrollRows.length === 0) {
    // If no payroll records exist, generate from employee base salaries
    const empRows = await queryRowsAdmin<{
      id: string;
      full_name: string;
      designation: string;
      base_salary: string;
      salary_currency: string;
    }>(
      `select e.id, e.full_name, e.designation, e.base_salary, e.salary_currency
       from employees e
       join companies c on c.id = e.company_id
       where c.code = $1::company_code and e.status = 'active' and e.base_salary > 0`,
      [fromCompanyCode]
    );

    if (empRows.length === 0) {
      redirectToPayrollInvoices("error", `No active employees with salaries found for ${fromCompanyCode}.`);
    }

    // Build line items from employees directly, converting to invoice currency
    let subtotal = 0;
    const lineItems: { employeeId: string; description: string; inrAmount: number; convertedAmount: number }[] = [];

    for (const emp of empRows) {
      const salaryAmount = Number(emp.base_salary);
      const salCurrency = emp.salary_currency;

      let convertedAmount = salaryAmount;
      if (salCurrency !== invoiceCurrency) {
        const fx = await convertCurrency(salaryAmount, salCurrency, invoiceCurrency);
        convertedAmount = fx.converted;
      }

      lineItems.push({
        employeeId: emp.id,
        description: `${emp.full_name} — ${emp.designation} (${salaryAmount.toLocaleString()} ${salCurrency})`,
        inrAmount: salaryAmount,
        convertedAmount
      });
      subtotal += convertedAmount;
    }

    const total = Number(subtotal.toFixed(2));
    const yyyymm = payrollMonth.replace("-", "");
    const rand4 = String(Math.floor(1000 + Math.random() * 9000));
    const invoiceNumber = `PAY-${yyyymm}-${rand4}`;

    const invoiceRows = await queryRowsAdmin<{ id: string }>(
      `insert into payroll_invoices (
         invoice_number, invoice_date, payroll_month,
         from_company_id, to_company_id,
         subtotal, tax_amount, total_amount,
         currency_code, status, payment_method, notes, generated_at
       ) values ($1, current_date, $2::date, $3, $4, $5, 0, $5, $6, 'generated', $7, $8, now())
       returning id`,
      [invoiceNumber, monthDate, fromCompanyId, toCompanyId, total, invoiceCurrency, paymentMethod || null, notes || null]
    );

    const invoiceId = invoiceRows[0]?.id;
    if (!invoiceId) redirectToPayrollInvoices("error", "Failed to create invoice.");

    for (const item of lineItems) {
      await executeAdmin(
        `insert into payroll_invoice_items (payroll_invoice_id, employee_id, description, quantity, unit_price, amount)
         values ($1, $2, $3, 1, $4, $4)`,
        [invoiceId, item.employeeId, item.description, item.convertedAmount]
      );
    }

    revalidatePath("/payroll-invoices");
    redirectToPayrollInvoices(
      "success",
      `Invoice ${invoiceNumber} generated: ${lineItems.length} employees, ${total.toLocaleString("en-US", { style: "currency", currency: invoiceCurrency })}.`
    );
  }

  // If payroll records exist, use those
  let subtotal = 0;
  const lineItems: { employeeId: string; description: string; convertedAmount: number }[] = [];

  for (const row of payrollRows) {
    const netSalary = Number(row.net_salary);
    const salCurrency = row.currency_code;

    let convertedAmount = netSalary;
    if (salCurrency !== invoiceCurrency) {
      const fx = await convertCurrency(netSalary, salCurrency, invoiceCurrency);
      convertedAmount = fx.converted;
    }

    lineItems.push({
      employeeId: row.employee_id,
      description: `${row.full_name} — ${row.designation} (${netSalary.toLocaleString()} ${salCurrency})`,
      convertedAmount
    });
    subtotal += convertedAmount;
  }

  const total = Number(subtotal.toFixed(2));
  const yyyymm = payrollMonth.replace("-", "");
  const rand4 = String(Math.floor(1000 + Math.random() * 9000));
  const invoiceNumber = `PAY-${yyyymm}-${rand4}`;

  const invoiceRows = await queryRowsAdmin<{ id: string }>(
    `insert into payroll_invoices (
       invoice_number, invoice_date, payroll_month,
       from_company_id, to_company_id,
       subtotal, tax_amount, total_amount,
       currency_code, status, payment_method, notes, generated_at
     ) values ($1, current_date, $2::date, $3, $4, $5, 0, $5, $6, 'generated', $7, $8, now())
     returning id`,
    [invoiceNumber, monthDate, fromCompanyId, toCompanyId, total, invoiceCurrency, paymentMethod || null, notes || null]
  );

  const invoiceId = invoiceRows[0]?.id;
  if (!invoiceId) redirectToPayrollInvoices("error", "Failed to create invoice.");

  for (const item of lineItems) {
    await executeAdmin(
      `insert into payroll_invoice_items (payroll_invoice_id, employee_id, description, quantity, unit_price, amount)
       values ($1, $2, $3, 1, $4, $4)`,
      [invoiceId, item.employeeId, item.description, item.convertedAmount]
    );
  }

  revalidatePath("/payroll-invoices");
  redirectToPayrollInvoices(
    "success",
    `Invoice ${invoiceNumber} generated: ${lineItems.length} items, ${total.toLocaleString("en-US", { style: "currency", currency: invoiceCurrency })}.`
  );
}
