# Browser tests (Playwright)

A small suite that runs the real app in a real browser. It is **not** part of `npm test` — the four
gates stay fast, and this runs on its own.

```bash
npm run test:e2e
```

First time on a machine (downloads the browser, ~115 MB):

```bash
npm run test:e2e:install
```

| Command | What it does |
| --- | --- |
| `npm run test:e2e` | Both viewports, headless |
| `npm run test:e2e -- --project=desktop` | One viewport |
| `npm run test:e2e -- --headed` | Watch it drive |
| `npm run test:e2e:ui` | Playwright's time-travel UI — the fastest way to debug a failure |

The runner starts its own dev server on **5183** (`--strictPort`), so it never fights the servers on
5180–5182. An already-running one on 5183 is reused; set `E2E_PORT` to move it.

## What belongs here

Only failures that a browser can see and jsdom structurally cannot:

- 📐 **Real layout** — element boxes, overlap, caret rects. jsdom reports every rect as zero.
- 🖱️ **Real hit-testing** — `pointer-events`, stacking, one thing covering another. A dispatched
  `click()` lands on a dead overlay just as happily as a live one.
- 📱 **Real viewport behavior** — anything gated on window size or touch.

Everything else is cheaper and clearer as a Vitest test. If a guard could be written against a pure
function or a rendered tree, write it there instead.

## Viewports

| Project | Size | Why |
| --- | --- | --- |
| `desktop` | 1280 × 860 | The split layout only exists this wide |
| `mobile` | 375 × 812 | `hasTouch`, so touch-gated chrome renders |

Both projects run every spec; a spec that only makes sense on one calls `test.skip` on the project
name, which is why the run reports skips.

## Getting somewhere

Specs navigate with the DEV-only dev-router rather than clicking through menus:

```ts
await openApp(page);                       // seeded localStorage, past the intro and the setup gate
await openPromptEditor(page);              // Settings → Prompts, on an editable preset
await gotoDev(page, 'gameViewer', { tab: 'memory' });
```

Helpers live in [app.ts](e2e/app.ts). The router itself is [devRoutes.ts](src/lib/devRoutes.ts) — it
is stripped from production builds, which is why these tests need `npm run dev` and not `preview`.

> **Editable preset:** the shipped prompt presets are read-only, and a read-only editor takes no
> caret. `openPromptEditor` creates a user preset first, through the real UI.

## Coverage today

[prompt-editor.spec.ts](e2e/prompt-editor.spec.ts) — the prompt editor's layout, chrome gating, caret,
focus behavior, and dropdown scrolling. Each guard was verified by putting its bug back and watching the
test go red.

[tooltip-hover.spec.ts](e2e/tooltip-hover.spec.ts) — the themed tooltip on the Main Menu's view toggle:
hover opens it, moving to the neighbor opens that one through the shared instant window, and keyboard
focus opens the same tip. Desktop only for the two hover guards — a touch profile has no hover, and the
native `title` these replaced never showed there either.

[landing-pulse-clip.spec.ts](e2e/landing-pulse-clip.spec.ts) — the Landing Pulse ring by painted pixels:
an undo on a field flush with its scroll window paints the ring's top edge, the ring follows a field that
scrolls, and a ring in a dialog paints above it and takes no hit. The top-edge check fails on the old
row-drawn ring. Desktop only for the editor guards; the mobile sheet has no flush field.

> **No stopwatch.** The instant window is read off the popup's `data-instant`, not off elapsed time.
> Note that the provider's `timeout` does **not** control it: a direct move from one trigger to its
> neighbor hands over instantly whatever that value is. What makes them one group is the shared provider,
> so removing it is the mutation that turns this guard red.

[chat-pin.spec.ts](e2e/chat-pin.spec.ts) — the Chat layout's scroll: a submit or Re-generate pins the turn to
the viewport top, the view holds still through a long stream, and Jump to Latest shows, lands, and hides. A
local server streams the reply in timed chunks, because `page.route` answers in one piece.

> **Frames, not seconds.** Motion and stillness are counts of frames in which the offset moved. Each guard
> was verified by putting its bug back and watching the test go red.

[library-drag-parity.spec.ts](e2e/library-drag-parity.spec.ts) — the library board's drag, as twelve executable
rules. It is a **parity** suite: every rule was measured against the library as it stood before the tile board
landed, and the file is written against app-level observables only (thumbnail order by `alt`, bounding boxes,
the absence of a folder heading) so it runs unchanged on either implementation.

> **How to re-validate it.** Add a worktree at the commit before the tile board, junction `node_modules` into
> it, copy the two files across, and run:
>
> ```bash
> git worktree add --detach ../_parity 9beea58
> ```
>
> Then `cp e2e/tileDrag.ts e2e/library-drag-parity.spec.ts ../_parity/e2e/` and
> `E2E_PORT=5186 npx playwright test library-drag-parity` from inside it. Twenty-four pass, two skip — the same
> score the current code gets. A rule that only the new board can satisfy does not belong in this file.

Two claims about the old code turned out to be false once measured there, so they are **not** asserted.
Releasing away from the board did *not* commit nothing: `closestCenter` always returns its nearest droppable
however far the pointer is, so the tile landed beside whichever tile was closest. And the settle was *not* a
fade: the card's `transition-opacity` class was dead — `useSortable` writes an inline transform-only
`transition` that overrides it — so the released tile snapped to its slot and to full opacity in one frame.

[library-tiles.spec.ts](e2e/library-tiles.spec.ts) — the folder half: made from the tile's menu, filled and
emptied from it, arranged inside, and never touched by a drag.

Two caveats worth knowing:

- **Focus, not the keyboard.** There is no soft keyboard to drive, so the specs measure what *summons*
  one: who holds focus, and whether that opens or re-opens full screen. The keyboard-stuck-open loop
  itself is still only reachable on a real phone.
- **Wheel events, not `scrollTop`.** Radix drives its dropdown chevrons off its own scroll handling.
  Setting `scrollTop` from a script leaves exactly one chevron mounted and reproduces nothing;
  `mouse.wheel` reproduces the reflow (the list jumped 334 → 358px before the fix). Any future scroll
  spec has to use real input.

[folder-fly-in.spec.ts](e2e/folder-fly-in.spec.ts) — the folder camera, in numbers. One recorder samples every
animation frame of a fly-in and a fly-out on a scrolled library: the folder tile's rectangle in the library
layer against the region's rectangle in the folder layer (one pixel apart, both directions), the sizes in
between, the header's opacity and lift, and the left-out members' one shared opacity. A second group proves
the clips in pixels. Each guard was verified by putting its fault back and watching the test go red.

> **A clip is only proved by painted truth.** `getBoundingClientRect` reports an element's own box and knows
> nothing about an ancestor's clip — a fix that widened one clip while an ancestor went on cutting at the
> identical line passed exactly such a check and changed nothing on screen. `elementFromPoint` is no use
> here either: the raised frame and the scroll viewport both carry `pointer-events: none` while the camera
> runs, so a hit test returns neither layer. So the clip tests pause the camera on a frame, photograph a
> strip, hide one layer, photograph the same strip again, and compare the two images.

## CI

Not wired into a workflow yet. `npm run test:e2e` is CI-ready (it retries once and reports in
GitHub's annotation format when `CI` is set), but it needs a `playwright install --with-deps
chromium` step, so adding it is a deliberate choice rather than a default.
