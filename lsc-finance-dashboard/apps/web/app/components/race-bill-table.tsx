type BillRow = {
  id?: string;
  documentName: string;
  expenseDate?: string;
  originalAmount?: string;
  originalCurrency?: string;
  convertedUsdAmount?: string;
  status: string;
  previewDataUrl?: string | null;
};

type RaceBillTableProps = {
  rows: BillRow[];
};

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

export function RaceBillTable({ rows }: RaceBillTableProps) {
  return (
    <div className="table-wrapper clean-table bill-table">
      <table>
        <thead>
          <tr>
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
            rows.map((row) => (
              <tr key={`${row.id ?? row.documentName}-${row.expenseDate ?? "date"}`}>
                <td>
                  <span className="bill-link">
                    {row.previewDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={row.documentName} src={row.previewDataUrl} />
                    ) : (
                      <span className="bill-thumb-placeholder">Bill</span>
                    )}
                    <span className="bill-name">{row.documentName}</span>
                  </span>
                </td>
                <td>{row.expenseDate ?? "Unknown"}</td>
                <td>{row.originalAmount ?? "$0.00"}</td>
                <td>{row.originalCurrency ?? "Unknown"}</td>
                <td>{row.convertedUsdAmount ?? "$0.00"}</td>
                <td>
                  <span className="pill subtle-pill">{formatStatus(row.status)}</span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="muted" colSpan={6}>
                No bills or receipts uploaded for this race yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
