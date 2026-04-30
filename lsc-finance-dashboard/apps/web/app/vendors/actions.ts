"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../lib/auth";
import { normalizeCompanyCode } from "../lib/entities";

function clean(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function redirectToVendors(status: "success" | "error", message: string): never {
  redirect(
    `/vendors?status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}` as Route
  );
}

export async function addVendorAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const name = clean(formData.get("name"));
  const vendorType = clean(formData.get("vendorType")) || "service_provider";
  const rawCompanyCode = clean(formData.get("companyCode"));
  const companyCode = rawCompanyCode ? normalizeCompanyCode(rawCompanyCode, "LSC") : "";
  const paymentTerms = clean(formData.get("paymentTerms"));
  const address = clean(formData.get("address"));
  const city = clean(formData.get("city"));
  const country = clean(formData.get("country"));
  const email = clean(formData.get("email"));
  const phone = clean(formData.get("phone"));
  const bankName = clean(formData.get("bankName"));
  const bankBranch = clean(formData.get("bankBranch"));
  const bankAccountNumber = clean(formData.get("bankAccountNumber"));
  const bankIfsc = clean(formData.get("bankIfsc"));
  const bankSwift = clean(formData.get("bankSwift"));
  const bankIban = clean(formData.get("bankIban"));
  const bankRoutingCode = clean(formData.get("bankRoutingCode"));
  const currencyCode = clean(formData.get("currencyCode")) || "USD";
  const taxId = clean(formData.get("taxId"));
  const notes = clean(formData.get("notes"));

  if (!name) redirectToVendors("error", "Vendor name is required.");

  const vendorRows = await queryRowsAdmin<{ id: string }>(
    `insert into vendors (name, vendor_type, status, payment_terms,
       address, city, country, email, phone,
       bank_name, bank_branch, bank_account_number, bank_ifsc, bank_swift,
       bank_iban, bank_routing_code, currency_code, tax_id, notes)
     values ($1, $2::vendor_type, 'active'::vendor_status, $3,
       $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18)
     returning id`,
    [
      name, vendorType, paymentTerms || null,
      address || null, city || null, country || null, email || null, phone || null,
      bankName || null, bankBranch || null, bankAccountNumber || null,
      bankIfsc || null, bankSwift || null,
      bankIban || null, bankRoutingCode || null,
      currencyCode, taxId || null, notes || null
    ]
  );

  const vendorId = vendorRows[0]?.id;

  // Link to company if provided
  if (vendorId && companyCode) {
    const companyRows = await queryRowsAdmin<{ id: string }>(
      `select id from companies where code = $1::company_code`,
      [companyCode]
    );
    if (companyRows[0]?.id) {
      await executeAdmin(
        `insert into vendor_entity_links (vendor_id, company_id, is_primary)
         values ($1, $2, true)
         on conflict do nothing`,
        [vendorId, companyRows[0].id]
      );
    }
  }

  if (vendorId) {
    await cascadeUpdate({
      trigger: "vendor:created",
      entityType: "vendor",
      entityId: vendorId,
      action: "create",
      after: { name, vendorType, companyCode, email, currencyCode },
      performedBy: session.id,
      agentId: "vendor-agent",
    });
  }

  revalidatePath("/vendors");
  revalidatePath("/payroll-invoices");
  redirectToVendors("success", `Vendor "${name}" added.`);
}

export async function updateVendorAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const id = clean(formData.get("id"));
  if (!id) redirectToVendors("error", "Missing vendor id.");

  const fields: Record<string, string | null> = {};
  const fieldNames = [
    "name", "vendorType", "paymentTerms", "address", "city", "country",
    "email", "phone", "bankName", "bankBranch", "bankAccountNumber",
    "bankIfsc", "bankSwift", "bankIban", "bankRoutingCode", "currencyCode",
    "taxId", "notes", "status"
  ];
  const columnMap: Record<string, string> = {
    vendorType: "vendor_type", paymentTerms: "payment_terms",
    bankName: "bank_name", bankBranch: "bank_branch",
    bankAccountNumber: "bank_account_number", bankIfsc: "bank_ifsc",
    bankSwift: "bank_swift", bankIban: "bank_iban",
    bankRoutingCode: "bank_routing_code", currencyCode: "currency_code",
    taxId: "tax_id"
  };

  for (const f of fieldNames) {
    const val = clean(formData.get(f));
    if (val) fields[f] = val;
  }

  if (Object.keys(fields).length === 0) {
    redirectToVendors("error", "No fields to update.");
  }

  const sets: string[] = ["updated_at = now()"];
  const vals: (string | null)[] = [id];
  let p = 2;

  for (const [field, value] of Object.entries(fields)) {
    const col = columnMap[field] ?? field;
    if (col === "vendor_type") {
      sets.push(`${col} = $${p}::vendor_type`);
    } else if (col === "status") {
      sets.push(`${col} = $${p}::vendor_status`);
    } else {
      sets.push(`${col} = $${p}`);
    }
    vals.push(value);
    p++;
  }

  await executeAdmin(`update vendors set ${sets.join(", ")} where id = $1`, vals);

  await cascadeUpdate({
    trigger: "vendor:updated",
    entityType: "vendor",
    entityId: id,
    action: "update",
    after: fields,
    performedBy: session.id,
    agentId: "vendor-agent",
  });

  revalidatePath("/vendors");
  revalidatePath("/payroll-invoices");
  redirectToVendors("success", "Vendor updated.");
}

export async function deleteVendorAction(formData: FormData): Promise<void> {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const id = clean(formData.get("id"));
  if (!id) redirectToVendors("error", "Missing id.");

  const before = await queryRowsAdmin<{ name: string }>(
    `select name from vendors where id = $1`,
    [id]
  );

  await executeAdmin(`delete from vendor_entity_links where vendor_id = $1`, [id]);
  await executeAdmin(`delete from vendors where id = $1`, [id]);

  await cascadeUpdate({
    trigger: "vendor:deleted",
    entityType: "vendor",
    entityId: id,
    action: "delete",
    before: before[0] ? { name: before[0].name } : undefined,
    performedBy: session.id,
    agentId: "vendor-agent",
  });

  revalidatePath("/vendors");
  revalidatePath("/payroll-invoices");
  redirectToVendors("success", "Vendor deleted.");
}
