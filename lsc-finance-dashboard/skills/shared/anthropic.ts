/**
 * Anthropic (Claude) provider.
 *
 * Implements the LlmProvider contract defined in llm.ts.
 * Uses the Messages API directly via fetch — no SDK dependency.
 *
 * Tier → model mapping:
 *   T1 → claude-haiku-4-5-20251001  (routing, classification, short summaries)
 *   T2 → claude-sonnet-4-6          (analyzers, narrative reasoning)
 *   T3 → claude-opus-4-7            (monthly audit, high-stakes reasoning)
 *
 * JSON mode: Claude doesn't have a dedicated JSON flag. We instruct via
 * the system prompt and parse the text response. If jsonSchema is passed,
 * we append a "Return JSON matching this schema" line to the system prompt.
 * enforceStrictSchema is a no-op here (server-side schema enforcement is
 * Gemini-only).
 *
 * inlineParts: Claude accepts images via { type: "image", source: ... }.
 * PDFs are sent via { type: "document", source: ... }.
 */

import type { LlmCallInput, LlmCallResult, LlmTier } from "./llm";

const TIER_MODELS: Record<
  LlmTier,
  { model: string; temperature: number; maxTokens: number }
> = {
  T1: { model: "claude-haiku-4-5-20251001", temperature: 0.1, maxTokens: 2048 },
  T2: { model: "claude-sonnet-4-6", temperature: 0.3, maxTokens: 2048 },
  T3: { model: "claude-opus-4-7", temperature: 0.2, maxTokens: 4096 },
};

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return key.trim();
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

type AnthropicResponse = {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text?: string }>;
  model: string;
  stop_reason: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { type: string; message: string };
};

function buildContent(
  prompt: string,
  inlineParts: LlmCallInput["inlineParts"]
): AnthropicContentBlock[] {
  const blocks: AnthropicContentBlock[] = [];

  for (const part of inlineParts ?? []) {
    const mime = part.mimeType || "application/octet-stream";
    if (mime === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: part.dataBase64 },
      });
    } else if (mime.startsWith("image/")) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: mime, data: part.dataBase64 },
      });
    }
    // Other mime types (csv/json/text) are handled by the caller inlining
    // them as text into the prompt. We skip silently here.
  }

  blocks.push({ type: "text", text: prompt });
  return blocks;
}

function extractJsonFromText(text: string): string {
  // Strip markdown fences if Claude emitted any
  const stripped = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return stripped.slice(first, last + 1);
  }
  return stripped;
}

async function callAnthropicOnce<T>(
  input: LlmCallInput
): Promise<LlmCallResult<T>> {
  const cfg = TIER_MODELS[input.tier];
  const started = Date.now();
  const apiKey = getApiKey();

  const systemParts: string[] = [];
  if (input.systemPrompt) systemParts.push(input.systemPrompt);
  if (input.jsonSchema) {
    systemParts.push(
      "Respond with valid JSON only. Do not wrap in markdown fences. Do not include any prose before or after the JSON object."
    );
  }

  const body = {
    model: cfg.model,
    max_tokens: input.maxOutputTokens ?? cfg.maxTokens,
    temperature: cfg.temperature,
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: [
      {
        role: "user",
        content: buildContent(input.prompt, input.inlineParts),
      },
    ],
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? 30_000
  );

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = (await response.json()) as AnthropicResponse;

    if (!response.ok) {
      return {
        ok: false,
        error: raw.error?.message ?? `HTTP ${response.status}`,
        modelUsed: cfg.model,
        providerUsed: "anthropic",
        durationMs: Date.now() - started,
      };
    }

    const textBlock = raw.content?.find((b) => b.type === "text");
    const text = textBlock?.text ?? "";
    if (!text) {
      return {
        ok: false,
        error: "Anthropic returned no text content",
        modelUsed: cfg.model,
        providerUsed: "anthropic",
        durationMs: Date.now() - started,
      };
    }

    const tokens = raw.usage
      ? {
          prompt: raw.usage.input_tokens ?? 0,
          candidates: raw.usage.output_tokens ?? 0,
          total: (raw.usage.input_tokens ?? 0) + (raw.usage.output_tokens ?? 0),
        }
      : undefined;

    if (input.jsonSchema) {
      try {
        const jsonText = extractJsonFromText(text);
        const data = JSON.parse(jsonText) as T;
        return {
          ok: true,
          data,
          text,
          tokensUsed: tokens,
          modelUsed: cfg.model,
          providerUsed: "anthropic",
          durationMs: Date.now() - started,
        };
      } catch (parseErr) {
        return {
          ok: false,
          error: `Anthropic returned invalid JSON: ${
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          }`,
          text,
          tokensUsed: tokens,
          modelUsed: cfg.model,
          providerUsed: "anthropic",
          durationMs: Date.now() - started,
        };
      }
    }

    return {
      ok: true,
      text,
      tokensUsed: tokens,
      modelUsed: cfg.model,
      providerUsed: "anthropic",
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      modelUsed: cfg.model,
      providerUsed: "anthropic",
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/** 2 retries on transient errors (5xx, abort, timeout). 4xx fails fast. */
export async function callAnthropic<T = unknown>(
  input: LlmCallInput
): Promise<LlmCallResult<T>> {
  let last: LlmCallResult<T> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await callAnthropicOnce<T>(input);
    if (last.ok) return last;
    const err = last.error ?? "";
    const transient =
      err.includes("HTTP 5") ||
      err.includes("aborted") ||
      err.includes("ETIMEDOUT") ||
      err.includes("fetch failed") ||
      err.includes("overloaded");
    if (!transient) break;
    await new Promise((r) => setTimeout(r, 300 * Math.pow(3, attempt)));
  }
  return last as LlmCallResult<T>;
}
