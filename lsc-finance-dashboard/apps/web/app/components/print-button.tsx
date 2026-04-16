"use client";

export function PrintButton() {
  return (
    <button
      className="action-button primary"
      type="button"
      onClick={() => window.print()}
    >
      Print / Save PDF
    </button>
  );
}
