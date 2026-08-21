import type { ThinkingMode } from '@/contexts/SettingsContext';

/** The toggles that decide which prompt sub-tabs exist in Settings → Prompts. */
export interface PromptTabFlags {
  thinkingMode: ThinkingMode;
  choicesEnabled: boolean;
  statUpdatesEnabled: boolean;
  locationChangeEnabled: boolean;
  memoryDigests: boolean;
  characterDiaries: boolean;
  aiClock: boolean;
  /** Scene images are available at all — i.e. image generation isn't switched off wholesale. */
  sceneImages: boolean;
  /** Advanced editor mode. Gates the Authoring group only: the world editor's ✨ buttons work on their
   *  shipped prompts in Simple mode, where a prompt editor is noise rather than a missing feature. */
  advanced: boolean;
}

/**
 * Which prompt sub-tabs are available for the given settings. Each tab only
 * exists while its governing feature is active. Diaries are read only by the
 * staged character pass, so the Diary tab requires Staged mode even when the
 * persisted Character Diaries flag is on.
 */
export function computePromptTabAvailability(flags: PromptTabFlags): Record<string, boolean> {
  const { thinkingMode, choicesEnabled, statUpdatesEnabled, locationChangeEnabled, memoryDigests, characterDiaries, aiClock, sceneImages, advanced } = flags;
  return {
    narration: true,
    thinking: thinkingMode === 'precall',
    choices: choicesEnabled,
    statupdates: statUpdatesEnabled,
    location: locationChangeEnabled,
    summary: memoryDigests,
    diary: thinkingMode === 'staged' && characterDiaries,
    director: thinkingMode === 'staged',
    character: thinkingMode === 'staged',
    storyboard: thinkingMode === 'staged',
    timepassed: aiClock,
    timeopening: aiClock,
    scenetags: sceneImages,
    // Authoring prompts are gated by editor mode alone — they drive the world editor's buttons, which are
    // always present, rather than any turn-pipeline feature that can be switched off.
    playerdesc: advanced,
    aidesc: advanced,
    aisummary: advanced,
    desccheck: advanced,
  };
}
