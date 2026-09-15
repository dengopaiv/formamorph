import { describe, it, expect } from 'vitest';
import { depthStepOffset, offsetForDepth } from './treeDepthStep';
import { buildLocationTree, flattenLocationTree, getLocationDropProjection } from './locationTree';
import type { GameLocation } from '@/types';

const INDENT = 24;

// Compact location factory: id doubles as name; parentId omitted = top-level.
const L = (id: string, parentId?: string | null): GameLocation => ({ id, name: id, parentId });

// A: [B]  ·  C  ·  D   → flattened depths A(0) B(1) C(0) D(0)
const world: GameLocation[] = [L('A'), L('B', 'A'), L('C'), L('D')];
const visible = flattenLocationTree(buildLocationTree(world));

// C held over its own slot: it sits under B (depth 1) and above D (depth 0), so the real projection allows
// depths 0..2 — top-level, B's sibling, or B's child.
const project = (offsetLeft: number) =>
  getLocationDropProjection(visible, 'C', 'C', offsetLeft, INDENT).depth;
const activeDepth = 0;
const step = (offsetLeft: number, dir: 1 | -1) =>
  depthStepOffset(project, activeDepth, offsetLeft, dir, INDENT);

describe('offsetForDepth', () => {
  it("inverts the projection's indent count", () => {
    expect(offsetForDepth(0, 0, INDENT)).toBe(0);
    expect(offsetForDepth(2, 0, INDENT)).toBe(48);
    expect(offsetForDepth(1, 2, INDENT)).toBe(-24);
    // Round trip through the real projection.
    expect(project(offsetForDepth(2, activeDepth, INDENT))).toBe(2);
  });
});

describe('depthStepOffset', () => {
  it('steps one indent deeper per press', () => {
    expect(step(0, 1)).toBe(24);
    expect(step(24, 1)).toBe(48);
  });

  it('steps back out again', () => {
    expect(step(48, -1)).toBe(24);
    expect(step(24, -1)).toBe(0);
  });

  it('banks nothing past the deepest legal level', () => {
    // Depth 2 is the cap here (one past B). Pressing on must leave the offset where it is, so a single
    // press back out is enough — this is the whole reason the step re-projects instead of just adding.
    expect(step(48, 1)).toBe(48);
    expect(step(step(step(48, 1), 1), -1)).toBe(24);
  });

  it('banks nothing past the top level', () => {
    expect(step(0, -1)).toBe(0);
    expect(step(step(0, -1), 1)).toBe(24);
  });

  it('snaps an off-grid offset onto a real depth', () => {
    // 100px reads as depth 4, which the projection clamps to 2; stepping out lands on a clean depth 1.
    expect(project(100)).toBe(2);
    expect(step(100, -1)).toBe(24);
  });

  it('leaves the offset alone when nothing is being dropped', () => {
    expect(depthStepOffset(() => null, 0, 24, 1, INDENT)).toBe(24);
  });
});
