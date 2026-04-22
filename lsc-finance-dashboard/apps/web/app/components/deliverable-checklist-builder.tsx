"use client";

import { useState } from "react";
import { createDeliverableChecklistAction } from "../commercial-goals/actions";
import { FormButton } from "../documents/form-button";

type ContractOption = {
  id: string;
  contractName: string;
  sponsorName: string;
  sponsorId: string;
  contractValue: string;
};

type OwnerOption = {
  id: string;
  name: string;
};

type ItemDraft = {
  id: string;
  itemLabel: string;
  itemDescription: string;
  responsibleOwnerId: string;
  dueDate: string;
  revenueAmount: string;
};

type Props = {
  contracts: ContractOption[];
  owners: OwnerOption[];
  returnPath: string;
};

const QUICK_TEMPLATES = [
  { key: "logo", label: "Logo placement" },
  { key: "social", label: "Social media post" },
  { key: "hospitality", label: "Hospitality package" },
  { key: "report", label: "Season report" },
  { key: "activation", label: "On-site activation" },
  { key: "media", label: "Media mention" }
];

function makeItem(label = ""): ItemDraft {
  return {
    id: crypto.randomUUID(),
    itemLabel: label,
    itemDescription: "",
    responsibleOwnerId: "",
    dueDate: "",
    revenueAmount: ""
  };
}

export function DeliverableChecklistBuilder({ contracts, owners, returnPath }: Props) {
  const [selectedContractId, setSelectedContractId] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);

  const selectedContract = contracts.find((c) => c.id === selectedContractId);

  const updateItem = (id: string, patch: Partial<Omit<ItemDraft, "id">>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const addTemplates = (keys: string[]) => {
    const newItems = QUICK_TEMPLATES
      .filter((t) => keys.includes(t.key))
      .map((t) => makeItem(t.label));
    setItems((current) => [...current, ...newItems]);
  };

  return (
    <form action={createDeliverableChecklistAction} className="stack-form">
      <input name="contractId" type="hidden" value={selectedContractId} />
      <input name="sponsorId" type="hidden" value={selectedContract?.sponsorId ?? ""} />
      <input name="returnPath" type="hidden" value={returnPath} />
      <input name="itemsJson" type="hidden" value={JSON.stringify(items)} />

      <label className="field">
        <span>Contract</span>
        <select
          className="table-select"
          value={selectedContractId}
          onChange={(e) => setSelectedContractId(e.target.value)}
          required
          style={{ width: "100%" }}
        >
          <option value="">Select a contract</option>
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.sponsorName} — {c.contractName} ({c.contractValue})
            </option>
          ))}
        </select>
      </label>

      <div className="grid-two">
        <label className="field">
          <span>Checklist title</span>
          <input
            className="table-input"
            name="checklistTitle"
            placeholder="e.g. Aramco Season 4 Deliverables"
            required
          />
        </label>
        <label className="field">
          <span>Total revenue value (USD)</span>
          <div className="currency-input" style={{ width: "100%" }}>
            <span className="currency-symbol">$</span>
            <input
              inputMode="decimal"
              name="totalRevenueValue"
              placeholder="100,000"
              defaultValue={selectedContract?.contractValue.replace(/[^0-9.-]/g, "") ?? ""}
            />
          </div>
        </label>
      </div>

      <div className="inline-actions">
        <button
          className="action-button secondary"
          onClick={() => addTemplates(["logo", "social", "hospitality", "report"])}
          type="button"
        >
          Add common deliverables
        </button>
        {QUICK_TEMPLATES.map((t) => (
          <button
            className="ghost-link"
            key={t.key}
            onClick={() => addTemplates([t.key])}
            type="button"
          >
            + {t.label}
          </button>
        ))}
        <button
          className="ghost-link"
          onClick={() => setItems((c) => [...c, makeItem()])}
          type="button"
        >
          + Blank row
        </button>
      </div>

      {items.length > 0 ? (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Deliverable</th>
                <th>Owner</th>
                <th>Due date</th>
                <th>Revenue (USD)</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      className="table-input"
                      value={item.itemLabel}
                      onChange={(e) => updateItem(item.id, { itemLabel: e.target.value })}
                      placeholder="Logo on RaceBird hull"
                    />
                  </td>
                  <td>
                    <select
                      className="table-select"
                      value={item.responsibleOwnerId}
                      onChange={(e) => updateItem(item.id, { responsibleOwnerId: e.target.value })}
                    >
                      <option value="">--</option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="table-input"
                      type="date"
                      value={item.dueDate}
                      onChange={(e) => updateItem(item.id, { dueDate: e.target.value })}
                    />
                  </td>
                  <td>
                    <div className="currency-input">
                      <span className="currency-symbol">$</span>
                      <input
                        inputMode="decimal"
                        value={item.revenueAmount}
                        onChange={(e) => updateItem(item.id, { revenueAmount: e.target.value })}
                        placeholder="25,000"
                      />
                    </div>
                  </td>
                  <td>
                    <button
                      className="remove-button"
                      onClick={() => removeItem(item.id)}
                      type="button"
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-note">No deliverable items yet — add templates above or add a blank row.</div>
      )}

      {items.length > 0 && (
        <FormButton
          label={`Create checklist with ${items.length} deliverable${items.length !== 1 ? "s" : ""}`}
          pendingLabel="Creating..."
        />
      )}
    </form>
  );
}
