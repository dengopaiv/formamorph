// Reading an entity's or location's two descriptions against each other and reporting where they disagree.
//
// This is the *check* half of the description-consistency work, and deliberately the first half: it writes
// nothing. The ✨ buttons draft one description from the other and overwrite in place, and because the two
// directions are lossy in opposite ways — player-facing withholds, AI-facing invents — a round trip quietly
// swaps authored facts for plausible substitutes. A pass that only reports can never do that, needs no new
// world data, and is worth running on a small local model, which is where this app mostly lives.
//
// Same request shape as `bridgeDescription`/`summarize`, and the same editable-template contract.

import { SUBJECT_TOKEN, BRIDGE_SUBJECT, type BridgeKind } from './bridgeDescription';

/**
 * The default, user-editable prompt. Written to report and nothing else: a model asked to "check" a
 * description will otherwise volunteer a rewrite, which is exactly the silent overwrite this pass exists
 * to avoid.
 *
 * The third bullet is the round trip's own signature. An AI-facing description that says no more than the
 * player-facing one is the shape a laundered reference note has — the secrets were stripped on the way out
 * and never came back — and it is the one finding an author cannot spot by reading either text alone.
 *
 * Persisted per prompt preset and overridable in Settings → Prompts → Authoring.
 */
export const DEFAULT_DESC_CHECK_PROMPT =
  `You are the game's continuity editor, reading two descriptions of ${SUBJECT_TOKEN} that have to agree. `
  + 'The player-facing description is what the game shows a player. The AI-facing description is the private '
  + 'reference the narrator reads: it holds everything the player-facing one holds, and more that the player '
  + 'cannot see.\n\n'
  + 'Report only real disagreements:\n'
  + '- A fact one states and the other contradicts.\n'
  + '- Something the player-facing description asserts that the AI-facing one does not account for.\n'
  + '- Detail the AI-facing description ought to hold and does not. If it says no more than the player-facing '
  + 'one, say so: that is what a reference note looks like after it has been overwritten from the blurb.\n\n'
  + 'Write one finding per line, each naming both sides. Do not rewrite either description, do not suggest '
  + 'wording, and do not remark on style. If the two agree, reply with the single word NONE.';

/** Room for a handful of findings. Short by design: this pass reports, and a report that runs long is a
 *  rewrite wearing a list's clothes. User-overridable like the other authoring caps. */
export const DEFAULT_CHECK_MAX_TOKENS = 300;

/** The range the per-prompt cap field allows. The floor still fits two or three findings; the ceiling is
 *  past any report an author would read, and only bounds a model that has started rewriting. */
export const CHECK_MAX_TOKENS_MIN = 64;
export const CHECK_MAX_TOKENS_MAX = 2048;

// An analytic read, not prose — low enough to be repeatable across runs, above 0 because our tiers give
// degenerate output there.
const CHECK_TEMPERATURE = 0.2;

/** Expand the check template's `<SUBJECT>` for the kind being read. Split/join rather than replace, so a
 *  `$&` in the author's wording is not read as a replacement pattern (same reason as `composeBridgePrompt`). */
export function composeCheckPrompt(template: string, kind: BridgeKind): string {
  return template.split(SUBJECT_TOKEN).join(BRIDGE_SUBJECT[kind]);
}

/** The user message: both descriptions under headings, so the model can name which side a finding is on.
 *  Labelled with the field names the author sees in the editor, not the internal direction ids. */
export function buildCheckMessage(playerText: string, aiText: string): string {
  return `Player-Facing Description:\n${playerText.trim()}\n\nAI-Facing Description:\n${aiText.trim()}`;
}

/** A lone "NONE" — the agreed-clean answer. Tolerates the trailing punctuation and casing small models add. */
const NONE_ANSWER = /^none[.!]?$/i;

/**
 * The findings in a raw response, one per line.
 *
 * Lenient on purpose: small models number their lists, bullet them, or wrap them in a preamble, and none of
 * that changes what was found. Leading bullets and numbering are stripped, blank lines dropped, and a
 * response that is only "NONE" becomes the empty list — as does a stray NONE line among findings, which is
 * a model hedging rather than a finding.
 */
export function parseFindings(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed || NONE_ANSWER.test(trimmed)) return [];
  return trimmed
    .split('\n')
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line && !NONE_ANSWER.test(line));
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/**
 * Read the two descriptions against each other and return the findings, newest request wins via `signal`.
 * An empty array means they agree — which is a real result, not a failure, and the caller must say so
 * rather than showing nothing. Throws on a non-OK response; an empty completion is treated as agreement,
 * since a model with nothing to report is the case this pass is quietest about.
 */
export async function checkDescriptions(
  playerText: string,
  aiText: string,
  kind: BridgeKind,
  opts: {
    endpointUrl: string;
    apiToken: string;
    modelName: string;
    template?: string;
    maxTokens?: number;
    signal?: AbortSignal;
  },
): Promise<string[]> {
  const template = opts.template?.trim() || DEFAULT_DESC_CHECK_PROMPT;
  const res = await fetch(opts.endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.apiToken ? { Authorization: `Bearer ${opts.apiToken}` } : {}),
    },
    body: JSON.stringify({
      model: opts.modelName,
      messages: [
        { role: 'system', content: composeCheckPrompt(template, kind) },
        { role: 'user', content: buildCheckMessage(playerText, aiText) },
      ],
      temperature: CHECK_TEMPERATURE,
      max_tokens: opts.maxTokens ?? DEFAULT_CHECK_MAX_TOKENS,
      stream: false,
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = (await res.json()) as ChatCompletion;
  const content = json?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? parseFindings(content) : [];
}
