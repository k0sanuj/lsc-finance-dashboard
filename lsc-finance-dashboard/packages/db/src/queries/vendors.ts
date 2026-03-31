import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, getBackend } from "./shared";

export type VendorRow = {
  id: string;
  name: string;
  vendorType: string;
  status: string;
  paymentTerms: string;
  entityCodes: string;
  totalSpend: string;
  ytdSpend: string;
  mtdSpend: string;
  lastInvoiceDate: string;
  invoiceCount: number;
};

export type VendorDetailRow = {
  id: string;
  name: string;
  vendorType: string;
  status: string;
  paymentTerms: string;
  taxId: string;
  notes: string;
};

export type ProductionPartnerRow = {
  id: string;
  vendorName: string;
  scopeOfWork: string;
  contractValue: string;
  paymentSchedule: string;
  performanceNotes: string;
};

export type VenueAgreementRow = {
  id: string;
  venueName: string;
  location: string;
  vendorName: string;
  rentalCost: string;
  depositAmount: string;
  depositStatus: string;
  outstandingBalance: string;
  eventDates: string;
  agreementStart: string;
  agreementEnd: string;
};

export type VendorContactRow = {
  id: string;
  contactName: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
};

export async function getVendors(): Promise<VendorRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    name: string;
    vendor_type: string;
    status: string;
    payment_terms: string | null;
    entity_codes: string | null;
    total_spend: string;
    ytd_spend: string;
    mtd_spend: string;
    last_invoice_date: string | null;
    invoice_count: string;
  }>(
    `select
       v.id,
       v.name,
       v.vendor_type,
       v.status,
       v.payment_terms,
       (select string_agg(c2.code::text, ', ' order by c2.code)
        from vendor_entity_links vel2
        join companies c2 on c2.id = vel2.company_id
        where vel2.vendor_id = v.id) as entity_codes,
       coalesce(vs.total_spend, 0)::numeric(14,2)::text as total_spend,
       coalesce(vs.ytd_spend, 0)::numeric(14,2)::text as ytd_spend,
       coalesce(vs.mtd_spend, 0)::numeric(14,2)::text as mtd_spend,
       vs.last_invoice_date::text,
       coalesce(vs.invoice_count, 0)::text as invoice_count
     from vendors v
     left join lateral (
       select
         sum(inv.total_amount) as total_spend,
         sum(inv.total_amount) filter (where inv.issue_date >= date_trunc('year', current_date)) as ytd_spend,
         sum(inv.total_amount) filter (where inv.issue_date >= date_trunc('month', current_date)) as mtd_spend,
         max(inv.issue_date) as last_invoice_date,
         count(*)::bigint as invoice_count
       from invoices inv
       where inv.direction = 'payable'
         and inv.notes ilike '%' || v.name || '%'
     ) vs on true
     order by v.name`
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    vendorType: r.vendor_type.replace(/_/g, " "),
    status: r.status,
    paymentTerms: r.payment_terms ?? "",
    entityCodes: r.entity_codes ?? "",
    totalSpend: formatCurrency(r.total_spend),
    ytdSpend: formatCurrency(r.ytd_spend),
    mtdSpend: formatCurrency(r.mtd_spend),
    lastInvoiceDate: formatDateLabel(r.last_invoice_date),
    invoiceCount: Number(r.invoice_count)
  }));
}

export async function getProductionPartners(): Promise<ProductionPartnerRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    vendor_name: string;
    scope_of_work: string | null;
    contract_value: string;
    payment_schedule: string | null;
    performance_notes: string | null;
  }>(
    `select pp.id, v.name as vendor_name, pp.scope_of_work,
            pp.contract_value, pp.payment_schedule, pp.performance_notes
     from production_partners pp
     join vendors v on v.id = pp.vendor_id
     order by v.name`
  );

  return rows.map((r) => ({
    id: r.id,
    vendorName: r.vendor_name,
    scopeOfWork: r.scope_of_work ?? "",
    contractValue: formatCurrency(r.contract_value),
    paymentSchedule: r.payment_schedule ?? "",
    performanceNotes: r.performance_notes ?? ""
  }));
}

export async function getVenueAgreements(): Promise<VenueAgreementRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    venue_name: string;
    location: string | null;
    vendor_name: string;
    rental_cost: string;
    deposit_amount: string;
    deposit_status: string;
    outstanding_balance: string;
    event_dates: string | null;
    agreement_start: string | null;
    agreement_end: string | null;
  }>(
    `select va.id, va.venue_name, va.location, v.name as vendor_name,
            va.rental_cost, va.deposit_amount, va.deposit_status,
            va.outstanding_balance, va.event_dates,
            va.agreement_start::text, va.agreement_end::text
     from venue_agreements va
     join vendors v on v.id = va.vendor_id
     order by va.venue_name`
  );

  return rows.map((r) => ({
    id: r.id,
    venueName: r.venue_name,
    location: r.location ?? "",
    vendorName: r.vendor_name,
    rentalCost: formatCurrency(r.rental_cost),
    depositAmount: formatCurrency(r.deposit_amount),
    depositStatus: r.deposit_status,
    outstandingBalance: formatCurrency(r.outstanding_balance),
    eventDates: r.event_dates ?? "",
    agreementStart: formatDateLabel(r.agreement_start),
    agreementEnd: formatDateLabel(r.agreement_end)
  }));
}
