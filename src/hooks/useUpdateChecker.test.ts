// @vitest-environment jsdom
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GithubRelease } from '@/services/UpdateService';

const checkForUpdate = vi.hoisted(() => vi.fn());
vi.mock('@/services/UpdateService', async () => {
  const actual = await vi.importActual<typeof import('@/services/UpdateService')>('@/services/UpdateService');
  return { ...actual, checkForUpdate };
});

import { useUpdateChecker } from './useUpdateChecker';

type Shell = { formamorphDesktop?: unknown };

const release = (tag: string): GithubRelease => ({
  tag_name: tag,
  name: tag,
  body: 'notes',
  prerelease: false,
  draft: false,
  assets: [],
  published_at: '2026-09-04T00:00:00Z',
});

/** A fake update bridge, planted where the desktop shell's preload puts the real one. */
function plantBridge(over: Partial<Record<string, unknown>> = {}) {
  const bridge = {
    pending: vi.fn(async () => null as { version: string } | null),
    download: vi.fn(async () => {}),
    apply: vi.fn(async () => {}),
    onProgress: vi.fn(() => () => {}),
    onDownloaded: vi.fn(() => () => {}),
    ...over,
  };
  (window as Shell).formamorphDesktop = { update: bridge };
  return bridge;
}

beforeEach(() => {
  checkForUpdate.mockResolvedValue({
    success: true,
    result: { available: true, latestVersion: 'v9.9.9', changelog: 'notes', release: release('v9.9.9') },
  });
});

afterEach(() => {
  delete (window as Shell).formamorphDesktop;
  vi.clearAllMocks();
});

describe('the update checker over the desktop bridge', () => {
  it('offers the update once the check finds one', async () => {
    plantBridge();

    const { result } = renderHook(() => useUpdateChecker('stable'));

    await waitFor(() => expect(result.current.state.phase).toBe('available'));
    expect(result.current.state.latestVersion).toBe('v9.9.9');
  });

  it('resumes at downloaded when the staged version is the one on offer', async () => {
    plantBridge({ pending: vi.fn(async () => ({ version: '9.9.9' })) });

    const { result } = renderHook(() => useUpdateChecker('stable'));

    // No second download of a file already in the cache: it goes straight to the install offer.
    await waitFor(() => expect(result.current.state.phase).toBe('downloaded'));
  });

  it('still offers a download when the staged version is an older one', async () => {
    plantBridge({ pending: vi.fn(async () => ({ version: '9.9.8' })) });

    const { result } = renderHook(() => useUpdateChecker('stable'));

    await waitFor(() => expect(result.current.state.phase).toBe('available'));
  });

  it('hands the bridge the release the check found', async () => {
    const bridge = plantBridge();
    const { result } = renderHook(() => useUpdateChecker('stable'));
    await waitFor(() => expect(result.current.state.phase).toBe('available'));

    act(() => result.current.download());

    await waitFor(() => expect(bridge.download).toHaveBeenCalledWith({ version: 'v9.9.9', channel: 'stable' }));
    expect(result.current.state.phase).toBe('downloading');
  });

  it('shows a failed download as an error, not a stalled progress bar', async () => {
    plantBridge({ download: vi.fn(async () => { throw new Error('Checksum did not match'); }) });
    const { result } = renderHook(() => useUpdateChecker('stable'));
    await waitFor(() => expect(result.current.state.phase).toBe('available'));

    act(() => result.current.download());

    await waitFor(() => expect(result.current.state.phase).toBe('error'));
    expect(result.current.state.error).toBe('Checksum did not match');
  });

  it('drives progress events into the download state', async () => {
    let progress: ((p: { received: number; total: number }) => void) | null = null;
    plantBridge({
      onProgress: vi.fn((cb: (p: { received: number; total: number }) => void) => {
        progress = cb;
        return () => {};
      }),
    });
    const { result } = renderHook(() => useUpdateChecker('stable'));
    await waitFor(() => expect(progress).not.toBeNull());

    act(() => progress!({ received: 45, total: 90 }));

    expect(result.current.state.phase).toBe('downloading');
    expect(result.current.state.downloadPct).toBe(50);
  });

  it('shows a failed install as an error', async () => {
    plantBridge({
      pending: vi.fn(async () => ({ version: '9.9.9' })),
      apply: vi.fn(async () => { throw new Error('The installer refused the file'); }),
    });
    const { result } = renderHook(() => useUpdateChecker('stable'));
    await waitFor(() => expect(result.current.state.phase).toBe('downloaded'));

    act(() => result.current.applyUpdate());

    await waitFor(() => expect(result.current.state.phase).toBe('error'));
    expect(result.current.state.error).toBe('The installer refused the file');
  });
});

describe('the update checker with no bridge', () => {
  it('still checks, and download and apply do nothing', async () => {
    const { result } = renderHook(() => useUpdateChecker('stable'));
    await waitFor(() => expect(result.current.state.phase).toBe('available'));

    act(() => result.current.download());
    act(() => result.current.applyUpdate());

    // The browser dev server has no installer. Nothing throws, and the offer is all the UI shows.
    expect(result.current.state.phase).toBe('downloading');
  });
});
