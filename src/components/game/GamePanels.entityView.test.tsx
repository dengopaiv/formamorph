import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { LeftPanel } from './GamePanels';
import { defaultSystemPrompt } from './GamePrompts';
import { renderInGame, worldFixture, type Gameplay } from '@/test/gamePanels';
import type { Entity, SceneEntity } from '@/types';

vi.mock('@/lib/useTtsPlayback', () => import('@/test/stubs/ttsPlayback'));
vi.mock('@/services/ModelStorageService', () => ({
  default: { getModelMetadata: vi.fn().mockResolvedValue([]), getModelData: vi.fn().mockRejectedValue(new Error('none')) },
}));
const mobile = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => mobile.value }));

const vrm = (name: string) => ({ name, file: { data: `data:model/vrm;base64,${name}`, type: 'model/vrm', name: `${name}.vrm` } });
const PICTURE = 'data:image/png;base64,AAAA';
const PICTURE_B = 'data:image/png;base64,BBBB';

const golem = { id: 'golem', name: 'Golem', locations: [], images: [{ data: PICTURE }] } as unknown as Entity;
const heron = { id: 'heron', name: 'Heron', locations: [], images: [{ data: PICTURE_B }] } as unknown as Entity;
const wren = { id: 'wren', name: 'Wren', persona: true, locations: [], vrmPick: { kind: 'world', id: 'wren' } } as unknown as Entity;

const show = ({ cast, scene, overview = {}, seed }: {
  cast: Entity[];
  scene: SceneEntity[];
  overview?: Record<string, unknown>;
  seed?: (g: Gameplay) => void;
}) => {
  const onEntityClick = vi.fn();
  const view = renderInGame(
    <LeftPanel entities={cast} onEntityClick={onEntityClick} narrationPrompt={defaultSystemPrompt} />,
    {
      world: { entities: cast, worldOverview: { ...worldFixture().worldOverview, vrmStore: { wren: vrm('Wren') }, ...overview } } as never,
      seed: (g) => {
        g.setVisibleEntities(scene);
        seed?.(g);
      },
    },
  );
  return { ...view, onEntityClick };
};

const entityRow = (name: string) => {
  fireEvent.mouseDown(screen.getByRole('tab', { name: /Entities/i }));
  return within(screen.getByRole('tabpanel')).getByText(name);
};

beforeEach(() => {
  mobile.value = false;
});

describe('LeftPanel — one entity view', () => {
  it('swaps the view to the entity the player selects', () => {
    const { onEntityClick } = show({
      cast: [heron, golem], scene: [{ name: 'Heron', revealed: true }, { name: 'Golem', revealed: true }],
    });
    expect(screen.getByAltText('Heron')).toBeInTheDocument();

    fireEvent.click(entityRow('Golem'));
    expect(screen.queryByAltText('Heron')).toBeNull();
    expect(screen.getByAltText('Golem')).toBeInTheDocument();
    expect(onEntityClick).not.toHaveBeenCalled();
  });

  it('opens on the first scene entity with a visual when the played entity has none', () => {
    show({
      cast: [heron, wren], scene: [{ name: 'Heron', revealed: true }],
      seed: (g) => g.setPersonaRef({ source: 'world', entityId: 'wren' }),
    });
    expect(screen.getByAltText('Heron')).toBeInTheDocument();
  });

  it('drops the Avatar/Entities toggle and names the view in the hide control', () => {
    show({ cast: [golem], scene: [{ name: 'Golem', revealed: true }] });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide Entity View' })).toBeInTheDocument();
  });
});

describe('LeftPanel — one entity view on mobile', () => {
  beforeEach(() => { mobile.value = true; });

  it('replaces the Avatar tab with the View tab, which shows the entity view', () => {
    show({
      cast: [heron, wren], scene: [{ name: 'Heron', revealed: true }],
      seed: (g) => g.setPersonaRef({ source: 'world', entityId: 'wren' }),
    });
    expect(screen.queryByRole('tab', { name: 'Avatar' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'View' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByAltText('Heron')).toBeInTheDocument();
  });

  it('selects a clicked entity for the View tab and still opens its popup', () => {
    const { onEntityClick } = show({
      cast: [heron, wren], scene: [{ name: 'Heron', revealed: true }],
      seed: (g) => g.setPersonaRef({ source: 'world', entityId: 'wren' }),
    });
    fireEvent.click(entityRow('Heron'));
    expect(onEntityClick).toHaveBeenCalledWith('Heron');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'View' }));
    expect(screen.getByAltText('Heron')).toBeInTheDocument();
  });
});

describe('LeftPanel — the You row', () => {
  it('shows no You row in a legacy-fallback world', () => {
    show({ cast: [heron], scene: [{ name: 'Heron', revealed: true }], overview: { legacyVrmFallback: { kind: 'world', id: 'wren' } } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Entities/i }));
    expect(within(screen.getByRole('tabpanel')).queryByText('You')).toBeNull();
  });

  it('shows no You row when the world has no fallback', () => {
    show({ cast: [heron], scene: [{ name: 'Heron', revealed: true }] });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Entities/i }));
    expect(within(screen.getByRole('tabpanel')).queryByText('You')).toBeNull();
  });
});
