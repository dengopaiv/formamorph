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

Regenerated 2026-09-05, after syncing every branch onto upstream **v2.16.0** (`0a574d9`).

| Branch | Carries | Behind upstream | On `origin` |
|---|---|---|---|
| `main` | nothing of ours — a clean mirror of upstream | 0 | **stale**, 233 behind local |
| `description-consistency` | the ✨/🔍 authoring work, the endpoint notes, the pod scripts, this file | 0 | **not pushed** |
| `keyboard-tree-nesting` | the keyboard-nesting a11y work, plus four commits that do not belong to it | 0 | **stale** — `origin` has the pre-rebase `db665f8`; needs `--force-with-lease` |
| `Colossally-expensive-curiosities` | one doc, `docs-internal/behemoth-128b.md` | 0 | **not pushed** |

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

### C4 · Two upstream tsdoc warnings

`src/lib/localNetworkEmbed.ts`, lines 98–99, unclosed code spans. Not ours, not blocking, and a
one-line fix worth sending upstream on its own as a first easy PR.

### C5 · `CodeArea.test.tsx` flakes under full-suite load

Passes 37/37 alone. A known flake, not a regression — but it means **"1 failed" is the expected clean
result**, which is exactly the shape of thing that hides a real failure later. Worth fixing for that
reason alone.

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

- **2026-09-05** — every branch synced onto upstream v2.16.0. Two real integration problems, not just
  conflicts: `SortableTree` re-expressed against upstream's new shared `EditorDndContext` (which gained
  an `accessibility` prop, because dnd-kit's stock wording only knows the vertical axis), and the
  authoring prompts re-expressed against upstream's new Request Anatomy hub — an authoring prompt has
  no request to draw, and would have opened onto an empty hub.
- **2026-09-05** — `runpod-exl3.md` and `pod-scripts/textgen-setup.sh` written.

---

# How to check the gates

```bash
NODE_OPTIONS=--no-experimental-webstorage npm run test     # the flag matters on Node 26
npm run typecheck
npm run lint
npm run build
```

Upstream's merge bar is all four green, plus "keep the diff scoped to one concern". CI runs only the
first three. Expect **1 failure** from C5.
