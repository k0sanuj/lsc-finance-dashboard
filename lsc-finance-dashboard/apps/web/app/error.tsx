"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="page-grid">
      <section className="hero">
        <span className="eyebrow">Something went wrong</span>
        <h2>An unexpected error occurred</h2>
        <p>
          {error.message || "The page encountered a problem. This has been logged for review."}
        </p>
        <div className="hero-actions">
          <button className="solid-link" onClick={reset} type="button">
            Try again
          </button>
          <a className="ghost-link" href="/">
            Return to overview
          </a>
        </div>
      </section>
    </div>
  );
}
