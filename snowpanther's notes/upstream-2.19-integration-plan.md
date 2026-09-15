# Bringing upstream v2.17–v2.19 into the fork

**State:** Filed, 2026-09-16. Nothing in this document has been done yet.

Upstream moved from `46ea181c` (2026-09-07) to `685b4152` (2026-09-15) with **237 commits across 676 files**,
tagging v2.17.0, v2.18.0 and v2.19.0 along the way, plus unreleased Native Reasoning work. All four of our
branches are still sitting on `46ea181c`. Last time was 58 commits and no conflicts. This time is four
times the size, and it runs straight through two of our branches.

The fork's goal is accessibility, and that decides three things in this plan:

1. **Our accessibility work goes first and comes out whole.** The keyboard branch is integrated before the
   description work, and nothing about it may regress for the sake of a clean merge.
2. **Every new upstream surface we build on is checked by keyboard and NVDA before we build on it.**
   Phase 6 is the audit, and it is real work, not an afterthought.
3. **A gap we find becomes a filed candidate, not a silent patch.** It goes into `TODO.md` under **A**. It
   is not fixed quietly inside an unrelated branch, and nothing is PR'd upstream unless you ask each time.

One finding that changes the tone: **upstream is visibly writing for assistive technology now.** The new
panel tabs keep an `aria-label` when they shrink to an icon. The Publish Size bar is a real `role="meter"`.
The Community rail sets `aria-current`. The add-on review control carries a per-row `ariaLabel`, and
closing Find now returns focus to where you were. So a keyboard contribution is landing on receptive
ground. It also means Phase 6 is mostly about *hearing* what they built, not assuming it is missing.

---

## Decisions that are yours

**Answered 2026-09-16:** Q1 yes · Q2 per world · Q3 yes. All three recommendations as written below.

| # | Question | Recommendation |
|---|---|---|
| Q1 | Rebuild `keyboard-tree-nesting` clean on top of upstream, instead of merging a fourth time? | **Yes.** See Phase 2. It drops four of its seven conflicts and does K2 as a side effect. |
| Q2 | For the Author's Brief, should a library update overwrite it, or should the field be kept per world? | **Keep it per world** (skip it in update comparisons), so the claim "nothing writes into it" stays true. The other reading is also defensible: a brief travels with the item. |
| Q3 | Should the ✨ and 🔍 authoring calls follow upstream's new Native Reasoning switch? | **Send reasoning off (`none`), and send a budget of 0 where the engine supports one**, the way upstream treats stat updates. Reasons are in Phase 3.4. |

---

## Phase 0 · Safety (5 minutes)

- Tag every branch tip before touching anything: `pre-2.19/<branch>`. A merge this size is where a wrong
  resolution hides, and a tag is cheaper than the reflog.
- `git stash` nothing. The working tree is clean apart from `.claude/`, and it should stay that way through
  every phase.
- **Back up the browser's Formamorph storage before any manual testing** (Settings → full backup).
  v2.19's linked content moves library data between worlds, and v2.19's stat code runs a load-time
  rewrite on older worlds.

## Phase 1 · `main` (1 minute)

Fast-forward `main` to `upstream/main`. There are no conflicts, because `main` carries nothing of ours.
Pushing it to `origin` is fine. It is our own fork, and C3 already set that precedent.

## Phase 2 · `keyboard-tree-nesting`, rebuilt

**Why rebuild rather than merge.** Of the branch's eight non-merge commits, only three are the feature:
`e7052577`, `21aad1d1` and the canvas-docs fix `168f8b09`. The other five are the ones K2 already says
must come off:

- `0d528dea` is the authoring prompts, which already live on `description-consistency`.
- `d8826fd3`, `ed7483b3`, `21285908` and `9870bd9e` are the notes and memos.

Merging would mean resolving conflicts in `SettingsContext.tsx`, `SettingsModal.tsx` and
`promptPresets.ts` purely for `0d528dea`, and then throwing that commit away in K2 anyway. What overlaps
with upstream *because of the keyboard work itself* is small: `EntityTree.tsx` (upstream changed 2 lines),
`WorldEditor.md` and `helpTopics.ts`. **`SortableTree.tsx`, `EditorDndContext.tsx`, `PlaceholderList.tsx`,
`LocationTree.tsx` and `TraitTree.tsx` are all untouched upstream.**

K2's own note said to wait until after K1, so that history is never rewritten under an uncommitted NVDA
fix. No such fix exists. The old line survives under its `pre-2.19/` tag and on `origin`.

**Steps**

1. Create `keyboard-tree-nesting-2.19` from `upstream/main`.
2. Bring the code over as a three-way diff, **not** `git checkout <branch> -- file`. A whole-file checkout
   of `EntityTree.tsx` would silently revert upstream's change:
   ```bash
   git diff 46ea181c keyboard-tree-nesting -- \
     src/lib/treeDepthStep.ts src/lib/treeDepthStep.test.ts \
     src/lib/treeAnnouncements.ts src/lib/treeAnnouncements.test.ts \
     src/managers/SortableTree.tsx src/managers/EntityTree.tsx src/managers/LocationTree.tsx \
     src/managers/TraitTree.tsx src/managers/PlaceholderList.tsx src/managers/PlaceholderList.test.tsx \
     src/components/dnd/EditorDndContext.tsx \
     | git apply -3
   ```
   Diffing from `46ea181c` picks up the `EditorDndContext` `accessibility` prop and the `PlaceholderList`
   conversion. Both were written inside the v2.16 **merge resolution**, so cherry-picking the three
   commits would lose them.
3. Re-apply the keyboard paragraphs in `docs/WorldEditor.md` and `helpTopics.ts` by hand, against
   upstream's reworded text. Upstream now has a writing guide (`docs/Writing-Guide.md`, based on
   ASD-STE100) and `npm run copy:sweep`. **Run the sweep on our wording.** Our current sentences are
   longer than theirs.
4. The changelog bullets go into `docs/Changelog.Fork.md`, not `docs/Changelog.md` (✅ Settled). The
   upstream-format bullet gets written at K3 time, as part of the PR text.
5. **Check the tree's new neighbours.** v2.18 placed the location and entity trees beside tabbed detail
   panels. After a keyboard drop the focus has to stay on the row. It must not jump into the new tab strip.
   Add that as case 10 of `keyboard-nesting-test-script.md`.
6. Run the gates (Phase 5). Once green, `keyboard-tree-nesting-2.19` replaces `keyboard-tree-nesting`, and
   the push needs `--force-with-lease` again.

**Then K1 is the next thing, before any more feature work.** K1 is the NVDA pass. Three weeks of upstream
tabs and focus changes are exactly what a unit test cannot hear.

## Phase 3 · `description-consistency`, merged

This branch *is* the fork's history (notes, pod scripts, `TODO.md`), so it stays a merge, as on
2026-09-07. Expect conflicts in 10 files. What follows is what each one actually means.

### 3.1 Mechanical conflicts

| File | Upstream +/− | What happened, and how to resolve it |
|---|---|---|
| `EntityFields.tsx` | +116 −67 | **The field body was split into named groups for the tab panel.** The Author's Brief and the 🔍 button go in the *Descriptions* group, above Player-Facing. Do not reinstate the old flat layout. |
| `LocationManager.tsx` | +154 −107 | **The location panel got Details, Presence, Media and Pins tabs.** The brief and 🔍 go in *Details*, above the descriptions. |
| `SettingsContext.tsx` | +175 −80 | **Reasoning became `{ enabled, level }`** and the detection logic moved out. Keep upstream's reasoning code as is. Re-add only our four authoring prompts and `descMaxTokens`. |
| `SettingsModal.tsx` | +180 −184 | **The Native Reasoning row was rewritten.** Keep upstream's. Re-add the Authoring tab and `DescTokenCapField`. |
| `promptPresets.ts` | +32 −7 | **The preset `reasoning` map now stores settings, not strings.** Keep both changes. They sit side by side. |
| `settingsCopy.ts` | +8 −8 | **Upstream reworded some copy.** Keep upstream's wording and re-add `ENDPOINT_CLEARTEXT_WARNING`. |
| `helpTopics.ts` | +163 −12 | **Mostly new topics** (linked content, stat code). Keep ours alongside. |
| `docs/WorldEditor.md` | +39 −18 | **Panels are now described per tab.** Check that "sits above both descriptions" still reads as true. |
| `world.ts` | +63 | **Link records were added to entities and locations.** Keep both. |
| `entityFile.ts` | +27 −13 | **The placeholder scan list became `chipTexts()`** in `linkedContent.ts`. See 3.2. |

### 3.2 What breaks without a conflict

These all pass the gates as they stand, which is why they are listed separately.

- **Find won't open the right tab.** `entityPanelTabs.ts` and `locationPanelTabs.ts` hold a `TAB_BY_FIELD`
  map. `authorBrief` is not in it, so a Find hit in a brief lands on whatever tab is open. Add
  `authorBrief: 'descriptions'` and `authorBrief: 'details'`, with a test next to theirs.
  **This one is an accessibility bug and not only an inconvenience:** a screen-reader user who presses
  Enter on a hit hears nothing move, and has no view of the page to see that the match is on a hidden tab.
- **Placeholders used only in a brief get dropped on export.** Add `item.authorBrief` to `chipTexts()` in
  `linkedContent.ts`. Our line in `entityFile.ts` has nothing to attach to any more.
- **A library update would overwrite the brief** (depends on Q2). `componentUpdates.ts` compares every
  field it does not skip. As things stand, the brief would show up in View Changes as "Author Brief" and
  would be replaced on Update.
  - If Q2 is "keep per world": add `authorBrief` to `SKIPPED_FIELDS`, and make sure the update write
    carries the local value forward.
  - If Q2 is "it travels": add a `FIELD_LABELS` entry `"Author's Brief"`, and narrow the docs' "Nothing
    ever writes into this field" to "no ✨ or 🔍 button writes into it".
- **The brief's wording breaks upstream's voice rules.** v2.18 removed dashes and "Enter…"-style
  placeholders from panel fields, and moved help to a line between the label and the control. Our
  `placeholder="Notes, in any shape — a list is fine…"` becomes a short help line, and the help topic
  gets shortened. Run `npm run copy:sweep`.
  - **For the fork's goal, this is the useful half of the rule:** placeholder text disappears once you
    type, and NVDA reads it inconsistently. A help line wired to `aria-describedby` does neither.

### 3.3 D4 got more urgent

Upstream now resolves reasoning **per request kind**, and ships a catalog of about 7,800 models so the
controls appear before the first turn. Our three authoring calls still build their own `fetch` and send
**no reasoning fields at all**. On a reasoning model that means its default amount of thinking, spent
inside output caps of **400 (✨ drafts), 300 (🔍 check) and 80 (summary) tokens**. The summary will
often come back empty, cut off before any answer. That can make D1's live run look like a prompt failure
when it is really a reasoning-budget failure.

### 3.4 The fix (Q3)

Add a small shared helper that asks upstream's own `reasoningEffort.ts` for the "off" body. The body is
`reasoningEffortBody` for outside endpoints and `reasoningBudgetBody` with a budget of 0 on the built-in
engine. Use it from all three calls, and **do the cheap half of D4 in the same commit**: show the server's
error message instead of the bare status code.

- **Why off rather than following the Global switch:** a consistency check wants a short, predictable
  answer, and upstream already ships its short internal passes (stat updates, choices) off.
- **What stays out of scope:** routing the calls through the shared request layer is still D4's "proper"
  answer, and still not started.
- **The accessibility reason:** the 🔍 dialog is read aloud. An empty answer and a slow one sound the same
  there, as silence, so the audience that cannot glance at a spinner pays most for a thinking model that
  never answers.

### 3.5 After the merge

Update `TODO.md`: regenerate the branches table, add an entry to Recently landed, move D4 up, and file the
Phase 6 findings under A.

## Phase 4 · `Colossally-expensive-curiosities`

One file, no conflicts. Merge `upstream/main` into it, or do C1/C2 first and fold the doc into
`snowpanther's notes/`, then retire the branch. C1/C2 is the better use of the occasion, because it removes
one of four branches to sync next time.

## Phase 5 · Gates, after each branch

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run --pool=threads --poolOptions.threads.maxThreads=4
npm run typecheck
npm run lint
npm run build
```

Upstream added a lot of test files again, so **re-measure the capped runtime** and update C5 if the 8½
minutes has moved. A capped failure is taken seriously (C5). An uncapped one is re-run on its own before
anyone believes it.

## Phase 6 · Keyboard and NVDA audit of what upstream shipped

Ordered by how likely each item is to matter to a screen-reader user of **this fork**. It is not ordered
by how big the feature is. Each line names what the code suggests, so the pass can confirm or refute it
rather than start from nothing. Findings go to `TODO.md` → **A**, one id each.

| # | Surface | What to listen for | Why it is on the list |
|---|---|---|---|
| 6.1 | **Panel tab strips** (entity, location, stat, trait, dictionary) | Arrow keys between tabs; the tab name read when the strip is icon-only; what Find's tab switch announces | Every editor panel changed in v2.18. `aria-label` is present, but a tab switch that Find triggers may say nothing. |
| 6.2 | **Linked-copy marker** 🔗 and its footer button | The source name and "Link pending save" | The marker is a non-focusable `role="img"` labelled only "Linked". The richer line with the source's name is in a hover `Tip`, which keyboard and screen-reader users may never reach. |
| 6.3 | **Remember Additions** in Enter World | Whether "Remembered" is spoken after pressing it | Confirmation is an `aria-label` swap on the already-focused button, plus a colour change. There is no live region, and NVDA usually does not re-read a focused control's changed name. |
| 6.4 | **Stat code editor**, both boxes | Underlined errors, completions, Test Code results | A squiggle is visual. Check whether diagnostics reach the accessibility tree at all. v2.19 made this editor far more important. |
| 6.5 | **Update Available / Update This World / Connect World References** | The row state, the per-row action choice, whether **Connect & Add** says why it is disabled | These windows are the core of v2.19. A disabled button that does not say why is a dead end without sight. |
| 6.6 | **Manage Add-ons** | The Approved/Unreviewed/Declined switch, and the "Pending change" badge being read with its row | The badges are separate spans. Check whether they are read in context. |
| 6.7 | **Save list and Enter World dictionary drag** | What dnd-kit announces while dragging | These are two **new** `EditorDndContext` users that do not get the `accessibility` prop from Phase 2. dnd-kit's stock wording speaks the item **id**, which for a save may be a UUID. Enter World has Move Up/Down buttons as the accessible path. The save list may have none. |
| 6.8 | **Native Reasoning row** | The checkbox's label, and whether the dropdown is announced as tied to it | A switch beside a dropdown is a common spot for an orphaned label. |
| 6.9 | **Community section rail / dropdown** | The current section | The changelog says it is announced (`aria-current`). Confirm it and move on. |
| 6.10 | **Publish Size meter** | Value and state (green/amber/red) | It has `role="meter"`. Check the colour state has words as well. |
| 6.11 | **Library tile board** (A1) | Unchanged since 2026-09-07? | Re-check that it is still pointer-only before A1 is discussed again. |

## Phase 7 · Memory and notes

- **`keyboard-nesting-contribution`:** update the branch name and tip.
- **`description-consistency-branch`:** record the D4 reasoning finding.
- **`fork-work-state-index`:** new sync base.
- **`upstream-check` skill:** step 4 found a real stale claim again, the "Nothing ever writes into this
  field" sentence. Add it as a second worked example if it proves out.

---

## Order at a glance

```
0 tags + backup
1 main ← upstream (ff)
2 keyboard-tree-nesting-2.19  (rebuild, gates)  →  K1 NVDA pass
3 description-consistency ← upstream (merge, 3.2 fixes, 3.4 reasoning-off, gates)
4 Colossally-expensive-curiosities → fold into notes (C1/C2)
6 audit → TODO.md › A
7 memories
```

Phases 2 and 3 are independent, so if time is short, do 2 alone. It is the accessibility work, and it is
the smaller job.
