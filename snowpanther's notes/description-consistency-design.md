# Description consistency — design memo

> **Status: version zero built and measured — and the measurements say the prompt is wrong.** Filed
> 2026-08-21 from a design conversation and rewritten the same day; version zero shipped 2026-08-22 as
> `ba321a5`, and was put in front of five models the same day. Two of its three findings work. The third —
> the round trip, §1, the reason this document exists — was detected in **1 of 96 runs** across models from
> 24B to frontier, and the clean-pair false-positive rate ran from 37% to 100%. §7's staging still holds;
> §10's done bar does not, and is rewritten at the end. Read §1, §7 and §11 first if you are picking this
> up cold.

**Problem.** The World Editor's ✨ drafting buttons write a description from one other field and nothing
else. Two consequences, and the second is worse than the first:

1. A drafted description can contradict the dictionary entries, locations and characters the narrator will
   later be handed. The author finds out mid-play.
2. **The two description fields generate into each other, so there is no base.** Round-tripping them
   deletes authored facts and substitutes invented ones. This is shipped behaviour today.

---

## 1. The cycle

At the call sites ([EntityFields.tsx:58](src/managers/EntityFields.tsx:58), same shape in
[LocationManager.tsx](src/managers/LocationManager.tsx)):

```
aiDescription  <->  playerDescription  ->  aiSummary
```

Two nodes, both edges one click, target overwritten in place through `onChange`. `aiSummary` is the only
honest edge in the graph — strictly derived, nothing generates back into its source. It is a leaf, which is
proof the right shape is achievable; the other two simply do not have it.

**The cycle is not a loop, it is a shredder.** The two directions are instructed to do opposite things:

- `playerDesc` — *"Keep only what a player would learn by looking. Details the note holds back — secrets,
  plans, private history, author bookkeeping — stay out."*
  ([bridgeDescription.ts:38](src/lib/bridgeDescription.ts:38)). Deliberately, correctly lossy.
- `aiDesc` — *"plus behavior and relationships the blurb implies… keep additions to what it already
  suggests."* Deliberately generative.

So a round trip **deletes the secrets, then invents replacements consistent with what is left**. Not drift
— substitution. The invented material is plausible, specific, and indistinguishable from authored text,
sitting in the field the narrator reads.

Then it propagates: `aiSummary` draws from `aiDescription`, and the `summary` content variant is what many
runtime prompts actually send. Launder the AI-facing description once and the corruption is downstream in
what the model sees every turn.

**There is no base because the graph has no root — but the information has one.** `aiDesc` is a superset of
`playerDesc` by construction. The base exists; the UI does not know it.

### The fix is a rule about emptiness, not a schema

Every destructive case is an **overwrite**. Generating into an empty field cannot lose anything, and
knowing that needs no provenance, no tracking, no new world data.

- `playerDesc -> aiDesc` is legitimate as a **seed** for an empty AI-facing field, and never as a
  **regeneration** of a populated one. Same in reverse.
- The button does not need disabling. It needs to stop being silent: *"This will replace 4 sentences of
  AI-facing description."* Undo already exists underneath it.

That alone breaks the cycle, because closing it requires overwriting a populated field every single time.

Provenance is the nicer version and also needs no schema: **session-only** marking of "this field was
drafted, not typed" catches the round trip in the sitting where people actually do it — filling a world in
for the first time. Persisting it across sessions is a separate, larger argument.

**This is upstream's bug, not ours.** The buttons shipped this way; `0d528de` only made their prompts
editable. Worth raising with Jake independently of everything below — an overwrite warning is a far easier
sell than a detection window.

## 2. Three detectors, all of which already exist

None needs a turn. All are pure over `(text, world data)`.

| | Module | What it finds |
|---|---|---|
| **Names** | [entityMatch.ts](src/lib/entityMatch.ts) | Locations, characters and their **aliases** named in the draft. Not a substring search: proper-noun guard, singular/plural folding through `matchKey`, whole-name and distinctive-word matching, aliases under a stricter case rule. Reports `MatchVia` (name / partial / alias) with `TextSpan` evidence per hit. Built for the turn parser's presence detection — point it at a draft instead of at narration. |
| **Keyword lore** | `explainActivation` ([dictionaryUtils.ts:226](src/lib/dictionaryUtils.ts:226)) | Takes arbitrary named `ScanSource` regions, so it reads a draft as happily as a turn. Reports which entries fire and why. |
| **Semantic lore** | `selectSemanticLore` ([semanticDictionary.ts](src/lib/semanticDictionary.ts)) | Meaning-based, threshold 0.39, capped at 3. Tuned by `semantic-lore-probe.mjs` against Vane Hollow. Needs an embedding endpoint, so it is the last one to add, not the first. |

**Names is the most valuable of the three**, and it was missing from the first draft of this memo. What a
description most often contradicts is not a dictionary entry — it is another location or character that has
a name.

Scan the **world's enabled books only** (`flattenEnabledBookEntries`). Library books are a play-time
selection ([dictionarySelection.ts](src/lib/dictionarySelection.ts)) and mean nothing while authoring.

Region label for the lore scan: `authoring:source`. The rule in
[dictionaryScan.ts](src/lib/dictionaryScan.ts) — *if the AI is given the text, the text can fire a trigger*
— holds cleanly, because the source text is exactly what is given.

## 3. Detector, not marker

An author-placed marker (a string in the world JSON saying "this references entry X") was considered and
rejected. It is bookkeeping that rots: rename an entry and it dangles; write a new sentence and nothing
marks it; and it demands attention at exactly the moment the author is least thinking about
cross-references.

The detector reads what is actually written, every time — and, decisively, **it is the same rule the
narrator will fire on at play time**. What the window shows is what the model will see in the scene. A
marker cannot promise that.

**The marker's kernel survives as pin and mute.** The detector will miss something the author knows
matters, and surface something they know does not. Pin forces an undetected entry in; mute keeps one out
without unticking it every time.

Where those live is the one real schema question:

- **Ephemeral** (this invocation only) — no world-data change at all.
- **Stored per item** — a new field that must travel through export, import and the share format.

**Ship ephemeral.** Let the friction prove whether pinning is worth schema.

## 4. The window is the feature, not the ✨ button

Today the button is one click and opaque: text out, text back, diff it by ear. A **draft -> detect ->
review -> act** dialog fixes three problems at once:

1. The author sees what is about to be injected, so a small model eating a lore entry verbatim stops being
   a surprise (see §8.2).
2. Grounding and checking stop being two features. Same window, same detected set, two buttons: *write it
   using these*, and *check it against these*.
3. It is navigable. A one-click button that silently consults hidden context is the worst possible shape
   for a screen reader; a dialog with a labelled checkbox group and a findings region is close to the best.

### Chips and checkboxes are different jobs

- **The prompt template decides what *kinds* of context this prompt may use** — `<LOCATION|ancestors.name>`
  says "this prompt wants the containing chain, by name". Preset-level policy, set once.
- **The window decides which *instances* are used this time** — the checkbox beside *Second Floor* says
  "not this one, this classroom is a weird annex". Invocation-level exception.

This also means the chip carries the token-budget decision and the checkbox never has to.

## 5. Location scope — existing machinery, one gap

The runtime already has the scopes this needs, with a Full / Summary / Name content axis and
`contextDelivery` ([locationContext.ts:23](src/lib/locationContext.ts:23)) behind them: Current, Sub,
Parent, Reachable, Destinations. Connections are already modelled in `navigableDestinations`
([locationContext.ts:281](src/lib/locationContext.ts:281)).

**The gap is the ancestor chain.** `parent` is single-level only
([buildParentLocationContext](src/lib/locationContext.ts:327)); there is no walk to the root anywhere in
`src/lib/`. A classroom wants *Hallway -> Second Floor -> Northgate School*, and that chain is the piece
that has to be written.

## 6. The chain wants names, not descriptions

The single most important defaults decision in this design.

Take the classroom literally: three ancestors, five connected rooms, three lore hits. As full descriptions
that is roughly 350 tokens of ancestors, 600 of connections and 240 of lore — about **1,200 tokens of
context wrapped around a request for three sentences**, on a model where instruction-following is the
scarce resource.

As names: *"inside Hallway, inside Second Floor, inside Northgate School"* — about **fifteen tokens**, and
it buys nearly all of the coherence. The model does not need the Second Floor's prose to avoid writing a
sea view into a room three floors up; it needs to know the room is indoors, upstairs, in a school.

So the defaults are **asymmetric, not uniform**:

| Context | Default delivery |
|---|---|
| The subject itself | Full |
| Ancestors | **Name only** |
| Connections / siblings | Name + summary |
| Lore entries | Full — they are short, and they are the point |

The Full/Summary/Name axis already exists per chip, so this is a defaults decision, not new code.

## 7. Staging — build them in this order

**Version zero — check the two descriptions against each other.** No dictionary, no location scope, no
ancestor walk, no detector, no schema. Two fields, one model call, a report: does the player-facing text
assert anything the AI-facing text contradicts, and does the AI-facing text still hold the secrets it is
supposed to be holding, or did a round trip launder them out? This targets the failure in §1, which is the
one actively destroying authored work today. Pair it with the overwrite warning, which is smaller still.

**Version one — the window, check only.** Draft, detect across names + keyword lore, list what was found
with its evidence, report contradictions, **change nothing**. Cannot damage a description, needs no schema,
and is worth using on a 12B.

**Later, in rough order of appetite:** grounding (inject the checked set into the generation), the semantic
pass, pin/mute, persisted provenance, stored per-item context preferences.

Note the direction of travel: every round of design has made version one *smaller*. Resist the urge to
start at grounding — it is the part that can damage text, and the part a small model handles worst.

## 8. Things that will bite

1. **`playerDesc` is not symmetric with `aiDesc`.** The player-facing template's whole job is withholding.
   Grounding *that* direction hands the model more secret material and asks it to be disciplined. Ground
   `aiDesc` first; playerDesc grounding is opt-in and should say out loud what it is doing.
2. **Small models copy injected lore into the prose.** `lore-noise-probe.mjs` measured 11% uptake on
   Cydonia 24B for a *wrong* entry and 75% for correct on-topic lore. At runtime that is the feature
   working; here it is a defect — a three-sentence blurb that has swallowed a lore entry verbatim is worse
   than one that never saw it. Another argument for checking before grounding.
3. **`EntityFields` is shared with the library editor**, which has no world at all — that is why
   `placeholders` and `locationOptions` are optional props
   ([EntityFields.tsx:20](src/managers/EntityFields.tsx:20)). Any world context must degrade to "no
   context, behave exactly as today".
4. **Telephone between items.** Generate the classroom from the hallway, later regenerate the hallway from
   the classroom, and a drift has been laundered through two models. The window should show which sources
   are themselves drafts, so a weaker source looks weaker.
5. **Half-built worlds, which is every world during authoring.** Most connected locations will have no
   description yet. Show them as present-but-empty **with the reason**, rather than silently omitting them
   — and put the reason in the accessible name, not in a grey.

## 9. Accessibility bar

The lens this whole feature is designed through, not a later pass.

- A toast is the wrong surface for findings: it cannot be re-read and it takes no focus. Findings want a
  region that can be reached and re-read after the fact.
- Named counts, never colour alone — "3 contradictions, 2 unresolved names".
- Every finding names the entry or location it came from, so the author can open it.
- When the draft is edited and re-detected, **what changed must be announced** — the checkbox list is a
  live thing, and a silently different list is the same failure the silent arrows were.
- The checkbox group needs grouping and per-group select-all: a location with eight connections, four
  ancestors and six lore hits is eighteen tab stops otherwise.

## 10. Done bar

- Version zero reports a contradiction planted between the two descriptions of a fixture entity, and stays
  silent on a consistent pair.
- Generating into a populated field states what it will replace; generating into an empty one does not.
- Keyword selection over a draft returns the same entries a turn would, asserted against a fixture world.
- Default templates unchanged byte-for-byte; grounding happens only when the author places the chip.
- The library editor (no world) generates exactly as it does today.
- Nothing in the turn pipeline changes — `PROMPT_KIND_VARIABLES`'s turn-kind invariant test still holds.

## 11. What five models actually did (2026-08-22)

Version zero was run against `testing/baseline/harness/desccheck-probe.mjs`: four subjects, four arms each
— the pair as authored (want silence), a planted contradiction, a planted omission, and a note laundered
down to the blurb's content. Roughly 800 calls.

| Model | clean | contradiction | omission | roundtrip |
|---|---|---|---|---|
| deepseek-v4-pro | 34% | 100% | 100% | **0%** |
| deepseek-v4-flash | 16% | 100% | 88% | **0%** |
| mistral-small-2603 | 63% | 75% | 22% | **0%** |
| cydonia-24b-v4.1 *(RP tune)* | **0%** | 100% | 44% | **0%** |
| euryale-70b *(RP tune)* | 14% | 100% | 61% | **0%** |

`clean` is the share of runs that correctly reported nothing; the rest, the share that found the plant.

**Three things this settles.**

**The round trip is undetected everywhere.** Not weakly detected — 1 genuine finding in 96 runs, including
at the ceiling. §1 calls this the failure the feature exists for, and version zero does not catch it. An
earlier reading of 28% was the probe's own regex matching *"not a contradiction — the AI-facing is allowed
to hold more"*, which is a model saying the opposite of the finding; the metric was fixed in `990d57f` and
the completions re-scored.

**The false positives are a contract bug, not invention.** All 21 of deepseek-v4-pro's clean-arm findings
were it narrating agreement fact by fact — *"no disagreement, just more detail"* — which `parseFindings`
keeps, because it keeps everything that is not literally NONE. The prompt says *write one finding per line*
and never says *do not write a line for what agrees*. mistral-small is the mirror image: 41 clean-arm
findings, none of them narration, all genuine invention. Same column, different bug.

**Neither size nor tune type predicts failure.** The working hypothesis was that roleplay finetunes would
fail where instruct models passed. They do not: Cydonia and Euryale both detect contradictions at 100%,
exactly like the instruct arms. Every model fails the same two arms. It is the prompt.

The one real outlier is **Rocinante-XL-16B-v1a-Q6_K under koboldcpp locally**, which answered NONE to all
24 planted disagreements at exactly 3 tokens each while formatting perfectly on the two clean pairs it
spoke to. No hosted arm reproduced that. Unexplained — suspect the quant, the build or the chat template
before concluding anything about the model.

### The done bar in §10 is wrong

Its first line — *"reports a contradiction planted between the two descriptions of a fixture entity, and
stays silent on a consistent pair"* — treats those as one bar. They are not: contradictions pass
everywhere and silence fails everywhere. Replace it with three, each measured by the probe rather than
judged by eye:

- A planted contradiction is found in at least 7 of 8 runs. **Met today.**
- A clean pair is reported silent in at least 7 of 8 runs. **Best measured: 63%.**
- A laundered note is named in at least 5 of 8 runs. **Best measured: 3%.**

Until the second and third hold on a model an author would plausibly run, the 🔍 button shows invented or
narrated findings on most subjects and never catches the thing it was built for.

### The prompt was rewritten three times and it is a volume knob

`v2a` named the asymmetry as never-a-finding and forbade agreement lines. `v2b` asked the round trip as
its own step about one description alone. `v3` named the missing thing as *secrets, motives, plans,
private history* instead of "what a player could not observe" — because `v2b` proved the models execute
the step and answer a different question, reading "could not observe" as "not stated in the blurb".

Each was obeyed. None discriminated. Cydonia-24b across all four, on the clean arm:

| prompt | findings/run | clean false positives | omission found |
|---|---|---|---|
| current | 5.5 | 100% | 74% |
| v2a | 5.1 | 100% | 71% |
| v2b | 3.1 | 100% | 63% |
| v3 | 1.1 | 88% | 14% |

Monotonic. The instructions changed how much the model says, and true findings fell with the false ones.
`v3` cut the noise by 80% and took omission detection down with it, 71% → 14%.

**A third failure mode, found only because the probe scores through the shipped parser:** models paste the
input descriptions back as findings. Cydonia did it on 9 of 20 clean runs under `v2a`. Not invention, not
agreement narration — echo, which `parseFindings` keeps because the line is not NONE. It has its own
counter now.

### The round trip is not a model task

Zero detections across four prompts and five models, on the order of 1,400 calls. The one thing every
variant shares is asking a model to notice an *absence* — that nothing private is present — while it is
also being asked to compare two texts. Two more phrasings will not fix that.

**It does not need a model at all.** §1 already has the answer and staged it as the nicer-to-have:
the app knows when it generated into a field. A session-only mark of "this was drafted, not typed" makes
the round trip *exact* — `aiDescription` drafted from `playerDescription` which was itself drafted from
`aiDescription` is a fact the app observes rather than infers. No schema, no call, no latency, no false
positives, and it catches the case in the sitting where it actually happens: filling a world in for the
first time.

So the check splits by what each half is good at:

- **Contradictions — keep the model.** 100% on every model tested, every prompt. This half works.
- **The round trip — drop it from the prompt entirely** and implement provenance. It currently costs
  tokens on every call and returns nothing.
- **Omissions — undecided.** Real when the model is talkative, and talkativeness is what makes the clean
  arm unusable.

The clean arm remains the blocker: the best false-positive rate measured on any model under any prompt is
63%, and on the model an author is likeliest to run it is 88–100%.

### Acted on, 2026-08-22

The round-trip bullet is out of the shipped prompt (`descriptionCheck.ts`), and the test that asserted its
presence now asserts its absence with the measurement in the comment, so it does not come back without new
evidence. The probe keeps the fixtures but runs that arm only under `--class roundtrip`, as a canary: the
case is still real for a world with no brief, and a future model that can name an absence would be news.

`authorBrief` shipped in `a59f429` — an optional field on all four description-bearing types that no
generator writes to, with `lib/authorBrief.draftSource` returning it when present and the other description
otherwise. That is §1's "the graph has no root" answered directly rather than detected, and it retires the
staging in §7: version one is no longer the detection window.

What remains open, in order:

1. **The clean arm is still the blocker for the check itself.** Best false-positive rate measured on any
   model under any prompt is 63%; on a 24B roleplay finetune it is 88–100%. Cutting the third bullet may
   move it — the sweeps above were all run with the bullet in — so re-measure before assuming.
2. **Few-shot is the one untried lever.** Every attempt so far changed what the model was *told*. A worked
   example of a clean pair answered NONE changes what it *sees*.
3. **Unlabelled briefs are unmeasured.** The 0-leak figure for brief → player-facing is on briefs that mark
   private lines `SECRET:`. An author who does not mark them is the untested case, and the help text
   recommends the convention precisely because the evidence only covers it.
