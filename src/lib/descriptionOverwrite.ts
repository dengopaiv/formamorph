// What a ✨ drafting button is about to destroy, in words — so a generation that replaces authored text
// has to say so before it runs.
//
// The two description fields generate into each other: player-facing from AI-facing, AI-facing back from
// player-facing. Nothing in that graph is a base, and the two directions are lossy in opposite ways. The
// player-facing prompt deliberately withholds ("secrets, plans, private history… stay out") and the
// AI-facing one deliberately invents ("behavior and relationships the blurb implies"), so a round trip
// deletes what the author wrote and puts plausible substitutes in the field the narrator reads. The button
// did all of that in silence.
//
// The rule encoded here: **generating into an empty field cannot lose anything**, and needs no warning at
// all. Only an overwrite is destructive — and closing the cycle requires one every single time, so warning
// on overwrites alone is enough to make the round trip impossible to walk into blind.
//
// Pure and stateless: the caller owns the dialog, and owns knowing which field is the target.

/**
 * How many sentences `text` holds, for saying how much an overwrite would cost.
 *
 * Sentences rather than words or characters because that is the unit the authoring prompts are already
 * written in — "Write 2 to 4 sentences", "Write 3 to 6 sentences" — so the number reads against what the
 * author asked for. A terminator counts when it ends the text or is followed by whitespace, which keeps
 * "Wait… what?" at two rather than four; text with no terminator at all is one sentence, not none.
 *
 * Knowingly imprecise on abbreviations: "Dr. Smith went home." counts two. The number is there to convey
 * *how much*, and nothing branches on it, so an occasional over-count costs nothing.
 */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const enders = trimmed.match(/[.!?…]+(?=["')\]]*(?:\s|$))/g);
  return enders?.length || 1;
}

/**
 * The warning for replacing `existing` with a fresh draft, or `null` when there is nothing to warn about.
 *
 * `null` is the whole point of the module: an empty target is not a destructive write, so it must not put a
 * dialog in the way of the ordinary first draft. `targetLabel` is the field's own label, so the sentence
 * names the field the author is looking at rather than an internal direction id.
 */
export function overwriteWarning(existing: string | undefined | null, targetLabel: string): string | null {
  const sentences = countSentences(existing ?? '');
  if (sentences === 0) return null;
  const count = `${sentences} ${sentences === 1 ? 'sentence' : 'sentences'}`;
  return `This replaces ${count} of ${targetLabel} with a fresh draft. Undo puts it back.`;
}
