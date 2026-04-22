"use client";

import { useState, useRef, useEffect } from "react";

type RoutingStep = {
  agentId: string;
  skill: string;
  payload: Record<string, unknown>;
  dependsOn: number[];
};

type StepResult = {
  stepIndex: number;
  agentId: string;
  skill: string;
  status: "success" | "error" | "skipped";
  data?: unknown;
  error?: string;
};

type OrchestratorResult = {
  intent: string;
  plan: {
    intent: string;
    reasoning: string;
    steps: RoutingStep[];
    hitlSteps: number[];
  };
  results: StepResult[];
  summary: string;
  geminiTokens?: { prompt: number; candidates: number; total: number };
  classifyDurationMs?: number;
};

type Exchange = {
  id: number;
  message: string;
  status: "pending" | "complete" | "error";
  error?: string;
  result?: OrchestratorResult;
  startedAt: number;
  completedAt?: number;
};

const EXAMPLE_QUESTIONS = [
  "What are our company metrics?",
  "Show me the TBR race list for 2026",
  "Convert 1000 INR to USD",
  "What's our cash position?",
  "How are sponsor deals going?",
];

function renderData(data: unknown): string {
  if (data === null || data === undefined) return "null";
  if (typeof data === "string") return data;
  if (typeof data === "number" || typeof data === "boolean") return String(data);
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function CopilotChat() {
  const [input, setInput] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exchanges]);

  async function send(message: string, autoRunHitl: boolean = false) {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    const id = Date.now();
    const pending: Exchange = {
      id,
      message: trimmed,
      status: "pending",
      startedAt: Date.now(),
    };
    setExchanges((prev) => [...prev, pending]);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, autoRunHitl }),
      });

      if (!response.ok) {
        const err = await response.text();
        setExchanges((prev) =>
          prev.map((e) =>
            e.id === id
              ? { ...e, status: "error", error: `HTTP ${response.status}: ${err}`, completedAt: Date.now() }
              : e
          )
        );
        return;
      }

      const result = (await response.json()) as OrchestratorResult;
      setExchanges((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, status: "complete", result, completedAt: Date.now() } : e
        )
      );
    } catch (err) {
      setExchanges((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "error",
                error: err instanceof Error ? err.message : String(err),
                completedAt: Date.now(),
              }
            : e
        )
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  async function retryWithHitl(exchange: Exchange) {
    await send(exchange.message, true);
  }

  return (
    <div className="copilot-root">
      {exchanges.length === 0 ? (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Examples</span>
              <h3>Try asking</h3>
            </div>
          </div>
          <div className="copilot-examples">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="copilot-example-chip"
                onClick={() => send(q)}
                disabled={isSending}
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="copilot-thread">
        {exchanges.map((e) => (
          <ExchangeCard key={e.id} exchange={e} onRetryWithHitl={retryWithHitl} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="copilot-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          className="copilot-input"
          placeholder="Ask about invoices, payroll, races, commercial goals…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isSending}
          autoFocus
        />
        <button
          type="submit"
          className="action-button primary"
          disabled={isSending || input.trim().length === 0}
        >
          {isSending ? "Working…" : "Ask"}
        </button>
      </form>
    </div>
  );
}

function ExchangeCard({
  exchange,
  onRetryWithHitl,
}: {
  exchange: Exchange;
  onRetryWithHitl: (e: Exchange) => void;
}) {
  const duration =
    exchange.completedAt && exchange.startedAt
      ? exchange.completedAt - exchange.startedAt
      : null;

  return (
    <article className="copilot-exchange">
      <div className="copilot-question">
        <strong>Q:</strong> {exchange.message}
      </div>

      {exchange.status === "pending" && (
        <div className="copilot-status muted">Routing through orchestrator…</div>
      )}

      {exchange.status === "error" && (
        <div className="copilot-status signal-risk">
          <strong>Error:</strong> {exchange.error}
        </div>
      )}

      {exchange.status === "complete" && exchange.result && (
        <CopilotResult result={exchange.result} duration={duration} onRetryWithHitl={() => onRetryWithHitl(exchange)} />
      )}
    </article>
  );
}

function CopilotResult({
  result,
  duration,
  onRetryWithHitl,
}: {
  result: OrchestratorResult;
  duration: number | null;
  onRetryWithHitl: () => void;
}) {
  const hasHitl = result.results.some((r) => r.status === "skipped");

  return (
    <>
      <div className="copilot-plan">
        <div className="copilot-plan-meta">
          <span className="subtle-pill">{result.plan.intent}</span>
          {duration !== null && (
            <span className="muted" style={{ fontSize: "0.78rem" }}>
              {duration}ms
              {result.classifyDurationMs != null
                ? ` • classify ${result.classifyDurationMs}ms`
                : ""}
              {result.geminiTokens
                ? ` • ${result.geminiTokens.total.toLocaleString()} tokens`
                : ""}
            </span>
          )}
        </div>
        {result.plan.reasoning ? (
          <div className="copilot-reasoning">
            <strong>Plan: </strong>
            {result.plan.reasoning}
          </div>
        ) : null}
      </div>

      <div className="copilot-steps">
        {result.results.map((step, i) => (
          <details key={i} className="copilot-step" open={step.status === "success"}>
            <summary className="copilot-step-summary">
              <span
                className={
                  step.status === "success"
                    ? "pill signal-pill signal-good"
                    : step.status === "error"
                      ? "pill signal-pill signal-risk"
                      : "pill signal-pill signal-warn"
                }
              >
                {step.status}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
                {step.agentId}:{step.skill}
              </span>
              {step.status === "error" && (
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  {step.error}
                </span>
              )}
            </summary>
            <div className="copilot-step-body">
              {step.status === "success" && step.data !== undefined ? (
                <pre className="copilot-data">{renderData(step.data)}</pre>
              ) : step.status === "skipped" ? (
                <div className="muted">{step.error}</div>
              ) : step.status === "error" ? (
                <div className="signal-risk">{step.error}</div>
              ) : null}
            </div>
          </details>
        ))}
      </div>

      {hasHitl ? (
        <div className="copilot-hitl-actions">
          <div className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.5rem" }}>
            This plan has human-in-the-loop steps (document analysis, audit). They were skipped by default.
          </div>
          <button type="button" className="action-button secondary" onClick={onRetryWithHitl}>
            Re-run with HITL approved
          </button>
        </div>
      ) : null}

      <div className="copilot-summary muted">
        <strong>Summary:</strong> {result.summary}
      </div>
    </>
  );
}
