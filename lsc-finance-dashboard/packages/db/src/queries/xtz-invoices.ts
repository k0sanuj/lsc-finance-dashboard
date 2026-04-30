import "server-only";

import { queryRows } from "../query";
import { formatDateLabel, getBackend } from "./shared";

// Canonical XTZ India issuer & recipient details (single source of truth).
// These get baked into each invoice header on generation so historical
// invoices stay stable even if company details change.
export const XTZ_ISSUER = {
  legalName: "XTZ INDIA PRIVATE LIMITED",
  gstin: "07AAACX3462A1ZP",
  cin: "U72900DL2020PTC372731",
  pan: "AAACX3462A",
  address: "573, 3rd Floor, Main Road, Chirag Delhi, South Delhi, Delhi, 110017, India",
  bank: {
    name: "INDUSIND BANK LIMITED",
    accountNumber: "259810194254",
    ifsc: "INDB0000168",
    swift: "INDBINBBNDH",
    adCode: "6380265",
    branch: "Gulmohar — Yusuf Sarai",
    branchAddress:
      "S-6, Building No. 18 & 19, Oriental House, Gulmohar Community Centre, Yusuf Sarai, New Delhi 110016, India"
  }
} as const;

export const XTE_RECIPIENT = {
  legalName: "XTZ Esports Tech Ltd",
  address: "Unit 208, 209, Level 1\nGate Avenue – South Zone\nDubai International Financial Centre\nDubai, UAE"
} as const;

export const SAYAN_BENEFICIARY = {
  name: "Sayan Mukherjee",
  address: "D2, 4th Floor, AC 86, Gallery Suite\nNew Town, Kolkata — 700156\nWest Bengal, India",
  email: "sayan0151996@gmail.com",
  phone: "+91 9204384567",
  bank: {
    name: "HDFC Bank",
    branchAddress: "No 89, Ground Floor, Badami Mansion, Main Road, Parsudih, East Singhbhum — 831002",
    accountNumber: "50100153694001",
    ifsc: "HDFC0009081",
    swift: "HDFCINBBXXX"
  }
} as const;

// Dubai LSC entity as an issuer (for invoices sent to individuals/companies like Yadav Jani).
export const XTE_ISSUER = {
  legalName: "XTZ Esports Tech Ltd",
  address: "Unit 208, 209, Level 1\nGate Avenue – South Zone\nDubai International Financial Centre\nDubai, UAE",
  bank: {
    name: "Emirates NBD Bank, PJSC",
    branchAddress: "Baniyas Road, Deira, Dubai\nUnited Arab Emirates",
    accountNumber: "1025783560602",
    iban: "AE940260001025783560602",
    routingCode: "302620122",
    swift: "EBILAEAD"
  }
} as const;

export const LSC_DUBAI_RECIPIENT = XTE_RECIPIENT;
export const LSC_DUBAI_ISSUER = XTE_ISSUER;

export type XtzInvoiceSection =
  | "payroll"
  | "mdg_fees"
  | "reimbursement"
  | "provision"
  | "software_expense"
  | "other";

export type XtzInvoiceHeaderRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDateRaw: string;
  payrollMonth: string;
  payrollMonthRaw: string;
  fromCompany: string;
  toCompany: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  notes: string;
  issuerLegalName: string;
  issuerGstin: string;
  issuerCin: string;
  issuerPan: string;
  issuerAddress: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankSwift: string;
  bankAdCode: string;
  bankBranch: string;
  bankBranchAddress: string;
  recipientLegalName: string;
  recipientAddress: string;
};

export type XtzInvoiceItemRow = {
  id: string;
  section: XtzInvoiceSection;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  originalAmount: number | null;
  originalCurrency: string | null;
  fxRate: number | null;
  vendorName: string | null;
  referenceNote: string | null;
  isProvision: boolean;
  displayOrder: number;
  employeeName: string | null;
};

export async function getXtzInvoices(): Promise<XtzInvoiceHeaderRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    payroll_month: string;
    from_company: string;
    to_company: string;
    subtotal: string;
    tax_amount: string;
    total_amount: string;
    currency_code: string;
    status: string;
    payment_method: string | null;
    notes: string | null;
    issuer_legal_name: string | null;
    issuer_gstin: string | null;
    issuer_cin: string | null;
    issuer_pan: string | null;
    issuer_address: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    bank_swift: string | null;
    bank_ad_code: string | null;
    bank_branch: string | null;
    bank_branch_address: string | null;
    recipient_legal_name: string | null;
    recipient_address: string | null;
  }>(
    `select pi.id, pi.invoice_number, pi.invoice_date::text, pi.payroll_month::text,
            fc.name as from_company, tc.name as to_company,
            pi.subtotal, pi.tax_amount, pi.total_amount,
            pi.currency_code, pi.status, pi.payment_method, pi.notes,
            pi.issuer_legal_name, pi.issuer_gstin, pi.issuer_cin, pi.issuer_pan,
            pi.issuer_address, pi.bank_name, pi.bank_account_number, pi.bank_ifsc,
            pi.bank_swift, pi.bank_ad_code, pi.bank_branch, pi.bank_branch_address,
            pi.recipient_legal_name, pi.recipient_address
     from payroll_invoices pi
     join companies fc on fc.id = pi.from_company_id
     join companies tc on tc.id = pi.to_company_id
     order by pi.invoice_date desc, pi.invoice_number desc`
  );

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    invoiceDate: formatDateLabel(r.invoice_date),
    invoiceDateRaw: r.invoice_date,
    payrollMonth: new Date(r.payroll_month).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    }),
    payrollMonthRaw: r.payroll_month,
    fromCompany: r.from_company,
    toCompany: r.to_company,
    subtotal: Number(r.subtotal),
    taxAmount: Number(r.tax_amount),
    totalAmount: Number(r.total_amount),
    currency: r.currency_code,
    status: r.status,
    paymentMethod: r.payment_method ?? "",
    notes: r.notes ?? "",
    issuerLegalName: r.issuer_legal_name ?? XTZ_ISSUER.legalName,
    issuerGstin: r.issuer_gstin ?? XTZ_ISSUER.gstin,
    issuerCin: r.issuer_cin ?? XTZ_ISSUER.cin,
    issuerPan: r.issuer_pan ?? XTZ_ISSUER.pan,
    issuerAddress: r.issuer_address ?? XTZ_ISSUER.address,
    bankName: r.bank_name ?? XTZ_ISSUER.bank.name,
    bankAccountNumber: r.bank_account_number ?? XTZ_ISSUER.bank.accountNumber,
    bankIfsc: r.bank_ifsc ?? XTZ_ISSUER.bank.ifsc,
    bankSwift: r.bank_swift ?? XTZ_ISSUER.bank.swift,
    bankAdCode: r.bank_ad_code ?? XTZ_ISSUER.bank.adCode,
    bankBranch: r.bank_branch ?? XTZ_ISSUER.bank.branch,
    bankBranchAddress: r.bank_branch_address ?? XTZ_ISSUER.bank.branchAddress,
    recipientLegalName: r.recipient_legal_name ?? XTE_RECIPIENT.legalName,
    recipientAddress: r.recipient_address ?? XTE_RECIPIENT.address
  }));
}

export async function getXtzInvoiceById(invoiceId: string): Promise<{
  header: XtzInvoiceHeaderRow;
  items: XtzInvoiceItemRow[];
} | null> {
  if (getBackend() !== "database") return null;

  const headers = await getXtzInvoices();
  const header = headers.find((h) => h.id === invoiceId);
  if (!header) return null;

  const items = await queryRows<{
    id: string;
    section: XtzInvoiceSection;
    description: string;
    quantity: string;
    unit_price: string;
    amount: string;
    original_amount: string | null;
    original_currency: string | null;
    fx_rate: string | null;
    vendor_name: string | null;
    reference_note: string | null;
    is_provision: boolean;
    display_order: string;
    employee_name: string | null;
  }>(
    `select pii.id, pii.section, pii.description, pii.quantity::text, pii.unit_price,
            pii.amount, pii.original_amount, pii.original_currency, pii.fx_rate,
            pii.vendor_name, pii.reference_note, pii.is_provision,
            pii.display_order::text, e.full_name as employee_name
     from payroll_invoice_items pii
     left join employees e on e.id = pii.employee_id
     where pii.payroll_invoice_id = $1
     order by
       case pii.section
         when 'payroll' then 1
         when 'mdg_fees' then 2
         when 'reimbursement' then 3
         when 'software_expense' then 4
         when 'provision' then 5
         else 6
       end,
       pii.display_order, pii.created_at`,
    [invoiceId]
  );

  return {
    header,
    items: items.map((r) => ({
      id: r.id,
      section: r.section,
      description: r.description,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unit_price),
      amount: Number(r.amount),
      originalAmount: r.original_amount != null ? Number(r.original_amount) : null,
      originalCurrency: r.original_currency,
      fxRate: r.fx_rate != null ? Number(r.fx_rate) : null,
      vendorName: r.vendor_name,
      referenceNote: r.reference_note,
      isProvision: r.is_provision,
      displayOrder: Number(r.display_order),
      employeeName: r.employee_name
    }))
  };
}

export type XtzInvoiceSummary = {
  totalInvoices: number;
  totalInvoicedUsd: number;
  paidCount: number;
  pendingCount: number;
  latestInvoice: XtzInvoiceHeaderRow | null;
};

export async function getXtzInvoiceSummary(): Promise<XtzInvoiceSummary> {
  const invoices = await getXtzInvoices();
  const usdInvoices = invoices.filter((i) => i.currency === "USD");
  return {
    totalInvoices: invoices.length,
    totalInvoicedUsd: usdInvoices.reduce((s, i) => s + i.totalAmount, 0),
    paidCount: invoices.filter((i) => i.status === "paid").length,
    pendingCount: invoices.filter(
      (i) => i.status !== "paid" && i.status !== "cancelled"
    ).length,
    latestInvoice: invoices[0] ?? null
  };
}

// ── Related data for the invoice generator (staging rows) ─────────────

export type MdgFeeRow = {
  id: string;
  feeMonth: string;
  feeMonthRaw: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  notes: string;
};

export async function getMdgFees(companyCode: string = "XTZ"): Promise<MdgFeeRow[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRows<{
    id: string;
    fee_month: string;
    description: string;
    amount: string;
    currency_code: string;
    status: string;
    notes: string | null;
  }>(
    `select m.id, m.fee_month::text, m.description, m.amount, m.currency_code, m.status, m.notes
     from mdg_fees m
     join companies c on c.id = m.company_id
     where c.code = $1::company_code
     order by m.fee_month desc`,
    [companyCode]
  );

  return rows.map((r) => ({
    id: r.id,
    feeMonth: new Date(r.fee_month).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    }),
    feeMonthRaw: r.fee_month,
    description: r.description,
    amount: Number(r.amount),
    currency: r.currency_code,
    status: r.status,
    notes: r.notes ?? ""
  }));
}

export type ProvisionRow = {
  id: string;
  provisionMonth: string;
  provisionMonthRaw: string;
  description: string;
  category: string;
  vendorName: string;
  estimatedAmount: number;
  currency: string;
  status: string;
  notes: string;
};

export async function getProvisions(companyCode: string = "XTZ"): Promise<ProvisionRow[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRows<{
    id: string;
    provision_month: string;
    description: string;
    category: string;
    vendor_name: string | null;
    estimated_amount: string;
    currency_code: string;
    status: string;
    notes: string | null;
  }>(
    `select p.id, p.provision_month::text, p.description, p.category, p.vendor_name,
            p.estimated_amount, p.currency_code, p.status, p.notes
     from provisions p
     join companies c on c.id = p.company_id
     where c.code = $1::company_code
     order by p.provision_month desc, p.created_at desc`,
    [companyCode]
  );

  return rows.map((r) => ({
    id: r.id,
    provisionMonth: new Date(r.provision_month).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    }),
    provisionMonthRaw: r.provision_month,
    description: r.description,
    category: r.category,
    vendorName: r.vendor_name ?? "",
    estimatedAmount: Number(r.estimated_amount),
    currency: r.currency_code,
    status: r.status,
    notes: r.notes ?? ""
  }));
}

export type ReimbursementItemRow = {
  id: string;
  expenseMonth: string;
  expenseMonthRaw: string;
  description: string;
  vendorName: string;
  amount: number;
  currency: string;
  status: string;
  notes: string;
};

export async function getReimbursementItems(
  companyCode: string = "XTZ"
): Promise<ReimbursementItemRow[]> {
  if (getBackend() !== "database") return [];
  const rows = await queryRows<{
    id: string;
    expense_month: string;
    description: string;
    vendor_name: string | null;
    amount: string;
    currency_code: string;
    status: string;
    notes: string | null;
  }>(
    `select r.id, r.expense_month::text, r.description, r.vendor_name, r.amount,
            r.currency_code, r.status, r.notes
     from reimbursement_items r
     join companies c on c.id = r.reimbursing_company_id
     where c.code = $1::company_code
     order by r.expense_month desc, r.created_at desc`,
    [companyCode]
  );

  return rows.map((r) => ({
    id: r.id,
    expenseMonth: new Date(r.expense_month).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    }),
    expenseMonthRaw: r.expense_month,
    description: r.description,
    vendorName: r.vendor_name ?? "",
    amount: Number(r.amount),
    currency: r.currency_code,
    status: r.status,
    notes: r.notes ?? ""
  }));
}

export type SoftwareExpenseRow = {
  id: string;
  expenseMonth: string;
  expenseMonthRaw: string;
  vendorName: string;
  description: string;
  amount: number;
  currency: string;
  payingCompanyCode: string;
  isYearlyRenewal: boolean;
  status: string;
};

export async function getSoftwareExpenses(
  payingCompanyCode?: string
): Promise<SoftwareExpenseRow[]> {
  if (getBackend() !== "database") return [];
  const where = payingCompanyCode ? "where c.code = $1::company_code" : "";
  const params = payingCompanyCode ? [payingCompanyCode] : [];
  const rows = await queryRows<{
    id: string;
    expense_month: string;
    vendor_name: string;
    description: string | null;
    amount: string;
    currency_code: string;
    paying_company_code: string;
    is_yearly_renewal: boolean;
    status: string;
  }>(
    `select se.id, se.expense_month::text, se.vendor_name, se.description,
            se.amount, se.currency_code, c.code::text as paying_company_code,
            se.is_yearly_renewal, se.status
     from software_expenses se
     join companies c on c.id = se.paying_company_id
     ${where}
     order by se.expense_month desc, se.vendor_name`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    expenseMonth: new Date(r.expense_month).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    }),
    expenseMonthRaw: r.expense_month,
    vendorName: r.vendor_name,
    description: r.description ?? "",
    amount: Number(r.amount),
    currency: r.currency_code,
    payingCompanyCode: r.paying_company_code,
    isYearlyRenewal: r.is_yearly_renewal,
    status: r.status
  }));
}
