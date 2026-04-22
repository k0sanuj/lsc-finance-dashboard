"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Reads ?highlight=<id> from the URL, finds the row with data-row-id=<id>,
 * scrolls it into view, flashes it for 2s, then strips the highlight
 * param so refresh/back-button don't re-trigger.
 *
 * Pages opt in by:
 *   1. Rendering <RowHighlight /> anywhere in their tree
 *   2. Setting data-row-id={id} on the row (any element works — tr, li, div)
 *
 * No-op if there's no highlight param or no matching row. Designed for use
 * by the Cmd+K palette's server-side entity search.
 */
export function RowHighlight() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (!highlight) return;

    // Wait one frame so the row is guaranteed mounted
    const raf = requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(highlight)}"]`);
      if (!row) return;

      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("row-highlight-flash");

      // Clean up the URL once the row is found so refresh won't re-flash
      const params = new URLSearchParams(searchParams.toString());
      params.delete("highlight");
      const q = params.toString();
      router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });

      // Remove the flash class after the animation
      const done = setTimeout(() => {
        row.classList.remove("row-highlight-flash");
      }, 2200);

      return () => clearTimeout(done);
    });

    return () => cancelAnimationFrame(raf);
  }, [pathname, searchParams, router]);

  return null;
}
