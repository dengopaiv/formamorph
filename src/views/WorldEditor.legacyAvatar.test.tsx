import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { benchEditorWorld, openEditorTab, renderWorldEditorBench } from '@/test/worldEditorBench';
import { LEGACY_VRM_ID } from '@/lib/legacyVrm';
import type { World } from '@/types';

/** An old world's player Avatar in the editor: the old controls are gone and the hidden fallback is spent. */

vi.mock('../services/WorldStorageService', () => ({
  default: {
    initialize: vi.fn(),
    getWorldMetadata: vi.fn().mockResolvedValue([]),
    storeWorld: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/jsonFileWorkerUtils', () => ({
  serializeJsonBlob: vi.fn(), parseJsonText: vi.fn(), terminateWorker: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  ToastContainer: () => null,
}));

vi.mock('@/services/ModelStorageService', () => ({
  default: { getModelMetadata: vi.fn().mockResolvedValue([]), getModelData: vi.fn() },
}));

const FILE = { data: 'data:model/vrm;base64,Z2xURgIA', type: 'model/vrm', name: 'Wren.vrm' };

/** A world as a build before per-entity Avatars stored it: the flag on, an old Avatar, a Custom Persona. */
const OLD_WORLD = benchEditorWorld({
  worldOverview: {
    name: 'Sedge Landing', description: '', author: '', thumbnail: null, bgm: null,
    systemPrompt: 'Narrate the fen.', readme: 'A fen primer.', tags: [],
    use3DModel: true, customPlayerVRM: FILE,
  } as unknown as World['worldOverview'],
  entities: [
    { id: 'you', name: 'Traveler', aiDescription: 'The player.', locations: ['harbor'], customPersona: true },
    { id: 'e1', name: 'Wren', aiDescription: 'A lamp-keeper.', locations: ['harbor'] },
  ],
});

const selectEntity = (name: string) => {
  openEditorTab(/Entities/);
  fireEvent.click(screen.getByText(name));
};

const avatarCardNames = () =>
  Array.from(screen.getByRole('region', { name: 'World › Avatars' }).querySelectorAll('[data-media-card="avatar"] .truncate')).map((el) => el.textContent);

beforeEach(() => localStorage.clear());

describe("an old world's player Avatar in the editor", () => {
  it('shows the old Avatar as a store entry, with no checkbox or old uploader', () => {
    const bench = renderWorldEditorBench(OLD_WORLD, 'advanced');
    openEditorTab(/^Media$/);
    expect(avatarCardNames()).toEqual(['Wren']);
    openEditorTab(/Overview/);
    expect(screen.queryByText('3D Player Avatar')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /3D Player Avatar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Player Avatar/ })).toBeNull();
    expect(bench.ctx().worldOverview.legacyVrmFallback).toEqual({ kind: 'world', id: LEGACY_VRM_ID });
  });

  it('drops the fallback when an entity with a pick becomes the Custom Persona', async () => {
    const noCustom = benchEditorWorld({
      ...OLD_WORLD,
      entities: [{ id: 'e1', name: 'Wren', aiDescription: 'A lamp-keeper.', locations: ['harbor'], vrmPick: { kind: 'default' } }],
    });
    const bench = renderWorldEditorBench(noCustom, 'advanced');
    selectEntity('Wren');
    fireEvent.click(screen.getByRole('radio', { name: 'Custom Persona' }));

    await waitFor(() => expect(bench.ctx().entities[0].customPersona).toBe(true));
    expect(bench.ctx().worldOverview.legacyVrmFallback).toBeUndefined();
  });
});
