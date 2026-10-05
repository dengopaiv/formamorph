// One-shot description bridging for the world editor's player/AI description buttons.
// The direction picks which description is being written.

import type { AiSettingsSnapshot } from '@/lib/aiRequest/aiRequestSpec';
import { requestAiText } from '@/lib/aiRequest/aiText';
import {
  SUBJECT_TOKEN, FACETS_TOKEN, DEFAULT_PLAYER_DESC_PROMPT, DEFAULT_AI_DESC_PROMPT,
} from './authoringPromptDefaults';

export { SUBJECT_TOKEN, FACETS_TOKEN, DEFAULT_PLAYER_DESC_PROMPT, DEFAULT_AI_DESC_PROMPT };

/** Which description is being written, and therefore which one is the source. */
export type BridgeDirection = 'playerDesc' | 'aiDesc';

/** The subject the description is about — entities and locations want different facets covered. */
export type BridgeKind = 'character' | 'location';

/** Per-kind noun substituted for `<SUBJECT>` — reads inline mid-sentence ("a note about this place"). */
export const BRIDGE_SUBJECT: Record<BridgeKind, string> = {
  character: 'this character',
  location: 'this place',
};

/** Per-kind facet list substituted for `<FACETS>` — what a description of this kind should cover. */
export const BRIDGE_FACETS: Record<BridgeKind, string> = {
  character: 'appearance, manner, and how they carry themselves',
  location: 'layout, atmosphere, and what stands out on arrival',
};

/** The shipped default per direction, so a caller with no stored template still has one. */
export const DEFAULT_BRIDGE_PROMPTS: Record<BridgeDirection, string> = {
  playerDesc: DEFAULT_PLAYER_DESC_PROMPT,
  aiDesc: DEFAULT_AI_DESC_PROMPT,
};

/** Expand a bridge template's per-kind tokens. Split/join rather than replace: a `$&` in the guidance
 *  would otherwise be read as a replacement pattern. */
export function composeBridgePrompt(template: string, kind: BridgeKind): string {
  return template
    .split(SUBJECT_TOKEN).join(BRIDGE_SUBJECT[kind])
    .split(FACETS_TOKEN).join(BRIDGE_FACETS[kind]);
}

/** The shipped prompt for one direction and kind — the default template, expanded. */
export function bridgePrompt(direction: BridgeDirection, kind: BridgeKind): string {
  return composeBridgePrompt(DEFAULT_BRIDGE_PROMPTS[direction], kind);
}

/** Room for the longest default direction (`aiDesc`, up to 6 sentences) with slack for a long subject.
 *  User-overridable, since the prompt asking for the length is: a template edited to ask for more than the
 *  cap allows would otherwise truncate mid-sentence with nothing to say why. */
export const DEFAULT_BRIDGE_MAX_TOKENS = 400;

/** The range the per-prompt cap field allows. The floor still fits a sentence or two; the ceiling is well
 *  past any description an author would want, and only bounds a runaway model. */
export const BRIDGE_MAX_TOKENS_MIN = 64;
export const BRIDGE_MAX_TOKENS_MAX = 4096;

/**
 * Rewrite `text` into the other description through the request pipeline. `template` is the author's prompt
 * for this direction (shipped default when absent) and `maxTokens` its output cap. Throws on a failed or
 * empty result; the caller surfaces failures (and ignores `AbortError`).
 */
export async function bridgeDescription(
  text: string,
  direction: BridgeDirection,
  kind: BridgeKind,
  opts: { snapshot: AiSettingsSnapshot; template?: string; maxTokens?: number; signal?: AbortSignal },
): Promise<string> {
  const template = opts.template?.trim() || DEFAULT_BRIDGE_PROMPTS[direction];
  return requestAiText(opts.snapshot, {
    systemPrompt: composeBridgePrompt(template, kind),
    messages: [{ role: 'user', content: text }],
    requestType: 'descriptionBridge',
    maxTokensOverride: opts.maxTokens ?? DEFAULT_BRIDGE_MAX_TOKENS,
  }, { signal: opts.signal });
}
