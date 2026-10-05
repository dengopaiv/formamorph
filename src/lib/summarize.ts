// One-shot summarizer for the world editor's "generate AI-Facing Summary" button.

import type { AiSettingsSnapshot } from '@/lib/aiRequest/aiRequestSpec';
import { requestAiText } from '@/lib/aiRequest/aiText';
import { DEFAULT_AI_SUMMARY_PROMPT } from './authoringPromptDefaults';

export { DEFAULT_AI_SUMMARY_PROMPT };

/** Enough for the default's one sentence. User-overridable alongside the prompt, so a template edited to
 *  ask for two or three sentences isn't silently cut off at the shipped cap. */
export const DEFAULT_SUMMARY_MAX_TOKENS = 80;

/** The range the per-prompt cap field allows. */
export const SUMMARY_MAX_TOKENS_MIN = 16;
export const SUMMARY_MAX_TOKENS_MAX = 1024;

/**
 * Summarize `text` through the request pipeline. `template` is the author's summary prompt (shipped default
 * when absent) and `maxTokens` its output cap. Throws on a failed or empty result; the caller surfaces
 * failures (and ignores `AbortError`).
 */
export async function summarizeDescription(
  text: string,
  opts: { snapshot: AiSettingsSnapshot; template?: string; maxTokens?: number; signal?: AbortSignal },
): Promise<string> {
  return requestAiText(opts.snapshot, {
    systemPrompt: opts.template?.trim() || DEFAULT_AI_SUMMARY_PROMPT,
    messages: [{ role: 'user', content: text }],
    requestType: 'descriptionSummary',
    maxTokensOverride: opts.maxTokens ?? DEFAULT_SUMMARY_MAX_TOKENS,
  }, { signal: opts.signal });
}
