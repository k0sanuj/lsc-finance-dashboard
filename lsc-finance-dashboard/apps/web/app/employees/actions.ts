"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";
import type { Route } from "next";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function redirectToEmployees(
  status: "success" | "error",
  message: string,
  company?: string
): never {
  const params = new URLSearchParams({ status, message });
  if (company) params.set("company", company);
  redirect(`/employees?${params.toString()}` as Route);
}

export async function addEmployeeAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const companyCode = normalizeWhitespace(String(formData.get("companyCode") ?? ""));
  const fullName = normalizeWhitespace(String(formData.get("fullName") ?? ""));
  const email = normalizeWhitespace(String(formData.get("email") ?? ""));
  const designation = normalizeWhitespace(String(formData.get("designation") ?? ""));
  const department = normalizeWhitespace(String(formData.get("department") ?? ""));
  const region = normalizeWhitespace(String(formData.get("region") ?? ""));
  const employmentType = normalizeWhitespace(String(formData.get("employmentType") ?? "full_time"));
  const baseSalary = normalizeWhitespace(String(formData.get("baseSalary") ?? "0"));
  const salaryCurrency = normalizeWhitespace(String(formData.get("salaryCurrency") ?? "INR"));

  if (!fullName || !companyCode) {
    redirectToEmployees("error", "Full name and company are required.", companyCode);
  }

  const companies = await queryRowsAdmin<{ id: string }>(
    `select id from companies where code = $1::company_code`,
    [companyCode]
  );

  const companyId = companies[0]?.id;
  if (!companyId) {
    redirectToEmployees("error", `Company "${companyCode}" not found.`, companyCode);
  }

  const inserted = await queryRowsAdmin<{ id: string }>(
    `insert into employees (company_id, full_name, email, designation, department, region, employment_type, base_salary, salary_currency, status, start_date)
     values ($1, $2, $3, $4, $5, $6, $7::employment_type, $8::numeric, $9, 'active', current_date)
     returning id`,
    [companyId, fullName, email || null, designation, department || null, region || null, employmentType, baseSalary, salaryCurrency]
  );

  const employeeId = inserted[0]?.id;
  if (employeeId) {
    await cascadeUpdate({
      trigger: "employee:created",
      entityType: "employee",
      entityId: employeeId,
      action: "create",
      after: { fullName, companyCode, designation, employmentType, baseSalary, salaryCurrency },
      performedBy: session.id,
      agentId: "payroll-agent",
    });
  }

  revalidatePath("/employees");
  redirectToEmployees("success", `Employee "${fullName}" added.`, companyCode);
}

export async function updateEmployeeAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const employeeId = normalizeWhitespace(String(formData.get("employeeId") ?? ""));
  const company = normalizeWhitespace(String(formData.get("company") ?? ""));

  if (!employeeId) {
    redirectToEmployees("error", "Employee ID required.", company);
  }

  // Build dynamic update fields
  const updates: string[] = [];
  const values: (string | null)[] = [employeeId];
  let paramIndex = 2;

  const fields: [string, string, string | null][] = [
    ["designation", "designation", formData.get("designation") as string | null],
    ["department", "department", formData.get("department") as string | null],
    ["region", "region", formData.get("region") as string | null],
    ["base_salary", "baseSalary", formData.get("baseSalary") as string | null],
    ["salary_currency", "salaryCurrency", formData.get("salaryCurrency") as string | null],
  ];

  for (const [col, , val] of fields) {
    if (val !== null && val !== undefined) {
      const cleaned = normalizeWhitespace(val);
      if (cleaned) {
        if (col === "base_salary") {
          updates.push(`${col} = $${paramIndex}::numeric`);
        } else {
          updates.push(`${col} = $${paramIndex}`);
        }
        values.push(cleaned);
        paramIndex++;
      }
    }
  }

  if (updates.length === 0) {
    redirectToEmployees("error", "No fields to update.", company);
  }

  updates.push("updated_at = now()");

  await executeAdmin(
    `update employees set ${updates.join(", ")} where id = $1`,
    values
  );

  await cascadeUpdate({
    trigger: "employee:updated",
    entityType: "employee",
    entityId: employeeId,
    action: "update",
    after: { fields: updates },
    performedBy: session.id,
    agentId: "payroll-agent",
  });

  revalidatePath("/employees");
  redirectToEmployees("success", "Employee updated.", company);
}

export async function updateEmployeeStatusAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const employeeId = normalizeWhitespace(String(formData.get("employeeId") ?? ""));
  const newStatus = normalizeWhitespace(String(formData.get("newStatus") ?? ""));
  const company = normalizeWhitespace(String(formData.get("company") ?? ""));

  if (!employeeId || !newStatus) {
    redirectToEmployees("error", "Employee and status are required.", company);
  }

  await executeAdmin(
    `update employees set status = $2::employee_status, updated_at = now() where id = $1`,
    [employeeId, newStatus]
  );

  await cascadeUpdate({
    trigger: "employee:status:changed",
    entityType: "employee",
    entityId: employeeId,
    action: "status-change",
    after: { newStatus },
    performedBy: session.id,
    agentId: "payroll-agent",
  });

  revalidatePath("/employees");
  redirectToEmployees("success", `Status updated to "${newStatus.replace(/_/g, " ")}".`, company);
}

export async function updateSalaryAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const employeeId = normalizeWhitespace(String(formData.get("employeeId") ?? ""));
  const baseSalary = normalizeWhitespace(String(formData.get("baseSalary") ?? ""));
  const salaryCurrency = normalizeWhitespace(String(formData.get("salaryCurrency") ?? ""));
  const company = normalizeWhitespace(String(formData.get("company") ?? ""));

  if (!employeeId || !baseSalary) {
    redirectToEmployees("error", "Employee and salary required.", company);
  }

  const before = await queryRowsAdmin<{ base_salary: string; salary_currency: string }>(
    `select base_salary::text, salary_currency from employees where id = $1`,
    [employeeId]
  );

  const setCurrency = salaryCurrency ? ", salary_currency = $3" : "";
  const params: string[] = [employeeId, baseSalary];
  if (salaryCurrency) params.push(salaryCurrency);

  await executeAdmin(
    `update employees set base_salary = $2::numeric${setCurrency}, updated_at = now() where id = $1`,
    params
  );

  await cascadeUpdate({
    trigger: "employee:salary:changed",
    entityType: "employee",
    entityId: employeeId,
    action: "salary-change",
    before: before[0] ? { baseSalary: before[0].base_salary, salaryCurrency: before[0].salary_currency } : undefined,
    after: { baseSalary, salaryCurrency: salaryCurrency || undefined },
    performedBy: session.id,
    agentId: "payroll-agent",
  });

  revalidatePath("/employees");
  redirectToEmployees("success", "Salary updated.", company);
}
