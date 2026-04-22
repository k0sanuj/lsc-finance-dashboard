"use client";

import { useEffect, useState } from "react";

/**
 * Visible "⌘ K" chip in the topbar.
 * Clicking dispatches a synthetic Cmd+K / Ctrl+K keydown that the
 * CommandPalette listens for, so we don't need a shared context.
 */
export function CmdKTrigger() {
  const [modKey, setModKey] = useState<"⌘" | "Ctrl">("⌘");

  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
    setModKey(isMac ? "⌘" : "Ctrl");
  }, []);

  function open() {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
  }

  return (
    <button type="button" className="cmdk-trigger" onClick={open} aria-label="Open command palette">
      <span>Search</span>
      <kbd>{modKey}</kbd>
      <kbd>K</kbd>
    </button>
  );
}
