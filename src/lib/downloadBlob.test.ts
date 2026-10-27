// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './downloadBlob';

afterEach(() => vi.restoreAllMocks());

describe('downloadBlob', () => {
  it('downloads through an anchor and releases the object URL', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    downloadBlob(new Blob(['{}']), 'world.json');
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('world.json');
    expect(revoke).toHaveBeenCalledOnce();
  });
});
