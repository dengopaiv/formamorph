import { describe, it, expect } from 'vitest';
import { hasEntityVisual } from './entityVisual';
import type { Entity } from '@/types';

const MODEL = { name: 'statue.glb', type: 'model/gltf-binary', data: 'data:model/gltf-binary;base64,AAAA' };
const IMAGE = 'data:image/webp;base64,AAAA';

const entity = (extra: Partial<Entity>): Entity =>
  ({ id: 'e1', name: 'Sedge', ...extra }) as Entity;

describe('hasEntityVisual', () => {
  it('accepts an image and rejects an entity with none', () => {
    expect(hasEntityVisual(entity({ images: [{ data: IMAGE }] }))).toBe(true);
    expect(hasEntityVisual(entity({}))).toBe(false);
    expect(hasEntityVisual(undefined)).toBe(false);
  });

  it('rejects an entity with only a stored 3D model, which nothing shows any more', () => {
    expect(hasEntityVisual(entity({ model: MODEL }))).toBe(false);
  });
});
