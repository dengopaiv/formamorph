# TODO — what is in flight, and what state it is in

One page for "where is everything". Written 2026-09-05, immediately after syncing every branch onto
upstream **v2.16.0** (`0a574d9`).

Read it as **state per branch**, because that is how the work is actually divided. Nothing here is a
plan for new features — the design memos hold those, and `description-consistency-design.md` in
particular is deliberately a list of things *not* to build yet.

Status words used below mean one thing each:

| | |
|---|---|
| **Done** | built, gates green, and nothing is owed on it |
| **Built, unverified** | the code exists and the unit gates pass, but the claim it makes has never been checked against the thing it is a claim about — a real model, a real screen reader, a real pod |
| **Started** | partly written, and known to be incomplete |
| **Filed** | a memo exists; no code |
| **Chore** | not a feature; housekeeping that will cost something if it is left |

---

## Where the branches stand

| Branch | Carries | Behind upstream | Pushed to `origin` |
|---|---|---|---|
| `main` | nothing of ours — a clean mirror of `upstream/main` | 0 | **no** — 233 commits ahead of `origin/main` |
| `description-consistency` | the ✨/🔍 authoring work, the endpoint notes, the pod scripts | 0 | **no** |
| `keyboard-tree-nesting` | the keyboard-nesting a11y work, plus four commits that do not belong to it | 0 | **stale** — `origin` still has the pre-rebase `db665f8` |
| `Colossally-expensive-curiosities` | one doc, `docs-internal/behemoth-128b.md` | 0 | **no** |

**Nothing has been pushed since the sync.** `keyboard-tree-nesting` will need `--force-with-lease`
when it goes, because the branch was rebased and `origin`'s copy is the old line.

---

## 1. `keyboard-tree-nesting` — the accessibility fix

Keyboard support for **nesting** in the drag-trees. dnd-kit resolves an arrow key by hunting for a
droppable lying that way; in a full-width list every row shares one left edge, so nothing lies left or
right — a row could be reordered but never nested. This adds a `coordinateGetter` that steps depth
directly, and speaks the result.

| | |
|---|---|
| The gesture — `lib/treeDepthStep` + `SortableTree`'s coordinate getter | **Done** |
| Screen-reader instructions naming both axes | **Done** |
| Live announcements — `lib/treeAnnouncements`, built from the drop projection so speech and outcome cannot disagree | **Done** |
| Docs — `docs/WorldEditor.md`, `lib/helpTopics`, the canvas dwell-to-nest correction | **Done** |
| Upstream v2.16.0 merge — re-expressed against the shared `EditorDndContext`, `PlaceholderList` converted to the `project` contract | **Done** |

### What is owed

- [ ] **Hear it with NVDA.** *Built, unverified — this is the blocker.* The unit gates cover what the
      sentence says; nothing has been read aloud. The script is `keyboard-nesting-test-script.md`,
      9 ordered cases. Three questions only ears can settle: is the wording right, does a fast repeat
      interrupt cleanly, and does a **refused** press read as silence or as a stall?
- [ ] **Get the unrelated commits off the branch.** *Chore, and it gates the PR.* In the branch's own order:
      - `0d528de` "WIP: Make The World Editor's Drafting Prompts Editable" — **drop it**, it is already
        on `description-consistency` as `d6cf0a5`.
      - `d8826fd` (model research), `2128590` (the notes directory), `9870bd9` (the design memo) — ours,
        but not this subject.
      - `168f8b0` (canvas dwell docs) — a genuine upstream fix, but its own PR.
- [ ] **Rewrite the PR description.** The old draft is gone with its session. Its "manually tested
      against all three trees" line was a placeholder and must not be restored until the NVDA pass is done.
- [ ] **Sign the CLA** on first submission — every upstream PR needs it, and GitHub issues are disabled
      there, so a PR is the only inbound channel.

---

## 2. `description-consistency` — the ✨ drafting buttons

Version zero shipped the two things that cannot damage a description: a ✨ that asks before it
overwrites, and a 🔍 that only reports.

| | |
|---|---|
| Editable authoring prompts, with their own output caps, on a prompt preset | **Done** |
| Overwrite confirmation — `lib/descriptionOverwrite` | **Done** |
| Author's Brief — a field nothing generates into, which turns the description graph from a cycle into a star | **Done** |
| The 🔍 check — `lib/descriptionCheck`, registered as a fourth authoring prompt | **Built, unverified** |
| `endpointSendsInTheClear` — the cleartext-endpoint warning | **Done** |
| The verdict parser — `parseFindings` collapsing a checklist answer to its failing items | **Built, unverified** |
| `desccheck-probe.mjs` — four arms per subject over the bridge probe's cast | **Started** |

### What is owed

- [ ] **Run the check against a live endpoint.** *This is the one thing not done.* Everything above is
      unit-level. What only a real model can settle: whether a small model returns one finding per line
      rather than a rewrite, whether it says NONE when the two agree instead of inventing a disagreement
      to be helpful, and whether the output cap is enough. Run `desccheck-probe.mjs` with several
      `--model` arms at once — a frontier arm proves the *prompt* is right, and only a small-model arm
      proves it *survives* the model this app is usually pointed at.
- [ ] **The clean arm is why the button is not finished.** 88–100% false positives on both models
      measured, before and after the omission repair. A 🔍 that shows an author three imaginary problems
      stops being opened. Decide what to do about that before this ships: a stricter parser, a stricter
      prompt, or a threshold below which the dialog says nothing.
- [ ] **Re-score `parseFindings` against fresh completions.** The verdict-collapsing port (`6a8ed3b`) was
      written against transcripts already on disk, not against a new run.
- [ ] **Do not start at grounding.** *Deliberately unbuilt, in the memo's order:* grounding, the
      `entityMatch` name detector, the keyword and semantic lore detectors, the ancestor chain, pin/mute,
      persisted provenance. Every design round made version one smaller.
- [ ] **Move this branch's changelog entries.** They are in `docs/Changelog.Fork.md`, which is correct —
      check before the next merge that nothing has drifted back into `docs/Changelog.md`, which is
      upstream's file and is never touched.

---

## 3. Running the model — endpoints, pods, hardware

The local card is a 4 GB Quadro P2000, so anything above a small quant is rented. That is what all of
this exists for.

| | |
|---|---|
| `FORMAMORPH-ENDPOINT-NOTES.md` — presets, URL normalization, koboldcpp/OpenRouter, throughput math | **Done** |
| §15.9's peer-to-peer trap — measured on three A40 pods out of three | **Done** |
| `pod-scripts/rp.sh` — one command, clean text, no interactive session | **Done** |
| `pod-scripts/pod-setup.sh` — unattended TabbyAPI bring-up | **Built, unverified at size** — verified end to end against a 1B control model; **never run against a 100 GB-class model** |
| `runpod-exl3.md` + `pod-scripts/textgen-setup.sh` — the standalone EXL3 walkthrough and the text-generation-webui path | **Built, unverified** |
| `model-recommendations.md` — the shortlist per VRAM tier | **Done** |

### What is owed

- [ ] **Run `pod-setup.sh` against Behemoth-class weights.** Every failure it knows about was found on a
      1B model. The 70 GB download, the tensor-parallel split and the ten-minute health-check window are
      all untested at real size.
- [ ] **Run the text-generation-webui path at all.** `textgen-setup.sh` is written from documentation,
      not from a pod. Its two soft spots are named in the script itself: whether `--enable_tp` reaches the
      **ExLlamaV3** loader (the flag is documented for V2), and the exact loader name in the version that
      installs. Both are one `--help` away on a live pod.
- [ ] **Measure a pod that passes the p2p check.** The 12.0 tok/s in §15.8 was measured with every
      collective detouring through host RAM. It is a floor; by how much a healthy pod beats it is unknown.
- [ ] **Featherless is blocked on one unverified fact:** whether their stack serves the
      Mistral-Medium-3.5 base at all. Until that is answered the route is not a route.
      (`docs-internal/behemoth-128b.md`, on `Colossally-expensive-curiosities`.)
- [ ] **Endpoint presets still cannot be exported.** There is no import path in the app; moving one
      between installs is a localStorage edit. §13 documents the procedure; nothing has been built.

---

## 4. Chores that will cost something if they are left

- [ ] **Move `docs-internal/behemoth-128b.md` out of `docs-internal/`.** It is ours, and
      `docs-internal/` is upstream's — a note filed there lands in the diff of every PR made from this
      fork. Upstream has also since sorted that directory into `designs/`, `notes/` and `specs/`
      subfolders, so a loose file at its root is doubly out of place. It belongs in `snowpanther's notes/`
      beside `model-recommendations.md`.
- [ ] **Decide what `Colossally-expensive-curiosities` is for.** It is one doc on its own branch. Either
      fold it into `snowpanther's notes/` on a working branch, or keep it and say why here.
- [ ] **Push the synced branches.** Nothing has gone to `origin` since the merge. `main` is a clean
      upstream mirror and can go first; `keyboard-tree-nesting` needs `--force-with-lease`.
- [ ] **Two upstream tsdoc warnings** in `src/lib/localNetworkEmbed.ts` (unclosed code spans, lines
      98–99). Not ours, not blocking, and a one-line fix worth sending upstream on its own.
- [ ] **`CodeArea.test.tsx` fails under full-suite load and passes 37/37 alone.** A known flake, not a
      regression — but it means "1 failed" is the expected clean result, which is exactly the shape of
      thing that hides a real failure later.

---

## How to check the gates

```bash
NODE_OPTIONS=--no-experimental-webstorage npm run test     # the flag matters on Node 26
npm run typecheck
npm run lint
npm run build
```

Upstream's merge bar is all four green, plus "keep the diff scoped to one concern". CI runs only the
first three.
