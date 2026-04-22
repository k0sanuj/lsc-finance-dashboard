"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Command = {
  id: string;
  label: string;
  group: string;
  href?: Route | string;
  hint?: string;
  action?: () => void;
  keywords?: string; // extra searchable text
};

type ServerHit = {
  id: string;
  kind: string;
  label: string;
  subtitle?: string;
  href: string;
};

type Props = {
  /** Commands supplied by the shell — typically every nav link + quick actions. */
  commands: Command[];
};

const RECENT_KEY = "lsc:cmdk:recent";
const RECENT_MAX = 5;

const HIT_KIND_GROUP: Record<string, string> = {
  vendor: "Vendors",
  employee: "Employees",
  race: "Races",
  "invoice-intake": "Invoice Intake",
  "payroll-invoice": "Payroll Invoices",
  deal: "Deals",
  subscription: "Subscriptions",
  sponsor: "Sponsors & Customers",
};

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadRecent().filter((x) => x !== id);
    const next = [id, ...current].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — silently skip
  }
}

/**
 * Fuzzy-match score. Higher = better.
 * - 1000: exact label match
 * - 500: label starts with query
 * - 100: all query chars appear in label in order
 * - 50:  query matches keywords
 * - 0:   no match
 */
function score(cmd: Command, q: string): number {
  if (!q) return 0;
  const qLower = q.toLowerCase();
  const label = cmd.label.toLowerCase();
  const keywords = (cmd.keywords ?? "").toLowerCase();

  if (label === qLower) return 1000;
  if (label.startsWith(qLower)) return 500 + (1000 - label.length);
  if (label.includes(qLower)) return 300 + (1000 - label.length);

  // Each query char appears in label in order?
  let li = 0;
  for (let qi = 0; qi < qLower.length; qi++) {
    const c = qLower[qi];
    while (li < label.length && label[li] !== c) li++;
    if (li >= label.length) {
      // No in-order match in label; try keywords substring
      if (keywords.includes(qLower)) return 50;
      return 0;
    }
    li++;
  }
  return 100;
}

export function CommandPalette({ commands }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [serverHits, setServerHits] = useState<ServerHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Open/close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset state + load recent when opened
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlighted(0);
    setRecentIds(loadRecent());
    setServerHits([]);
    setIsSearching(false);
    // Focus after render
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Debounced server-side entity search (fires when query has >=2 chars)
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = null;

    if (trimmed.length < 2) {
      setServerHits([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          setServerHits([]);
        } else {
          const body = (await response.json()) as { hits?: ServerHit[] };
          setServerHits(Array.isArray(body.hits) ? body.hits : []);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setServerHits([]);
        }
      } finally {
        if (abortRef.current === controller) setIsSearching(false);
      }
    }, 200);

    return () => {
      clearTimeout(timeout);
    };
  }, [query, open]);

  // Build filtered command list (static nav + server entity hits merged)
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Recent first, then all commands grouped
      const recentCmds = recentIds
        .map((id) => commands.find((c) => c.id === id))
        .filter((c): c is Command => Boolean(c))
        .map((c) => ({ ...c, group: "Recent" }));
      const otherCmds = commands.filter((c) => !recentIds.includes(c.id));
      return [...recentCmds, ...otherCmds];
    }

    // Nav / quick-action hits (scored client-side)
    const ranked = commands
      .map((c) => ({ cmd: c, s: score(c, query.trim()) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.cmd);

    // Server entity hits — already filtered by the backend, add as-is
    const entityCmds: Command[] = serverHits.map((h) => ({
      id: h.id,
      label: h.label,
      group: HIT_KIND_GROUP[h.kind] ?? h.kind,
      href: h.href,
      hint: h.subtitle,
    }));

    return [...ranked, ...entityCmds];
  }, [query, commands, recentIds, serverHits]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  // Scroll highlighted into view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmdk-index="${highlighted}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const runCommand = useCallback(
    (cmd: Command) => {
      pushRecent(cmd.id);
      setOpen(false);
      if (cmd.action) {
        cmd.action();
      } else if (cmd.href) {
        router.push(cmd.href as Route);
      }
    },
    [router]
  );

  function onKeyInInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[highlighted];
      if (cmd) runCommand(cmd);
    }
  }

  if (!open) return null;

  // Group for display
  const groups: Array<{ label: string; items: Command[] }> = [];
  for (const cmd of filtered) {
    let g = groups.find((gg) => gg.label === cmd.group);
    if (!g) {
      g = { label: cmd.group, items: [] };
      groups.push(g);
    }
    g.items.push(cmd);
  }

  let flatIndex = 0;

  return (
    <div
      className="cmdk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="cmdk-card">
        <div className="cmdk-input-row">
          <span className="cmdk-input-icon" aria-hidden="true">⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="cmdk-input"
            placeholder="Search navigation, vendors, employees, invoices, races…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyInInput}
            aria-label="Command search"
            autoFocus
          />
          {isSearching ? (
            <span className="cmdk-searching" aria-label="Searching">
              <span className="spinner" />
            </span>
          ) : null}
          <kbd className="cmdk-esc">esc</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmdk-empty">No commands match &quot;{query}&quot;.</div>
          ) : (
            groups.map((group) => (
              <div className="cmdk-group" key={group.label}>
                <div className="cmdk-group-label">{group.label}</div>
                {group.items.map((cmd) => {
                  const i = flatIndex++;
                  const isHighlighted = i === highlighted;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-cmdk-index={i}
                      className={`cmdk-item ${isHighlighted ? "cmdk-item-highlighted" : ""}`}
                      onClick={() => runCommand(cmd)}
                      onMouseEnter={() => setHighlighted(i)}
                    >
                      <span className="cmdk-item-label">{cmd.label}</span>
                      {cmd.hint ? <span className="cmdk-item-hint">{cmd.hint}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmdk-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
