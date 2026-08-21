# Description consistency — design memo

> **Status: not built.** Filed 2026-08-21 from a design conversation, so the analysis survives the branch
> it was thought up on. Nothing here is started; the working tree at filing time carries the *editable
> authoring prompts* work, which is this memo's prerequisite, not its beginning.

**Problem.** The World Editor's ✨ drafting buttons write a description from one field and nothing else.
They cannot see the world's dictionary entries or its locations, so a drafted description can contradict
the lore the narrator will later be handed. The author only finds out mid-play, and the contradiction is
usually a detail neither text flagged — a place described as ruined that an entry says was rebuilt.

**Fix, in one line.** Select the *few* lore entries a draft actually touches, using the activation
machinery that already exists, and let the author's own prompt decide what to do with them. Nothing gets
run through the shredder: the selector is the same one a turn uses, pointed at the draft text instead of
at a player action.

---

## 1. Where the gap is

`bridgeDescription` sends exactly two strings — the expanded template as system, the field's text as user
([bridgeDescription.ts:96](src/lib/bridgeDescription.ts:96)). Nothing else reaches the model.

That is deliberate and written down: `PROMPT_KIND_VARIABLES`
([promptVariables.ts:205](src/lib/promptVariables.ts:205)) gives `playerdesc`/`aidesc` only `SUBJECT` and
`FACETS`, because the runtime chips "would have nothing to resolve against" in the editor.

**Half of that reasoning is now stale.** There is no *turn* in the editor, so `<ENTITIES scope=here>`,
`<STATS>`, `<NOTES>` and `<TIME>` genuinely have nothing to bind to. But the world's dictionary books, its
locations and its world description are all in `GameDataContext` — `LocationManager.tsx:19` already pulls
from it three lines above the ✨ button. Those are resolvable at authoring time. The blanket exclusion is
what costs us, not the rule behind it.

## 2. The selector already exists, twice

Neither of these needs a turn. Both are pure over `entries × text`.

| | Module | What it gives |
|---|---|---|
| Keyword | `explainActivation` ([dictionaryUtils.ts:226](src/lib/dictionaryUtils.ts:226)) | Takes arbitrary named `ScanSource` regions. Hand it the draft as the scene corpus and it reports which entries fire, with hits attributed. |
| Semantic | `selectSemanticLore` ([semanticDictionary.ts](src/lib/semanticDictionary.ts)) | Meaning-based, threshold 0.39, capped at 3 — already tuned by `semantic-lore-probe.mjs` against Vane Hollow. |

Keyword-only is the no-dependency first cut (no embedding endpoint needed in the editor). Semantic is a
pure add-on afterwards, since `entryVectorKey`/`selectSemanticLore` hold no state.

Scan the **world's enabled books only** (`flattenEnabledBookEntries`). Library books are a play-time
selection ([dictionarySelection.ts](src/lib/dictionarySelection.ts)) and have no meaning while authoring.

Region label: something like `authoring:source`. The scan rule in
[dictionaryScan.ts](src/lib/dictionaryScan.ts) — *if the AI is given the text, the text can fire a
trigger* — holds cleanly here, because the source text is exactly what is given.

## 3. Two features, kept apart

**A. Grounding.** Inject the selected lore (and, for a location, its parent) into the generation, so the
draft is consistent by construction. Smallest version:

1. A `<DICTIONARY|relevant>` chip whose scope is "entries the source text activates", plus
   `<LOCATION|parent>` for the location editor.
2. Add both to `playerdesc`/`aidesc` in `PROMPT_KIND_VARIABLES`.
3. Plumb an author-context object through `AiGenerateButton` → `bridgeDescription`.

The author's template decides whether the check happens and how strict it is — which is how every other
prompt here works, and it means the shipped defaults stay byte-identical for anyone who does not want it.

**B. Checking.** A read-only pass that *reports* contradictions without touching the text — "the
description says the beacon is ruined; the Old Beacon entry says it was rebuilt". New prompt kind, new
mode on the button, and somewhere to put the output.

**Order: A first**, because once the relevant context is selected and plumbed, B is largely a different
prompt over the same payload. But B is the more valuable half for this author: it produces something
readable and actionable rather than a silent rewrite that has to be diffed by ear.

## 4. Three things that will bite

1. **`playerDesc` is not symmetric with `aiDesc`.** The player-facing template's whole job is keeping
   private material out — "secrets, plans, private history"
   ([bridgeDescription.ts:38](src/lib/bridgeDescription.ts:38)). Grounding *that* direction hands the model
   more secret material and asks it to be disciplined. Ground `aiDesc` first; playerDesc grounding is
   opt-in and should say out loud what it is doing.
2. **Small models will copy injected lore into the description.** `lore-noise-probe.mjs` measured 11%
   uptake on Cydonia 24B for a *wrong* entry and 75% for correct on-topic lore. At runtime that is the
   feature working; here it is a failure — a three-sentence blurb that has swallowed a lore entry verbatim
   is worse than one that never saw it. Argues for **B over A** on local hardware.
3. **`EntityFields` is shared with the library editor**, which has no world at all — that is why
   `placeholders` and `locationOptions` are optional props ([EntityFields.tsx:20](src/managers/EntityFields.tsx:20)).
   Any world context must degrade to "no context, behave exactly as today".

## 5. Accessibility bar (for B)

A check pass that reports findings needs a surface. A toast is the wrong one: it cannot be re-read, and
it steals nothing to focus. Findings want a region that can be reached and re-read after the fact, named
counts rather than colour, and each finding naming the entry it came from so the author can open it.

## 6. Done bar

- Keyword selection over the draft returns the same entries a turn would, asserted against a fixture world.
- Default templates unchanged byte-for-byte; grounding only happens when the author places the chip.
- The library editor (no world) generates exactly as it does today.
- Nothing in the turn pipeline changes — `PROMPT_KIND_VARIABLES`'s turn-kind invariant test still holds.
