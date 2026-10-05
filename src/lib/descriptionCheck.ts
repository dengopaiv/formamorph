// Reading an entity's or location's two descriptions against each other and reporting where they disagree.
//
// This is the *check* half of the description-consistency work, and deliberately the first half: it writes
// nothing. The ✨ buttons draft one description from the other and overwrite in place, and because the two
// directions are lossy in opposite ways — player-facing withholds, AI-facing invents — a round trip quietly
// swaps authored facts for plausible substitutes. A pass that only reports can never do that, needs no new
// world data, and is worth running on a small local model, which is where this app mostly lives.
//
// Sent through the request pipeline like `bridgeDescription`/`summarize`, as its own editor request kind
// (`descriptionCheck`), and with the same editable-template contract.

import { SUBJECT_TOKEN, BRIDGE_SUBJECT, type BridgeKind } from './bridgeDescription';
import { DEFAULT_DESC_CHECK_PROMPT } from './authoringPromptDefaults';
import type { AiSettingsSnapshot } from '@/lib/aiRequest/aiRequestSpec';
import type { AiStreamResult } from '@/lib/aiRequest/aiStream';
import { requestAiText } from '@/lib/aiRequest/aiText';
import { stripReasoning } from '@/lib/aiResponse';

export { DEFAULT_DESC_CHECK_PROMPT };

/** Room for a handful of findings. Short by design: this pass reports, and a report that runs long is a
 *  rewrite wearing a list's clothes. User-overridable like the other authoring caps. */
export const DEFAULT_CHECK_MAX_TOKENS = 300;

/** The range the per-prompt cap field allows. The floor still fits two or three findings; the ceiling is
 *  past any report an author would read, and only bounds a model that has started rewriting. */
export const CHECK_MAX_TOKENS_MIN = 64;
export const CHECK_MAX_TOKENS_MAX = 2048;

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
 * A verdict on one item of a checklist, in the ways models word them.
 *
 * `PASS` has to be tested against `NEG_ACCOUNT` before it is believed, because *"does not account for this"*
 * contains *"account for this"*. Order matters and is the only subtle thing here.
 *
 * `FAIL` ends in a bare `not` deliberately — a verdict that says nothing else recognisable but does say
 * "not" is a failure often enough to keep, and an item is only ever *dropped* on an explicit pass, so a
 * misread here costs a noisy line rather than a lost finding.
 */
const PASS_VERDICT = /\b(?:accounts?|accounted)\s+for\s+(?:this|it)\b|\bis accounted for\b/i;
const NEG_ACCOUNT = /\b(?:not|never|fails? to|doesn'?t|does not)\s+(?:\w+\s+){0,2}account/i;
const NOT_A_PROBLEM = /\bnot (?:a )?(?:contradict\w*|conflict\w*|disagree\w*|issue|problem|finding)/i;
const FAIL_VERDICT = /\b(?:does not|doesn'?t|never|fails? to|no mention|missing|absent|omit\w*|contradict\w*|conflict\w*|not)\b/i;

/**
 * A checklist answer, or `null` when the response is not one.
 *
 * A model asked to work through a numbered list answers in pairs — the item, then its verdict on the line
 * below:
 *
 *     6. curt with strangers, slow to warm
 *     The description accounts for this.
 *
 *     7. SECRET: takes bribes from the night barges
 *     The description does not account for this.
 *
 * Read one line at a time that is nine findings, six of which say nothing is wrong. It is the reason this
 * function exists: on a 24B finetune the format is what made the model do the work at all — it stopped
 * pasting the input back and started reaching every planted fault — and measured line by line the same
 * output would have put **eight times** as many lines in this dialog as the model actually reported. The
 * measurement is in `description-consistency-design.md` (in dengopaiv's private model-lab notes) §14.
 *
 * Deliberately conservative in three ways, because a parser that guesses wrong here hides a real fault:
 * it needs at least two numbered items carrying verdict text *and* one verdict it can actually read, so a
 * free-text finding that merely wrapped onto a second line is not mistaken for a checklist; an item is
 * dropped only on an explicit pass; and anything it cannot classify is kept.
 */
function parseVerdictReport(raw: string): string[] | null {
  const items: { head: string; verdict: string[] }[] = [];
  let cur: { head: string; verdict: string[] } | null = null;
  for (const line of raw.split('\n').map((l) => l.trim())) {
    const m = /^\d{1,2}[.)]\s*(.*)$/.exec(line);
    if (m) {
      if (cur) items.push(cur);
      cur = { head: m[1], verdict: [] };
    } else if (cur && line) cur.verdict.push(line);
  }
  if (cur) items.push(cur);

  const withVerdict = items.filter((i) => i.verdict.length);
  if (withVerdict.length < 2) return null;
  const readable = withVerdict.some((i) => {
    const v = i.verdict.join(' ');
    return (PASS_VERDICT.test(v) && !NEG_ACCOUNT.test(v)) || FAIL_VERDICT.test(v);
  });
  if (!readable) return null;

  const findings: string[] = [];
  for (const item of items) {
    const verdict = item.verdict.join(' ');
    if (!verdict) continue;
    if ((PASS_VERDICT.test(verdict) && !NEG_ACCOUNT.test(verdict)) || NOT_A_PROBLEM.test(verdict)) continue;
    findings.push(item.head ? `${item.head} — ${verdict}` : verdict);
  }
  return findings;
}

/**
 * The findings in a raw response, one per line.
 *
 * Lenient on purpose: small models number their lists, bullet them, or wrap them in a preamble, and none of
 * that changes what was found. Leading bullets and numbering are stripped, blank lines dropped, and a
 * response that is only "NONE" becomes the empty list — as does a stray NONE line among findings, which is
 * a model hedging rather than a finding.
 *
 * A checklist answer is collapsed to its failing items first (see `parseVerdictReport`), because line-by-line
 * that format reads as a finding per item whether or not the item is at fault.
 */
export function parseFindings(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed || NONE_ANSWER.test(trimmed)) return [];
  const verdicts = parseVerdictReport(trimmed);
  if (verdicts) return verdicts.filter((line) => line && !NONE_ANSWER.test(line));
  return trimmed
    .split('\n')
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line && !NONE_ANSWER.test(line));
}

/**
 * Read the two descriptions against each other and return the findings, newest request wins via `signal`.
 * An empty array means they agree — which is a real result, not a failure, and the caller must say so
 * rather than showing nothing. Throws on a failed request. An empty answer is agreement only when the model
 * finished on its own: one cut off at the cap said nothing because it ran out, and reading that as "they
 * agree" would tell the author the one thing the check cannot know.
 */
export async function checkDescriptions(
  playerText: string,
  aiText: string,
  kind: BridgeKind,
  opts: { snapshot: AiSettingsSnapshot; template?: string; maxTokens?: number; signal?: AbortSignal },
): Promise<string[]> {
  const template = opts.template?.trim() || DEFAULT_DESC_CHECK_PROMPT;
  let result: AiStreamResult | undefined;
  try {
    return parseFindings(await requestAiText(opts.snapshot, {
      systemPrompt: composeCheckPrompt(template, kind),
      messages: [{ role: 'user', content: buildCheckMessage(playerText, aiText) }],
      requestType: 'descriptionCheck',
      maxTokensOverride: opts.maxTokens ?? DEFAULT_CHECK_MAX_TOKENS,
    }, { signal: opts.signal, observe: (_spec, done) => { result = done; } }));
  } catch (error) {
    if (result?.finishReason === 'stop' && !stripReasoning(result.content ?? '').trim()) return [];
    throw error;
  }
}
