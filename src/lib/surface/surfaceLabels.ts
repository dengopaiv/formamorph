/**
 * The label the player sees for each surface id. A label comes from the constant that renders it where
 * one exists; the rest are the fixed word of a title that has none, or a generic noun for a dynamic one.
 */
import { TOUR_STEPS } from '@/lib/authoringTour/steps';
import { KIND_LABELS } from '@/lib/catalogKinds';
import { AUTHORING_LABELS, HUB_LABEL, OVERVIEW_LABEL, PROMPT_LABELS, SURFACE_LABELS as PROMPT_SURFACE_LABELS } from '@/lib/promptGroups';
import { BENCH_TABS } from '@/lib/testBench/benchTabs';
import type { SurfaceId } from '@/lib/docs/surfaceMap';
import { SETTINGS_ENDPOINT_TABS, SETTINGS_TABS } from '@/components/modals/settingsTabs';
import { TOOL_EDIT_TABS } from '@/components/modals/toolsView';
import { DICTIONARY_BOOK_PANEL_TABS } from '@/views/dictionaryBookPanelTabs';
import { PLACEHOLDER_PANEL_TABS } from '@/views/placeholderPanelTabs';
import { DICTIONARY_EDITOR_TABS } from '@/views/dictionaryEditorTabs';
import { DICTIONARY_PANEL_TABS } from '@/views/dictionaryPanelTabs';
import { ENTITY_EDITOR_SUBTABS, ENTITY_EDITOR_TABS, ENTITY_PANEL_TABS } from '@/views/entityPanelTabs';
import { LOCATION_PANEL_TABS } from '@/views/locationPanelTabs';
import { STAT_PANEL_TABS } from '@/views/statPanelTabs';
import { TRAIT_PANEL_TABS } from '@/views/traitPanelTabs';
import { WORLD_EDITOR_TABS } from '@/views/worldEditorTabs';

/** The ids of one ledger, each with its tab's label. */
function tabsOf(ledger: string, tabs: readonly { value: string; label: string }[]): [string, string][] {
  return tabs.map((tab) => [`${ledger}.${tab.value}`, tab.label]);
}

const ENTRIES: [string, string][] = [
  // Screens and dialogs. A title that changes with the open item shows its kind of item.
  ['mainMenu', 'Main Menu'],
  ['gameViewer', 'Game'],
  ['aiSetup', 'Set up your AI'],
  ['componentUpdates', 'Update Available'],
  ['connectReferences', 'Connect World References'],
  ['dictionaryEditor', 'Dictionary'],
  ['entityEditor', 'Entity'],
  ['importComponent', 'Import'],
  ['memoryManager', 'Memories'],
  ['persona', 'Change Persona'],
  ['imageReplace', 'Replace Which Image'],
  ['codeRename', 'Update Code References'],
  ['replaceAll', 'Replace All'],
  ['savedElsewhere', 'World Saved in Another Tab'],
  ['deletedElsewhere', 'World Deleted in Another Tab'],
  ['settings', 'Settings'],
  ['worldEditor', 'World Editor'],
  ['aiContext', 'AI Context'],
  ['demoAI', "You're Playing on the Demo AI"],
  ['editText', 'Edit Text'],
  ['entity', 'Entity'],
  ['enterWorld', 'Enter World'],
  ['errorDetails', 'Error Details'],
  ['imageSetup', 'Image Setup'],
  ['export', 'Export story'],
  ['intro', 'Introduction'],
  ['location', 'Change Location'],
  ['menu', 'Load Game'],
  ['backup', 'Backup & Restore'],
  ['changelog', "What's new"],
  ['worldPrompts', 'Custom Prompts'],
  ['settingsCompare', 'Compare'],
  ['chipOptions', 'Chip Options'],
  ['designSystemGroupPicker.picker', 'Add To Group'],
  ['designSystemGroupPicker.create', 'Create New Group'],

  // Tabs
  ...tabsOf('settings', SETTINGS_TABS),
  ...tabsOf('settingsEndpoints', SETTINGS_ENDPOINT_TABS.map((tab) => ({ value: tab.route, label: tab.label }))),
  ...tabsOf('settingsToolEdit', TOOL_EDIT_TABS),
  ...Object.entries(PROMPT_LABELS).map(([tab, label]): [string, string] => [`settingsPrompts.${tab}`, label]),
  ...Object.entries(AUTHORING_LABELS).map(([tab, label]): [string, string] => [`settingsPrompts.${tab}`, label]),
  ...Object.entries(PROMPT_SURFACE_LABELS).map(([tab, label]): [string, string] => [`settingsPromptSurfaces.${tab}`, label]),
  ['settingsPromptSurfaces.anatomy', HUB_LABEL],
  ['settingsPromptPreset.overview', OVERVIEW_LABEL],
  ...tabsOf('worldEditor', WORLD_EDITOR_TABS),
  ...tabsOf('worldEditorLocations', [{ value: 'list', label: 'List' }, { value: 'canvas', label: 'Canvas' }]),
  ...tabsOf('worldEditorEntity', ENTITY_PANEL_TABS),
  ...tabsOf('worldEditorLocation', LOCATION_PANEL_TABS),
  ...tabsOf('worldEditorStat', STAT_PANEL_TABS),
  ...tabsOf('worldEditorTrait', TRAIT_PANEL_TABS),
  ...tabsOf('worldEditorEntry', DICTIONARY_PANEL_TABS),
  ...tabsOf('worldEditorBook', DICTIONARY_BOOK_PANEL_TABS),
  ...tabsOf('worldEditorPlaceholder', PLACEHOLDER_PANEL_TABS),
  ...tabsOf('worldEditorBench', BENCH_TABS),
  ...tabsOf('worldEditorTour', TOUR_STEPS.map((step) => ({ value: step.id, label: step.title }))),
  ...tabsOf('entityEditor', ENTITY_EDITOR_TABS),
  ...tabsOf('entityEditorEntity', ENTITY_EDITOR_SUBTABS),
  ...tabsOf('dictionaryEditor', DICTIONARY_EDITOR_TABS),
  ...tabsOf('mainMenu', [
    { value: 'worlds', label: KIND_LABELS.world.many },
    { value: 'entities', label: KIND_LABELS.entity.many },
    { value: 'dictionaries', label: KIND_LABELS.dictionary.many },
  ]),
  ['gameViewer.entities', 'Entities'],
  ['gameViewer.notes', 'Notes'],
  ['gameViewer.memory', 'Memory'],
  ['gameViewer.logs', 'Logs'],
];

/** The label for each surface id the player can have open. */
export const SURFACE_LABELS: Partial<Record<SurfaceId, string>> = Object.fromEntries(ENTRIES);

/** The label for an id. The coverage test fails for an id without one. */
export function surfaceLabel(id: SurfaceId): string {
  return SURFACE_LABELS[id] as string;
}
