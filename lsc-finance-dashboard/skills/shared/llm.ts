/**
 * Provider-agnostic LLM interface.
 *
 * Callers pass (tier, purpose, prompt, ...) — we decide which provider to
 * use based on a purpose → provider registry. This lets us mix providers:
 * e.g. use Claude for routing (T1 Haiku is cheaper + better at structured
 * JSON) but keep Gemini for document extraction (better price on image
 * tokens).
 *
 * Each provider exports a callProvider() that conforms to this module's
 * types. The registry below decides which one runs for a given purpose.
 */

export type LlmTier = "T1" | "T2" | "T3";

export type LlmInlinePart = {
  mimeType: string;
  dataBase64: string;
};

export type LlmCallInput = {
  tier: LlmTier;
  systemPrompt?: string;
  prompt: string;
  inlineParts?: LlmInlinePart[];
  /** JSON response mode + parse. Schema is optional / advisory. */
  jsonSchema?: Record<string, unknown>;
  /**
   * Strict schema enforcement (server-side). Gemini uses responseJsonSchema,
   * Anthropic does not support this — ignored silently there.
   */
  enforceStrictSchema?: boolean;
  /** Skip Gemini 2.5 thinking for speed. Ignored on providers that don't support it. */
  disableThinking?: boolean;
  maxOutputTokens?: number;
  purpose: string;
  timeoutMs?: number;
  /**
   * Force a specific provider instead of using the purpose registry.
   * Useful when a caller knows which provider it wants (e.g. bill parser
   * on Gemini for image cost efficiency).
   */
  provider?: LlmProvider;
};

export type LlmCallResult<T = unknown> = {
  ok: boolean;
  data?: T;
  text?: string;
  error?: string;
  tokensUsed?: {
    prompt: number;
    candidates: number;
    total: number;
  };
  modelUsed: string;
  providerUsed: LlmProvider;
  durationMs: number;
};

export type LlmProvider = "anthropic" | "gemini";

/**
 * Purpose → provider routing.
 *
 * Criteria:
 *   - "routing" / short structured extraction → Anthropic Haiku (T1)
 *     Better JSON compliance at low cost
 *   - "document-analyze", "parse-bill", "race-budget-extraction" → Gemini
 *     Cheaper per-image/PDF token, matters for high-volume document workflows
 *   - "audit" / complex reasoning → Anthropic Opus (T3)
 *     Accuracy > cost for once-a-month runs
 *   - Anything unmapped falls back to Anthropic (safer default for routing).
 */
const PURPOSE_PROVIDER: Record<string, LlmProvider> = {
  // Orchestrator + short classification — Anthropic Haiku
  "orchestrator-intent-classify": "anthropic",
  "ai-ingest-classify": "anthropic",
  "ai-ingest-action-classify": "anthropic",
  "cross-dashboard-classify": "anthropic",
  "notification-draft": "anthropic",

  // Document/image extraction — Gemini (image-token economics)
  "parse-bill": "gemini",
  "document-analyze": "gemini",
  "document-analyze-compact-retry": "gemini",
  "race-budget-extraction": "gemini",

  // Analyzers (narrative reasoning) — Anthropic Sonnet
  "cash-flow-analyze": "anthropic",
  "receivables-analyze": "anthropic",
  "margin-analyze": "anthropic",
  "budget-analyze": "anthropic",
  "goal-track": "anthropic",

  // Audit — Anthropic Opus
  "monthly-audit": "anthropic",
  "reconcile-invoices": "anthropic",
  "verify-subscriptions": "anthropic",
};

const DEFAULT_PROVIDER: LlmProvider = "anthropic";

export function providerForPurpose(purpose: string): LlmProvider {
  return PURPOSE_PROVIDER[purpose] ?? DEFAULT_PROVIDER;
}

/**
 * Main entrypoint. Picks provider based on input.provider override or the
 * purpose registry, then dispatches. Dynamic import avoids loading a
 * provider's SDK when it isn't used.
 */
export async function callLlm<T = unknown>(
  input: LlmCallInput
): Promise<LlmCallResult<T>> {
  const provider = input.provider ?? providerForPurpose(input.purpose);

  if (provider === "anthropic") {
    const { callAnthropic } = await import("./anthropic");
    return callAnthropic<T>(input);
  }
  if (provider === "gemini") {
    const { callGeminiAdapter } = await import("./gemini-adapter");
    return callGeminiAdapter<T>(input);
  }
  return {
    ok: false,
    error: `Unknown provider: ${provider}`,
    modelUsed: "unknown",
    providerUsed: provider,
    durationMs: 0,
  };
}
