// One-shot, non-streaming description bridging for the world editor's player/AI description buttons.
// Same request shape as `summarize.ts`; the direction picks which description is being written.

/** Which description is being written, and therefore which one is the source. */
export type BridgeDirection = 'playerDesc' | 'aiDesc';

/** The subject the description is about — entities and locations want different facets covered. */
export type BridgeKind = 'character' | 'location';

// Tokens in the (user-editable) bridge prompts that expand to the per-kind wording below. Use the app's
// `<ANGLE>` convention so they render as chips in PromptField (registered in promptVariables as SUBJECT
// and FACETS). `<SUBJECT>` is the same token the image tag prompt uses, expanded for a different job.
export const SUBJECT_TOKEN = '<SUBJECT>';
export const FACETS_TOKEN = '<FACETS>';

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

/**
 * The default, user-editable prompt for each direction. Player-facing text is what the game shows the
 * player, so it stays evocative and keeps the author's private notes out. AI-facing text is reference
 * material the narrator draws on, so it stays plain and factual.
 *
 * Persisted per prompt preset and overridable in Settings → Prompts → Authoring.
 */
export const DEFAULT_PLAYER_DESC_PROMPT =
  `You are the game's writer, turning a private reference note about ${SUBJECT_TOKEN} into the description a player reads. `
  + `Write flowing prose covering ${FACETS_TOKEN}, in the same voice a game would use to introduce ${SUBJECT_TOKEN}. `
  + 'Keep only what a player would learn by looking. Details the note holds back — secrets, plans, '
  + 'private history, author bookkeeping — stay out. '
  + 'Write 2 to 4 sentences, shorter than the note. Open on the description itself, with no title, label or heading above it.';

export const DEFAULT_AI_DESC_PROMPT =
  `You are the game's continuity writer, expanding a player-facing blurb about ${SUBJECT_TOKEN} into the reference `
  + 'the narrator uses. '
  + `Write plain declarative prose covering ${FACETS_TOKEN}, plus behavior and relationships the blurb implies. `
  + 'Stay consistent with every fact the blurb states, and keep additions to what it already suggests. '
  + 'Write 3 to 6 sentences. Open on the description itself, with no title, label or heading above it.';

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

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

// A rewrite that must stay faithful to the source, so it sits low - but both directions are prose the
// author will read, and 0 gives flat, near-identical phrasing on our tiers.
const BRIDGE_TEMPERATURE = 0.6;

/** Room for the longest default direction (`aiDesc`, up to 6 sentences) with slack for a long subject.
 *  User-overridable, since the prompt asking for the length is: a template edited to ask for more than the
 *  cap allows would otherwise truncate mid-sentence with nothing to say why. */
export const DEFAULT_BRIDGE_MAX_TOKENS = 400;

/** The range the per-prompt cap field allows. The floor still fits a sentence or two; the ceiling is well
 *  past any description an author would want, and only bounds a runaway model. */
export const BRIDGE_MAX_TOKENS_MIN = 64;
export const BRIDGE_MAX_TOKENS_MAX = 4096;

/**
 * Rewrite `text` into the other description via the configured chat-completions endpoint. `template` is the
 * author's prompt for this direction (shipped default when absent) and `maxTokens` its output cap. Throws on
 * a non-OK response or an empty/unparseable result; the caller surfaces failures (and ignores `AbortError`).
 */
export async function bridgeDescription(
  text: string,
  direction: BridgeDirection,
  kind: BridgeKind,
  opts: {
    endpointUrl: string;
    apiToken: string;
    modelName: string;
    template?: string;
    maxTokens?: number;
    signal?: AbortSignal;
  },
): Promise<string> {
  const template = opts.template?.trim() || DEFAULT_BRIDGE_PROMPTS[direction];
  const res = await fetch(opts.endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.apiToken ? { Authorization: `Bearer ${opts.apiToken}` } : {}),
    },
    body: JSON.stringify({
      model: opts.modelName,
      messages: [
        { role: 'system', content: composeBridgePrompt(template, kind) },
        { role: 'user', content: text },
      ],
      temperature: BRIDGE_TEMPERATURE,
      max_tokens: opts.maxTokens ?? DEFAULT_BRIDGE_MAX_TOKENS,
      stream: false,
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = (await res.json()) as ChatCompletion;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Empty description response');
  return content.trim();
}
