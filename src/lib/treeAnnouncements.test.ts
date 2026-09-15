import { describe, it, expect } from 'vitest';
import { arrayMove } from '@dnd-kit/sortable';
import {
  announceLift, announceMove, announceDrop, announceCancel, describeDrop,
  type TreeDropDescription,
} from './treeAnnouncements';
import { buildLocationTree, flattenLocationTree, getLocationDropProjection } from './locationTree';
import type { GameLocation } from '@/types';

const at = (over: Partial<TreeDropDescription> = {}): TreeDropDescription =>
  ({ depth: 0, parentName: null, afterName: null, ...over });

describe('announceMove', () => {
  it('counts levels from one, so the top level is "level 1" rather than "level 0"', () => {
    expect(announceMove(at())).toBe('Level 1, at the top level, first.');
    expect(announceMove(at({ depth: 2, parentName: 'Hallway' })))
      .toBe('Level 3, inside Hallway, first.');
  });

  it('names the parent it would nest into, and the row it would sit below', () => {
    expect(announceMove(at({ depth: 1, parentName: 'Hallway', afterName: 'Pantry' })))
      .toBe('Level 2, inside Hallway, below Pantry.');
  });

  it('says "first" when nothing precedes it under its parent', () => {
    expect(announceMove(at({ depth: 1, parentName: 'Hallway' })))
      .toBe('Level 2, inside Hallway, first.');
  });

  it('leaves out the dragged row\'s name, which cannot change mid-drag', () => {
    expect(announceMove(at({ parentName: 'Hallway' }))).not.toMatch(/picked|dropped/i);
  });

  // The whole point of the module: the sideways half of the gesture has to reach the live region. dnd-kit
  // re-announces only when the words change, so two depths must never produce one string.
  it('differs between two depths at the same position, so a sideways press is audible', () => {
    const shallow = announceMove(at({ depth: 0, afterName: 'Garden' }));
    const deep = announceMove(at({ depth: 1, parentName: 'Garden' }));
    expect(shallow).not.toBe(deep);
  });

  it('differs between two positions at the same depth, so a vertical press is audible', () => {
    expect(announceMove(at({ depth: 1, parentName: 'Hallway', afterName: 'Pantry' })))
      .not.toBe(announceMove(at({ depth: 1, parentName: 'Hallway', afterName: 'Cellar' })));
  });

  it('says nothing at all when there is no projection to describe', () => {
    expect(announceMove(null)).toBeUndefined();
  });
});

describe('announceLift', () => {
  it('names the row, since later announcements do not', () => {
    expect(announceLift('Kitchen', at({ depth: 1, parentName: 'Hallway' })))
      .toBe('Picked up Kitchen, level 2, inside Hallway, first.');
  });

  it('still names the row when there is nowhere to describe', () => {
    expect(announceLift('Kitchen', null)).toBe('Picked up Kitchen.');
  });
});

describe('announceDrop', () => {
  it('names the row and where it came to rest', () => {
    expect(announceDrop('Kitchen', at({ depth: 1, parentName: 'Hallway', afterName: 'Pantry' })))
      .toBe('Dropped Kitchen, level 2, inside Hallway, below Pantry.');
  });

  it('falls back to the bare name when the drop had no projection', () => {
    expect(announceDrop('Kitchen', null)).toBe('Dropped Kitchen.');
  });
});

describe('announceCancel', () => {
  it('says the row went back, not that it moved', () => {
    expect(announceCancel('Kitchen')).toBe('Cancelled. Kitchen is back where it began.');
  });
});

// ── describeDrop, against the real location projection ────────────────────────────────────────────────
const INDENT = 24;
const L = (id: string, parentId?: string | null): GameLocation => ({ id, name: id, parentId });

// Hallway: [Pantry, Cellar]  ·  Garden        depths: Hallway(0) Pantry(1) Cellar(1) Garden(0)
const world: GameLocation[] = [L('Hallway'), L('Pantry', 'Hallway'), L('Cellar', 'Hallway'), L('Garden')];
const rows = flattenLocationTree(buildLocationTree(world));
const nameOf = (id: string) => rows.find((r) => r.id === id)?.id ?? null;

const describeAt = (activeId: string, overId: string, offset: number) =>
  describeDrop(rows, activeId, overId, getLocationDropProjection(rows, activeId, overId, offset, INDENT), nameOf);

describe('describeDrop', () => {
  it('reads the parent out of the projection rather than re-deriving it', () => {
    // Garden held over its own slot, dragged one indent right: it nests into Cellar's parent chain.
    expect(describeAt('Garden', 'Garden', INDENT)?.parentName).toBe('Hallway');
    expect(describeAt('Garden', 'Garden', 0)?.parentName).toBeNull();
  });

  it('names the row directly above the drop', () => {
    expect(describeAt('Garden', 'Garden', 0)?.afterName).toBe('Cellar');
  });

  it('says "first" rather than naming the parent twice', () => {
    // Pantry over its own slot is the first child of Hallway, so Hallway is both parent and the row above.
    const at = describeAt('Pantry', 'Pantry', 0);
    expect(at?.parentName).toBe('Hallway');
    expect(at?.afterName).toBeNull();
    expect(announceMove(at!)).toBe('Level 2, inside Hallway, first.');
  });

  it('describes nothing when there is no row under the drag', () => {
    expect(describeDrop(rows, 'Garden', null, { depth: 0, parentId: null }, nameOf)).toBeNull();
    expect(describeDrop(rows, 'Garden', 'Garden', null, nameOf)).toBeNull();
    expect(describeDrop(rows, 'ghost', 'Garden', { depth: 0, parentId: null }, nameOf)).toBeNull();
  });

  // The shortcut inside describeDrop skips building the reordered array. If it ever disagrees with the
  // arrayMove the projections actually use, the spoken position stops matching the committed one.
  it('picks the same preceding row as a real arrayMove, for every pair of positions', () => {
    let compared = 0;
    for (let from = 0; from < rows.length; from++) {
      for (let to = 0; to < rows.length; to++) {
        const expected = arrayMove(rows, from, to)[to - 1]?.id;
        const spoken = describeAt(rows[from].id, rows[to].id, 0)?.afterName;
        // afterName is suppressed when the row above is the parent; otherwise it must be arrayMove's.
        if (spoken === null || spoken === undefined) continue;
        expect(spoken).toBe(expected);
        compared++;
      }
    }
    // Both branches of the shortcut have to have been exercised, or this proves nothing.
    expect(compared).toBeGreaterThan(rows.length);
  });
});
