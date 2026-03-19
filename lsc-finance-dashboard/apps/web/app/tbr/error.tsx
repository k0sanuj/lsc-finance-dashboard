"use client";

import { useEffect } from "react";

export default function TbrError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[TBR Error]", error);
  }, [error]);

  return (
    <div className="page-grid">
      <section className="notice error">
        <strong>Failed to load TBR workspace</strong>
        <span>{error.message || "An unexpected error occurred."}</span>
      </section>
      <div className="hero-actions">
        <button className="solid-link" onClick={reset} type="button">
          Retry
        </button>
        <a className="ghost-link" href="/">
          Go to overview
        </a>
      </div>
    </div>
  );
}
