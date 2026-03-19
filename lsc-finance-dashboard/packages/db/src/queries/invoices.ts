import "server-only";

import { queryRows } from "../query";
import {
  formatCurrency,
  formatDateLabel,
  getBackend
} from "./shared";

export type InvoiceWorkflowSummaryRow = {
  label: string;
  value: string;
  detail: string;
};

export type InvoiceQueueRow = {
  id: string;
  vendor: string;
  invoiceNumber: string;
  race: string;
  dueDate: string;
  totalAmount: string;
  status: string;
  sourceLabel?: string | null;
};

export type InvoiceWorkflowSummarySource = {
  pending_count: string;
  posted_count: string;
  total_open_amount: string;
};

export type InvoiceQueueSource = {
  id: string;
  vendor_name: string;
  invoice_number: string | null;
  race_name: string | null;
  due_date: string | null;
  total_amount: string;
  intake_status: string;
  linked_submission_title: string | null;
};

export async function getInvoiceWorkflowSummary() {
  if (getBackend() === "database") {
    const rows = await queryRows<InvoiceWorkflowSummarySource>(
      `select
         count(*) filter (where intake_status in ('submitted', 'in_review'))::text as pending_count,
         count(*) filter (where intake_status = 'posted')::text as posted_count,
         coalesce(sum(total_amount) filter (where intake_status in ('submitted', 'in_review')), 0)::text as total_open_amount
       from invoice_intakes`
    );

    if (rows[0]) {
      return [
        {
          label: "Pending invoices",
          value: rows[0].pending_count,
          detail: "Invoice intakes waiting on finance action."
        },
        {
          label: "Posted invoices",
          value: rows[0].posted_count,
          detail: "Invoice intakes already posted into canonical payables."
        },
        {
          label: "Open payable amount",
          value: formatCurrency(rows[0].total_open_amount),
          detail: "Amount sitting in submitted or in-review invoice workflow."
        }
      ] satisfies InvoiceWorkflowSummaryRow[];
    }
  }

  return [
    { label: "Pending invoices", value: "0", detail: "Invoice intakes waiting on finance action." },
    { label: "Posted invoices", value: "0", detail: "Invoice intakes already posted into canonical payables." },
    { label: "Open payable amount", value: formatCurrency(0), detail: "Amount sitting in submitted or in-review invoice workflow." }
  ];
}

export async function getInvoiceApprovalQueue() {
  if (getBackend() === "database") {
    const rows = await queryRows<InvoiceQueueSource>(
      `select
         ii.id,
         ii.vendor_name,
         ii.invoice_number,
         re.name as race_name,
         ii.due_date::text,
         ii.total_amount::text,
         ii.intake_status,
         es.submission_title as linked_submission_title
       from invoice_intakes ii
       left join expense_submissions es on es.id = ii.linked_submission_id
       left join race_events re on re.id = ii.race_event_id
       order by ii.created_at desc
       limit 12`
    );

    return rows.map((row) => ({
      id: row.id,
      vendor: row.vendor_name,
      invoiceNumber: row.invoice_number ?? "Pending number",
      race: row.race_name ?? "Unassigned",
      dueDate: row.due_date ? formatDateLabel(row.due_date) : "TBD",
      totalAmount: formatCurrency(row.total_amount),
      status: row.intake_status,
      sourceLabel: row.linked_submission_title
    })) satisfies InvoiceQueueRow[];
  }

  return [] satisfies InvoiceQueueRow[];
}
