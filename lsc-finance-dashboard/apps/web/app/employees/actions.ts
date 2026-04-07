"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { requireRole } from "../../lib/auth";
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

  const companyCode = normalizeWhitespace(String(formData.get("companyCode") ?? ""));
  const fullName = normalizeWhitespace(String(formData.get("fullName") ?? ""));
  const email = normalizeWhitespace(String(formData.get("email") ?? ""));
  const designation = normalizeWhitespace(String(formData.get("designation") ?? ""));
  const department = normalizeWhitespace(String(formData.get("department") ?? ""));
  const employmentType = normalizeWhitespace(String(formData.get("employmentType") ?? ""));
  const baseSalary = normalizeWhitespace(String(formData.get("baseSalary") ?? "0"));
  const salaryCurrency = normalizeWhitespace(String(formData.get("salaryCurrency") ?? "USD"));

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

  await executeAdmin(
    `insert into employees (company_id, full_name, email, designation, department, employment_type, base_salary, salary_currency, status)
     values ($1, $2, $3, $4, $5, $6::employment_type, $7::numeric, $8, 'active')`,
    [companyId, fullName, email || null, designation, department || null, employmentType, baseSalary, salaryCurrency]
  );

  revalidatePath("/employees");
  redirectToEmployees("success", `Employee "${fullName}" added.`, companyCode);
}

export async function updateEmployeeStatusAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);

  const employeeId = normalizeWhitespace(String(formData.get("employeeId") ?? ""));
  const newStatus = normalizeWhitespace(String(formData.get("newStatus") ?? ""));

  if (!employeeId || !newStatus) {
    redirectToEmployees("error", "Employee and status are required.");
  }

  await executeAdmin(
    `update employees set status = $2::employee_status, updated_at = now() where id = $1`,
    [employeeId, newStatus]
  );

  revalidatePath("/employees");
  redirectToEmployees("success", `Employee status updated to "${newStatus.replace(/_/g, " ")}".`);
}
