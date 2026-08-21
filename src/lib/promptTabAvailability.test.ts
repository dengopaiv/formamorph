import { describe, it, expect } from 'vitest';
import { computePromptTabAvailability, type PromptTabFlags } from './promptTabAvailability';

const base: PromptTabFlags = {
  thinkingMode: 'off',
  choicesEnabled: false,
  statUpdatesEnabled: false,
  locationChangeEnabled: false,
  memoryDigests: false,
  characterDiaries: false,
  aiClock: false,
  sceneImages: false,
  advanced: false,
};

describe('computePromptTabAvailability — Diary gating', () => {
  it('hides Diary when Character Diaries is on but Thinking is not Staged', () => {
    // The regression: Character Diaries is only toggleable in Staged, so the flag can
    // persist true after switching away. Diaries are read only by the staged pass.
    for (const thinkingMode of ['off', 'precall', 'inline'] as const) {
      expect(computePromptTabAvailability({ ...base, thinkingMode, characterDiaries: true }).diary).toBe(false);
    }
  });

  it('shows Diary only when Staged and Character Diaries are both on', () => {
    expect(computePromptTabAvailability({ ...base, thinkingMode: 'staged', characterDiaries: true }).diary).toBe(true);
  });

  it('hides Diary in Staged when Character Diaries is off', () => {
    expect(computePromptTabAvailability({ ...base, thinkingMode: 'staged', characterDiaries: false }).diary).toBe(false);
  });
});

describe('computePromptTabAvailability — other tabs', () => {
  it('always exposes Narration', () => {
    expect(computePromptTabAvailability(base).narration).toBe(true);
  });

  it('gates the staged-only tabs on Staged mode', () => {
    const staged = computePromptTabAvailability({ ...base, thinkingMode: 'staged' });
    expect(staged.director).toBe(true);
    expect(staged.character).toBe(true);
    expect(staged.storyboard).toBe(true);
    const off = computePromptTabAvailability(base);
    expect(off.director).toBe(false);
    expect(off.character).toBe(false);
    expect(off.storyboard).toBe(false);
  });

  it('gates Planning on precall mode only', () => {
    expect(computePromptTabAvailability({ ...base, thinkingMode: 'precall' }).thinking).toBe(true);
    expect(computePromptTabAvailability({ ...base, thinkingMode: 'staged' }).thinking).toBe(false);
  });

  it('maps each feature toggle to its tab', () => {
    expect(computePromptTabAvailability({ ...base, choicesEnabled: true }).choices).toBe(true);
    expect(computePromptTabAvailability({ ...base, statUpdatesEnabled: true }).statupdates).toBe(true);
    expect(computePromptTabAvailability({ ...base, locationChangeEnabled: true }).location).toBe(true);
    expect(computePromptTabAvailability({ ...base, memoryDigests: true }).summary).toBe(true);
    expect(computePromptTabAvailability({ ...base, sceneImages: true }).scenetags).toBe(true);
    expect(computePromptTabAvailability(base).scenetags).toBe(false);
  });
});

describe('computePromptTabAvailability — authoring prompts', () => {
  it('gates the authoring prompts on advanced mode alone', () => {
    const simple = computePromptTabAvailability(base);
    expect(simple.playerdesc).toBe(false);
    expect(simple.aidesc).toBe(false);
    expect(simple.aisummary).toBe(false);

    const adv = computePromptTabAvailability({ ...base, advanced: true });
    expect(adv.playerdesc).toBe(true);
    expect(adv.aidesc).toBe(true);
    expect(adv.aisummary).toBe(true);
  });

  it('does not tie them to any turn-pipeline feature', () => {
    // They drive the world editor's buttons, which are always present. Switching every gameplay feature
    // off must not take the prompt editors away with it.
    const adv = computePromptTabAvailability({ ...base, advanced: true, thinkingMode: 'off' });
    expect(adv.playerdesc).toBe(true);
    expect(adv.aisummary).toBe(true);
  });
});
