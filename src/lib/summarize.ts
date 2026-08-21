// One-shot, non-streaming summarizer for the world editor's "generate AI-Facing Summary" button.
// Mirrors the OpenAI-compatible request shape the game uses, minus the streaming/turn machinery.

/**
 * The default, user-editable summary prompt. Persisted per prompt preset and overridable in
 * Settings → Prompts → Authoring.
 *
 * Kind-agnostic by design: the summary condenses whatever description it is handed, so unlike the bridge
 * prompts it carries no `<SUBJECT>`/`<FACETS>` tokens.
 */
export const DEFAULT_AI_SUMMARY_PROMPT =
  'Summarize the following description in a single concise sentence (under ~20 words). ' +
  'Output only the summary — no preamble, labels, or quotes.';

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/** Enough for the default's one sentence. User-overridable alongside the prompt, so a template edited to
 *  ask for two or three sentences isn't silently cut off at the shipped cap. */
export const DEFAULT_SUMMARY_MAX_TOKENS = 80;

/** The range the per-prompt cap field allows. */
export const SUMMARY_MAX_TOKENS_MIN = 16;
export const SUMMARY_MAX_TOKENS_MAX = 1024;

/**
 * Summarize `text` via the configured chat-completions endpoint. `template` is the author's summary prompt
 * (shipped default when absent) and `maxTokens` its output cap. Throws on a non-OK response or an
 * empty/unparseable result; the caller surfaces failures (and ignores `AbortError`).
 */
export async function summarizeDescription(
  text: string,
  opts: {
    endpointUrl: string;
    apiToken: string;
    modelName: string;
    template?: string;
    maxTokens?: number;
    signal?: AbortSignal;
  },
): Promise<string> {
  const res = await fetch(opts.endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.apiToken ? { Authorization: `Bearer ${opts.apiToken}` } : {}),
    },
    body: JSON.stringify({
      model: opts.modelName,
      messages: [
        { role: 'system', content: opts.template?.trim() || DEFAULT_AI_SUMMARY_PROMPT },
        { role: 'user', content: text },
      ],
      max_tokens: opts.maxTokens ?? DEFAULT_SUMMARY_MAX_TOKENS,
      stream: false,
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = (await res.json()) as ChatCompletion;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Empty summary response');
  return content.trim();
}
