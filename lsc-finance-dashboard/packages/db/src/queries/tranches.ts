import "server-only";

import { queryRows } from "../query";
import { formatCurrency, formatDateLabel, formatDateValue, getBackend } from "./shared";

export type TrancheRow = {
  id: string;
  contractId: string;
  contractName: string;
  sponsorName: string;
  trancheNumber: number;
  trancheLabel: string;
  tranchePercentage: number;
  trancheAmount: string;
  triggerType: string;
  triggerDate: string;
  effectiveTriggerDate: string;
  raceName: string;
  deliverableGateBlocked: boolean;
  trancheStatus: string;
  linkedInvoiceId: string | null;
};

export type TrancheScheduleSummaryRow = {
  contractId: string;
  contractName: string;
  sponsorName: string;
  fullContractValue: string;
  totalTranches: number;
  activeCount: number;
  invoicedCount: number;
  collectedCount: number;
  totalScheduledValue: string;
  invoicedValue: string;
  collectedValue: string;
  nextTrancheLabel: string;
  nextTrancheDate: string;
  hasBlockedTranche: boolean;
};

export type TrancheCalendarEntry = {
  id: string;
  contractName: string;
  sponsorName: string;
  trancheLabel: string;
  trancheAmount: string;
  effectiveDate: string;
  monthLabel: string;
  trancheStatus: string;
};

export type RaceEventOption = {
  id: string;
  name: string;
  eventDate: string;
  seasonYear: number;
};

type TrancheSummarySource = {
  contract_id: string;
  contract_name: string;
  sponsor_name: string;
  full_contract_value: string;
  total_tranches: string;
  active_count: string;
  invoiced_count: string;
  collected_count: string;
  total_scheduled_value: string;
  invoiced_value: string;
  collected_value: string;
  next_tranche_label: string | null;
  next_tranche_date: string | null;
  has_blocked_tranche: boolean;
};

type TrancheSource = {
  id: string;
  contract_id: string;
  contract_name: string;
  sponsor_name: string;
  tranche_number: string;
  tranche_label: string;
  tranche_percentage: string;
  tranche_amount: string;
  trigger_type: string;
  effective_trigger_date: string | null;
  race_name: string | null;
  deliverable_gate_blocked: boolean;
  tranche_status: string;
  linked_invoice_id: string | null;
};

const EFFECTIVE_DATE_SQL = `
  case ct.trigger_type
    when 'on_date' then ct.trigger_date
    when 'on_signing' then con.start_date
    when 'pre_event' then (re.event_start_date + ct.trigger_offset_days)
    when 'post_event' then (coalesce(re.event_end_date, re.event_start_date) + ct.trigger_offset_days)
    else ct.trigger_date
  end`;

function mapTranche(row: TrancheSource): TrancheRow {
  return {
    id: row.id,
    contractId: row.contract_id,
    contractName: row.contract_name,
    sponsorName: row.sponsor_name,
    trancheNumber: Number(row.tranche_number),
    trancheLabel: row.tranche_label,
    tranchePercentage: Number(row.tranche_percentage),
    trancheAmount: formatCurrency(row.tranche_amount),
    triggerType: row.trigger_type.replace(/_/g, " "),
    triggerDate: row.effective_trigger_date ? formatDateLabel(row.effective_trigger_date) : "No date",
    effectiveTriggerDate: row.effective_trigger_date ?? "",
    raceName: row.race_name ?? "",
    deliverableGateBlocked: row.deliverable_gate_blocked,
    trancheStatus: row.tranche_status,
    linkedInvoiceId: row.linked_invoice_id
  };
}

export async function getContractTranches(contractId: string): Promise<TrancheRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<TrancheSource>(
    `select
       ct.id,
       ct.contract_id,
       con.contract_name,
       sc.name as sponsor_name,
       ct.tranche_number,
       ct.tranche_label,
       ct.tranche_percentage,
       ct.tranche_amount,
       ct.trigger_type,
       ${EFFECTIVE_DATE_SQL} as effective_trigger_date,
       re.name as race_name,
       coalesce(
         (ct.deliverable_checklist_id is not null
          and exists(
            select 1 from deliverable_checklist_summary dcs
            where dcs.checklist_id = ct.deliverable_checklist_id
              and dcs.invoice_eligible = false
          )),
         false
       ) as deliverable_gate_blocked,
       ct.tranche_status,
       ct.linked_invoice_id
     from contract_tranches ct
     join contracts con on con.id = ct.contract_id
     join sponsors_or_customers sc on sc.id = ct.sponsor_or_customer_id
     left join race_events re on re.id = ct.trigger_race_event_id
     where ct.contract_id = $1
     order by ct.tranche_number`,
    [contractId]
  );

  return rows.map(mapTranche);
}

export async function getTrancheSummaryByCompany(
  companyCode: string
): Promise<TrancheScheduleSummaryRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<TrancheSummarySource>(
    `select * from tranche_schedule_summary
     where company_code = $1::company_code
     order by sponsor_name, contract_name`,
    [companyCode]
  );

  return rows.map((row) => ({
    contractId: row.contract_id,
    contractName: row.contract_name,
    sponsorName: row.sponsor_name,
    fullContractValue: formatCurrency(row.full_contract_value),
    totalTranches: Number(row.total_tranches),
    activeCount: Number(row.active_count),
    invoicedCount: Number(row.invoiced_count),
    collectedCount: Number(row.collected_count),
    totalScheduledValue: formatCurrency(row.total_scheduled_value),
    invoicedValue: formatCurrency(row.invoiced_value),
    collectedValue: formatCurrency(row.collected_value),
    nextTrancheLabel: row.next_tranche_label ?? "All scheduled",
    nextTrancheDate: row.next_tranche_date ? formatDateLabel(row.next_tranche_date) : "No date",
    hasBlockedTranche: row.has_blocked_tranche
  }));
}

export async function getUpcomingTranches(
  companyCode: string,
  days = 90
): Promise<TrancheRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<TrancheSource>(
    `select
       ct.id,
       ct.contract_id,
       con.contract_name,
       sc.name as sponsor_name,
       ct.tranche_number,
       ct.tranche_label,
       ct.tranche_percentage,
       ct.tranche_amount,
       ct.trigger_type,
       ${EFFECTIVE_DATE_SQL} as effective_trigger_date,
       re.name as race_name,
       coalesce(
         (ct.deliverable_checklist_id is not null
          and exists(
            select 1 from deliverable_checklist_summary dcs
            where dcs.checklist_id = ct.deliverable_checklist_id
              and dcs.invoice_eligible = false
          )),
         false
       ) as deliverable_gate_blocked,
       ct.tranche_status,
       ct.linked_invoice_id
     from contract_tranches ct
     join contracts con on con.id = ct.contract_id
     join companies c on c.id = ct.company_id
     join sponsors_or_customers sc on sc.id = ct.sponsor_or_customer_id
     left join race_events re on re.id = ct.trigger_race_event_id
     where c.code = $1::company_code
       and ct.tranche_status in ('scheduled', 'active')
       and (${EFFECTIVE_DATE_SQL}) <= current_date + $2::integer
     order by (${EFFECTIVE_DATE_SQL}) nulls last`,
    [companyCode, days]
  );

  return rows.map(mapTranche);
}

export async function getActionableTranches(
  companyCode: string
): Promise<TrancheRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<TrancheSource>(
    `select
       ct.id,
       ct.contract_id,
       con.contract_name,
       sc.name as sponsor_name,
       ct.tranche_number,
       ct.tranche_label,
       ct.tranche_percentage,
       ct.tranche_amount,
       ct.trigger_type,
       ${EFFECTIVE_DATE_SQL} as effective_trigger_date,
       re.name as race_name,
       coalesce(
         (ct.deliverable_checklist_id is not null
          and exists(
            select 1 from deliverable_checklist_summary dcs
            where dcs.checklist_id = ct.deliverable_checklist_id
              and dcs.invoice_eligible = false
          )),
         false
       ) as deliverable_gate_blocked,
       ct.tranche_status,
       ct.linked_invoice_id
     from contract_tranches ct
     join contracts con on con.id = ct.contract_id
     join companies c on c.id = ct.company_id
     join sponsors_or_customers sc on sc.id = ct.sponsor_or_customer_id
     left join race_events re on re.id = ct.trigger_race_event_id
     where c.code = $1::company_code
       and ct.tranche_status in ('scheduled', 'active', 'invoiced')
     order by
       case ct.tranche_status
         when 'active' then 1
         when 'invoiced' then 2
         when 'scheduled' then 3
       end,
       (${EFFECTIVE_DATE_SQL}) nulls last`,
    [companyCode]
  );

  return rows.map(mapTranche);
}

export type CollectionTrancheRow = {
  id: string;
  contractName: string;
  sponsorName: string;
  trancheLabel: string;
  trancheAmount: string;
  invoiceNumber: string;
  invoicedAt: string;
  dueDate: string;
  daysOverdue: number;
  daysUntilDue: number;
  linkedInvoiceId: string;
};

export async function getCollectionTranches(
  companyCode: string
): Promise<CollectionTrancheRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    contract_name: string;
    sponsor_name: string;
    tranche_label: string;
    tranche_amount: string;
    invoice_number: string;
    invoiced_at: string;
    due_date: string;
    days_overdue: string;
    days_until_due: string;
    linked_invoice_id: string;
  }>(
    `select
       ct.id,
       con.contract_name,
       sc.name as sponsor_name,
       ct.tranche_label,
       ct.tranche_amount,
       coalesce(inv.invoice_number, '') as invoice_number,
       ct.invoiced_at,
       coalesce(inv.due_date, (ct.invoiced_at::date + 30)) as due_date,
       greatest(0, current_date - coalesce(inv.due_date, (ct.invoiced_at::date + 30)))::integer as days_overdue,
       greatest(0, coalesce(inv.due_date, (ct.invoiced_at::date + 30)) - current_date)::integer as days_until_due,
       ct.linked_invoice_id
     from contract_tranches ct
     join contracts con on con.id = ct.contract_id
     join companies c on c.id = ct.company_id
     join sponsors_or_customers sc on sc.id = ct.sponsor_or_customer_id
     left join invoices inv on inv.id = ct.linked_invoice_id
     where c.code = $1::company_code
       and ct.tranche_status = 'invoiced'
     order by
       coalesce(inv.due_date, (ct.invoiced_at::date + 30)) asc`,
    [companyCode]
  );

  return rows.map((row) => ({
    id: row.id,
    contractName: row.contract_name,
    sponsorName: row.sponsor_name,
    trancheLabel: row.tranche_label,
    trancheAmount: formatCurrency(row.tranche_amount),
    invoiceNumber: row.invoice_number,
    invoicedAt: formatDateLabel(row.invoiced_at),
    dueDate: formatDateLabel(row.due_date),
    daysOverdue: Number(row.days_overdue),
    daysUntilDue: Number(row.days_until_due),
    linkedInvoiceId: row.linked_invoice_id
  }));
}

export async function getTrancheScheduleCalendar(
  companyCode: string
): Promise<TrancheCalendarEntry[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    contract_name: string;
    sponsor_name: string;
    tranche_label: string;
    tranche_amount: string;
    effective_date: string | null;
    tranche_status: string;
  }>(
    `select
       ct.id,
       con.contract_name,
       sc.name as sponsor_name,
       ct.tranche_label,
       ct.tranche_amount,
       ${EFFECTIVE_DATE_SQL} as effective_date,
       ct.tranche_status
     from contract_tranches ct
     join contracts con on con.id = ct.contract_id
     join companies c on c.id = ct.company_id
     join sponsors_or_customers sc on sc.id = ct.sponsor_or_customer_id
     left join race_events re on re.id = ct.trigger_race_event_id
     where c.code = $1::company_code
     order by (${EFFECTIVE_DATE_SQL}) nulls last`,
    [companyCode]
  );

  return rows.map((row) => {
    const d = row.effective_date ? new Date(row.effective_date) : null;
    return {
      id: row.id,
      contractName: row.contract_name,
      sponsorName: row.sponsor_name,
      trancheLabel: row.tranche_label,
      trancheAmount: formatCurrency(row.tranche_amount),
      effectiveDate: row.effective_date ?? "",
      monthLabel: d ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Unscheduled",
      trancheStatus: row.tranche_status
    };
  });
}

export type TrancheAgingSummary = {
  totalScheduled: number;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  scheduledCount: number;
  activeCount: number;
  invoicedCount: number;
  collectedCount: number;
};

export async function getTrancheAgingSummary(
  companyCode: string
): Promise<TrancheAgingSummary> {
  if (getBackend() !== "database") {
    return {
      totalScheduled: 0, totalInvoiced: 0, totalCollected: 0, totalOutstanding: 0,
      scheduledCount: 0, activeCount: 0, invoicedCount: 0, collectedCount: 0
    };
  }

  const rows = await queryRows<{
    tranche_status: string;
    status_count: string;
    status_total: string;
  }>(
    `select
       ct.tranche_status,
       count(*)::text as status_count,
       coalesce(sum(ct.tranche_amount), 0)::numeric(14,2)::text as status_total
     from contract_tranches ct
     join companies c on c.id = ct.company_id
     where c.code = $1::company_code
     group by ct.tranche_status`,
    [companyCode]
  );

  const byStatus = new Map(rows.map((r) => [r.tranche_status, r]));
  const val = (status: string) => Number(byStatus.get(status)?.status_total ?? 0);
  const cnt = (status: string) => Number(byStatus.get(status)?.status_count ?? 0);

  return {
    totalScheduled: val("scheduled") + val("active"),
    totalInvoiced: val("invoiced"),
    totalCollected: val("collected"),
    totalOutstanding: val("active") + val("invoiced"),
    scheduledCount: cnt("scheduled"),
    activeCount: cnt("active"),
    invoicedCount: cnt("invoiced"),
    collectedCount: cnt("collected")
  };
}

export async function getRaceEventsForTrancheForm(
  companyCode: string
): Promise<RaceEventOption[]> {
  if (getBackend() !== "database") return [];

  return queryRows<{ id: string; name: string; event_start_date: string; season_year: number }>(
    `select re.id, re.name, re.event_start_date, re.season_year
     from race_events re
     join companies c on c.id = re.company_id
     where c.code = $1::company_code
       and re.event_start_date is not null
     order by re.event_start_date`,
    [companyCode]
  ).then((rows) =>
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      eventDate: formatDateValue(r.event_start_date),
      seasonYear: r.season_year
    }))
  );
}
