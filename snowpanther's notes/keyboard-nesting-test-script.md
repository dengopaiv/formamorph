# Keyboard nesting — manual test script

For testing the `keyboard-tree-nesting` branch by hand, with NVDA running.

The branch gives the World Editor's three drag trees — **Locations**, **Entities**, **Traits** — the sideways
half of the drag gesture from the keyboard. Reordering by keyboard already worked; nesting did not. This
script walks the gesture end to end and marks which claims are already proven mechanically and which ones
only ears can settle.

---

## Setup

**Launch.** Either works; the second is faster to re-run.

| | Command | Notes |
|---|---|---|
| Desktop shell | `npm run desktop:dev` | Builds, then opens the Electron app. Closest to what a player runs. |
| Dev server | `npm run dev` | Browser at the printed localhost port. Needed for the `#dev` router below. |

**Reach a tree** — the ordinary way, which works in either build:

1. Main menu → move to a world card → **Edit World**
2. → the **Locations** tab (also **Entities**, **Traits**)

**Or jump straight there** (dev server only — the dev router is stripped out of a production build):

```
#dev?modal=worldEditor&tab=locations
```

**Two things that will waste your time if you hit them blind:**

- **The search box must be empty.** With any text in it, the tab renders a flat filtered list instead of the
  tree — no grips, no nesting, nothing to test.
- **A row nests into the row above it, and only if that row can contain it.** In Locations any location can
  hold another. In Entities and Traits only a **group** (folder) is a container — entities and traits
  themselves are leaves. So testing those two tabs needs a group in the list, and the row you lift has to be
  sitting directly under it.

---

## The gesture

| Key | What it does |
|---|---|
| <kbd>Tab</kbd> | Move to a row's grip — a button that announces itself as *sortable* |
| <kbd>Space</kbd> or <kbd>Enter</kbd> | Lift the row |
| <kbd>↑</kbd> <kbd>↓</kbd> | Move it through the list |
| <kbd>←</kbd> <kbd>→</kbd> | Take it **out of** / **into** the row above — one level per press |
| <kbd>Space</kbd> or <kbd>Enter</kbd> | Drop it where it stands |
| <kbd>Esc</kbd> | Put it back where it began |

---

## Test cases

Run them in order — each leaves the tree ready for the next. Use a throwaway world.

A good starting shape for Locations is four places at the top level: **Harbor, Dock, Warehouse, Beach**.

### 1. The grip is reachable and explains itself

**Do:** <kbd>Tab</kbd> until you land on the grip of the *Dock* row.

**Expect:** it announces as a button, described as *sortable*, followed by the instruction text. The branch
replaced dnd-kit's stock wording — the sentence you should hear mentions the sideways keys:

> To pick up an item, press space or enter. While holding it, use the up and down arrow keys to move it
> through the list, and the left and right arrow keys to move it out of or into the item above it. Press
> space or enter again to drop it where it stands, or press escape to leave it where it began.

That string is the whole reason a keyboard user can discover the feature at all — the grip's tooltip never
reaches someone who never hovers. **This is the single most important thing to confirm by ear.** If NVDA
skips it or truncates it, the feature is undiscoverable no matter how well it works.

### 2. Lift and drop, without moving

**Do:** <kbd>Space</kbd>, then <kbd>Space</kbd> again.

**Expect:** the row lifts and drops in place. Nothing about the tree changes.

### 3. Nest one level — the new behavior

**Do:** on *Dock*'s grip: <kbd>Space</kbd>, then <kbd>→</kbd>.

**Expect:** *Dock* indents one step, sitting inside *Harbor*. Press <kbd>Space</kbd> to commit, and the
nesting stays after the drop.

### 4. A refused press is a no-op, not a banked one

**Do:** lift *Dock* again and press <kbd>→</kbd> twice.

**Expect:** the first press indents. The second does nothing — *Dock* is already as deep as the rows around
it allow. Now press <kbd>←</kbd> **once**.

**This is the real check:** one press back should return it to where one press took it. If the refused press
had been banked, you would have to press <kbd>←</kbd> twice to undo one visible step, and the row would
silently be "further right" than it looks. A row should always be exactly *n* presses away from a depth *n*
levels off.

### 5. Out again

**Do:** lift a nested row and press <kbd>←</kbd>.

**Expect:** it returns to the top level.

### 6. Depth survives a vertical move

**Do:** lift *Warehouse*, press <kbd>→</kbd> to indent it, then press <kbd>↑</kbd>.

**Expect:** it keeps its indent while it walks. Moving up or down must not quietly undo the nesting you
just dialled in — the two axes are independent.

### 7. Escape puts everything back

**Do:** lift a row, press <kbd>→</kbd>, press <kbd>↓</kbd>, then <kbd>Esc</kbd>.

**Expect:** the row returns to its original position **and** its original depth. Both halves of the gesture
have to be undone, not just the vertical one.

### 8. The other two trees

Repeat 3–5 on the **Entities** and **Traits** tabs, with a group in the list:

- Lift the row sitting **directly under a group** → <kbd>→</kbd> nests it into that group.
- Lift a row sitting under a plain entity or trait → <kbd>→</kbd> does nothing, correctly. A leaf is not a
  container, so there is nowhere to go.

### 9. The announcement audit — the part only ears can settle

Lift a row and work it with the arrows, listening rather than looking. This used to report
*"Draggable item loc-b was moved over droppable area loc-b"* — the id, not the name, and identical before
and after a sideways press. It now speaks the projected drop.

| Press | Expected, roughly |
|---|---|
| <kbd>Space</kbd> on a top-level row | *"Picked up Kitchen, level 1, at the top level, below Garden."* |
| <kbd>→</kbd> into the row above | *"Level 2, inside Hallway, first."* |
| <kbd>→</kbd> again, one deeper | *"Level 3, inside Pantry, first."* |
| <kbd>↓</kbd> past a sibling | same level and parent, new *"below …"* |
| <kbd>←</kbd> back out | *"Level 2, inside Hallway, below Pantry."* |
| <kbd>→</kbd> at the deepest legal level | **silence** — the press was refused, so nothing changed |
| <kbd>Space</kbd> to drop | *"Dropped Kitchen, level 2, inside Hallway, below Pantry."* |
| <kbd>Esc</kbd> instead | *"Cancelled. Kitchen is back where it began."* |

**Judgement calls I made that you should overrule if they sound wrong:**

- **The row's name is spoken only on lift, drop and cancel** — not on every arrow press. It cannot change
  mid-drag, and repeating it in front of each press buries the part that did. If losing track of *what* you
  are holding turns out to matter more, the name goes back on every move.
- **A refused press is silent.** Identical text does not re-fire a live region, so there is no way to say
  "that did nothing" without inventing varying words. Silence may read as a dropped keypress instead.
- **Levels count from one**, so the top level is "level 1" rather than "level 0".
- **"first"** is used where the row lands directly under its parent, rather than saying *"inside Hallway,
  below Hallway"*.
- Whether hearing all three facts every press is **useful or exhausting** at speed.

---

## Already verified mechanically

I drove all of this through the running app and read the DOM, so you do not need to re-check the mechanics —
only how they sound.

| Claim | Result |
|---|---|
| Grip is a focusable `role="button"`, `aria-roledescription="sortable"` | Confirmed |
| The branch's instruction text is on every grip via `aria-describedby` | Confirmed, text as quoted above |
| <kbd>Space</kbd> **and** <kbd>Enter</kbd> both lift and both drop | Confirmed |
| <kbd>→</kbd> indents exactly one level (24px, one `TREE_INDENT`) | Confirmed in all three trees |
| A press the tree refuses changes nothing — no banked indent | Confirmed at the depth limit and under a leaf |
| <kbd>←</kbd> un-nests by one level | Confirmed |
| Indent survives <kbd>↑</kbd> / <kbd>↓</kbd> | Confirmed |
| <kbd>Esc</kbd> restores both position and depth | Confirmed |
| Entities and traits nest into groups only | Confirmed — and the refusal under a leaf is correct |
| Announcement text is built from the drop projection, not re-derived | Confirmed by `treeAnnouncements` tests (17) |

**What only you can settle:** whether NVDA actually speaks the instruction string on focus, whether it speaks
it *before* you have already pressed space, whether the per-press announcements above are interrupted or
queued at speed, and whether the whole gesture is followable by ear without looking at the screen.

---

## Known gap: the arrows are silent

Found while preparing this, and worth deciding on before the PR.

The branch customized the **instructions** but left the **announcements** at dnd-kit's stock strings. Read
straight out of the live region during a keyboard nest, every step of the drag says:

```
Draggable item loc-b was moved over droppable area loc-b.
```

Two problems in one line:

1. **It names raw ids, not the location.** You hear `loc-b`, never *Dock*.
2. **It never mentions depth, so it does not change when depth changes.** That string is byte-identical
   before and after <kbd>→</kbd>. The gesture this branch exists to add produces **no spoken feedback at
   all** — the only confirmation that a press landed is visual indentation, which is exactly what a screen
   reader user does not have.

Case 4 above is unfalsifiable by ear because of this: a banked indent and a refused one sound the same,
because both sound like nothing.

**The fix is small and local.** `SortableTree` already passes `accessibility={{ screenReaderInstructions }}`
to `DndContext`; the same prop takes `announcements`, with callbacks for drag start / over / end / cancel.
Giving it announcements that name the row and state its depth — *"Dock, level 2, inside Harbor"* — would
close it, and would make every case in this script audible. The row names and the projected depth are both
already in hand at that point in the component.

---

## Notes

- Test with a throwaway world. Drops commit to the world immediately; <kbd>Esc</kbd> only cancels a drag in
  flight, it does not undo a committed drop.
- Both editor modes show all three trees, so Simple vs Advanced does not matter here.
