/**
 * Adapter: wraps callGemini() so it conforms to the LlmCallResult shape
 * used by the provider-agnostic llm.ts interface.
 */

import { callGemini } from "./gemini";
import type { LlmCallInput, LlmCallResult } from "./llm";

export async function callGeminiAdapter<T = unknown>(
  input: LlmCallInput
): Promise<LlmCallResult<T>> {
  const result = await callGemini<T>({
    tier: input.tier,
    systemPrompt: input.systemPrompt,
    prompt: input.prompt,
    inlineParts: input.inlineParts,
    jsonSchema: input.jsonSchema,
    enforceStrictSchema: input.enforceStrictSchema,
    disableThinking: input.disableThinking,
    maxOutputTokens: input.maxOutputTokens,
    purpose: input.purpose,
    timeoutMs: input.timeoutMs,
  });

  return {
    ok: result.ok,
    data: result.data,
    text: result.text,
    error: result.error,
    tokensUsed: result.tokensUsed,
    modelUsed: result.modelUsed,
    providerUsed: "gemini",
    durationMs: result.durationMs,
  };
}
