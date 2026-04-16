"use client";

export function PrintButton() {
  return (
    <button
      className="action-button secondary"
      type="button"
      onClick={() => window.print()}
    >
      Print page
    </button>
  );
}

export function DownloadPdfButton({ invoiceId }: { invoiceId: string }) {
  return (
    <a
      className="action-button primary"
      href={`/api/invoice-pdf/${invoiceId}`}
      download
    >
      Download PDF
    </a>
  );
}
