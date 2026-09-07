# Working file — what is in flight, and what you have said about it

This is a **channel, not a report**. You write in it; I read it, act, and write back. It survives
between sessions, which the conversation does not.

## How to use it

**Write anything in the Inbox below. Do not go looking for the right place — that is my job.**

A note is easier to file if it starts with an item id (`K1`, `D2`, …), but an id is not required and
never wait for one. "the nesting thing announces too much" is filable.

Two rules that make this work, and they are mine to keep, not yours:

1. **A line starting with `@me` is yours. I never edit it, never reword it, never delete it.** When I
   have acted on one I move it — verbatim — into the Notes of the item it belongs to, and add a dated
   reply under it. That is the only thing I ever do to your words.
2. **Everything else in this file is mine and you can overwrite it freely.** If a state word is wrong,
   change it. If a whole item is dead, delete it. I will not put it back without saying so.

Anything I write is signed `· claude ·` with a date. Anything unsigned under `@me` is yours.

---

## 📥 Inbox

Write here. Anything, any length, any order.

```
@me
```

---

## What the state words mean

- **Done** — built, gates green, nothing owed.
- **Built, unverified** — the code exists and the unit tests pass, but the *claim it makes* has never
  been checked against the thing it is a claim about: a real model, a real screen reader, a real pod.
  **This is the state most of this file is in, and it is the one that looks like Done from the test
  output alone.**
- **Started** — partly written, known to be incomplete.
- **Filed** — a memo exists, no code.
- **Blocked** — waiting on a fact nobody has gone and got.

---

## Where the branches stand

Regenerated 2026-09-07, after syncing every branch onto upstream `46ea181c`. Upstream is **still tagged
v2.16.0** — 58 commits with no version bump, so the tag is not a reliable "am I current" check on this
repo. Compare commits.

| Branch | Carries | Behind upstream | On `origin` |
|---|---|---|---|
| `main` | nothing of ours — a clean mirror of upstream | 0 | **stale**, 291 behind local |
| `description-consistency` | the ✨/🔍 authoring work, the endpoint notes, the pod scripts, this file | 0 | **not pushed** |
| `keyboard-tree-nesting` | the keyboard-nesting a11y work, plus four commits that do not belong to it | 0 | **stale** — `origin` has the pre-rebase `db665f8`; needs `--force-with-lease` |
| `Colossally-expensive-curiosities` | one doc, `docs-internal/behemoth-128b.md` | 0 | **not pushed** |

All four merged with **no textual conflicts**, and all four gates are green on the two that carry code.
What the 58 commits brought that touches us: a Capacitor **Android** build, a whole **website** with
accounts and a second Vite config, the tile board's `cellSim` replaced by a `gestureReader`, and — the
part that reaches our work — **per-endpoint sampler overrides and an optional max-output cap**. That
last one is written up in `runpod-exl3.md` §13 and the endpoint notes §13.1, and it is what **D4** below
is about.

---

# K · Keyboard nesting (branch `keyboard-tree-nesting`)

Keyboard support for **nesting** in the drag-trees. dnd-kit resolves an arrow key by hunting for a
droppable lying that way; in a full-width list every row shares one left edge, so nothing lies left or
right — a row could be reordered but never nested. A custom `coordinateGetter` steps depth directly,
and speaks the result.

Built and green: `lib/treeDepthStep`, the coordinate getter, instructions naming both axes,
`lib/treeAnnouncements` built from the drop projection so speech and outcome cannot disagree, the docs,
and the v2.16.0 merge onto upstream's shared `EditorDndContext`.

### K1 · Hear it with NVDA

**State:** Built, unverified — **this is the blocker for everything else in K.**

The unit gates cover what the sentence *says*. Nothing has been read aloud. The script is
`keyboard-nesting-test-script.md`, 9 ordered cases.

Three questions only ears can settle:

- Is the wording right? Each press currently says level, what it would nest inside, and what it would
  sit below — *"Level 2, inside Hallway, below Pantry"*.
- Does a fast repeat interrupt cleanly, or does it queue up and lag behind your fingers?
- Does a **refused** press read as silence, or as a stall? A refused press deliberately says nothing.
  That may be wrong.

Two traps in the script worth knowing before you start: the search box **must be empty** or the tab
renders a flat list with no grips at all, and entities/traits nest **only into groups**, so a refused
arrow on a leaf is correct behaviour rather than a bug.

**Notes**

- 2026-09-05 · claude · Nothing here yet. This is the item most likely to change the code.

### K2 · Lift the unrelated commits off the branch

**State:** chore, and it gates the PR.

In the branch's own order:

- `0d528de` "WIP: Make The World Editor's Drafting Prompts Editable" — **drop it outright**, it is
  already on `description-consistency` as `d6cf0a5`.
- `d8826fd` (model research), `2128590` (the notes directory), `9870bd9` (the design memo) — ours, but
  not this subject.
- `168f8b0` (canvas dwell docs) — a genuine upstream fix, but its own PR.

**Notes**

- 2026-09-05 · claude · Cheapest after K1, not before: an NVDA pass may change the announcement code,
  and rewriting history under an uncommitted fix is how you lose one.

### K3 · Rewrite the PR description

**State:** not started.

The old draft is gone with its session. Its *"manually tested against all three trees"* line was a
placeholder and **must not be restored until K1 is done**.

### K4 · Sign the CLA

**State:** not started, one-time.

Every upstream PR needs it, via the CLA Assistant bot. GitHub issues and discussions are both disabled
on upstream, so a PR is the only inbound channel there.

---

# D · Description consistency (branch `description-consistency`)

Version zero shipped the two things that cannot damage a description: a ✨ that asks before it
overwrites, and a 🔍 that only reports.

Built and green: the editable authoring prompts with their own output caps, `lib/descriptionOverwrite`,
the **Author's Brief** (a field nothing generates into, which turns the description graph from a cycle
into a star), `endpointSendsInTheClear`, and the v2.16.0 merge onto upstream's Request Anatomy hub.

### D1 · Run the check against a live endpoint

**State:** Built, unverified — **the one thing not done.**

Everything above is unit-level. `desccheck-probe.mjs` is written; run it with several `--model` arms at
once over the same fixtures and seeds.

What only a real model can settle:

- Does a small model return one finding per line, or a rewrite?
- Does it say NONE when the two descriptions agree, or invent a disagreement to be helpful?
- Is the output cap enough?

A frontier arm proves the *prompt* is right. Only a small-model arm proves it *survives* the model this
app is usually pointed at.

**Notes**

- 2026-09-05 · claude · Needs an endpoint. If that means renting a pod, P1 and P2 are the same errand —
  do them in one sitting.

### D2 · Decide what to do about the clean arm

**State:** Blocked on D1, and it is why the button is not finished.

**88–100% false positives on both models measured**, before and after the omission repair. A 🔍 that
shows an author three imaginary problems stops being opened — that is the whole feature failing, not a
rough edge.

Three shapes of answer, none chosen: a stricter parser, a stricter prompt, or a confidence threshold
below which the dialog says nothing at all.

### D3 · Re-score `parseFindings` against fresh completions

**State:** Built, unverified.

The verdict-collapsing port (`6a8ed3b`) was written against transcripts already on disk. Numbers from
it are not evidence until it has seen a new run.

---
### D4 · Our authoring calls sit outside upstream's request layer, and that now costs something

**State:** Filed, new on 2026-09-07 — found while folding in upstream, not by a failing test.

`checkDescriptions`, `bridgeDescription` and `summarizeDescription` each build their own `fetch`. That
was fine when the shared path had nothing they needed. Upstream's endpoint-override work changed that.

Three concrete differences, in the order they will bite:

- **A rejected parameter fails opaquely.** All three throw on `!res.ok` with nothing but the status
  number, discarding the response body. The turn pipeline now reads a 400/422, attributes it to the
  *specific* override the server refused, disables that override for the preset and shows the server's
  own message. Ours shows *"Failed to generate."*
- **They send a hard-coded `temperature`.** `CHECK_TEMPERATURE` and `BRIDGE_TEMPERATURE` are deliberate —
  a consistency check wants determinism, not the author's storytelling temperature — but an endpoint that
  **rejects** `temperature` outright (some reasoning endpoints do) now takes the whole button down with
  it, and the app cannot tell you why.
- **They ignore the preset's sampler overrides**, which is correct for temperature and probably wrong for
  the rest.

Two sizes of answer:

1. **Cheap, and worth doing before D1:** surface the server's message instead of the bare status. Three
   one-line changes, and it turns a live-endpoint debugging session from guesswork into reading.
2. **Proper:** route the authoring calls through the shared request layer. Bigger, and it drags in the
   `AIRequestType` question the authoring prompts were deliberately kept out of — see the ✅ note about
   the hub in *Recently landed*, 2026-09-05. Do not start here.

**Notes**

- 2026-09-07 · claude · Nothing is broken today; every gate is green and the fixed temperature is a
  design decision, not an oversight. This is a *divergence that has started to cost*, and D1 is the run
  that will expose it.


# P · Running the model — pods, endpoints, hardware

The local card is a 4 GB Quadro P2000, so anything above a small quant is rented. That is what all of
this exists for.

Built: `FORMAMORPH-ENDPOINT-NOTES.md`, `runpod-exl3.md`, the peer-to-peer trap measured on three A40
pods out of three, `pod-scripts/rp.sh`, and `model-recommendations.md`.

### P1 · Run `pod-setup.sh` against Behemoth-class weights

**State:** Built, unverified at size.

It reached READY and served coherent prose — against a **1B control model**. Every failure it knows
about was found there. Untested: the 70 GB download, the tensor-parallel split of a real model, and
whether the ten-minute health-check window is long enough.

### P2 · Run the text-generation-webui path at all

**State:** Built, unverified — written from documentation, never run on a pod.

`textgen-setup.sh`. Two soft spots, both named in the script and both **one `--help` away on a live
pod**:

- The loader name. `--loader exllamav3` is expected; the docs it was written from list only the V2
  loaders.
- Whether `--enable_tp` — documented as *"Enable Tensor Parallelism in **ExLlamaV2**"* — reaches the V3
  loader. If it does not, you get an automatic layer split: correct output, less throughput.

### P3 · Measure a pod that passes the peer-to-peer check

**State:** not started.

The **12.0 tok/s** figure was measured with every collective detouring through host RAM, because that
pod's card-to-card copies were silently returning zeros. It is a floor. How much a healthy pod beats it
is unknown, and it is the number that decides whether this is usable.

### P4 · Featherless — does it serve the Mistral-Medium-3.5 base?

**State:** Blocked on one unverified fact, and the route does not exist until it is answered.

Not blocked by size: the $25 Premium tier has no model-size cap (only the $10 Basic tier is capped, at
15B). What gates it is the 100-download auto-onboarding threshold and, more seriously, whether their
stack serves that base at all. See `docs-internal/behemoth-128b.md` on
`Colossally-expensive-curiosities`.

### P5 · Endpoint presets still cannot be exported

**State:** Filed. No code.

There is no import path in the app; moving a preset between installs is a localStorage edit. §13 of the
endpoint notes documents the procedure by hand. Nothing has been built, and nothing is planned.

---

# C · Chores that will cost something if they are left

### C1 · Move `docs-internal/behemoth-128b.md` out of `docs-internal/`

It is ours, and `docs-internal/` is **upstream's** — a note filed there lands in the diff of every PR
made from this fork. Upstream has since sorted that directory into `designs/`, `notes/` and `specs/`,
so a loose file at its root is doubly out of place. It belongs in `snowpanther's notes/` beside
`model-recommendations.md`.

### C2 · Decide what `Colossally-expensive-curiosities` is for

It is one doc on its own branch. Either fold it into `snowpanther's notes/` on a working branch, or
keep it and write down why here.

### C3 · Push the synced branches

Nothing has gone to `origin` since the merge. `main` is a clean upstream mirror and can go first.
`keyboard-tree-nesting` needs `--force-with-lease` — it was rebased and `origin` has the old line.

### C4 · ~~Two upstream tsdoc warnings~~ — **gone, upstream fixed it**

`src/lib/localNetworkEmbed.ts`, unclosed code spans. This was going to be our first easy PR to upstream.
`46ea181c` "Fix Local Network Embed TSDoc" is literally their newest commit, so that door is shut. If a
first easy PR is still wanted, C1's tsdoc is not it — look for something in the a11y work instead.

### C5 · The full suite fails a *handful* of view tests under load, and the number moves

**State:** worse than it was written down as, and the wording mattered.

This used to read *"`CodeArea.test.tsx` flakes; expect 1 failed"*. After the sync that is wrong in a way
that would hide a real regression. Three full runs on 2026-09-07: **1 failure**, then **2**, both on
`description-consistency`, then **7** on `keyboard-tree-nesting` — and no two runs failed the same set.
The names that came up were all heavy `views` or modal suites: `WorldEditor.bench`, `.fix`,
`.imageWebpFix`, `.statCodeCheck`, `MainMenu.sessionSync`, `SettingsModal.mode`, `EventFormDialog`.
**All seven were re-run isolated and all seven passed.** Upstream added ~90 test files in this sync, so
there is simply more running in parallel on the same machine.

The damage is to the gate, not the code: *"expect 1 failure"* was a usable rule and *"expect somewhere
between one and seven, and check which"* is not. Until this is fixed, the honest procedure is the one at
the bottom of this file — **re-run any failure isolated before believing it**.

**Tried it, and it works.** Capping worker concurrency gave a **completely clean run — 515 files,
8504 tests, zero failures** — where the uncapped run minutes earlier on the same tree failed two:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run --pool=threads --poolOptions.threads.maxThreads=4
```

It costs **8m20s against 5m56s**. Two and a half minutes to turn "somewhere between one and seven
failures, work out which" back into "green means green" is worth paying every time.

**One run is not proof** — these are probabilistic, and a clean run can happen by luck. Treat it as the
local gate from now on and let the next few runs confirm it; if a capped run ever fails, that failure is
much more interesting than an uncapped one. CI is unaffected either way: it runs on Node 24 on a
different machine, and this flag is local.

---

# A · Openings upstream just created

Not work in flight. Things the 2026-09-07 sync put on the board, noticed while reading the diff.

### A1 · The new tile-board drag is pointer-only

**State:** observed, nothing decided. **This is a candidate, not a commitment.**

Upstream replaced the library's `cellSim` with a `gestureReader` and moved the tile board onto it —
push/swap dragging, folder-or-move, a footprint that snaps to a named target. It is a nice piece of
work and it is **entirely pointer-driven**: `GestureInput` is defined as *"one pointer reading of a
drag"*, and there is no keyboard path and no announcement anywhere in the module. Playwright covers it
with mouse gestures.

So a new drag surface has appeared that a keyboard cannot reach — the same gap, in a second place, as
the one K exists to close in the editor trees.

Why it is only an opening:

- **K1 comes first.** Proposing the same fix twice before the first one has been heard aloud is how you
  find out twice that the wording was wrong.
- **A 2D board is a harder problem than a tree.** Depth-stepping a tree has one axis and a legal-move
  rule; a tile board has two axes, footprints of different sizes, and a move-versus-folder split that
  currently depends on *where inside a cell* the pointer sits. There may be no keyboard gesture that
  expresses that last one without redesigning it.
- It is upstream's newest feature, so it is also the most likely to keep moving.

**Notes**

- 2026-09-07 · claude · Filed only so it is not re-discovered from scratch next time. The honest
  sequence is K1 → K2/K3 → land that PR → then ask whether this one is worth proposing.

---

# ✅ Settled

Decisions already made, with the reason. Neither of us reopens one of these without saying so out loud
first — that is what this section is for.

- **Version one of the description work stays small.** Deliberately unbuilt, in the memo's order:
  grounding, the `entityMatch` name detector, the keyword and semantic lore detectors, the ancestor
  chain, pin/mute, persisted provenance. *Every design round made version one smaller.* **Do not start
  at grounding.**
- **No play text crosses the internet in the clear.** Tunnel a rented endpoint over SSH and eat the
  latency; do not expose a bare TCP port, and do not use RunPod's HTTP proxy, which also buffers
  streaming into one lump at the end.
- **Our changelog is separate.** Fork entries go in `docs/Changelog.Fork.md`. `docs/Changelog.md` is
  upstream's and is never touched — a file we never edit cannot conflict on a rebase.
- **Nothing of ours goes in `docs-internal/`.** It is upstream's directory; anything filed there shows
  up in the diff of every PR from this fork. Ours lives in `snowpanther's notes/`. (C1 is the last
  violation.)
- **No root `CLAUDE.md` in this repo.** That path is not gitignored and would land in a PR diff.
  `.claude/` is.

---

# 🗓️ Recently landed

- **2026-09-07** — all four branches synced onto upstream `46ea181c`, 58 commits, **no conflicts and no
  re-expression needed** — the opposite of the previous sync. Upstream's new work (Android, the website,
  the gesture reader) landed beside ours rather than through it. The one thing that reached us is the
  endpoint-override work, now written up in three places and filed as **D4**.
- **2026-09-07** — `runpod-exl3.md` rewritten as a procedure you can follow start to finish: a one-screen
  spine, a *Before you rent anything* section, a **§7 on getting the scripts onto the pod** — which the
  old draft simply did not have, since it told you to `curl` from a URL that does not exist because
  nothing is pushed — and a 1B rehearsal step before the expensive download.
- **2026-09-05** — every branch synced onto upstream v2.16.0. Two real integration problems, not just
  conflicts: `SortableTree` re-expressed against upstream's new shared `EditorDndContext` (which gained
  an `accessibility` prop, because dnd-kit's stock wording only knows the vertical axis), and the
  authoring prompts re-expressed against upstream's new Request Anatomy hub — an authoring prompt has
  no request to draw, and would have opened onto an empty hub.
- **2026-09-05** — `runpod-exl3.md` and `pod-scripts/textgen-setup.sh` written.

---

# How to check the gates

```bash
# the thread cap is what makes the result trustworthy on this machine — see C5
NODE_OPTIONS=--no-experimental-webstorage npx vitest run --pool=threads --poolOptions.threads.maxThreads=4
npm run typecheck
npm run lint
npm run build
```

Both flags matter and for different reasons: `--no-experimental-webstorage` or Node 26 mass-fails ~375
tests on `localStorage`, and the thread cap is what stops half a dozen heavy `views` suites timing out
under parallel load. Capped, this tree runs **8504 tests green in about 8½ minutes**.

Upstream's merge bar is all four green, plus "keep the diff scoped to one concern". CI runs only the
first three, on Node 24, where neither flag applies.

If you do run it uncapped, **do not read the failure count as a verdict** — re-run whatever it named on
its own, and believe the isolated result:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run <the files it named>
```
