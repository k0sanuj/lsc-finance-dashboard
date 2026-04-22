"use client";

import { useState } from "react";

type AnalyzerKey = "cash-flow" | "receivables" | "margin" | "budget" | "goal-tracker";

type Analyzer = {
  key: AnalyzerKey;
  title: string;
  description: string;
  agentId: string;
  skill: string;
  tier: "T1" | "T2";
};

const ANALYZERS: Analyzer[] = [
  {
    key: "cash-flow",
    title: "Cash Flow",
    description: "Liquidity, runway, upcoming-payment pressure.",
    agentId: "cash-flow-analyzer",
    skill: "analyze-cash-position",
    tier: "T2",
  },
  {
    key: "receivables",
    title: "Receivables",
    description: "Aging, collection risk, top at-risk customers.",
    agentId: "receivables-analyzer",
    skill: "analyze-aging",
    tier: "T2",
  },
  {
    key: "margin",
    title: "Race Margin",
    description: "Which races over-ran budget, cost drivers, margin trend.",
    agentId: "margin-analyzer",
    skill: "analyze-race-margin",
    tier: "T2",
  },
  {
    key: "budget",
    title: "Budget Utilization",
    description: "Category-level spend vs budget, overspend alerts.",
    agentId: "budget-analyzer",
    skill: "analyze-budget-utilization",
    tier: "T1",
  },
  {
    key: "goal-tracker",
    title: "Commercial Goals",
    description: "Target progress, at-risk goals, closure projections.",
    agentId: "goal-tracker",
    skill: "track-goal-progress",
    tier: "T1",
  },
];

type RunState = {
  status: "idle" | "pending" | "complete" | "error";
  data?: Record<string, unknown>;
  error?: string;
  tookMs?: number;
};

function StatusBadge({ status }: { status: RunState["status"] }) {
  const cls =
    status === "complete"
      ? "pill signal-pill signal-good"
      : status === "error"
        ? "pill signal-pill signal-risk"
        : status === "pending"
          ? "pill signal-pill signal-warn"
          : "pill subtle-pill";
  const label = status === "idle" ? "not run" : status;
  return <span className={cls}>{label}</span>;
}

function renderAnalysis(data: Record<string, unknown>): React.ReactNode {
  return (
    <div className="analyzer-result">
      {typeof data.summary === "string" ? (
        <p className="analyzer-summary">{data.summary}</p>
      ) : null}
      {Array.isArray(data.recommendations) && data.recommendations.length > 0 ? (
        <div className="analyzer-section">
          <strong>Recommendations</strong>
          <ul className="analyzer-list">
            {(data.recommendations as string[]).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {Array.isArray(data.keyInsights) && data.keyInsights.length > 0 ? (
        <div className="analyzer-section">
          <strong>Key insights</strong>
          <ul className="analyzer-list">
            {(data.keyInsights as string[]).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {Array.isArray(data.risks) && data.risks.length > 0 ? (
        <div className="analyzer-section">
          <strong>Risks</strong>
          <ul className="analyzer-list">
            {(data.risks as Array<{ severity: string; description: string }>).map((r, i) => (
              <li key={i}>
                <span className={`pill signal-pill signal-${r.severity === "high" ? "risk" : r.severity === "medium" ? "warn" : "good"}`}>
                  {r.severity}
                </span>{" "}
                {r.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {Array.isArray(data.alerts) && data.alerts.length > 0 ? (
        <div className="analyzer-section">
          <strong>Alerts</strong>
          <ul className="analyzer-list">
            {(data.alerts as Array<{ severity: string; message: string }>).map((a, i) => (
              <li key={i}>
                <span className={`pill signal-pill signal-${a.severity === "risk" ? "risk" : a.severity === "warn" ? "warn" : "good"}`}>
                  {a.severity}
                </span>{" "}
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <details className="analyzer-raw">
        <summary>Raw JSON</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}

export function AnalyzersShell() {
  const [runs, setRuns] = useState<Record<AnalyzerKey, RunState>>(
    Object.fromEntries(ANALYZERS.map((a) => [a.key, { status: "idle" }])) as Record<AnalyzerKey, RunState>
  );

  async function run(analyzer: Analyzer) {
    setRuns((prev) => ({ ...prev, [analyzer.key]: { status: "pending" } }));
    const started = Date.now();
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: analyzer.agentId, skill: analyzer.skill, payload: {} }),
      });
      const body = await response.json();
      const tookMs = Date.now() - started;
      if (!body.ok) {
        setRuns((prev) => ({
          ...prev,
          [analyzer.key]: { status: "error", error: body.error ?? "Dispatch failed", tookMs },
        }));
        return;
      }
      setRuns((prev) => ({
        ...prev,
        [analyzer.key]: { status: "complete", data: body.data, tookMs },
      }));
    } catch (err) {
      setRuns((prev) => ({
        ...prev,
        [analyzer.key]: {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          tookMs: Date.now() - started,
        },
      }));
    }
  }

  async function runAll() {
    await Promise.all(ANALYZERS.map((a) => run(a)));
  }

  const anyRunning = Object.values(runs).some((r) => r.status === "pending");

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">AI Analysis</span>
          <h3>HITL Analyzers — read-only narrative insights</h3>
          <p className="muted">
            5 analyzers read canonical data, call Claude (Haiku T1 / Sonnet T2), and produce
            structured findings. Read-only: no writes, no side effects. Humans review before
            action.
          </p>
        </div>
        <div>
          <button type="button" className="action-button primary" onClick={runAll} disabled={anyRunning}>
            {anyRunning ? "Running…" : "Run all analyzers"}
          </button>
        </div>
      </section>

      <div className="analyzer-grid">
        {ANALYZERS.map((a) => {
          const state = runs[a.key];
          return (
            <article className="card analyzer-card" key={a.key}>
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">{a.tier} · {a.agentId}</span>
                  <h3>{a.title}</h3>
                  <p className="muted">{a.description}</p>
                </div>
                <StatusBadge status={state.status} />
              </div>

              {state.status === "idle" ? (
                <div className="analyzer-empty">
                  <button type="button" className="action-button secondary" onClick={() => run(a)}>
                    Run
                  </button>
                </div>
              ) : state.status === "pending" ? (
                <div className="analyzer-empty muted">
                  <span className="spinner" /> Analyzing…
                </div>
              ) : state.status === "error" ? (
                <div className="analyzer-error">
                  <strong>Error:</strong> {state.error}
                  <button type="button" className="action-button secondary" onClick={() => run(a)}>
                    Retry
                  </button>
                </div>
              ) : state.data ? (
                <>
                  {renderAnalysis(state.data)}
                  <div className="analyzer-footer">
                    <span className="muted">
                      {state.tookMs ? `${(state.tookMs / 1000).toFixed(1)}s` : null}
                    </span>
                    <button type="button" className="action-button secondary" onClick={() => run(a)}>
                      Re-run
                    </button>
                  </div>
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
