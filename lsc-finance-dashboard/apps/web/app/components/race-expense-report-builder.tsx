"use client";

import { useMemo, useState } from "react";
import { createExpenseReportFromBillsAction } from "../tbr/expense-management/actions";
import { FormButton } from "../documents/form-button";

type BillRow = {
  id?: string;
  intakeEventId?: string;
  documentName: string;
  expenseDate?: string;
  originalAmount?: string;
  originalCurrency?: string;
  convertedUsdAmount?: string;
  status: string;
  previewDataUrl?: string | null;
  linkedSubmissionTitle?: string | null;
  canSelect?: boolean;
};

type RaceExpenseReportBuilderProps = {
  raceId: string;
  raceName: string;
  rows: BillRow[];
};

export function RaceExpenseReportBuilder({
  raceId,
  raceName,
  rows
}: RaceExpenseReportBuilderProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const selectableRows = useMemo(
    () => rows.filter((row) => row.intakeEventId && !row.linkedSubmissionTitle && (row.canSelect ?? true)),
    [rows]
  );

  const selectedCount = selectedIds.length;

  function toggleSelection(intakeEventId: string) {
    setSelectedIds((current) =>
      current.includes(intakeEventId)
        ? current.filter((value) => value !== intakeEventId)
        : [...current, intakeEventId]
    );
  }

  return (
    <>
      <article className="card compact-section-card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Bills and receipts</span>
            <h3>{raceName} evidence table</h3>
          </div>
          <div className="inline-actions">
            <span className="pill">{rows.length} uploaded</span>
            <button
              className="ghost-link modal-trigger"
              disabled={selectedCount === 0}
              onClick={() => setOpen(true)}
              type="button"
            >
              Create report
            </button>
          </div>
        </div>
        <div className="table-wrapper clean-table bill-table">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Receipt</th>
                <th>Date</th>
                <th>Original amount</th>
                <th>Currency</th>
                <th>USD amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => {
                  const intakeEventId = row.intakeEventId ?? "";
                  const linked = Boolean(row.linkedSubmissionTitle);
                  const canSelect = !linked && Boolean(intakeEventId) && (row.canSelect ?? true);
                  const checked = intakeEventId ? selectedIds.includes(intakeEventId) : false;

                  return (
                    <tr key={`${row.id ?? row.documentName}-${row.expenseDate ?? "date"}`}>
                      <td>
                        {!canSelect ? (
                          <span className="pill subtle-pill">{linked ? "linked" : "review first"}</span>
                        ) : (
                          <input
                            aria-label={`Select ${row.documentName}`}
                            checked={checked}
                            onChange={() => toggleSelection(intakeEventId)}
                            type="checkbox"
                          />
                        )}
                      </td>
                      <td>
                        <span className="bill-link">
                          {row.previewDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt={row.documentName} src={row.previewDataUrl} />
                          ) : (
                            <span className="bill-thumb-placeholder">Bill</span>
                          )}
                          <span className="bill-name">
                            {row.documentName}
                            {row.linkedSubmissionTitle ? (
                              <span className="bill-subnote">{row.linkedSubmissionTitle}</span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td>{row.expenseDate ?? "Unknown"}</td>
                      <td>{row.originalAmount ?? "$0.00"}</td>
                      <td>{row.originalCurrency ?? "Unknown"}</td>
                      <td>{row.convertedUsdAmount ?? "$0.00"}</td>
                      <td>
                        <span className="pill subtle-pill">{row.status}</span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="muted" colSpan={7}>
                    No bills or receipts uploaded for this race yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {open ? (
        <div className="modal-overlay" onClick={() => setOpen(false)} role="presentation">
          <div
            aria-modal="true"
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-head">
              <div>
                <span className="section-kicker">Create expense report</span>
                <h3>{raceName}</h3>
                <p>Group the selected analyzed bills into one expense report for finance review.</p>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)} type="button">
                Close
              </button>
            </div>

            <form action={createExpenseReportFromBillsAction} className="stack-form">
              <input name="raceEventId" type="hidden" value={raceId} />
              <input name="returnPath" type="hidden" value={`/tbr/races/${raceId}`} />
              <input name="intakeEventIds" type="hidden" value={selectedIds.join(",")} />
              <label className="field">
                <span>Report title</span>
                <input
                  defaultValue={`${raceName} expense report`}
                  name="submissionTitle"
                  placeholder="Example: Jeddah travel and support"
                  required
                />
              </label>
              <label className="field">
                <span>Operator note</span>
                <textarea
                  name="operatorNote"
                  placeholder="Optional note for finance before review."
                  rows={3}
                />
              </label>
              <div className="mini-metric-grid">
                <div className="mini-metric">
                  <span>Selected bills</span>
                  <strong>{selectedCount}</strong>
                </div>
                <div className="mini-metric">
                  <span>Available</span>
                  <strong>{selectableRows.length}</strong>
                </div>
              </div>
              <div className="actions-row">
                <FormButton label="Create expense report" pendingLabel="Creating..." />
                <span className="muted">
                  Each selected bill becomes one line item in the report using the approved preview amount.
                </span>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
