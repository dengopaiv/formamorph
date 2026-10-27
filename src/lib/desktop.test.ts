// @vitest-environment jsdom
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { isDesktop } from '@/lib/desktop';

beforeEach(() => {
  delete (window as { formamorphDesktop?: unknown }).formamorphDesktop;
});

afterEach(() => {
  delete (window as { formamorphDesktop?: unknown }).formamorphDesktop;
});

describe('isDesktop', () => {
  it('is false with no bridge', () => {
    expect(isDesktop()).toBe(false);
  });

  it('is true with the bridge', () => {
    (window as { formamorphDesktop?: unknown }).formamorphDesktop = {};
    expect(isDesktop()).toBe(true);
  });
});
