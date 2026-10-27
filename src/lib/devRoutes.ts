/**
 * Registry + running-tab for the DEV-only dev-router (see `devRouter.ts`). One source of truth for
 * which app locations the router can jump to, so verification can land somewhere in a single call
 * instead of a click-and-screenshot crawl. Extend this as each section lands.
 *
 * `DEV_VIEWS` is also App's `currentView` type — App imports it — so a new top-level view can't drift
 * from the router. `DEV_MODAL_TABS` is guarded in `devRouter.test.ts` against each surface's own exported
 * tab list, so adding a tab without covering it here fails the test.
 */

/** Top-level screens App can route to (App types `currentView` off this — single source of truth). */
export const DEV_VIEWS = ['mainMenu', 'gameViewer'] as const;
export type DevView = (typeof DEV_VIEWS)[number];

/** Dev-only routes for panes whose real host needs a deep click path. `customCode` opens MainMenu's Custom
 *  Code Execution dialog on canned stat code when the selected world has none; the rest mount one pane on
 *  canned props (`DevPaneRoutes`). Players never navigate to these. */
export const DEV_PANE_MODALS = ['customCode', 'fontTune', 'revealDemo', 'presetImport', 'placeholderPicker', 'rootCrash'] as const;
export type DevPaneModal = (typeof DEV_PANE_MODALS)[number];

/** Modals the router can open via `#dev?modal=…`. `settings` opens from MainMenu or GameViewer; `menu` and
 *  `worldEditor` open from MainMenu; `entity`/`export` are in game (GameViewer).
 *  `worldEditor` is an in-place modal on MainMenu (not a top-level view). `intro` replays the first-run
 *  welcome overlay on MainMenu. `localModel` is intentionally absent — it lives inside
 *  Settings→LocalModelPanel, reached via `modal=settings` + its tab, not its own name.
 *  `aiSetup` opens the AI setup gate on MainMenu in its skippable (first-run) form. `entityEditor` and
 *  `dictionaryEditor` are the *library* editors (MainMenu), distinct from the in-game `entity` modal; both
 *  open on a blank draft, so they're reachable without any stored data. `memoryManager` is
 *  in-game (GameViewer) and opens on an empty ledger before any turn has been summarized. `location` is in
 *  game (GameViewer) and opens the Change Location dialog on whichever of its two views was used last, so
 *  pair it with `fixture=…` to have a world worth traveling in; `fixture=entityFollowers` puts met entities
 *  on its Map and a follower in the Entities tab. `editText` is in game (GameViewer) and
 *  opens the narration editor on the current page's text — empty before any turn, which is enough to reach
 *  its full-screen toggle, the one editor that grows in place instead of raising a window. `changelog` opens
 *  MainMenu's What's New popout on a canned sample (`devChangelogSample.ts`) rather than the live GitHub
 *  fetch, so its typography is checkable offline and always shows every shape the notes can take.
 *  `worldPrompts` opens MainMenu's read-only Custom Prompts viewer; with no world selected it renders a canned
 *  sample override, so it's reachable on an empty library. `aiContext` is in game (GameViewer) and opens the
 *  AI Context inspector — empty before any turn, so pair it with `fixture=…` for real captured turns.
 *  `designSystem` opens the live reference showcase without mounting it in production. `enterWorld` starts
 *  normal entry for the stored world named by `tab` (or the first installed world).
 *  `connectReferences` raises the Connect World References step
 *  on canned rows (`devConnectReferencesSample.ts`), because in the app it opens only partway through an add
 *  in the World Editor, and only for a library item expecting something that world lacks.
 *  `componentUpdates` raises the component update review on a canned source and two canned worlds
 *  (`devComponentUpdateSample.ts`), because in the app it opens only for a library item whose revision two
 *  installed worlds are actually behind. Its worlds are held in memory, so Apply Updates writes nothing.
 *  `importComponent` raises the component-file import review on a canned file
 *  (`devImportComponentSample.ts`), because in the app it opens only for a chosen file that names worlds.
 *  Importing from it does write: the character lands in the library, and a world you tick gets a copy.
 *  `codeRename` and `replaceAll` open the World Editor and raise, on canned text, the offer to carry a
 *  rename into stat code, and the Replace All confirm. In the app each opens only partway through an edit. Every answer
 *  closes it and writes nothing. `savedElsewhere` and `deletedElsewhere` open the World Editor and raise
 *  the question another tab's save or delete of the open world asks. Either answer closes it and writes nothing.
 *  `demoAI` is in game
 *  (GameViewer) and opens the Demo AI dialog whatever the narration endpoint and the seen-key say, so it is
 *  reachable on a build that overrides the default endpoint.
 *  `persona` is in game (GameViewer) and opens the right panel's Change Persona picker. On mobile that panel
 *  mounts only on the Status tab, so open that tab first. `errorDetails` raises a canned failed-request toast
 *  from any view with toasts; its View Details link opens the dialog.
 *  `settingsCompare` opens Settings
 *  and the compare view over it, on a canned edit of the Narration prompt. `chipOptions` opens Settings and
 *  Chip Options over it, on a canned Entities chip. `scriptPrompt` is in game (GameViewer) and fires one
 *  canned `player.*` request through the live prompt store once the game has a turn; `tab=…` picks the shape
 *  (`devScriptPromptSamples.ts`). Pair it with `fixture=…`. `DEV_PANE_MODALS` follow. */
export const DEV_MODALS = ['settings', 'entity', 'export', 'menu', 'worldEditor', 'intro', 'backup', 'aiSetup', 'entityEditor', 'dictionaryEditor', 'memoryManager', 'editText', 'location', 'changelog', 'worldPrompts', 'aiContext', 'designSystem', 'enterWorld', 'connectReferences', 'componentUpdates', 'importComponent', 'codeRename', 'replaceAll', 'savedElsewhere', 'deletedElsewhere', 'demoAI', 'persona', 'errorDetails', 'settingsCompare', 'chipOptions', 'scriptPrompt', ...DEV_PANE_MODALS] as const;
export type DevModal = (typeof DEV_MODALS)[number];

/** The `history=…` value that opens the World Editor's History popover. */
export const DEV_HISTORY_OPEN = 'open';

/** Coverage ledger: tabbed surface → the sub-tabs the router can target (via `tab=…`). Kept in lockstep
 *  with each surface's own exported tab list by `devRouter.test.ts`. Add a surface's tabs here when wired. */
export const DEV_MODAL_TABS = {
  // The Context Menu reference exposes both production group dialogs with isolated data.
  designSystemGroupPicker: ['picker', 'create'],
  settings: ['display', 'output', 'prompts', 'tools', 'endpoints', 'data'],
  // Settings → Tools opens a New Tool draft on its edit tab with `subtab=…`
  // (`#dev?modal=settings&tab=tools&subtab=handler`). The Tools tab is Advanced only.
  settingsToolEdit: ['definition', 'parameters', 'handler', 'tryIt'],
  // Settings → Endpoints names its one surface with the same `subtab=…` (`#dev?modal=settings&tab=endpoints&subtab=text`).
  settingsEndpoints: ['text'],
  worldEditor: ['overview', 'media', 'entities', 'locations', 'traits', 'stats', 'dictionary', 'placeholders', 'scripts', 'tools'],
  // The World Editor's Locations tab shows one of two views of the same locations, switched with `subtab=…`
  // (`#dev?modal=worldEditor&tab=locations&subtab=canvas`). Adding `fullscreen=1` opens the canvas in its
  // full-screen window on arrival — the same canvas, so it is not a third view and not listed as one.
  // `pick=<entity id>` then picks that entity on it, and `pick=<entity id>:knownIn` starts in Known In mode;
  // `fixture=entityPresence` has a range warning on `dev-sentry`.
  worldEditorLocations: ['list', 'canvas'],
  // The World Editor's entity panel splits its fields across its own tabs, reached with the same `subtab=…`
  // slot over the Entities tab (`#dev?modal=worldEditor&tab=entities&subtab=descriptions`). It lands on the
  // panel, so pair it with a world that has an entity to select. `openings` and `placeholders` are Advanced only.
  // `fixture=entityPresence` gives the Archivist Relationships rows on `profile`.
  worldEditorEntity: ['profile', 'descriptions', 'traits', 'stats', 'placeholders', 'openings'],
  // The library entity editor (`#dev?modal=entityEditor&tab=placeholders`). It opens on a blank draft and is
  // never in Simple mode, so every tab is reachable. `fixture=gallery` opens it on an entity whose images carry
  // Visibility rules (`#dev?modal=entityEditor&tab=entity&subtab=profile&fixture=gallery`).
  entityEditor: ['entity', 'traits', 'stats', 'placeholders'],
  dictionaryEditor: ['overview', 'dictionary', 'placeholders'],
  // Its Entity tab's sub-tabs, reached with `subtab=…` (`#dev?modal=entityEditor&tab=entity&subtab=openings`).
  entityEditorEntity: ['profile', 'descriptions', 'openings'],
  // The World Editor's location panel does the same over the Locations tab
  // (`#dev?modal=worldEditor&tab=locations&subtab=presence`). It shares that tab's `subtab=…` slot with the
  // List/Canvas switch above, which is why no value may appear in both lists. `pins` is Advanced only.
  // `fixture=entityPresence` loads a cast for the Presence tab's Entities Here rows; select The White Room.
  worldEditorLocation: ['details', 'presence', 'media', 'pins', 'openings'],
  // The World Editor's stat panel does the same over the Stats tab
  // (`#dev?modal=worldEditor&tab=stats&subtab=code`). `descriptors` and `code` are Advanced only, and
  // Simple mode leaves one tab and no strip, so land those on an Advanced editor.
  worldEditorStat: ['details', 'descriptors', 'code'],
  // The World Editor's trait panel does the same over the Traits tab
  // (`#dev?modal=worldEditor&tab=traits&subtab=stats`). `pins` is Advanced only.
  worldEditorTrait: ['details', 'availability', 'stats', 'pins', 'scripts'],
  // The World Editor's dictionary entry panel does the same over the Dictionary tab
  // (`#dev?modal=worldEditor&tab=dictionary&subtab=matching`). It lands on the entry panel, so pair it with
  // a book that has an entry to select. `matching` is Advanced only, and Simple mode leaves one tab and no
  // strip, so land it on an Advanced editor.
  worldEditorEntry: ['details', 'matching'],
  // The World Editor's dictionary book panel shares that `subtab=…` slot
  // (`#dev?modal=worldEditor&tab=dictionary&subtab=placeholders`). It lands on the book panel, so pair it
  // with a book to select. `placeholders` is Advanced only.
  worldEditorBook: ['details', 'placeholders'],
  // The placeholder panel's own tabs, in any host that opens one (`#dev?modal=worldEditor&tab=placeholders&subtab=pins`).
  // It lands on the panel, so pair it with a placeholder to select. `pins` needs Advanced mode and a world.
  worldEditorPlaceholder: ['details', 'pins'],
  // The World Editor's Test Bench: `bench=…` opens the full panel — at whichever placement is remembered —
  // on the instrument it names (`#dev?modal=worldEditor&bench=issues`). Only built instruments are listed,
  // since an unbuilt tab renders
  // disabled and has nothing to land on, so adding one here is part of building it.
  worldEditorBench: ['issues', 'triggers', 'aiContext', 'opening'],
  // The World Editor's History popover: `history=open` opens it (`#dev?modal=worldEditor&history=open`).
  worldEditorHistory: [DEV_HISTORY_OPEN],
  // The World Editor's Authoring Tour: `tour=…` opens the editor on a new blank world with the tour at that
  // step, every earlier step already taken with its example (`#dev?modal=worldEditor&tour=location-name`).
  worldEditorTour: [
    'world-name', 'world-ai-description', 'world-thumbnail',
    'add-location', 'location-name', 'location-player-description', 'location-ai-description', 'location-image',
    'location-starting',
    'add-second-location', 'second-location-name', 'location-connection',
    'add-entity', 'entity-name', 'entity-locations', 'entity-pronouns', 'entity-image', 'entity-player-description',
    'entity-ai-description',
    'add-stat', 'stat-name', 'stat-description',
    'add-trait', 'trait-name', 'trait-ai-description', 'trait-stat-change',
    'add-dictionary-entry', 'dictionary-name-keywords', 'dictionary-value',
    'editor-mode', 'play',
  ],
  // Admin Panel → Policies has a second level, one sub-tab per authored popup, reached with `subtab=…`.
  // Admin Panel → Feedback uses the same `subtab=…` slot, one per branch.
  // The acknowledge poster renders one of an event's two phases; `tab=…` picks which the canned event is at.
  // `player.*` prompt shapes on the game view (`#dev?view=gameViewer&fixture=whiteRoom&modal=scriptPrompt&tab=askLong`).
  scriptPrompt: ['confirm', 'ask', 'askLong', 'askMulti', 'input', 'tell', 'toast'],
  // MainMenu's library card-type switcher. Not a modal: reached with `tab=…` and no `modal=…`, i.e.
  // `#dev?view=mainMenu&tab=models`. Listed here so the same drift guard covers it.
  mainMenu: ['worlds', 'entities', 'dictionaries'],
  // Settings → Prompts opens one prompt with `subtab=…` (`#dev?modal=settings&tab=prompts&subtab=choices`).
  // A prompt whose feature is off is not in the rail, and the panel lands on Narration.
  settingsPrompts: [
    'narration', 'thinking', 'director', 'character', 'discover', 'storyboard', 'choices',
    'statupdates', 'location', 'entitylocation', 'timepassed', 'timeopening', 'summary', 'milestone', 'diary',
  ],
  // Settings → Prompts has a THIRD level: which surface of the open prompt is on show, reached with
  // `surface=…` (`#dev?modal=settings&tab=prompts&subtab=narration&surface=anatomy`). `anatomy` is the
  // hub every prompt lands on, not an editor; the panel falls back to it wherever a surface doesn't apply.
  settingsPromptSurfaces: ['system', 'user', 'messages', 'options', 'anatomy'],
  // Settings → Prompts preset-level entries, reached with `subtab=…` in place of a prompt
  // (`#dev?modal=settings&tab=prompts&subtab=overview`). A built-in preset shows none and lands on Narration.
  settingsPromptPreset: ['overview'],
  // GameViewer's side panel (Entities/Notes/Memory/Logs). Also not a modal: `#dev?view=gameViewer&tab=memory`.
  // The mobile-only `model` tab is deliberately not routable.
  gameViewer: ['entities', 'notes', 'memory', 'logs'],
  // The narration panel's layout, reached with `mode=…` on the game view (`#dev?view=gameViewer&mode=chat`).
  // It overrides the Narration Layout setting without saving it.
  gameViewerLayout: ['pages', 'chat'],
} as const;

// Admin Panel → Policies uses the `subtab=…` slot, and its two are fixed, so they are guarded above.
// Mid-game boot fixtures live in `devFixtures.ts` (`DEV_FIXTURES`); reached via `bootFixture(name)`.
