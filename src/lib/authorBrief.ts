// The author's brief: the one field in the description graph that nothing ever generates into.
//
// `playerDescription` and `aiDescription` can each be drafted from the other, which means neither is a base
// — run the two buttons in turn and the player-facing prompt strips the secrets on the way out while the
// AI-facing prompt invents replacements on the way back, in the field the narrator actually reads, in prose
// indistinguishable from the author's own. There was no field in that graph a thought could be put into and
// still be there afterwards.
//
// Detecting that after the fact was tried first and does not work. Across five models from 24B to frontier,
// four prompt variants and roughly 1,400 calls, a laundered description was named in one run out of
// ninety-six; the full measurement is in `snowpanther's notes/description-consistency-design.md` §11. A model
// cannot reliably notice that something private is *absent*.
//
// A field that is only ever a source removes the question. The graph becomes a star — brief to player-facing,
// brief to AI-facing, independently — so either description can be regenerated any number of times without
// touching the other, and the round trip stops being something to warn about and becomes something that
// cannot be expressed. `aiSummary` stays a leaf off `aiDescription`, as it already was.
//
// **The invariant this rests on: no generator writes to `authorBrief`.** There is no ✨ button on it and
// there must never be one. The moment anything drafts into it, it stops being a root and the cycle is back.

/** Whether a brief holds anything. Whitespace is not a brief — the same emptiness rule the overwrite
 *  warning uses, so "has the author written here?" answers the same way everywhere. */
export function hasBrief(brief: string | undefined | null): boolean {
  return !!brief?.trim();
}

/**
 * What a drafting button reads for its source: the author's brief when there is one, and otherwise the
 * other description exactly as before the brief existed.
 *
 * That fallback is the whole migration story. A world written before this field has no brief, so every
 * button behaves as it always did and nothing needs converting; a world where the author fills the brief in
 * is rooted from that moment on, per subject, with no setting to find and no mode to be in.
 */
export function draftSource(
  brief: string | undefined | null,
  fallback: string | undefined | null,
): string {
  return (hasBrief(brief) ? brief : fallback)?.trim() ?? '';
}
