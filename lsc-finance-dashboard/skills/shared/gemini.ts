/**
 * Shared Gemini client.
 *
 * One module, one retry policy, one place to swap model versions.
 * Callers pick a tier (T1 = Flash, T2 = Pro, T3 = Pro + higher temperature).
 * Structured output uses responseMimeType: application/json and an optional
 * schema — we parse + validate the JSON so callers never have to.
 *
 * Server-only by convention (reads GEMINI_API_KEY). The consumer module
 * that imports it from the Next.js app should have its own "server-only"
 * guard if needed.
 */

export type GeminiTier = "T1" | "T2" | "T3";

/**
 * Model assignment per tier. Kept separate from the tier enum so we can
 * rotate models without touching callers.
 */
const TIER_MODELS: Record<GeminiTier, { model: string; temperature: number }> = {
  T1: { model: "gemini-2.5-flash", temperature: 0.1 },
  T2: { model: "gemini-2.5-flash", temperature: 0.3 },
  T3: { model: "gemini-2.5-flash", temperature: 0.2 },
};

/** Binary attachment sent as an inline_data part alongside the text prompt. */
export type GeminiInlinePart = {
  mimeType: string;
  /** Base64-encoded bytes. */
  dataBase64: string;
};

export type GeminiCallInput = {
  tier: GeminiTier;
  systemPrompt?: string;
  prompt: string;
  /** Binary attachments (images, PDFs). Sent inline, max ~8 MB total. */
  inlineParts?: GeminiInlinePart[];
  /**
   * If set, forces JSON output (responseMimeType=application/json) and parses
   * the response to this type. The schema is NOT sent to Gemini by default —
   * Gemini's strict responseSchema strips unknown properties (bad for
   * open-ended payloads). Pass enforceStrictSchema=true if you want the
   * server-side enforcement.
   */
  jsonSchema?: Record<string, unknown>;
  /** Send the schema via responseJsonSchema (permissive; preserves unknown keys). */
  enforceStrictSchema?: boolean;
  /** Disable Gemini 2.5 thinking mode for speed on simple extraction. */
  disableThinking?: boolean;
  /** Override max output tokens (default 2048). */
  maxOutputTokens?: number;
  /** Logical purpose — logged for cost attribution. */
  purpose: string;
  /** Request-level timeout (default 30s). */
  timeoutMs?: number;
};

export type GeminiCallResult<T = unknown> = {
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
  durationMs: number;
};

type GeminiApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
  error?: { message?: string; status?: string };
};

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return key.trim();
}

/**
 * Core call. No retry logic — failures return ok:false.
 * Retries live in callGemini() below.
 */
async function callGeminiOnce<T = unknown>(
  input: GeminiCallInput
): Promise<GeminiCallResult<T>> {
  const { model, temperature } = TIER_MODELS[input.tier];
  const started = Date.now();
  const apiKey = getApiKey();

  const contents: Array<Record<string, unknown>> = [];
  if (input.systemPrompt) {
    contents.push({ role: "user", parts: [{ text: input.systemPrompt }] });
    contents.push({ role: "model", parts: [{ text: "Understood." }] });
  }

  const userParts: Array<Record<string, unknown>> = [{ text: input.prompt }];
  for (const inline of input.inlineParts ?? []) {
    userParts.push({
      inline_data: { mime_type: inline.mimeType, data: inline.dataBase64 },
    });
  }
  contents.push({ role: "user", parts: userParts });

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens: input.maxOutputTokens ?? 2048,
  };
  if (input.jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    if (input.enforceStrictSchema) {
      // responseJsonSchema is permissive — validates structure but preserves
      // properties not declared in the schema. Safe for extraction flows.
      generationConfig.responseJsonSchema = input.jsonSchema;
    }
    // If !enforceStrictSchema, we rely on prompt + parse-on-read.
  }
  if (input.disableThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? 30_000
  );

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents, generationConfig }),
        signal: controller.signal,
      }
    );

    const raw = (await response.json()) as GeminiApiResponse;

    if (!response.ok) {
      return {
        ok: false,
        error: raw.error?.message ?? `HTTP ${response.status}`,
        modelUsed: model,
        durationMs: Date.now() - started,
      };
    }

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return {
        ok: false,
        error: "Gemini returned no text in response",
        modelUsed: model,
        durationMs: Date.now() - started,
      };
    }

    const tokens = raw.usageMetadata
      ? {
          prompt: raw.usageMetadata.promptTokenCount ?? 0,
          candidates: raw.usageMetadata.candidatesTokenCount ?? 0,
          total: raw.usageMetadata.totalTokenCount ?? 0,
        }
      : undefined;

    // Parse JSON if schema was requested
    if (input.jsonSchema) {
      try {
        const data = JSON.parse(text) as T;
        return {
          ok: true,
          data,
          text,
          tokensUsed: tokens,
          modelUsed: model,
          durationMs: Date.now() - started,
        };
      } catch (parseErr) {
        return {
          ok: false,
          error: `Gemini returned invalid JSON: ${
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          }`,
          text,
          tokensUsed: tokens,
          modelUsed: model,
          durationMs: Date.now() - started,
        };
      }
    }

    return {
      ok: true,
      text,
      tokensUsed: tokens,
      modelUsed: model,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      modelUsed: model,
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Call Gemini with up to 2 retries on transient failures (5xx, timeout).
 * 4xx errors (bad input, auth) are not retried.
 */
export async function callGemini<T = unknown>(
  input: GeminiCallInput
): Promise<GeminiCallResult<T>> {
  let lastResult: GeminiCallResult<T> | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    lastResult = await callGeminiOnce<T>(input);
    if (lastResult.ok) return lastResult;

    // Only retry on transient errors
    const err = lastResult.error ?? "";
    const isTransient =
      err.includes("HTTP 5") ||
      err.includes("aborted") ||
      err.includes("ETIMEDOUT") ||
      err.includes("fetch failed");
    if (!isTransient) break;

    // Exponential backoff: 300ms, 900ms
    await new Promise((r) => setTimeout(r, 300 * Math.pow(3, attempt)));
  }

  return lastResult as GeminiCallResult<T>;
}
