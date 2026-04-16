"use client";

import { useState } from "react";

type Vendor = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  bankName: string;
  bankBranch: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankSwift: string;
  bankIban: string;
  bankRoutingCode: string;
  currencyCode: string;
};

type VendorSelectorProps = {
  vendors: Vendor[];
  formId: string;
};

export function VendorSelector({ vendors, formId }: VendorSelectorProps) {
  const [selected, setSelected] = useState<Vendor | null>(null);

  function handleChange(vendorId: string) {
    const vendor = vendors.find((v) => v.id === vendorId) ?? null;
    setSelected(vendor);

    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form || !vendor) return;

    function setField(name: string, value: string) {
      const el = form!.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) return;
      el.value = value;
    }

    setField("recipientName", vendor.name);
    const fullAddress = [vendor.address, vendor.city, vendor.country]
      .filter(Boolean)
      .join(", ");
    setField("recipientAddress", fullAddress);

    if (vendor.currencyCode) {
      setField("invoiceCurrency", vendor.currencyCode);
    }
  }

  return (
    <div className="vendor-selector">
      <label className="field">
        <span>Select vendor / beneficiary</span>
        <select
          onChange={(e) => handleChange(e.target.value)}
          defaultValue=""
          aria-label="Select vendor"
        >
          <option value="">— Type manually or select saved vendor —</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.bankName ? ` (${v.bankName})` : ""}
            </option>
          ))}
        </select>
      </label>
      {selected?.bankAccountNumber ? (
        <div className="vendor-bank-preview">
          <span className="signal-pill signal-good">Bank details loaded</span>
          <span className="muted">
            {selected.bankName} · Acc {selected.bankAccountNumber}
            {selected.bankSwift ? ` · SWIFT ${selected.bankSwift}` : ""}
          </span>
          <input type="hidden" name="vendorId" value={selected.id} form={formId} />
          <input type="hidden" name="vendorBankName" value={selected.bankName} form={formId} />
          <input type="hidden" name="vendorBankBranch" value={selected.bankBranch} form={formId} />
          <input type="hidden" name="vendorBankAccount" value={selected.bankAccountNumber} form={formId} />
          <input type="hidden" name="vendorBankIfsc" value={selected.bankIfsc} form={formId} />
          <input type="hidden" name="vendorBankSwift" value={selected.bankSwift} form={formId} />
          <input type="hidden" name="vendorBankIban" value={selected.bankIban} form={formId} />
          <input type="hidden" name="vendorBankRouting" value={selected.bankRoutingCode} form={formId} />
        </div>
      ) : selected ? (
        <div className="vendor-bank-preview">
          <span className="signal-pill signal-warn">No bank details</span>
          <span className="muted">
            Add bank details on the Vendors page to auto-populate invoices.
          </span>
        </div>
      ) : null}
    </div>
  );
}
