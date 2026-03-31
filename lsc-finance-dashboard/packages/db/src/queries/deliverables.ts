import "server-only";

import { queryRows } from "../query";
import {
  formatCurrency,
  formatDateLabel,
  formatDateValue,
  getBackend
} from "./shared";

// ── Types ───────────────────────────────────────────────

export type DeliverableChecklistRow = {
  checklistId: string;
  contractId: string;
  sponsorName: string;
  contractName: string;
  checklistTitle: string;
  totalRevenueValue: string;
  fullContractValue: string;
  totalItems: number;
  completedItems: number;
  waivedItems: number;
  inProgressItems: number;
  completionPercentage: number;
  recognizedRevenue: string;
  deferredRevenue: string;
  invoiceEligible: boolean;
  nextDueDate: string;
  createdAt: string;
};

export type DeliverableItemRow = {
  id: string;
  checklistId: string;
  itemLabel: string;
  itemDescription: string;
  responsibleOwnerName: string;
  dueDate: string;
  revenueAmount: string;
  completionStatus: string;
  completedAt: string;
  completedByName: string;
  notes: string;
  evidenceFileName: string;
  sortOrder: number;
};

export type DeliverableChecklistDetailResult = {
  checklist: DeliverableChecklistRow | null;
  items: DeliverableItemRow[];
};

export type SponsorDeliverableSummaryRow = {
  sponsorName: string;
  totalContractValue: string;
  totalRecognized: string;
  totalDeferred: string;
  totalItems: number;
  totalCompleted: number;
  overallCompletionPct: number;
  allInvoiceable: boolean;
};

export type ContractOption = {
  id: string;
  contractName: string;
  sponsorName: string;
  sponsorId: string;
  contractValue: string;
};

export type OwnerOption = {
  id: string;
  name: string;
};

// ── Source types ─────────────────────────────────────────

type ChecklistSummarySource = {
  checklist_id: string;
  contract_id: string;
  sponsor_name: string;
  contract_name: string;
  checklist_title: string;
  total_revenue_value: string;
  full_contract_value: string;
  total_items: string;
  completed_items: string;
  waived_items: string;
  in_progress_items: string;
  completion_percentage: string;
  recognized_revenue: string;
  deferred_revenue: string;
  invoice_eligible: boolean;
  next_due_date: string | null;
  created_at: string;
};

type ItemSource = {
  id: string;
  checklist_id: string;
  item_label: string;
  item_description: string | null;
  owner_name: string | null;
  due_date: string | null;
  revenue_amount: string;
  completion_status: string;
  completed_at: string | null;
  completed_by_name: string | null;
  notes: string | null;
  evidence_file_name: string | null;
  sort_order: string;
};

type SponsorSummarySource = {
  sponsor_name: string;
  total_contract_value: string;
  total_recognized: string;
  total_deferred: string;
  total_items: string;
  total_completed: string;
  overall_completion_pct: string;
  all_invoiceable: boolean;
};

// ── Mappers ─────────────────────────────────────────────

function mapChecklist(row: ChecklistSummarySource): DeliverableChecklistRow {
  return {
    checklistId: row.checklist_id,
    contractId: row.contract_id,
    sponsorName: row.sponsor_name,
    contractName: row.contract_name,
    checklistTitle: row.checklist_title,
    totalRevenueValue: formatCurrency(row.total_revenue_value),
    fullContractValue: formatCurrency(row.full_contract_value),
    totalItems: Number(row.total_items),
    completedItems: Number(row.completed_items),
    waivedItems: Number(row.waived_items),
    inProgressItems: Number(row.in_progress_items),
    completionPercentage: Number(row.completion_percentage),
    recognizedRevenue: formatCurrency(row.recognized_revenue),
    deferredRevenue: formatCurrency(row.deferred_revenue),
    invoiceEligible: row.invoice_eligible,
    nextDueDate: row.next_due_date ? formatDateLabel(row.next_due_date) : "No deadline",
    createdAt: formatDateValue(row.created_at)
  };
}

function mapItem(row: ItemSource): DeliverableItemRow {
  return {
    id: row.id,
    checklistId: row.checklist_id,
    itemLabel: row.item_label,
    itemDescription: row.item_description ?? "",
    responsibleOwnerName: row.owner_name ?? "Unassigned",
    dueDate: row.due_date ? formatDateLabel(row.due_date) : "No date",
    revenueAmount: formatCurrency(row.revenue_amount),
    completionStatus: row.completion_status,
    completedAt: row.completed_at ? formatDateValue(row.completed_at) : "",
    completedByName: row.completed_by_name ?? "",
    notes: row.notes ?? "",
    evidenceFileName: row.evidence_file_name ?? "",
    sortOrder: Number(row.sort_order)
  };
}

// ── Queries ─────────────────────────────────────────────

export async function getDeliverableChecklists(
  companyCode?: string
): Promise<DeliverableChecklistRow[]> {
  if (getBackend() !== "database") {
    return [];
  }

  const where = companyCode ? "where company_code = $1::company_code" : "";
  const values = companyCode ? [companyCode] : [];

  const rows = await queryRows<ChecklistSummarySource>(
    `select * from deliverable_checklist_summary ${where} order by created_at desc`,
    values
  );

  return rows.map(mapChecklist);
}

export async function getDeliverableChecklistDetail(
  checklistId: string
): Promise<DeliverableChecklistDetailResult> {
  if (getBackend() !== "database") {
    return { checklist: null, items: [] };
  }

  const checklists = await queryRows<ChecklistSummarySource>(
    `select * from deliverable_checklist_summary where checklist_id = $1`,
    [checklistId]
  );

  const items = await queryRows<ItemSource>(
    `select
       di.id,
       di.checklist_id,
       di.item_label,
       di.item_description,
       o.name as owner_name,
       di.due_date,
       di.revenue_amount,
       di.completion_status,
       di.completed_at,
       au.full_name as completed_by_name,
       di.notes,
       sd.source_name as evidence_file_name,
       di.sort_order
     from deliverable_items di
     left join owners o on o.id = di.responsible_owner_id
     left join app_users au on au.id = di.completed_by_user_id
     left join source_documents sd on sd.id = di.evidence_source_document_id
     where di.checklist_id = $1
     order by di.sort_order, di.created_at`,
    [checklistId]
  );

  return {
    checklist: checklists[0] ? mapChecklist(checklists[0]) : null,
    items: items.map(mapItem)
  };
}

export async function getSponsorDeliverableSummary(
  companyCode?: string
): Promise<SponsorDeliverableSummaryRow[]> {
  if (getBackend() !== "database") {
    return [];
  }

  const where = companyCode ? "where company_code = $1::company_code" : "";
  const values = companyCode ? [companyCode] : [];

  const rows = await queryRows<SponsorSummarySource>(
    `select * from sponsor_deliverable_summary ${where} order by sponsor_name`,
    values
  );

  return rows.map((row) => ({
    sponsorName: row.sponsor_name,
    totalContractValue: formatCurrency(row.total_contract_value),
    totalRecognized: formatCurrency(row.total_recognized),
    totalDeferred: formatCurrency(row.total_deferred),
    totalItems: Number(row.total_items),
    totalCompleted: Number(row.total_completed),
    overallCompletionPct: Number(row.overall_completion_pct),
    allInvoiceable: row.all_invoiceable
  }));
}

export async function getContractsForChecklistForm(
  companyCode: string
): Promise<ContractOption[]> {
  if (getBackend() !== "database") {
    return [];
  }

  const rows = await queryRows<{
    id: string;
    contract_name: string;
    sponsor_name: string;
    sponsor_id: string;
    contract_value: string;
  }>(
    `select
       ct.id,
       ct.contract_name,
       sc.name as sponsor_name,
       sc.id as sponsor_id,
       ct.contract_value
     from contracts ct
     join sponsors_or_customers sc on sc.id = ct.sponsor_or_customer_id
     join companies c on c.id = ct.company_id
     where c.code = $1::company_code
       and ct.contract_status = 'active'
     order by sc.name, ct.contract_name`,
    [companyCode]
  );

  return rows.map((row) => ({
    id: row.id,
    contractName: row.contract_name,
    sponsorName: row.sponsor_name,
    sponsorId: row.sponsor_id,
    contractValue: formatCurrency(row.contract_value)
  }));
}

export async function getOwnersForChecklistForm(
  companyCode: string
): Promise<OwnerOption[]> {
  if (getBackend() !== "database") {
    return [];
  }

  const rows = await queryRows<{ id: string; name: string }>(
    `select o.id, o.name
     from owners o
     join companies c on c.id = o.company_id
     where c.code = $1::company_code
       and o.is_active = true
     order by o.name`,
    [companyCode]
  );

  return rows;
}
