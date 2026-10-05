// The shipped wording of the World Editor's authoring prompts (✨ drafts, the summary, the 🔍 check), and the
// tokens they expand.
//
// Kept apart from the code that sends them, which used to hold them, so that `GamePrompts` can gather them
// into the preset defaults without importing the request pipeline: that import closed a cycle back through
// the turn pipeline into `GamePrompts`, where a default could be read before it was defined. Nothing here
// imports anything, and nothing should.

// Tokens in the (user-editable) bridge prompts that expand to the per-kind wording below. Use the app's
// `<ANGLE>` convention so they render as chips in PromptField (registered in promptVariables as SUBJECT
// and FACETS). `<SUBJECT>` is the same token the image tag prompt uses, expanded for a different job.
export const SUBJECT_TOKEN = '<SUBJECT>';
export const FACETS_TOKEN = '<FACETS>';

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
 * rather than detectable. The measurement is in `description-consistency-design.md` (in dengopaiv's private model-lab notes) §11.
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
