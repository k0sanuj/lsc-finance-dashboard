"use client";

import { useState, useMemo } from "react";

type PaginatedTableProps<T> = {
  data: T[];
  pageSize?: number;
  columns: Array<{
    key: string;
    label: string;
    render: (row: T) => React.ReactNode;
    align?: "left" | "right" | "center";
  }>;
  emptyMessage?: string;
  caption?: string;
};

export function PaginatedTable<T extends Record<string, unknown>>({
  data,
  pageSize = 10,
  columns,
  emptyMessage = "No data available.",
  caption,
}: PaginatedTableProps<T>) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const pageData = useMemo(
    () => data.slice(page * pageSize, (page + 1) * pageSize),
    [data, page, pageSize]
  );

  return (
    <div>
      {caption && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span className="table-caption">{caption}</span>
          {data.length > pageSize && (
            <span className="table-caption">
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.length)} of {data.length}
            </span>
          )}
        </div>
      )}
      <div className="table-wrapper clean-table">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ textAlign: col.align ?? "left" }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.length > 0 ? (
              pageData.map((row, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} style={{ textAlign: col.align ?? "left" }}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="muted" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <nav className="pagination" aria-label="Table pagination">
          <button
            className="action-button secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            type="button"
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="action-button secondary"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            type="button"
            aria-label="Next page"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
