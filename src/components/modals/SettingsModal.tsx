import { PromptNavigationRail } from './PromptNavigationRail';
import { useRequestKey } from '@/lib/surface/useRequestKey';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { useTheme } from '../theme-provider';
import LlmSetupGuide from '@/components/modals/LlmSetupGuide';
import { settingsTabsFor, type SettingsTabId } from '@/components/modals/settingsTabs';
import { SETTINGS_DIALOG_SIZE } from '@/components/modals/settingsDialogSize';
import { SurfaceTab } from '@/components/ui/surface';
import { findTargetRow, targetAttribute, type TargetAttribute } from '@/lib/surface/surfaceTargets';
import { useLanding } from '@/lib/surface/useLanding';
import { ToolsTab } from '@/components/modals/ToolsTab';
import { EMPTY_TOOLS_VIEW, TOOL_EDIT_TABS, type ToolsView } from '@/components/modals/toolsView';
import { blankTool } from '@/lib/tools/toolDraft';
import { randomUUID } from '@/lib/uuid';
import type { ToolSnapshot } from '@/lib/tools/toolSnapshot';
import { readSettingsMode, writeSettingsMode, SETTINGS_MODE_DESCRIPTIONS, SETTINGS_HIDDEN_NOTICE, type SettingsMode } from '@/lib/settingsMode';
import { settingsUseAdvancedValues, sectionHiddenFields } from '@/lib/settingsAdvancedData';
import { TutorialPopover } from '@/components/TutorialPopover';
import { useDevRoute } from '@/lib/devRouter';
import { Row, CheckRow, Section, HintInfo, ValueSlider } from '@/components/SettingsRows';
import { MIN_EDITOR_AUTO_SAVE_IDLE_S, MAX_EDITOR_AUTO_SAVE_IDLE_S, EDITOR_AUTO_SAVE_IDLE_STEP_S } from '@/contexts/settingsDefaults';
import { formatPause } from '@/lib/formatPause';
import { SETTINGS_COPY, SETTINGS_BUTTONS, SETTINGS_CONFIRMS } from '@/components/modals/settingsCopy';
import { rowCopy } from '@/components/modals/settingsRowCopy';
import { reasoningRuledOut, toolsSupported, defaultPromptReasoningSetting, resolveReasoningBudgetPct, nativeReasoningSuppressed, type PromptReasoningSetting } from '@/lib/reasoningEffort';
import { MaxOutputControl, PromptReasoningField, type MaxOutputControlProps } from './PromptOptionFields';
import { promptReasoningFieldProps, type PromptReasoningFieldProps } from './promptReasoningField';
import { DisplaySettingsSection } from './DisplaySettingsSection';
import { OutputSettingsSection } from './OutputSettingsSection';
import type { SettingsSource } from './settingsSource';
import { useEmbeddingDownload } from './useEmbeddingDownload';
import { ModeSelect } from '@/components/ui/mode-select';
import { ExportPresetDialog, ImportPresetDialog } from '@/components/modals/PresetShareDialogs';
import { type SharedPreset } from '@/lib/promptPresetShare';
import { APP_VERSION } from '@/lib/version';
import { computePromptTabAvailability } from '@/lib/promptTabAvailability';
import { PresetOverviewPanel } from './PresetOverviewPanel';
import { useEndpointModelSuggestions } from './useEndpointModelSuggestions';
import { visibleGroups, SURFACE_LABELS, HUB_LABEL, HUB_ROUTE, OVERVIEW_LABEL, OVERVIEW_ROUTE, PROMPT_DESCRIPTIONS, PROMPT_LABELS, AUTHORING_LABELS, PROMPT_TAB_REQUESTS, isPromptTab, isAuthoringTab, type PromptSurface } from '@/lib/promptGroups';
import {
  DEFAULT_BRIDGE_MAX_TOKENS, BRIDGE_MAX_TOKENS_MIN, BRIDGE_MAX_TOKENS_MAX, BRIDGE_SUBJECT, BRIDGE_FACETS,
} from '@/lib/bridgeDescription';
import { DEFAULT_SUMMARY_MAX_TOKENS, SUMMARY_MAX_TOKENS_MIN, SUMMARY_MAX_TOKENS_MAX } from '@/lib/summarize';
import { DEFAULT_CHECK_MAX_TOKENS, CHECK_MAX_TOKENS_MIN, CHECK_MAX_TOKENS_MAX } from '@/lib/descriptionCheck';
import type { MessageField, PromptJumpTarget } from '@/lib/promptJump';
import { revealEditorChip, cancelEditorReveals } from '@/lib/editorFieldFocus';
import type { AnatomyViewMode } from '@/components/game/RequestAnatomyView';
import { RequestAnatomyPanel } from './RequestAnatomyPanel';
import { Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PanelShell } from "@/components/PanelShell";
import { useMorphFullscreen } from "@/lib/useMorphFullscreen";
import { composePreviewValues, languagePreviewValue } from "@/lib/previewValuePool";
import { layerValues, type TokenValues } from "@/lib/promptValues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadEmbeddingModel, disposeEmbeddingModel } from '@/lib/embeddingWorkerClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectSeparator, SelectGroup, SelectLabel } from "@/components/ui/select";
import PromptField from '../prompt/PromptField';
import { PROMPT_KIND_VARIABLES, PROMPT_KIND_USER_VARIABLES, NOW_LINE_VARIABLES, type PromptVariable } from '@/lib/promptVariables';
import { defaultPromptSampler } from '@/lib/promptSamplers';
import { MAX_AUTOSAVE_SLOTS } from '@/lib/autosave';
import { SamplerControl, type SamplerControlProps } from './SamplerControl';
import { EndpointRouteField } from './EndpointRouteField';
import { TextEndpointEditor } from './TextEndpointEditor';
import { activePresetEditor } from './textEndpointEditorModel';
import { ReadOnlyNotice } from '@/components/prompt/ReadOnlyNotice';
import { PromptCompareDialog } from '@/components/prompt/PromptCompareDialog';
import { DevChipOptions } from '@/components/prompt/DevChipOptions';
import { PromptResetCompare } from '@/components/prompt/PromptResetCompare';
import { promptVocabulary } from '@/lib/chipVocabulary';
import { isMaxOutputKind, shippedMaxOutput } from '@/lib/promptMaxOutput';
import { ConfirmDialog } from '../ConfirmDialog';
import { toast } from 'react-toastify';
import { toastError } from '@/lib/linkToast';
import WorldStorageService from '@/services/WorldStorageService';
import { cachedImageBytes, clearCachedImages } from '@/lib/remoteImageCache';
import { formatBytes } from '@/lib/imageOptim';
import { DEFAULT_WORLDS, readDeletedDefaultWorlds, clearDeletedDefaultWorlds } from '@/lib/defaultWorlds';
import { PresetNameDialog } from './PresetNameDialog';
import { PresetHeader } from '@/components/presetHeader/PresetHeader';
import { presetHeaderActions } from '@/lib/presetHeaderActions';
import { OPENING_SCENE_CUE, PROMPT_TEXT_DEFAULTS } from '../game/GamePrompts';
import { buildStyledValues } from '@/lib/sectionStyle';
import { statTextFor } from '@/lib/statTextPrompts';
import { resetTutorials, useSeenTutorialCount, useTutorial } from '@/lib/tutorials';

/** One editable prompt template: its text, its shipped default, its setter and its chip palette. */
type EditablePrompt = {
  value: string; def: string; set: (s: string) => void; variables: PromptVariable[];
  /** Runs beside the footer's Reset, for a prompt that was edited as a pair with something else. */
  onReset?: () => void;
};

/** Per-prompt control: the output cap for one authoring prompt. It rides the System view rather than
 *  Options because it is not tuning — a template edited to ask for more than the cap allows stops
 *  mid-sentence, with nothing on screen to say why, so the two are only meaningful side by side. */
function DescTokenCapField({ id, value, min, max, onChange, disabled }: {
  id: string; value: number; min: number; max: number; onChange: (n: number) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <label htmlFor={id} className="text-label">Max Output Tokens</label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.min(max, numInput(e.target.value, min)))}
        className="w-24"
      />
      <span className="hidden sm:inline text-helper text-muted-foreground">
        Caps how long this generation may run. Raise it if you ask the prompt for longer text.
      </span>
    </div>
  );
}

/** The chip families of the Messages fields, for their compare views. */
const NO_VARIABLES: PromptVariable[] = [];
const NO_VARIABLES_VOCABULARY = promptVocabulary(NO_VARIABLES);
const NOW_LINE_VOCABULARY = promptVocabulary(NOW_LINE_VARIABLES);
const NARRATION_VOCABULARY = promptVocabulary(PROMPT_KIND_VARIABLES.narration);


/** Per-prompt control: how many recent turns this prompt receives verbatim (the rest are summarized). */
function VerbatimTurnsField({ id, value, onChange, disabled }: { id: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const c = SETTINGS_COPY.verbatimTurns;
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <label htmlFor={id} className="text-label">{c.label}</label>
      <Input
        id={id}
        type="number"
        min={0}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
        className="w-20"
      />
      <span className="hidden sm:inline text-helper text-muted-foreground">{c.description}</span>
      <HintInfo>{c.info}</HintInfo>
    </div>
  );
}

/** The per-prompt Options sub-tab: the verbatim-turns control (only when digests are on and the prompt uses
 *  them), the per-prompt Native Reasoning override (the effort level on external endpoints, or the token budget
 *  on the local engine), plus one override row per tunable sampler.
 *  `disabled` locks every control when the active prompt preset is built-in (Default/Simple). */
function PromptOptionsPanel({ endpoint, maxOutput, verbatim, reasoning, samplers, disabled, readOnlyReason, onRequestEdit }: {
  /** Read-only under a built-in prompt preset, like the rest of the panel. */
  endpoint: React.ComponentProps<typeof EndpointRouteField>;
  /** Absent on a prompt without a Max Output row. */
  maxOutput: Omit<MaxOutputControlProps, 'disabled'> | null;
  verbatim: { value: number; set: (n: number) => void } | null;
  reasoning: Omit<PromptReasoningFieldProps, 'disabled'> | null;
  samplers: SamplerControlProps[];
  disabled: boolean;
  /** What is read-only, named in the notice. Absent on an editable preset. */
  readOnlyReason?: string;
  onRequestEdit?: () => void;
}) {
  return (
    <>
      {/* Same notice the editor carries: every control below is inert under a built-in, and a panel of dead
          checkboxes and sliders reads as broken rather than protected unless it says why. Outside the padded
          box so it lands at the same height as the editor's — inside, the panel's own top padding nudged it
          down and it visibly shifted when moving between a prompt's sub-tabs. */}
      {disabled && readOnlyReason && (
        <ReadOnlyNotice reason={readOnlyReason} onRequestEdit={onRequestEdit} />
      )}
      {/* Flush with the editor beside it. The slider thumb's clearance is on the slider rows themselves, so
          it no longer narrows the whole panel; the scroll frame supplies the right-hand gutter. */}
      <div className="space-y-5 py-3">
        <div {...targetAttribute('settingsPromptSurfaces.options', 'prompt-endpoint')}>
          <EndpointRouteField {...endpoint} disabled={disabled} />
        </div>
        {maxOutput && <MaxOutputControl {...maxOutput} disabled={disabled} />}
        {verbatim && <VerbatimTurnsField id="promptVerbatim" value={verbatim.value} onChange={verbatim.set} disabled={disabled} />}
        {reasoning && <PromptReasoningField {...reasoning} disabled={disabled} />}
        {samplers.map((s) => <SamplerControl key={s.id} {...s} disabled={disabled} />)}
      </div>
    </>
  );
}

/** The mode select is the target of the tab it sits over; the other tabs use Data's. */
const MODE_SELECT_TARGETS: Record<string, TargetAttribute> & { data: TargetAttribute } = {
  output: targetAttribute('settings.output', 'settings-mode'),
  data: targetAttribute('settings.data', 'settings-mode'),
};

export const SettingsModal = ({ isOpen, onOpenChange, previewValues, toolWorld, initialTab, initialPromptTab, initialPromptSurface, initialPromptField, initialTarget, requestKey: landingKey, onWorldsRestored, onStartAuthoringTour, forcedMode }: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after Restore Default Worlds re-seeds, so a world list on screen can refresh. */
  onWorldsRestored?: () => void;
  /** Starts the Authoring Tour on a new world. Only the main menu supplies it, so a running game hides the row. */
  onStartAuthoringTour?: () => void;
  /** Live variable values for the prompt-editor Preview tab. Supplied only in game; absent → no Preview. */
  previewValues?: TokenValues;
  /** The open world as a Tool Snapshot, for Try It. Supplied only in game; absent, Try It uses the sample world. */
  toolWorld?: () => ToolSnapshot;
  /** DEV dev-router: open on this top-level tab instead of the default (see `devRouter.ts`). */
  initialTab?: SettingsTabId;
  /** Which prompt under the Prompts tab to open (e.g. 'narration', 'thinking'). Set by the dev-router, and
   *  by a click on a highlighted run in the in-game AI-context viewer. */
  initialPromptTab?: string;
  initialPromptSurface?: string;
  /** Which stacked field of the Messages view to scroll to and focus on arrival. */
  initialPromptField?: MessageField;
  /** The route text of the row a Take Me There request lands on. */
  initialTarget?: string;
  /** Changes with each outside request, so a repeat request for the tab already set selects it again. */
  requestKey?: string;
  /** Overrides the stored Simple/Advanced preference (the dev-router's `mode` param; tests set it directly). */
  forcedMode?: SettingsMode;
}) => {
  const devRoute = useDevRoute();
  // DEV dev-router: `#dev?modal=settingsCompare` opens the compare view on a canned Narration edit.
  const [devCompare, setDevCompare] = useState(false);
  useEffect(() => { if (import.meta.env.DEV && devRoute?.modal === 'settingsCompare') setDevCompare(true); }, [devRoute]);
  // DEV dev-router: `#dev?modal=chipOptions` opens Chip Options on a canned Entities chip.
  const [devChipOptions, setDevChipOptions] = useState(false);
  useEffect(() => { if (import.meta.env.DEV && devRoute?.modal === 'chipOptions') setDevChipOptions(true); }, [devRoute]);
  const routeMode = import.meta.env.DEV && (devRoute?.mode === 'simple' || devRoute?.mode === 'advanced')
    ? devRoute.mode
    : undefined;
  // Asking for a tab Simple hides is asking for Advanced: `goto('settings', { tab: 'prompts' })` names a
  // destination, and landing somewhere else instead is the dev-router failure that is hardest to notice.
  const wantsAdvancedTab = !!initialTab && settingsTabsFor(false).every((t) => t.value !== initialTab);
  const [mode, setModeState] = useState<SettingsMode>(() =>
    forcedMode ?? routeMode ?? (wantsAdvancedTab ? 'advanced' : readSettingsMode()));
  const setMode = useCallback((next: SettingsMode) => { setModeState(next); writeSettingsMode(next); }, []);
  const advanced = mode === 'advanced';
  // Each parsed route is a fresh object, so a `goto` with the mode already showing still re-applies it —
  // a mount-time seed alone would miss that once the switch had been clicked.
  const lastRoute = useRef(devRoute);
  useEffect(() => {
    if (lastRoute.current === devRoute) return;
    lastRoute.current = devRoute;
    if (routeMode) setModeState(routeMode);
    else if (wantsAdvancedTab) setModeState('advanced');
  }, [devRoute, routeMode, wantsAdvancedTab]);
  useEffect(() => { if (forcedMode) setModeState(forcedMode); }, [forcedMode]);
  const requestKey = useRequestKey(landingKey);
  useEffect(() => {
    if (requestKey && wantsAdvancedTab) setModeState('advanced');
    // Only a new request switches the mode; the player's own switch afterwards stands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  const visibleTabs = useMemo(() => settingsTabsFor(advanced), [advanced]);
  const { active: tutorial, nav: tutorialNav, dismiss } = useTutorial('settings', { active: isOpen });
  const dismissTutorial = useCallback(() => { if (tutorial) dismiss(tutorial.id); }, [tutorial, dismiss]);
  const [activeTab, setActiveTab] = useState<string>(initialTab ?? visibleTabs[0].value);
  // Switching to Simple while standing on a hidden tab would blank the panel with no way back to it.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.value === activeTab)) setActiveTab(visibleTabs[0].value);
  }, [visibleTabs, activeTab]);
  // Deleted-default count, refreshed whenever the modal opens: localStorage isn't reactive, and the player
  // may have deleted a world since it last rendered.
  const [deletedDefaultCount, setDeletedDefaultCount] = useState(0);
  useEffect(() => { if (isOpen) setDeletedDefaultCount(readDeletedDefaultWorlds().size); }, [isOpen]);
  // Same reasoning for the linked-image cache: it grows during the game, so re-measure on open rather than once.
  const [cachedBytes, setCachedBytes] = useState(0);
  const seenTutorialCount = useSeenTutorialCount();
  // The read outlives a quick close, so the cleanup drops the late answer rather than writing to a gone modal.
  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    cachedImageBytes()
      .then((bytes) => { if (live) setCachedBytes(bytes); })
      .catch(() => { if (live) setCachedBytes(0); });
    return () => { live = false; };
  }, [isOpen]);

  const clearImageCache = async () => {
    try {
      await clearCachedImages();
      setCachedBytes(0);
      toast.success('Cached images cleared');
    } catch (error) {
      toastError(error, { headline: 'Could not clear the cached images' });
    }
  };

  const restoreDefaultWorlds = async () => {
    clearDeletedDefaultWorlds();
    try {
      const { failed, errors } = await WorldStorageService.loadDefaultWorlds(DEFAULT_WORLDS);
      if (failed.length) {
        toastError(
          new AggregateError(errors, 'Default worlds failed to restore'),
          { headline: `Some default worlds failed to restore: ${failed.join(', ')}` },
        );
      } else toast.success('Default worlds restored');
    } catch (error) {
      toastError(error, { headline: 'Could not restore the default worlds' });
    }
    setDeletedDefaultCount(readDeletedDefaultWorlds().size);
    onWorldsRestored?.();
  };
  // Honor a later dev-router tab change while the modal stays open (a fresh __fmDev.goto).
  useEffect(() => { if (initialTab) setActiveTab(initialTab); }, [initialTab, requestKey]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const landTarget = useLanding(
    (route: string) => (dialogRef.current ? findTargetRow(dialogRef.current, route) : null),
  );
  useEffect(() => { if (initialTarget) landTarget(initialTarget); }, [initialTarget, requestKey, landTarget]);
  const settings = useSettings();
  const {
    language,
    endpointUrl,
    maxTokens,
    builtinTextEndpointPresets,
    textEndpointPresets,
    activeTextEndpointPresetName,
    systemPrompt,
    setSystemPrompt,
    choicesPrompt,
    setChoicesPrompt,
    statUpdatesPrompt,
    setStatUpdatesPrompt,
    locationChangePromptText,
    setLocationChangePromptText,
    choicesEnabled,
    statUpdatesEnabled,
    locationChangeEnabled,
    locationAutoApply,
    entityMovement,
    narrationVerbatimTurns,
    setNarrationVerbatimTurns,
    thinkingVerbatimTurns,
    setThinkingVerbatimTurns,
    choicesVerbatimTurns,
    setChoicesVerbatimTurns,
    statUpdatesVerbatimTurns,
    setStatUpdatesVerbatimTurns,
    locationChangeVerbatimTurns,
    setLocationChangeVerbatimTurns,
    summaryVerbatimTurns,
    setSummaryVerbatimTurns,
    thinkingMode,
    limitActiveCharacters,
    activeCharacterLimit,
    reasoningCapability,
    nativeReasoning,
    promptReasoningSettings,
    setPromptReasoning,
    promptReasoningBudget,
    setPromptReasoningBudget,
    promptMaxOutput,
    setPromptMaxOutputCustom,
    setPromptMaxOutputValue,
    thinkingPrompt,
    setThinkingPrompt,
    summaryPrompt,
    setSummaryPrompt,
    diaryPrompt,
    setDiaryPrompt,
    directorPrompt,
    setDirectorPrompt,
    directorUserPrompt,
    setDirectorUserPrompt,
    characterPrompt,
    setCharacterPrompt,
    storyboardPrompt,
    setStoryboardPrompt,
    narrationUserPrompt,
    setNarrationUserPrompt,
    recapUserPrompt,
    rehydrateUserPrompt,
    setRehydrateUserPrompt,
    setRecapUserPrompt,
    oocDirectivePrompt,
    setOocDirectivePrompt,
    choicesUserPrompt,
    setChoicesUserPrompt,
    statUpdatesUserPrompt,
    setStatUpdatesUserPrompt,
    locationChangeUserPrompt,
    setLocationChangeUserPrompt,
    entityLocationPrompt,
    setEntityLocationPrompt,
    entityLocationUserPrompt,
    setEntityLocationUserPrompt,
    summaryUserPrompt,
    milestoneSelectPrompt,
    setMilestoneSelectPrompt,
    milestoneSelectUserPrompt,
    setMilestoneSelectUserPrompt,
    nowLinePrompt,
    setNowLinePrompt,
    timePassedPrompt,
    setTimePassedPrompt,
    timePassedUserPrompt,
    setTimePassedUserPrompt,
    openingTimePrompt,
    setOpeningTimePrompt,
    openingTimeUserPrompt,
    setOpeningTimeUserPrompt,
    discoverEntityPrompt,
    setDiscoverEntityPrompt,
    discoverEntityUserPrompt,
    setDiscoverEntityUserPrompt,
    playerDescPrompt,
    setPlayerDescPrompt,
    aiDescPrompt,
    setAiDescPrompt,
    aiSummaryPrompt,
    setAiSummaryPrompt,
    descCheckPrompt,
    setDescCheckPrompt,
    descMaxTokens,
    setDescMaxTokens,
    setSummaryUserPrompt,
    promptPresets,
    builtinPresets,
    activePresetId,
    activeSectionStyle,
    statTextPrompts,
    presetPinnedToWorld,
    activePresetIsBuiltIn,
    selectPreset,
    addPreset,
    renamePreset,
    deletePreset,
    resetPreset,
    presetOverview,
    setPresetOverview,
    catalogTools,
    userTools,
    enabledTools,
    saveTool,
    deleteTool,
    setToolEnabled,
    exportActivePreset,
    importPreset,
    memoryDigests,
    semanticMemory,
    semanticRehydration,
    timeContext,
    aiClock,
    toolsEnabled,
    autosaveEnabled,
    setAutosaveEnabled,
    autosaveSlots,
    setAutosaveSlots,
    editorAutoSave,
    setEditorAutoSave,
    editorAutoSaveIdleSeconds,
    setEditorAutoSaveIdleSeconds,
    characterDiaries,
    describeCharacters,
    genTemperature,
    genRepetitionPenalty,
    promptSamplers,
    setPromptSamplerCustom,
    setPromptSamplerValue,
    promptEndpoints,
    setPromptEndpoint,
    resolveEndpointForKind,
    paragraphLimit,
    markdownOutput,
  } = settings;
  // Autosaves Kept as it stood when Settings opened: lowering it below that warns until Settings closes.
  const [autosaveSlotsAtOpen, setAutosaveSlotsAtOpen] = useState(autosaveSlots);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- taken on open only; the edits after it are what it is compared with
  useEffect(() => { if (isOpen) setAutosaveSlotsAtOpen(autosaveSlots); }, [isOpen]);
  const themeState = useTheme();
  const [connectionGuideOpen, setConnectionGuideOpen] = useState(false);
  const embeddingModel = useEmbeddingDownload(loadEmbeddingModel, disposeEmbeddingModel);
  const settingsSource: SettingsSource = { ...settings, ...themeState, embeddingModel };

  // Preset name dialog (Add / Rename); the "Add New Preset…" select option opens it in add mode.
  const [presetDialog, setPresetDialog] = useState<{ mode: 'add' | 'rename' } | null>(null);
  const ADD_PRESET_SENTINEL = '__add_preset__';
  const [exportShared, setExportShared] = useState<SharedPreset | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const activePresetName = [...builtinPresets, ...promptPresets].find((p) => p.id === activePresetId)?.name ?? '';
  const handlePresetSelect = (v: string) => {
    if (v === ADD_PRESET_SENTINEL) setPresetDialog({ mode: 'add' });
    else selectPreset(v);
  };
  // `addPreset` clones the active values and selects the result, so a copy needs no dialog.
  const duplicatePreset = () => addPreset(`${activePresetName} (copy)`);
  const presetActions = presetHeaderActions(activePresetIsBuiltIn, {
    duplicate: duplicatePreset,
    rename: () => setPresetDialog({ mode: 'rename' }),
    import: () => setImportOpen(true),
    export: () => setExportShared(exportActivePreset(APP_VERSION)),
    reset: {
      run: () => resetPreset(activePresetId),
      description: `Reset every prompt in the "${activePresetName}" preset to its default value? This can't be undone.`,
    },
    delete: {
      run: () => deletePreset(activePresetId),
      description: `Delete the "${activePresetName}" preset? This can't be undone.`,
    },
  });
  const handlePresetNameSubmit = (name: string) => {
    if (presetDialog?.mode === 'add') addPreset(name);
    else if (presetDialog?.mode === 'rename') renamePreset(activePresetId, name);
  };
  // Short enough for one line on mobile; the notice puts the whole sentence on hover.
  const readOnlyReason = activePresetIsBuiltIn ? `${activePresetName} is read-only` : undefined;

  // Preview needs values to swap the chips for, and a game supplies them. Without one the pane (and the
  // side-by-side split that depends on it) had nothing to show, so writing a prompt meant loading a world
  // first. Falling back to samples makes the editor usable from the main menu; `sampleData` badges the pane
  // so the stand-in content is never mistaken for the player's own world.
  // Guidance follows the player's own settings and is real either way; only the world-state tokens are
  // stand-ins, which is what the badge speaks to.
  const usingSampleValues = !previewValues;
  // Both preview surfaces describe narration, so use the exact cap its request resolves to.
  const narrationPreviewMaxTokens = resolveEndpointForKind('narration').maxTokens;
  // Memoized because the Anatomy hub keys its whole assembly on this pool (see `hubSettings`).
  const effectivePreviewValues = useMemo(
    () => composePreviewValues(
      { paragraphLimit, maxTokens: narrationPreviewMaxTokens, markdownOutput, sectionStyle: activeSectionStyle, limitActiveCharacters, activeCharacterLimit, language },
      previewValues,
    ),
    [paragraphLimit, narrationPreviewMaxTokens, markdownOutput, activeSectionStyle, limitActiveCharacters, activeCharacterLimit, language, previewValues],
  );
  // The choices prompt's language chip names itself in the directive, so its preview says "choices" where
  // the pool's default says "narration".
  const choicesPreviewValues = layerValues(effectivePreviewValues, languagePreviewValue('choices', language));

  // The selected prompt sub-tab, so the Reset button can target just that prompt.
  const [promptTab, setPromptTab] = useState(initialPromptTab ?? 'narration');
  // DEV dev-router: honor a requested prompt sub-tab (a `subtab=…` in the hash).
  useEffect(() => { if (initialPromptTab) setPromptTab(initialPromptTab); }, [initialPromptTab, requestKey]);
  // The preset's Overview stands in place of a prompt. A built-in has none, so it falls through to the prompt.
  const [overviewOpen, setOverviewOpen] = useState(initialPromptTab === OVERVIEW_ROUTE);
  useEffect(() => { if (initialPromptTab) setOverviewOpen(initialPromptTab === OVERVIEW_ROUTE); }, [initialPromptTab, requestKey]);
  const showingOverview = overviewOpen && presetOverview !== null;
  const endpointModels = useEndpointModelSuggestions();
  // The mobile selector's value for the Overview entry; prompt and surface entries use their own prefixes.
  const overviewOption = `preset:${OVERVIEW_ROUTE}`;
  // Each prompt's default in the preset's section style, the text the whole-preset Reset writes too.
  const styledDefaults = useMemo(() => buildStyledValues(PROMPT_TEXT_DEFAULTS, activeSectionStyle), [activeSectionStyle]);
  // Names come from the shared map, so a jump that says where it goes and the rail row it lands on cannot
  // call the same prompt two different things.
  const editablePrompts: Record<string, EditablePrompt & { label: string }> = {
    narration: { label: PROMPT_LABELS.narration, value: systemPrompt, def: styledDefaults.systemPrompt, set: setSystemPrompt, variables: PROMPT_KIND_VARIABLES.narration },
    thinking: { label: PROMPT_LABELS.thinking, value: thinkingPrompt, def: styledDefaults.thinkingPrompt, set: setThinkingPrompt, variables: PROMPT_KIND_VARIABLES.thinking },
    choices: { label: PROMPT_LABELS.choices, value: choicesPrompt, def: styledDefaults.choicesPrompt, set: setChoicesPrompt, variables: PROMPT_KIND_VARIABLES.choices },
    statupdates: { label: PROMPT_LABELS.statupdates, value: statUpdatesPrompt, def: styledDefaults.statUpdatesPrompt, set: setStatUpdatesPrompt, variables: PROMPT_KIND_VARIABLES.statupdates },
    location: { label: PROMPT_LABELS.location, value: locationChangePromptText, def: styledDefaults.locationChangePromptText, set: setLocationChangePromptText, variables: PROMPT_KIND_VARIABLES.location },
    entitylocation: { label: PROMPT_LABELS.entitylocation, value: entityLocationPrompt, def: styledDefaults.entityLocationPrompt, set: setEntityLocationPrompt, variables: PROMPT_KIND_VARIABLES.entitylocation },
    summary: { label: PROMPT_LABELS.summary, value: summaryPrompt, def: styledDefaults.summaryPrompt, set: setSummaryPrompt, variables: PROMPT_KIND_VARIABLES.summary },
    milestone: { label: PROMPT_LABELS.milestone, value: milestoneSelectPrompt, def: styledDefaults.milestoneSelectPrompt, set: setMilestoneSelectPrompt, variables: PROMPT_KIND_VARIABLES.milestone },
    timepassed: { label: PROMPT_LABELS.timepassed, value: timePassedPrompt, def: styledDefaults.timePassedPrompt, set: setTimePassedPrompt, variables: PROMPT_KIND_VARIABLES.timepassed },
    timeopening: { label: PROMPT_LABELS.timeopening, value: openingTimePrompt, def: styledDefaults.openingTimePrompt, set: setOpeningTimePrompt, variables: PROMPT_KIND_VARIABLES.timeopening },
    diary: { label: PROMPT_LABELS.diary, value: diaryPrompt, def: styledDefaults.diaryPrompt, set: setDiaryPrompt, variables: PROMPT_KIND_VARIABLES.diary },
    director: { label: PROMPT_LABELS.director, value: directorPrompt, def: styledDefaults.directorPrompt, set: setDirectorPrompt, variables: PROMPT_KIND_VARIABLES.director },
    character: { label: PROMPT_LABELS.character, value: characterPrompt, def: styledDefaults.characterPrompt, set: setCharacterPrompt, variables: PROMPT_KIND_VARIABLES.character },
    discover: { label: PROMPT_LABELS.discover, value: discoverEntityPrompt, def: styledDefaults.discoverEntityPrompt, set: setDiscoverEntityPrompt, variables: PROMPT_KIND_VARIABLES.discover },
    storyboard: { label: PROMPT_LABELS.storyboard, value: storyboardPrompt, def: styledDefaults.storyboardPrompt, set: setStoryboardPrompt, variables: PROMPT_KIND_VARIABLES.storyboard },
    // Reset restores the prompt AND its cap: the two were edited as a pair, so restoring only the text
    // would leave a default template running under a cap the author raised for a longer one.
    playerdesc: {
      label: AUTHORING_LABELS.playerdesc, value: playerDescPrompt, def: styledDefaults.playerDescPrompt, set: setPlayerDescPrompt,
      variables: PROMPT_KIND_VARIABLES.playerdesc, onReset: () => setDescMaxTokens('playerdesc', DEFAULT_BRIDGE_MAX_TOKENS),
    },
    aidesc: {
      label: AUTHORING_LABELS.aidesc, value: aiDescPrompt, def: styledDefaults.aiDescPrompt, set: setAiDescPrompt,
      variables: PROMPT_KIND_VARIABLES.aidesc, onReset: () => setDescMaxTokens('aidesc', DEFAULT_BRIDGE_MAX_TOKENS),
    },
    aisummary: {
      label: AUTHORING_LABELS.aisummary, value: aiSummaryPrompt, def: styledDefaults.aiSummaryPrompt, set: setAiSummaryPrompt,
      variables: PROMPT_KIND_VARIABLES.aisummary, onReset: () => setDescMaxTokens('aisummary', DEFAULT_SUMMARY_MAX_TOKENS),
    },
    desccheck: {
      label: AUTHORING_LABELS.desccheck, value: descCheckPrompt, def: styledDefaults.descCheckPrompt, set: setDescCheckPrompt,
      variables: PROMPT_KIND_VARIABLES.desccheck, onReset: () => setDescMaxTokens('desccheck', DEFAULT_CHECK_MAX_TOKENS),
    },
  };
  // Each prompt tab only exists while its prompt is enabled (toggled in Generation → System Prompts, or
  // its governing setting for Thinking/Summary). If the open tab is no longer available (disabled since,
  // or on reopen), fall back to Narration so the panel isn't blank.
  const promptAvailable = computePromptTabAvailability({
    thinkingMode, choicesEnabled, statUpdatesEnabled, locationChangeEnabled, entityMovement, memoryDigests, characterDiaries, describeCharacters, aiClock,
    advanced,
  });
  const activePromptTab = promptAvailable[promptTab] ? promptTab : 'narration';
  const selectedPrompt = editablePrompts[activePromptTab] ?? editablePrompts.narration;

  // Each prompt has a System editor, an Options sub-tab, and — for the aux prompts — a User-message editor.
  // Narration additionally has a Messages view: the conditional user-slot lines that ride the narration
  // exchange (Recap, Recall, Direction), stacked with per-field resets, each hidden with its feature.
  // Null is the Anatomy hub — the prompt with no editor open, which is where selecting one lands.
  const [promptView, setPromptView] = useState<PromptSurface | null>(null);
  // The stacked Messages fields, by key, so a jump from the hub can land on the one it named.
  const messageFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Instant, not smooth: the field has to be under the cursor by the time focus lands on it. A built-in
  // preset's editors are read-only, so there is nothing to put a caret in; the scroll is the whole jump.
  const landField = useLanding((field: MessageField) => messageFieldRefs.current[field] ?? null, {
    block: 'start',
    focus: (field) => field.querySelector<HTMLElement>('[data-lexical-editor][contenteditable="true"]'),
  });
  // Which chip the arriving editor should scroll to and ring, set by a hub jump onto one.
  const [jumpChip, setJumpChip] = useState<string | null>(null);
  // How the hub draws a request. Held here rather than in the panel so a trip into an editor and back
  // keeps it, and rather than in settings because it is a way of looking, not a preference.
  const [anatomyMode, setAnatomyMode] = useState<AnatomyViewMode>('chips');
  // DEV dev-router: land on a named surface (`surface=…`). Re-runs when the prompt changes too, since
  // switching prompts returns to the hub. `anatomy` is the hub itself, and so is anything unrecognized.
  useEffect(() => {
    if (!initialPromptSurface) return;
    setPromptView(
      initialPromptSurface === HUB_ROUTE || !(initialPromptSurface in SURFACE_LABELS)
        ? null
        : (initialPromptSurface as PromptSurface),
    );
    if (initialPromptField) landField(initialPromptField);
  }, [initialPromptSurface, initialPromptTab, initialPromptField, requestKey, landField]);
  // Fullscreen for the whole Prompts panel (rail included), not for one field — see PanelShell. The
  // morph is the single source of truth: fields read `contentInOverlay`, so they return to their docked
  // form the moment the close starts — under the overlay, by then a fading solid panel.
  const promptsPanelRef = useRef<HTMLDivElement | null>(null);
  const promptsMorph = useMorphFullscreen(promptsPanelRef);
  const promptsFullscreen = promptsMorph.contentInOverlay;
  // The Tools tab's own full screen, the same morph. Its view lives here so the remount keeps it.
  const toolsPanelRef = useRef<HTMLDivElement | null>(null);
  const toolsMorph = useMorphFullscreen(toolsPanelRef);
  const [toolsView, setToolsView] = useState<ToolsView>(EMPTY_TOOLS_VIEW);
  // DEV dev-router: `tab=tools&subtab=<edit tab>` opens a New Tool draft on that tab.
  useEffect(() => {
    const editTab = TOOL_EDIT_TABS.find((t) => t.value === initialPromptTab)?.value;
    if (initialTab === 'tools' && editTab) setToolsView({ selectedId: null, draft: blankTool(randomUUID()), editTab, keptHandlers: {} });
  }, [initialTab, initialPromptTab]);
  // Selecting a prompt — including re-selecting the open one — returns to its hub, so the map is always
  // one click away from any editor.
  const selectPromptTab = (t: string) => { setOverviewOpen(false); setPromptTab(t); setPromptView(null); };
  const selectPromptView = (s: PromptSurface | null) => { setOverviewOpen(false); setPromptView(s); };
  /** A clicked run or chip in the anatomy: open the prompt, the editor that owns it, and — for a chip —
   *  the placement itself. A target with no surface is another prompt's hub. */
  const jumpToPrompt = (target: PromptJumpTarget) => {
    setOverviewOpen(false);
    setPromptTab(target.tab);
    setPromptView(target.surface ?? null);
    if (target.field) landField(target.field);
    setJumpChip(target.chip ?? null);
  };
  // The rail's groups, with prompts whose feature is off already removed.
  const railGroups = visibleGroups(promptAvailable);
  const userPrompts: Record<string, EditablePrompt> = {
    // Narration's user template applies only with thinking off (GameViewer guard); hide the editor
    // in other modes so a change there can't silently do nothing.
    ...(thinkingMode === 'off' ? { narration: { value: narrationUserPrompt, set: setNarrationUserPrompt, def: styledDefaults.narrationUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.narration ?? NO_VARIABLES } } : {}),
    choices: { value: choicesUserPrompt, set: setChoicesUserPrompt, def: styledDefaults.choicesUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.choices ?? NO_VARIABLES },
    statupdates: { value: statUpdatesUserPrompt, set: setStatUpdatesUserPrompt, def: styledDefaults.statUpdatesUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.statupdates ?? NO_VARIABLES },
    location: { value: locationChangeUserPrompt, set: setLocationChangeUserPrompt, def: styledDefaults.locationChangeUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.location ?? NO_VARIABLES },
    entitylocation: { value: entityLocationUserPrompt, set: setEntityLocationUserPrompt, def: styledDefaults.entityLocationUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.entitylocation ?? NO_VARIABLES },
    summary: { value: summaryUserPrompt, set: setSummaryUserPrompt, def: styledDefaults.summaryUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.summary ?? NO_VARIABLES },
    milestone: { value: milestoneSelectUserPrompt, set: setMilestoneSelectUserPrompt, def: styledDefaults.milestoneSelectUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.milestone ?? NO_VARIABLES },
    timepassed: { value: timePassedUserPrompt, set: setTimePassedUserPrompt, def: styledDefaults.timePassedUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.timepassed ?? NO_VARIABLES },
    timeopening: { value: openingTimeUserPrompt, set: setOpeningTimeUserPrompt, def: styledDefaults.openingTimeUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.timeopening ?? NO_VARIABLES },
    director: { value: directorUserPrompt, set: setDirectorUserPrompt, def: styledDefaults.directorUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.director ?? NO_VARIABLES },
    discover: { value: discoverEntityUserPrompt, set: setDiscoverEntityUserPrompt, def: styledDefaults.discoverEntityUserPrompt, variables: PROMPT_KIND_USER_VARIABLES.discover ?? NO_VARIABLES },
  };
  const activeUserPrompt = userPrompts[activePromptTab];
  const showingUser = promptView === 'user' && !!activeUserPrompt;
  // The recap line rides the narration history only while Memory Digests is on; the editor lives on the
  // Narration tab and hides with the feature so an edit can't silently do nothing.
  const recapAvailable = activePromptTab === 'narration' && memoryDigests;
  // The now-line closes the same recap reply, so it lives and hides with the recap itself.
  const nowAvailable = recapAvailable;
  // The recall line rides only while Scene Recall is on — same hide-with-the-feature rule as the recap.
  const recallAvailable = activePromptTab === 'narration' && memoryDigests && semanticMemory && semanticRehydration;
  // The direction rider fires only on [bracket] turns with thinking off (same guard as the User template).
  const directionAvailable = activePromptTab === 'narration' && thinkingMode === 'off';
  // The Messages view stacks whichever of the conditional narration lines are live.
  const messagesAvailable = recapAvailable || nowAvailable || recallAvailable || directionAvailable;
  const showingMessages = promptView === 'messages' && messagesAvailable;
  // The stacked fields the Messages view renders — one per live line, each with its own reset.
  const messageFields = [
    ...(recapAvailable ? [{
      key: 'recap', ...SETTINGS_COPY.recapMessage,
      value: recapUserPrompt, set: setRecapUserPrompt, def: styledDefaults.recapUserPrompt,
      variables: undefined, vocabulary: NO_VARIABLES_VOCABULARY,
    }] : []),
    ...(nowAvailable ? [{
      key: 'now', ...SETTINGS_COPY.nowMessage,
      value: nowLinePrompt, set: setNowLinePrompt, def: styledDefaults.nowLinePrompt,
      variables: NOW_LINE_VARIABLES, vocabulary: NOW_LINE_VOCABULARY,
    }] : []),
    ...(recallAvailable ? [{
      key: 'recall', ...SETTINGS_COPY.recallMessage,
      value: rehydrateUserPrompt, set: setRehydrateUserPrompt, def: styledDefaults.rehydrateUserPrompt,
      variables: undefined, vocabulary: NO_VARIABLES_VOCABULARY,
    }] : []),
    ...(directionAvailable ? [{
      key: 'direction', ...SETTINGS_COPY.directionMessage,
      value: oocDirectivePrompt, set: setOocDirectivePrompt, def: styledDefaults.oocDirectivePrompt,
      variables: undefined, vocabulary: NO_VARIABLES_VOCABULARY,
    }] : []),
  ];
  // A chip jump lands on the editor holding it; the reveal waits out that editor's mount on its own.
  useEffect(() => {
    if (!jumpChip || !promptView) return;
    revealEditorChip(jumpChip);
    setJumpChip(null);
  }, [jumpChip, promptView]);
  // Its own effect: the jump effect re-runs as soon as it clears `jumpChip`, which would cancel the reveal.
  useEffect(() => cancelEditorReveals, []);

  // The generation settings the Anatomy hub draws under. Memoized alongside its prompts and its value pool
  // so all three inputs are stable: a hub re-runs a turn's worth of assembly, and a fresh object on any of
  // them would redo that for every unrelated state change in the modal.
  const hubSettings = useMemo(() => ({
    thinkingMode, sectionStyle: activeSectionStyle, markdownOutput, paragraphLimit,
    language, maxTokens: narrationPreviewMaxTokens, memoryDigests, semanticMemory, semanticRehydration, timeContext,
    locationAutoApply,
  }), [
    thinkingMode, activeSectionStyle, markdownOutput, paragraphLimit, language, narrationPreviewMaxTokens,
    memoryDigests, semanticMemory, semanticRehydration, timeContext, locationAutoApply,
  ]);

  // Every prompt the Anatomy hub renders a request from, as authored.
  const hubPrompts = useMemo(() => ({
    system: systemPrompt,
    recap: recapUserPrompt,
    now: nowLinePrompt,
    recall: rehydrateUserPrompt,
    turn: {
      locationChange: locationChangePromptText || '',
      locationChangeUser: locationChangeUserPrompt,
      entityLocation: entityLocationPrompt,
      entityLocationUser: entityLocationUserPrompt,
      thinking: thinkingPrompt,
      director: directorPrompt,
      directorUser: directorUserPrompt,
      character: characterPrompt,
      storyboard: storyboardPrompt,
      narrationUser: narrationUserPrompt,
      oocDirective: oocDirectivePrompt,
      // The hub draws a mid-story turn, so the opening cue is along for the shape only.
      openingCue: OPENING_SCENE_CUE,
      discoverEntity: discoverEntityPrompt,
      discoverEntityUser: discoverEntityUserPrompt,
      choices: choicesPrompt,
      choicesUser: choicesUserPrompt,
      statUpdates: statUpdatesPrompt,
      statUpdatesUser: statUpdatesUserPrompt,
      statText: statTextFor(statTextPrompts, { worldPrompt: false }),
      summary: summaryPrompt,
      summaryUser: summaryUserPrompt,
      milestoneSelect: milestoneSelectPrompt,
      milestoneSelectUser: milestoneSelectUserPrompt,
      timePassed: timePassedPrompt,
      timePassedUser: timePassedUserPrompt,
      openingTime: openingTimePrompt,
      openingTimeUser: openingTimeUserPrompt,
      diary: diaryPrompt,
    },
  }), [
    systemPrompt, recapUserPrompt, nowLinePrompt, rehydrateUserPrompt,
    locationChangePromptText, locationChangeUserPrompt, entityLocationPrompt, entityLocationUserPrompt, thinkingPrompt, directorPrompt, directorUserPrompt,
    characterPrompt, storyboardPrompt, narrationUserPrompt, oocDirectivePrompt,
    choicesPrompt, choicesUserPrompt, statUpdatesPrompt, statUpdatesUserPrompt, statTextPrompts,
    summaryPrompt, summaryUserPrompt, timePassedPrompt, timePassedUserPrompt,
    openingTimePrompt, openingTimeUserPrompt, diaryPrompt,
    discoverEntityPrompt, discoverEntityUserPrompt, milestoneSelectPrompt, milestoneSelectUserPrompt,
  ]);

  // The authoring prompts have only their system template: no user message, no riders, and no per-request
  // tuning to put under Options (their editor request kinds have no preset rows). Their output cap rides
  // the System view instead.
  const authoringPrompt = isAuthoringTab(activePromptTab);
  // Which editors the open prompt actually has — the rail lists exactly these under it.
  const activeSurfaces: PromptSurface[] = authoringPrompt ? ['system'] : [
    'system',
    ...(activeUserPrompt ? ['user' as const] : []),
    ...(messagesAvailable ? ['messages' as const] : []),
    'options',
  ];
  const showingOptions = promptView === 'options' && !authoringPrompt;
  // The hub: the prompt selected with no editor open. An editor the open prompt doesn't have lands here
  // too, rather than on a blank panel.
  //
  // An authoring prompt is the exception: it runs outside the turn, so there is no request for a hub to
  // draw. Its System template is the only editor it has, so selecting one opens that template rather than
  // landing on a hub that would render empty.
  const showingHub = !authoringPrompt && (promptView === null || !activeSurfaces.includes(promptView));
  /** The editor the surface controls point at — for an authoring prompt, never the hub it hasn't got. */
  const promptSurface: PromptSurface | null = authoringPrompt ? (promptView ?? 'system') : promptView;
  // The footer's Reset and Compare target whichever template is on screen, named by its full noun. The
  // Messages view carries a pair per field, so the footer hides there (like Options).
  const footerPrompt = showingUser && activeUserPrompt
    ? { name: `${selectedPrompt.label} Message`, ...activeUserPrompt }
    : { name: `${selectedPrompt.label} Prompt`, ...selectedPrompt };
  const footerVocabulary = useMemo(() => promptVocabulary(footerPrompt.variables), [footerPrompt.variables]);

  // Verbatim-turns control for the active prompt, shown once in the footer (like Reset).
  const promptVerbatim: Record<string, { value: number; set: (n: number) => void }> = {
    narration: { value: narrationVerbatimTurns, set: setNarrationVerbatimTurns },
    thinking: { value: thinkingVerbatimTurns, set: setThinkingVerbatimTurns },
    choices: { value: choicesVerbatimTurns, set: setChoicesVerbatimTurns },
    statupdates: { value: statUpdatesVerbatimTurns, set: setStatUpdatesVerbatimTurns },
    location: { value: locationChangeVerbatimTurns, set: setLocationChangeVerbatimTurns },
    summary: { value: summaryVerbatimTurns, set: setSummaryVerbatimTurns },
  };
  const activeVerbatimEntry = promptVerbatim[activePromptTab];
  const verbatimApplicable = memoryDigests && !!activeVerbatimEntry;

  // Per-prompt samplers for the active tab. Off shows the kind's default (read-only); on shows the stored
  // custom value (seeded to the default on first enable). A default of `undefined` means the prompt omits the
  // sampler (a non-pinned prompt on a custom endpoint) — the panel names its endpoint state.
  const activeKind = isPromptTab(activePromptTab) ? PROMPT_TAB_REQUESTS[activePromptTab] : 'narration';
  const activeSamplers = promptSamplers[activeKind];
  // Endpoint routing for this prompt. A pin naming a preset that no longer exists shows as Use Active Endpoint —
  // the same thing it actually resolves to at request time.
  const routableEndpoints = [...builtinTextEndpointPresets, ...textEndpointPresets];
  const pinnedEndpointId = promptEndpoints[activeKind];
  // The rest of the panel describes what this prompt will actually send, so its engine flag and reasoning
  // support come from the routed target — a prompt pinned off the bundled engine gets the external-endpoint
  // controls even while the engine is running, and vice versa.
  const promptTarget = resolveEndpointForKind(activeKind);
  const promptLocalEngine = promptTarget.localEngine;
  const pinnedEndpoint = routableEndpoints.find((p) => p.id === pinnedEndpointId);
  const endpointControl = {
    label: SETTINGS_COPY.promptEndpoint.label,
    description: SETTINGS_COPY.promptEndpoint.description,
    // The ⓘ names the current target; the fixed description does not.
    info: pinnedEndpoint
      ? `Always goes to ${pinnedEndpoint.name}, even when you switch endpoints elsewhere`
      : 'Follows the endpoint picked on the **AI Endpoints** tab. Switch endpoints there and this prompt follows.',
    value: pinnedEndpoint ? pinnedEndpoint.id : null,
    activeName: activeTextEndpointPresetName,
    presets: routableEndpoints,
    onChange: (id: string | null) => setPromptEndpoint(activeKind, id),
    // Probed only while pinned — an unpinned prompt uses the active endpoint, which the setup gate covers.
    reachability: {
      url: promptTarget.url,
      apiToken: promptTarget.apiToken,
      model: promptTarget.model,
      enabled: promptTarget.presetId !== null,
    },
  };
  // The cap this prompt sends, which the Max Output row reads.
  const maxOutputControl = isMaxOutputKind(activeKind)
    ? {
        custom: promptMaxOutput[activeKind]?.custom ?? false,
        value: promptMaxOutput[activeKind]?.value ?? shippedMaxOutput(activeKind),
        shipped: shippedMaxOutput(activeKind),
        onCustomChange: (c: boolean) => setPromptMaxOutputCustom(activeKind, c),
        onValueChange: (v: number) => setPromptMaxOutputValue(activeKind, v),
      }
    : null;
  const samplerControls: SamplerControlProps[] = [
    {
      id: 'customTemp',
      label: SETTINGS_COPY.customTemperature.label,
      hint: SETTINGS_COPY.customTemperature.description,
      min: 0, max: 2, step: 0.05,
      custom: activeSamplers?.temperature?.custom ?? false,
      value: activeSamplers?.temperature?.value ?? defaultPromptSampler(activeKind, 'temperature', genTemperature, promptLocalEngine) ?? genTemperature,
      defaultValue: defaultPromptSampler(activeKind, 'temperature', genTemperature, promptLocalEngine),
      fallbackLabel: promptTarget.samplerOverrides.temperature.enabled ? 'Endpoint Override' : 'Endpoint Default',
      onCustomChange: (c) => setPromptSamplerCustom(activeKind, 'temperature', c),
      onValueChange: (v) => setPromptSamplerValue(activeKind, 'temperature', v),
    },
    {
      id: 'customRepPen',
      label: SETTINGS_COPY.customRepetitionPenalty.label,
      hint: SETTINGS_COPY.customRepetitionPenalty.description,
      min: 1, max: 1.5, step: 0.02,
      custom: activeSamplers?.repetitionPenalty?.custom ?? false,
      value: activeSamplers?.repetitionPenalty?.value ?? defaultPromptSampler(activeKind, 'repetitionPenalty', genRepetitionPenalty, promptLocalEngine) ?? genRepetitionPenalty,
      defaultValue: defaultPromptSampler(activeKind, 'repetitionPenalty', genRepetitionPenalty, promptLocalEngine),
      fallbackLabel: promptTarget.samplerOverrides.repetitionPenalty.enabled ? 'Endpoint Override' : 'Endpoint Default',
      onCustomChange: (c) => setPromptSamplerCustom(activeKind, 'repetitionPenalty', c),
      onValueChange: (v) => setPromptSamplerValue(activeKind, 'repetitionPenalty', v),
    },
  ];
  // The Output row reads the ACTIVE endpoint's record, not the selected prompt's routed target. It is the
  // endpoint-wide strength every Global prompt follows, routed ones included, so it gives way only where
  // the active model is ruled out entirely.
  const activeNoNativeReasoning = reasoningRuledOut(reasoningCapability);
  const activeToolsSupported = toolsSupported(reasoningCapability);
  // Beside a budget, the stored level still goes out; the Output row is its visible control.
  const reasoningControl = promptReasoningFieldProps({
    target: promptTarget,
    kind: activeKind,
    setting: promptReasoningSettings[activeKind] ?? defaultPromptReasoningSetting(activeKind),
    budgetPct: resolveReasoningBudgetPct(activeKind, promptReasoningBudget),
    global: nativeReasoning,
    suppressed: nativeReasoningSuppressed(thinkingMode, activeKind),
    onChange: (v: PromptReasoningSetting) => setPromptReasoning(activeKind, v),
    onBudgetChange: (v: number) => setPromptReasoningBudget(activeKind, v),
  });

  // Only meaningful in Simple mode, where the settings it reports on are the ones out of sight. Most hidden
  // rows sit behind a switch Simple still shows (Thinking), so Advanced can always reach
  // them. Native Reasoning is the exception: an endpoint that rejects every effort level has no such row to
  // reach, so a stored level there is left out rather than promising one.
  const hasHiddenValues = !advanced && settingsUseAdvancedValues({
    ...sectionHiddenFields(settings),
    maxTokens,
    promptPresetCustom: !activePresetIsBuiltIn,
  });

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* Prompts get a wider dialog than the rest of Settings: they're the only tab holding a document
          rather than a list of controls, and the extra width is what lets the editor show edit and
          preview side by side instead of one at a time. */}
      <DialogContent
        ref={dialogRef}
        surface="settings"
        aria-describedby={undefined}
        // One width for every tab, matching the Feedback hub — Prompts wanted a wider window only to fit
        // the side-by-side panes, and those now belong to full screen.
        className={SETTINGS_DIALOG_SIZE}
      >
        <DialogHeader className="flex-shrink-0">
          {/* The close cross is absolutely placed over this row, so the select is kept clear of it. */}
          <div className="flex items-center justify-between gap-4 pr-8">
            <DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4" /> Settings</DialogTitle>
            <TutorialPopover entry={tutorial} nav={tutorialNav}>
              <ModeSelect
                mode={mode}
                // Using the select is itself the lesson, so it retires the tutorial as surely as the button does.
                onModeChange={(next) => { dismissTutorial(); setMode(next); }}
                descriptions={SETTINGS_MODE_DESCRIPTIONS}
                hiddenNotice={hasHiddenValues ? SETTINGS_HIDDEN_NOTICE : undefined}
                size="sm"
                aria-label="Settings mode"
                // The Data and Output tabs' guide sections need Advanced, so they land on this select.
                {...(MODE_SELECT_TARGETS[activeTab] ?? MODE_SELECT_TARGETS.data)}
              />
            </TutorialPopover>
          </div>
        </DialogHeader>
        <Tabs surfaceTabs="settings" value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 min-h-0">
          {/* The tab labels don't fit narrow mobile, so below sm the tab strip becomes a dropdown of the
              active tab; sm+ keeps the full row. Both drive the same activeTab state. */}
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full flex-shrink-0 sm:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleTabs.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TabsList
            className={cn('hidden w-full flex-shrink-0 sm:grid', advanced ? 'grid-cols-6' : 'grid-cols-4')}
          >
            {visibleTabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="display" className="px-2 flex-1 min-h-0 data-[state=active]:flex flex-col">
            <ScrollArea landingRoom className="flex-1 min-h-0">
              <DisplaySettingsSection source={settingsSource} mode={mode} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="output" className="px-2 flex-1 min-h-0 data-[state=active]:flex flex-col">
            <ScrollArea landingRoom className="flex-1 min-h-0">
              <OutputSettingsSection source={settingsSource} mode={mode} nativeReasoningRuledOut={activeNoNativeReasoning} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="endpoints" className="py-4 px-2 flex-1 min-h-0 data-[state=active]:flex flex-col">
            {/* One endpoint kind is left, so it draws without a tab strip; the ledger still names it. */}
            <SurfaceTab ledger="settingsEndpoints" tab="text" />
            <TextEndpointEditor model={activePresetEditor(settings)} advanced={advanced} onOpenConnectionGuide={() => setConnectionGuideOpen(true)} />
          </TabsContent>

          {advanced && (
          <TabsContent ref={promptsPanelRef} value="prompts" className="pt-4 px-2 pb-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-4">
            <PanelShell morph={promptsMorph} sourceRef={promptsPanelRef} title="Prompts">
            {/* Built-in presets are read-only; selecting one switches the whole prompt set. */}
            <PresetHeader
              label="Preset"
              actions={presetActions}
              testId="preset-header-row"
              select={
              <Select value={activePresetId} onValueChange={handlePresetSelect}>
                <SelectTrigger aria-label="Preset" className="flex-1 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {builtinPresets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  {promptPresets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value={ADD_PRESET_SENTINEL}>Add New Preset…</SelectItem>
                </SelectContent>
              </Select>
              }
            />
            {/* While a pinned world is open the selector edits that world's pin, not the global choice —
                say so, or picking a preset here looks like it silently did nothing to the rest of the app. */}
            {presetPinnedToWorld && (
              <p className="-mt-2 flex-shrink-0 text-helper text-muted-foreground">
                The world you&apos;re playing is pinned to this preset, so changing it here re-pins this world.
                Your usual preset is unaffected and comes back when you leave.
              </p>
            )}
            {/* Rail + panel. The rail replaces both the thirteen wrapped prompt tabs and the
                System/User/Messages/Options row: two rows of chrome the editor gets back, and a list that
                says what each prompt is for. `Tabs` still owns the panel switching — only its list is gone. */}
            <Tabs value={activePromptTab} onValueChange={selectPromptTab} className="w-full flex flex-1 min-h-0 gap-4 flex-col md:flex-row">
              {/* The rail has no tab strip, so the open prompt and its surface report by hand. */}
              {showingOverview ? <SurfaceTab ledger="settingsPromptPreset" tab={OVERVIEW_ROUTE} /> : (
                <>
                  <SurfaceTab ledger="settingsPrompts" tab={activePromptTab} />
                  <SurfaceTab ledger="settingsPromptSurfaces" tab={showingHub ? HUB_ROUTE : promptView} />
                </>
              )}
              {/* Narrow: one dropdown carrying prompt + surface, since a rail and an editor can't share
                  mobile width. Same collapse the top-level Settings tabs already do. */}
              <div className="md:hidden flex-shrink-0">
                {/* Prompt and surface entries live in one list but must not share a value string, or
                    Radix matches both and renders their labels concatenated. */}
                <Select
                  value={showingOverview ? overviewOption : `surface:${promptSurface ?? HUB_ROUTE}`}
                  onValueChange={(v) => {
                    const [kind, id] = v.split(':');
                    if (kind === 'preset') setOverviewOpen(true);
                    else if (kind === 'prompt') selectPromptTab(id);
                    else selectPromptView(id === HUB_ROUTE ? null : (id as PromptSurface));
                  }}
                >
                  {/* Named outright rather than via SelectValue: the value tracks only the surface, and
                      the reader needs to see which prompt they're in. */}
                  <SelectTrigger>
                    <span className="truncate leading-normal">
                      {showingOverview ? OVERVIEW_LABEL : <>{selectedPrompt.label} &middot; {promptSurface ? SURFACE_LABELS[promptSurface] : HUB_LABEL}</>}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {presetOverview && (
                      <>
                        <SelectItem value={overviewOption}>{OVERVIEW_LABEL}</SelectItem>
                        <SelectSeparator />
                      </>
                    )}
                    {railGroups.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.tabs.map((t) => (
                          <SelectItem key={t} value={`prompt:${t}`}>{editablePrompts[t]?.label ?? t}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{selectedPrompt.label}</SelectLabel>
                      {/* The hub is a destination on mobile as well, since there is no prompt row to
                          re-tap here — the dropdown carries both levels at once. An authoring prompt has
                          no hub, so it offers only its System template. */}
                      {!authoringPrompt && <SelectItem value={`surface:${HUB_ROUTE}`}>{HUB_LABEL}</SelectItem>}
                      {activeSurfaces.map((s) => (
                        <SelectItem key={s} value={`surface:${s}`}>{SURFACE_LABELS[s]}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <PromptNavigationRail
                groups={railGroups}
                labels={Object.fromEntries(Object.entries(editablePrompts).map(([id, prompt]) => [id, prompt.label]))}
                activePrompt={activePromptTab}
                surface={showingHub ? null : promptSurface}
                surfaces={activeSurfaces}
                showingOverview={showingOverview}
                hasOverview={!!presetOverview}
                onOverview={() => setOverviewOpen(true)}
                onPrompt={selectPromptTab}
                onSurface={selectPromptView}
              />

              <div className="flex flex-1 min-w-0 min-h-0 flex-col gap-2">

              {showingOverview && presetOverview ? (
                <ScrollArea className="flex-1 min-h-0">
                  <PresetOverviewPanel
                    overview={presetOverview}
                    onChange={setPresetOverview}
                    modelSuggestions={endpointModels.suggestions}
                    onModelsOpen={endpointModels.load}
                  />
                </ScrollArea>
              ) : (
              <>
              {/* What this prompt is for, over every surface, so the first thing seen names the prompt's job.
                  The hub draws the same line itself, beside its own controls. Above rather than beneath: at
                  the bottom of a full-height editor it sat below the fold. */}
              {!showingHub && (
                <p className="flex-shrink-0 text-helper text-muted-foreground">
                  {PROMPT_DESCRIPTIONS[activePromptTab]}
                </p>
              )}

              {showingOptions && (
                <ScrollArea landingRoom className="mt-4 flex-1 min-h-0">
                  <PromptOptionsPanel
                    endpoint={endpointControl}
                    maxOutput={maxOutputControl}
                    verbatim={verbatimApplicable ? activeVerbatimEntry : null}
                    reasoning={reasoningControl}
                    samplers={samplerControls}
                    disabled={activePresetIsBuiltIn}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                  />
                </ScrollArea>
              )}

              {showingHub && (
                <RequestAnatomyPanel
                  tab={activePromptTab}
                  description={PROMPT_DESCRIPTIONS[activePromptTab]}
                  prompts={hubPrompts}
                  values={effectivePreviewValues}
                  settings={hubSettings}
                  mode={anatomyMode}
                  onModeChange={setAnatomyMode}
                  onJump={jumpToPrompt}
                  fullscreen={promptsFullscreen}
                  onRequestFullscreen={promptsMorph.toggle}
                />
              )}

              {!showingOptions && !showingHub && (
              <>
              <TabsContent value="narration" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col">
                {showingMessages ? (
                  // The padding is the Landing Pulse's room; the negative margin keeps the fields in place.
                  <ScrollArea landingRoom className="-my-3 flex-1 min-h-0">
                    <div className="flex flex-col gap-5 pr-3 py-3">
                      {messageFields.map((f) => (
                        <div
                          key={f.key}
                          ref={(node) => { messageFieldRefs.current[f.key] = node; }}
                          className="flex flex-col gap-1 scroll-my-3"
                        >
                          {/* Wraps rather than squeezes: on mobile the pair drops under the label, still right-aligned. */}
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <span className="flex shrink-0 items-center gap-1.5 text-label font-medium">
                              {f.label}
                              <HintInfo>{f.info}</HintInfo>
                            </span>
                            {!activePresetIsBuiltIn && (
                              <PromptResetCompare
                                className="ml-auto"
                                size="sm"
                                name={f.label}
                                value={f.value}
                                defaultValue={f.def}
                                onReset={() => f.set(f.def)}
                                vocabulary={f.vocabulary}
                                surface="settingsCompare"
                              />
                            )}
                          </div>
                          {/* Read before the template: when this message is sent is runtime-conditional,
                              so it can't be inferred from the field being visible. */}
                          <p className="text-helper text-muted-foreground italic">{f.sentWhen}</p>
                          <PromptField
                            value={f.value}
                            onChange={f.set}
                            variables={f.variables ?? []}
                            previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                            readOnly={activePresetIsBuiltIn}
                          />
                          <p className="text-helper text-muted-foreground">{f.description}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <PromptField
                    value={showingUser ? narrationUserPrompt : systemPrompt}
                    onChange={showingUser ? setNarrationUserPrompt : setSystemPrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.narration ?? []) : PROMPT_KIND_VARIABLES.narration}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                )}
              </TabsContent>

              {thinkingMode === 'precall' && (
                <TabsContent value="thinking" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col">
                  <PromptField
                    value={thinkingPrompt}
                    onChange={setThinkingPrompt}
                    variables={PROMPT_KIND_VARIABLES.thinking}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {choicesEnabled && (
                <TabsContent value="choices" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col">
                  <PromptField
                    value={showingUser ? choicesUserPrompt : choicesPrompt}
                    onChange={showingUser ? setChoicesUserPrompt : setChoicesPrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.choices ?? []) : PROMPT_KIND_VARIABLES.choices}
                    previewValues={choicesPreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {statUpdatesEnabled && (
                <TabsContent value="statupdates" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col">
                  <PromptField
                    value={showingUser ? statUpdatesUserPrompt : statUpdatesPrompt}
                    onChange={showingUser ? setStatUpdatesUserPrompt : setStatUpdatesPrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.statupdates ?? []) : PROMPT_KIND_VARIABLES.statupdates}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {locationChangeEnabled && (
                <TabsContent value="location" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={showingUser ? locationChangeUserPrompt : locationChangePromptText}
                    onChange={showingUser ? setLocationChangeUserPrompt : setLocationChangePromptText}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.location ?? []) : PROMPT_KIND_VARIABLES.location}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {locationChangeEnabled && entityMovement && (
                <TabsContent value="entitylocation" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={showingUser ? entityLocationUserPrompt : entityLocationPrompt}
                    onChange={showingUser ? setEntityLocationUserPrompt : setEntityLocationPrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.entitylocation ?? []) : PROMPT_KIND_VARIABLES.entitylocation}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {memoryDigests && (
                <TabsContent value="summary" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={showingUser ? summaryUserPrompt : summaryPrompt}
                    onChange={showingUser ? setSummaryUserPrompt : setSummaryPrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.summary ?? []) : PROMPT_KIND_VARIABLES.summary}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {memoryDigests && (
                <TabsContent value="milestone" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={showingUser ? milestoneSelectUserPrompt : milestoneSelectPrompt}
                    onChange={showingUser ? setMilestoneSelectUserPrompt : setMilestoneSelectPrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.milestone ?? []) : PROMPT_KIND_VARIABLES.milestone}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {aiClock && (
                <TabsContent value="timepassed" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={showingUser ? timePassedUserPrompt : timePassedPrompt}
                    onChange={showingUser ? setTimePassedUserPrompt : setTimePassedPrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.timepassed ?? []) : PROMPT_KIND_VARIABLES.timepassed}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {aiClock && (
                <TabsContent value="timeopening" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={showingUser ? openingTimeUserPrompt : openingTimePrompt}
                    onChange={showingUser ? setOpeningTimeUserPrompt : setOpeningTimePrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.timeopening ?? []) : PROMPT_KIND_VARIABLES.timeopening}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {characterDiaries && (
                <TabsContent value="diary" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={diaryPrompt}
                    onChange={setDiaryPrompt}
                    variables={PROMPT_KIND_VARIABLES.diary}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {thinkingMode === 'staged' && (
                <TabsContent value="director" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={showingUser ? directorUserPrompt : directorPrompt}
                    onChange={showingUser ? setDirectorUserPrompt : setDirectorPrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.director ?? []) : PROMPT_KIND_VARIABLES.director}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {thinkingMode === 'staged' && (
                <TabsContent value="character" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={characterPrompt}
                    onChange={setCharacterPrompt}
                    variables={PROMPT_KIND_VARIABLES.character}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {describeCharacters && (
                <TabsContent value="discover" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={showingUser ? discoverEntityUserPrompt : discoverEntityPrompt}
                    onChange={showingUser ? setDiscoverEntityUserPrompt : setDiscoverEntityPrompt}
                    variables={showingUser ? (PROMPT_KIND_USER_VARIABLES.discover ?? []) : PROMPT_KIND_VARIABLES.discover}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {thinkingMode === 'staged' && (
                <TabsContent value="storyboard" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-1">
                  <PromptField
                    value={storyboardPrompt}
                    onChange={setStoryboardPrompt}
                    variables={PROMPT_KIND_VARIABLES.storyboard}
                    previewValues={effectivePreviewValues}
                    sampleData={usingSampleValues}
                    readOnlyReason={readOnlyReason}
                    onRequestEdit={duplicatePreset}
                    fullscreen={promptsFullscreen}
                    onRequestFullscreen={promptsMorph.toggle}
                    readOnly={activePresetIsBuiltIn}
                  />
                </TabsContent>
              )}

              {/* Authoring prompts — the world editor's ✨ and 🔍 buttons. System template only, each with the
                  output cap that has to move with it. Advanced mode gates them into the rail. */}
              {advanced && (<>
              <TabsContent value="playerdesc" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-2">
                <p className="text-helper text-muted-foreground flex-shrink-0">
                  Rewrites an AI-facing description into the player-facing one. The
                  <span className="mx-1 font-medium">Subject</span>and
                  <span className="mx-1 font-medium">Facets</span>chips expand per kind — character:
                  “{BRIDGE_SUBJECT.character}” / “{BRIDGE_FACETS.character}”; location: “{BRIDGE_SUBJECT.location}” / “{BRIDGE_FACETS.location}”.
                </p>
                <PromptField
                  value={playerDescPrompt}
                  onChange={setPlayerDescPrompt}
                  variables={PROMPT_KIND_VARIABLES.playerdesc}
                  readOnlyReason={readOnlyReason}
                  onRequestEdit={duplicatePreset}
                  fullscreen={promptsFullscreen}
                  onRequestFullscreen={promptsMorph.toggle}
                  readOnly={activePresetIsBuiltIn}
                />
                <DescTokenCapField
                  id="playerDescMaxTokens"
                  value={descMaxTokens.playerdesc}
                  min={BRIDGE_MAX_TOKENS_MIN}
                  max={BRIDGE_MAX_TOKENS_MAX}
                  onChange={(n) => setDescMaxTokens('playerdesc', n)}
                  disabled={activePresetIsBuiltIn}
                />
              </TabsContent>

              <TabsContent value="aidesc" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-2">
                <p className="text-helper text-muted-foreground flex-shrink-0">
                  Expands a player-facing description into the AI-facing one. The
                  <span className="mx-1 font-medium">Subject</span>and
                  <span className="mx-1 font-medium">Facets</span>chips expand per kind, as above.
                </p>
                <PromptField
                  value={aiDescPrompt}
                  onChange={setAiDescPrompt}
                  variables={PROMPT_KIND_VARIABLES.aidesc}
                  readOnlyReason={readOnlyReason}
                  onRequestEdit={duplicatePreset}
                  fullscreen={promptsFullscreen}
                  onRequestFullscreen={promptsMorph.toggle}
                  readOnly={activePresetIsBuiltIn}
                />
                <DescTokenCapField
                  id="aiDescMaxTokens"
                  value={descMaxTokens.aidesc}
                  min={BRIDGE_MAX_TOKENS_MIN}
                  max={BRIDGE_MAX_TOKENS_MAX}
                  onChange={(n) => setDescMaxTokens('aidesc', n)}
                  disabled={activePresetIsBuiltIn}
                />
              </TabsContent>

              <TabsContent value="aisummary" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-2">
                <p className="text-helper text-muted-foreground flex-shrink-0">
                  Condenses an AI-facing description into the one-line AI-facing summary. It condenses
                  whatever text it is handed, so it takes no per-kind chips.
                </p>
                <PromptField
                  value={aiSummaryPrompt}
                  onChange={setAiSummaryPrompt}
                  variables={PROMPT_KIND_VARIABLES.aisummary}
                  readOnlyReason={readOnlyReason}
                  onRequestEdit={duplicatePreset}
                  fullscreen={promptsFullscreen}
                  onRequestFullscreen={promptsMorph.toggle}
                  readOnly={activePresetIsBuiltIn}
                />
                <DescTokenCapField
                  id="aiSummaryMaxTokens"
                  value={descMaxTokens.aisummary}
                  min={SUMMARY_MAX_TOKENS_MIN}
                  max={SUMMARY_MAX_TOKENS_MAX}
                  onChange={(n) => setDescMaxTokens('aisummary', n)}
                  disabled={activePresetIsBuiltIn}
                />
              </TabsContent>

              <TabsContent value="desccheck" className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col gap-2">
                <p className="text-helper text-muted-foreground flex-shrink-0">
                  Reads a subject&apos;s two descriptions against each other and reports where they disagree. It
                  writes nothing, so a finding is yours to act on or ignore. The
                  <span className="mx-1 font-medium">Subject</span>chip expands per kind, as above.
                </p>
                <PromptField
                  value={descCheckPrompt}
                  onChange={setDescCheckPrompt}
                  variables={PROMPT_KIND_VARIABLES.desccheck}
                  readOnlyReason={readOnlyReason}
                  onRequestEdit={duplicatePreset}
                  fullscreen={promptsFullscreen}
                  onRequestFullscreen={promptsMorph.toggle}
                  readOnly={activePresetIsBuiltIn}
                />
                <DescTokenCapField
                  id="descCheckMaxTokens"
                  value={descMaxTokens.desccheck}
                  min={CHECK_MAX_TOKENS_MIN}
                  max={CHECK_MAX_TOKENS_MAX}
                  onChange={(n) => setDescMaxTokens('desccheck', n)}
                  disabled={activePresetIsBuiltIn}
                />
              </TabsContent>
              </>)}
              </>
              )}
              </>
              )}
              </div>
            </Tabs>

            {/* The pair targets the on-screen template; hidden on the Options sub-tab (edits no template)
                and the Messages view (a pair per field). */}
            {!activePresetIsBuiltIn && !showingOverview && !showingOptions && !showingMessages && !showingHub && (
              <PromptResetCompare
                className="flex-shrink-0"
                name={footerPrompt.name}
                value={footerPrompt.value}
                defaultValue={footerPrompt.def}
                onReset={() => { footerPrompt.set(footerPrompt.def); footerPrompt.onReset?.(); }}
                vocabulary={footerVocabulary}
                surface="settingsCompare"
              />
            )}
            <PresetNameDialog
              open={presetDialog !== null}
              mode={presetDialog?.mode ?? 'add'}
              initialName={presetDialog?.mode === 'rename' ? activePresetName : ''}
              onOpenChange={(o) => { if (!o) setPresetDialog(null); }}
              onSubmit={handlePresetNameSubmit}
            />
            <ExportPresetDialog
              open={exportShared !== null}
              onOpenChange={(o) => { if (!o) setExportShared(null); }}
              shared={exportShared}
            />
            <ImportPresetDialog
              open={importOpen}
              onOpenChange={setImportOpen}
              currentAppVersion={APP_VERSION}
              userTools={userTools}
              existingUserNames={promptPresets}
              onImport={(imported, opts) => { const id = importPreset(imported, opts); selectPreset(id); }}
            />
            </PanelShell>
          </TabsContent>
          )}

          {advanced && (
          <TabsContent ref={toolsPanelRef} value="tools" className="pt-4 px-2 pb-4 flex-1 min-h-0 data-[state=active]:flex flex-col">
            <PanelShell morph={toolsMorph} sourceRef={toolsPanelRef} title="Tools">
            <ToolsTab
              catalogTools={catalogTools}
              userTools={userTools}
              enabledTools={enabledTools}
              toolsSupported={activeToolsSupported}
              toolsEnabled={toolsEnabled}
              onSaveTool={saveTool}
              onDeleteTool={deleteTool}
              onSetEnabled={setToolEnabled}
              view={toolsView}
              onViewChange={setToolsView}
              fullscreen={toolsMorph.contentInOverlay}
              onToggleFullscreen={toolsMorph.toggle}
              appVersion={APP_VERSION}
              openWorld={toolWorld}
              targets={{ shareTools: targetAttribute('settings.tools', 'share-tools') }}
              // Selection only: Add opens a dialog that lives in the Prompts tab.
              presetSelector={(
                <div className="flex items-center gap-2">
                  <span className="text-helper text-muted-foreground">Preset</span>
                  <Select value={activePresetId} onValueChange={selectPreset}>
                    <SelectTrigger aria-label="Preset" className="flex-1 min-w-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {builtinPresets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      {promptPresets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
            </PanelShell>
          </TabsContent>
          )}

          <TabsContent value="data" className="px-2 flex-1 min-h-0 data-[state=active]:flex flex-col">
            <ScrollArea landingRoom className="flex-1 min-h-0">
            <div className="grid gap-6 py-4">
              <Section title="Saves">
              <CheckRow
                htmlFor="autosaveEnabled"
                checked={autosaveEnabled}
                onChange={setAutosaveEnabled}
                {...rowCopy('autosave')}
              />
              {autosaveEnabled && (
                <Row htmlFor="autosaveSlots" {...rowCopy('autosaveSlots')}>
                  <div className="grid gap-1">
                    <ValueSlider
                      id="autosaveSlots"
                      value={autosaveSlots}
                      min={1}
                      max={MAX_AUTOSAVE_SLOTS}
                      step={1}
                      onChange={setAutosaveSlots}
                      format={String}
                    />
                    {autosaveSlots < autosaveSlotsAtOpen && (
                      <p role="status" className="text-helper text-destructive">
                        Deletes each world&apos;s oldest autosaves past {autosaveSlots} on its next autosave
                      </p>
                    )}
                  </div>
                </Row>
              )}
              </Section>

              <Section title="Authoring">
              <CheckRow
                htmlFor="editorAutoSave"
                checked={editorAutoSave}
                onChange={setEditorAutoSave}
                {...rowCopy('editorAutoSave')}
              />
              {editorAutoSave && (
              <Row htmlFor="editorAutoSaveIdleSeconds" {...rowCopy('editorAutoSavePause')}>
                <ValueSlider
                  id="editorAutoSaveIdleSeconds"
                  value={editorAutoSaveIdleSeconds}
                  min={MIN_EDITOR_AUTO_SAVE_IDLE_S}
                  max={MAX_EDITOR_AUTO_SAVE_IDLE_S}
                  step={EDITOR_AUTO_SAVE_IDLE_STEP_S}
                  onChange={setEditorAutoSaveIdleSeconds}
                  format={formatPause}
                />
              </Row>
              )}
              {onStartAuthoringTour && (
              <Row {...rowCopy('authoringTour')}>
                <Button variant="outline" size="sm" onClick={onStartAuthoringTour} {...targetAttribute('settings.data', 'start-authoring-tour')}>
                  {SETTINGS_BUTTONS.startAuthoringTour}
                </Button>
              </Row>
              )}
              </Section>

              {/* Housekeeping rather than settings — every one is a "put it back" a normal player never
                  needs, so Simple keeps the whole section out of the way. */}
              {advanced && (
              <Section title="Storage">
              <Row>
                <div>
                  <ConfirmDialog
                    {...SETTINGS_CONFIRMS.restoreDefaultWorlds}
                    onConfirm={restoreDefaultWorlds}
                  >
                    <Button variant="outline" size="sm" disabled={deletedDefaultCount === 0}>
                      {SETTINGS_BUTTONS.restoreDefaultWorlds}
                    </Button>
                  </ConfirmDialog>
                  <p className="text-helper text-muted-foreground mt-1">
                    {deletedDefaultCount === 0
                      ? "You haven't deleted any of the bundled worlds."
                      : `Re-creates ${deletedDefaultCount} deleted bundled world${deletedDefaultCount > 1 ? 's' : ''} at their latest version.`}
                  </p>
                </div>
              </Row>
              <Row>
                <div>
                  <ConfirmDialog
                    {...SETTINGS_CONFIRMS.clearCachedImages}
                    onConfirm={clearImageCache}
                  >
                    <Button variant="outline" size="sm" disabled={cachedBytes === 0}>
                      {SETTINGS_BUTTONS.clearCachedImages}
                    </Button>
                  </ConfirmDialog>
                  <p className="text-helper text-muted-foreground mt-1">
                    {cachedBytes === 0
                      ? 'No linked images have been cached yet.'
                      : `${formatBytes(cachedBytes)} of linked images kept on this device so they work offline.`}
                  </p>
                </div>
              </Row>
              <Row>
                <div>
                  <ConfirmDialog
                    {...SETTINGS_CONFIRMS.resetTutorials}
                    onConfirm={resetTutorials}
                  >
                    <Button variant="outline" size="sm" disabled={seenTutorialCount === 0}>
                      {SETTINGS_BUTTONS.resetTutorials}
                    </Button>
                  </ConfirmDialog>
                  <p className="text-helper text-muted-foreground mt-1">
                    {seenTutorialCount === 0
                      ? 'No tutorials have been dismissed yet.'
                      : `Brings back ${seenTutorialCount} dismissed tutorial${seenTutorialCount > 1 ? 's' : ''}.`}
                  </p>
                </div>
              </Row>
              </Section>
              )}
            </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
    <LlmSetupGuide
      open={connectionGuideOpen}
      onOpenChange={setConnectionGuideOpen}
      endpointUrl={endpointUrl}
    />
    {import.meta.env.DEV && (
      <PromptCompareDialog
        open={devCompare && isOpen}
        onOpenChange={setDevCompare}
        name={`${PROMPT_LABELS.narration} Prompt`}
        defaultText={styledDefaults.systemPrompt}
        text={`Write in present tense.\n${styledDefaults.systemPrompt.slice(0, Math.floor(styledDefaults.systemPrompt.length * 0.8))}`}
        vocabulary={NARRATION_VOCABULARY}
        surface="settingsCompare"
      />
    )}
    {import.meta.env.DEV && <DevChipOptions open={devChipOptions && isOpen} onOpenChange={setDevChipOptions} />}
    </>
  );
};
