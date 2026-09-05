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
 * It asked after the round trip too, once — an AI-facing description that says no more than the
 * player-facing one is the shape a laundered reference note has. That bullet is gone, and it was removed on
 * evidence rather than taste. Across five models from 24B to frontier, four wordings of it and roughly 1,400
 * probe calls, the finding was named in one run out of ninety-six, while every rewrite moved a single dial —
 * how much the model says — with true and false positives rising and falling together. Asking a model to
 * notice that something private is *absent* does not work, and asking cost output tokens on every call for a
 * finding that never arrived. `lib/authorBrief` answers it instead, by making the round trip unrepresentable
 * rather than detectable. The measurement is in `snowpanther's notes/description-consistency-design.md` §11.
 *
 * What remains is the half that does work: contradictions were found in 100% of runs on every model tested.
 *
 * The omission bullet carries the round-trip bullet's framing, and that is deliberate. Cutting the third
 * bullet cost omission detection on both models measured — flash 100% → 75%, cydonia 74% → 58% — because
 * *"detail the AI-facing description ought to hold and does not"* was a second framing of the omission
 * question and had been priming it. Folding the note-side framing into the bullet that remains bought it
 * back without asking for the finding that never arrives: flash 75% → 88%, cydonia 52% → 78% on the same
 * fixtures and seeds, pooled 30/47 → 39/47 (Fisher p = 0.03), with the clean arm unmoved. Shortening this
 * bullet to its first sentence is not a tidy-up; it is the change that was measured and cost 20 points.
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
  + '- A fact the player-facing description states that the AI-facing one never accounts for. The '
  + "AI-facing description is the narrator's only reference, so a fact the player is shown and it does "
  + 'not hold is a fact the narrator cannot use. Name that fact.\n\n'
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
 * measurement is in `snowpanther's notes/description-consistency-design.md` §14.
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
