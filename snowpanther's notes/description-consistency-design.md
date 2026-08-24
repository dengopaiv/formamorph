# Description consistency — design memo

> **Status: version zero built and measured — and the measurements say the prompt is wrong.** Filed
> 2026-08-21 from a design conversation and rewritten the same day; version zero shipped 2026-08-22 as
> `ba321a5`, and was put in front of five models the same day. Two of its three findings work. The third —
> the round trip, §1, the reason this document exists — was detected in **1 of 96 runs** across models from
> 24B to frontier, and the clean-pair false-positive rate ran from 37% to 100%. §7's staging still holds;
> §10's done bar does not, and is rewritten at the end. **§12 (2026-08-24) asks whether the check is aimed
> at the wrong pair of fields at all** — read §1, §7, §11 and §12 if you are picking this up cold.

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

1. **The clean arm is still the blocker, and cutting the third bullet did not move it.** Re-measured the
   same day on the same fixtures and seeds: deepseek-v4-flash went 92% → **100%** false positives and its
   `NONE` answers went 2/24 → 0/24; cydonia stayed pinned at 100%. Best rate on any model under any prompt
   remains 63%.

   The cut also **cost omission detection**, on both models and in the same direction: flash 100% → 75%,
   cydonia 74% → 58% (n=24 per arm, so flash's drop is six misses). The likely reason is that the removed
   bullet — *"detail the AI-facing description ought to hold and does not"* — was a second framing of the
   omission question and was priming it. It was doing two jobs: one it never accomplished, and one it did
   by accident.

   It bought a real but narrow gain: truncations at the 300-token cap fell 11 → 4.

   **It was not restored.** Shipping a request for a finding that arrives once in ninety-six, to keep a
   side effect, is the wrong repair. The omission bullet was strengthened directly instead: it now carries
   the note-side framing the cut bullet had been supplying, saying outright that the AI-facing description
   is the narrator's only reference and a fact the player is shown that it does not hold is a fact the
   narrator cannot use.

   **Measured 2026-08-24**, same fixtures, same seed, 6 runs, both models, shipped-before against
   candidate-after in one session:

   | | omission | clean false positives | said NONE | truncated |
   |---|---|---|---|---|
   | flash — thin bullet | 75% | 100% | 0/24 | 1 |
   | flash — both framings | **88%** | 88% | 3/24 | 5 |
   | cydonia — thin bullet | 52% | 100% | 0/22 | 1 |
   | cydonia — both framings | **78%** | 100% | 0/21 | 0 |

   Pooled omission 30/47 → 39/47, Fisher p = 0.03. Per model it is suggestive rather than settled (flash
   p = 0.21, cydonia p = 0.09); pooled it is real. **The wording was thin, and the cut was right.** Cydonia
   ends above where the three-bullet prompt had it (74% → 78%) and flash below (100% → 88%), so the
   round-trip bullet is not owed anything: one call's worth of tokens was saved and the detections came
   back from a sentence.

   The clean arm did not move in any way worth claiming — flash's three NONE answers out of 24 are
   p = 0.12, and cydonia is still pinned at 100%. Truncations went 1 → 5 on flash, giving back part of
   the 11 → 4 the cut had bought; cydonia went 1 → 0. Both the module comment and a test in
   `descriptionCheck.test.ts` pin the second sentence, because trimming it as redundant is the edit that
   was just measured at twenty points.
2. **Few-shot is the one untried lever.** Every attempt so far changed what the model was *told*. A worked
   example of a clean pair answered NONE changes what it *sees*.
3. **Unlabelled briefs are unmeasured.** The 0-leak figure for brief → player-facing is on briefs that mark
   private lines `SECRET:`. An author who does not mark them is the untested case, and the help text
   recommends the convention precisely because the evidence only covers it.
4. **The check may be checking the wrong two fields.** The narrator never reads `playerDescription`, so a
   player-versus-note disagreement is cosmetic and the pair that costs something is brief-versus-note.
   Ahead of item 2 in priority: it is worth knowing whether the clean arm is a hard problem or the wrong
   problem before spending a fifth prompt rewrite on it. **§12.**

---

## 12. The check may be aimed at the wrong pair (2026-08-24)

Raised by the author, and checked against the code rather than agreed to. **The narrator never reads
`playerDescription`.** Every context builder on the turn path takes `aiSummary` or `aiDescription` and
nothing else — `locationContext.ts`, `stagedPlanning.ts`, `traitTree.ts`, `runtimeCharacters.ts`. The
player-facing field reaches only the UI panels (`GamePanels`, `EntityModal`, `LocationModal`,
`TraitsTab`), the editor's search-and-replace in `worldSearch.ts`, and `publishPayload.ts`, which is the
catalogue blurb for a world listing and not gameplay. It is optional on all four types and nothing falls
back on its absence. (`locationContext.ts:114` falls back to a legacy `location.description` when there
is no summary or note — old-world compatibility, not a second channel.)

So the field is what the author says it is: **fixed text a player may be shown, never in the model's
context, and not required at all.** It exists for someone who wants a specific unchanging description,
and it is generatable for someone who would rather not write one.

### The consequence for the 🔍 check

`checkDescriptions` compares `playerDescription` against `aiDescription`. Under that reading it is
comparing a field the narrator reads against a field it never reads, one of which is optional
decoration. A disagreement between them is a **cosmetic** inconsistency a player might notice. It is not
a continuity fault in the game, because only one of the two texts was ever in the room.

The pair that costs something is **brief ↔ `aiDescription`**: what the author asserted is true, against
what the narrator was actually handed. A drift there means the model is running on facts nobody wrote.
That is the same failure §1 opens with, stated against the star topology `authorBrief` introduced rather
than against the cycle it replaced.

**This is an open question, not a decision.** It changes what the button is *for*, which is the author's
call. Recorded because it bears directly on §11's blocker: the clean arm has resisted four prompt
rewrites and roughly 1,400 calls, and it is worth knowing whether that is a hard problem or the wrong
problem before spending a fifth rewrite on it.

### The commonest authoring habit is the one the check is blindest to (2026-08-24)

Reported by the author from how people actually fill worlds in: **many write the player-facing
description, paste it into the AI-facing field, and stop.** That is the `roundtrip` fixture, produced by
hand rather than by a ✨ button — a note that holds nothing the blurb does not.

And the 🔍 check reports that world as **clean**. The two texts agree perfectly because they are the same
text. The single most common way a world gets filled in produces the exact state the check cannot see,
and it looks like a pass rather than like nothing having been checked.

This is the strongest argument in this section, and it arrives from a different direction than the one
above. Player-versus-note cannot catch the laundered note **in principle** — identical texts never
disagree, so no prompt rewrite reaches it, which is consistent with the 1-in-96 measured across four
wordings in §11. Brief-versus-note catches it trivially: the brief asserts things the note does not hold,
which is the omission finding that already works at 78–88%.

### Two facts about the fields, checked while §12 was written

**The player-facing surfaces never fall back to the AI field.** `EntityModal` renders
`playerDescription` or nothing; `TraitsTab` the same; `GamePanels` and `LocationModal` fall back to the
legacy `location.description` and never to `aiDescription`. So a subject with no player-facing text shows
none, and the separation is enforced by the render path rather than trusted to convention. Discovered
entities are the proof it holds: `materializeDiscoveredEntity` builds them with an `aiDescription` alone.

**`aiDescription` is not the summary — there are three fields, not two.** `aiSummary` is a separate
shorter one, and `pickDescription(preferSummary, …)` prefers it in the lightweight planning precall while
narration gets the full note. It is a **token-budget** device, not a secrecy device. Nothing in the app
marks any text as secret: `aiDescription` is private only because no player-facing surface renders it,
and the `SECRET:` convention in a brief is an instruction inside a prompt, not a mechanism. Anything that
later claims to enforce secrecy has to build it; nothing today does.

### Why the retarget might also be easier

A hypothesis, unmeasured, and it should be measured before it is believed. Brief-versus-note is closer to
fact extraction than to open-ended text comparison: the brief is terse and enumerable, so the question
becomes *is each asserted fact accounted for* rather than *do these two prose passages disagree*. The
clean-arm failure mode across every model tested was a model with nothing to report inventing something
to be useful — and a checklist gives it somewhere to put "yes" that is not a finding. `bridge-probe.mjs`
already scores fact recall from a bullet brief (94–95%, zero secret leaks), so the fixtures and half the
scorer exist.

Against it: a brief marks private lines `SECRET:`, and those are *supposed* to be absent from the
player-facing draft and *present* in the note. A brief-versus-note check has to read that convention or
it will flag every secret as an omission in one direction and every withheld line in the other. That is
a real complication and it is the first thing to design if this is taken up.

### What would need deciding

- Does the button check brief ↔ note, replace the pair it checks entirely, or offer both?
- What does it do on a subject with no brief? The honest answer may be that it has nothing to check and
  should say so, rather than falling back to the cosmetic pair and looking like it worked.
- Is a player-facing drift worth reporting at all, given it costs nothing in play? Possibly as a
  different, quieter thing than a continuity finding.

### One property worth protecting deliberately

If the brief is the only artifact that must be authored, then **every other field is recoverable by
pressing ✨ again** and a bad generation is never a loss. That is worth holding as a design rule rather
than an accident. It is also the shape that serves a screen-reader author best — one plain field to write
into, rather than generated prose to review in three — which is §9's bar approached from the authoring
side instead of the widget side.

---

## 13. First brief-versus-note measurement (2026-08-24)

`briefcheck-probe.mjs`, default wording, four subjects, four arms, 6 runs, same seed as everything in §11.
191 completions. **The clean arm moved, and it moved all the way** — on one model.

| | clean FP | contradiction | omission (one bullet) | laundered | secret recall |
|---|---|---|---|---|---|
| deepseek-v4-flash | **0%** (NONE 24/24) | 96% | 4% | 38% | 32% |
| cydonia-24b-v4.1 | 0% (NONE 24/24) | **4%** | 0% | 0% | 0% |

Read the two rows differently. They are not the same result.

### Flash: the blocker is gone, and the detector is coarse

Against the shipped player-versus-note pair this model ran **88–100% false positives** on the clean arm and
said NONE 0 to 3 times in 24, across four prompt wordings and roughly 1,400 calls. Here it says NONE **24
times out of 24** and still returns findings on 23 of 24 contradictions. That is discrimination, not silence,
and it is the first time the clean arm has been anywhere near a shippable number. §10's rewritten bar of
"silent on a clean pair in at least 7 of 8" is **met at 24 of 24**.

What it is not is enumerative, and two arms say so.

**One missing bullet out of nine reads as agreement: 4%.** The note accounts for eight of the brief's nine
lines and the model answers NONE. It is judging the pair as a whole rather than checking facts off a list —
which is the same holistic reading §11 found under a different prompt, arriving here as a false negative
instead of a false positive.

**On the laundered arm the split is by subject kind, not by how much is missing.** Characters 9 of 12
(harbormaster 4/6, healer 5/6); locations **1 of 12** (chapel 1/6, nightmarket 0/6). Three whole secrets are
absent in every one of those runs. A missing motive or a missing crime reads as a gap in a person; a missing
crypt, a stolen bell, a protection racket and a fire next spring do not read as gaps in a place. Worth
knowing before anything is built on this, and not something the arm was designed to find — locations were in
the cast because the bridge probe had them.

Also worth recording: on the laundered arm flash never once returned a finding that was wrong. It was either
silent or correct — 0 non-NONE misses in 24. The failure mode is under-reporting, not invention, which is the
opposite of every measurement in §11.

### Cydonia: the prompt does not survive the 24B at all

3 tokens average. NONE to every clean, omission and laundered run. Its only non-NONE answers, all on the
contradiction arm, were **the brief pasted back** — the changed bullet, or in two runs most of the brief.
The 4% left after the paste rule was corrected is one run that escaped on a 13-character fragment.

This is not a quiet model. It is a model that has stopped following the instruction and started completing
the list it was handed, which the bullet-shaped input invites. §11's Rocinante anomaly was the same shape and
was left unexplained; two of these now say it is worth explaining.

**So the honest reading of §12 is: the retarget works, on a model an author mostly is not running.** The
clean-arm blocker was real and the pair was wrong — that much is now measured rather than argued. But the
tier that matters is worse here than it was on the old pair, and the thing that makes it worse is plausibly
the input shape rather than the question.

### What this points at next, in order

1. **Few-shot, now with two reasons.** §11 wanted it for the clean arm; that arm is fixed on flash and the
   need moved. What it would fix here is cydonia completing the list instead of comparing — one worked
   example of a brief, a note and a finding is exactly the demonstration a completing model needs. Still the
   one lever never pulled.
2. **Number the brief lines and ask for findings by line.** Cheap, and it attacks both failures at once:
   it makes the task enumerative rather than holistic (flash's 4%) and turns the input from a list to be
   continued into a list to be indexed (cydonia's paste).
3. **Locations need their own fixtures or their own wording.** 1 of 12 is not noise, and the cast was
   inherited rather than chosen for this question.
4. **Unmeasured, and it is the real target:** a hand-laundered note against a brief that was never used to
   draft it. Every fixture here has a note drafted from the same authored facts. The world §12 describes —
   blurb written, pasted into the AI field, brief added afterwards — has a note that agrees with the brief's
   visible lines by coincidence rather than by provenance, and that is the case an author would actually
   bring.

---

## 14. Numbering the brief, and the parser becomes the blocker (2026-08-24)

§13's step 2, run the same day: `--numbered` puts the brief in as a numbered list and
`candidates/brief-check-numbered.txt` asks for a verdict per line. Same subjects, same seed, 6 runs, 192
completions. **It moved both models, in opposite directions.**

| model | wording | clean FP | contradiction | omission | laundered | secret recall |
|---|---|---|---|---|---|---|
| deepseek-v4-flash | free text | 0% | 96% | 4% | 38% | 32% |
| deepseek-v4-flash | numbered | 0% | 83% | **0%** | **0%** | **0%** |
| cydonia-24b-v4.1 | free text | 0% | 4% | 0% | 0% | 0% |
| cydonia-24b-v4.1 | numbered | 0% | 42% | 33% | **71%** | **46%** |

**Cydonia went from not doing the task to doing it properly.** Under the free-text prompt every non-NONE
answer it gave was the brief pasted back. Numbered, it works down the list:

```
6. curt with strangers, slow to warm
The description accounts for this.

7. SECRET: takes bribes from the night barges to keep their cargo out of the ledger
The description does not account for this.
```

Nine lines, six passed and the three missing secrets named — a perfect answer on the arm the shipped check
scores 0 on, from a 24B roleplay finetune. The diagnosis in §13 was right: a bulleted list invites a
completing model to continue it, and a numbered list gives it somewhere to put a verdict instead.

**Flash went the other way.** Told to decide line by line, it answers NONE to every laundered run — 24 of 24,
with three secrets absent each time — and to every omission run. Its free-text 38% and 4% both went to zero.
Numbering did not make it enumerate; it made it quieter. Whatever is happening on that model, per-line
instructions are not it.

So there is no single wording for both tiers yet, and the split is the opposite of the usual one: the small
model needs the structure and the large one is hurt by it.

### The parser is now the binding constraint, and it is an app problem

**Shown cydonia's numbered output, `parseFindings` would list 970 findings across the sweep where the model
reported 117.** Eight times inflation, and on the harbormaster it means an author opening the dialog on a
subject with three real problems sees **nine lines, six of which say "The description accounts for this."**

That is the §11 agreement-narration gap again, arriving as the consequence of the format that finally made a
small model work. `parseFindings` splits on newlines and keeps everything that is not literally NONE, so it
cannot represent a verdict per line: the fact line reads as a paste and the verdict line carries no fact.

The probe now parses verdicts (`parseLineVerdicts`) and prints both counts side by side, so the gap between
what the model said and what the app would show is visible on every run. **The correction was worth 71
points**: this arm scored 4% before the verdict parse and 71% after, on completions already paid for. A
completely correct answer had been scoring zero, which is the second metric bug in this section's own
measurements and the one that cost the most.

**If a per-line format ships, it needs a parser that reads verdicts.** That is a real requirement on
`descriptionCheck.ts`, not a probe detail — and it is cheap next to another prompt rewrite.

### What this changes about the plan

1. **Two prompts, chosen by tier, is now on the table** and was not before. It is unattractive — every
   prompt in this app is one editable template — but the measurement says the free-text wording is worth 38%
   on flash and 0% on cydonia, and the numbered wording 0% and 71%. That is not a rounding difference.
2. **Verdict parsing comes before any further wording work.** It converted a 4% into a 71% without a single
   new call, and the same parse would let the dialog show three findings instead of nine.
3. **Few-shot is still unpulled**, and it is now the obvious candidate for the one thing neither wording
   does: make flash enumerate. It is the only lever that changes what the model *sees* rather than what it
   is told, and both of these were tellings.
4. Unchanged from §13: locations are weak, and the note-drafted-from-the-same-brief fixture is not the case
   an author brings.
