/**
 * One accessor for the update bridge, where this build has one.
 *
 * The desktop shell stages a download and installs it, and the screens that offer an update reach it
 * through here rather than through the global. Everything else — the browser dev server — has no
 * bridge, and its update is a reload.
 */

/** Which release a download is for. */
export interface UpdateDownloadTarget {
  version?: string;
  /** Which channel to draw from. The desktop shell's own updater resolves the release from this. */
  channel?: 'stable' | 'prerelease';
}

/**
 * What the update bridge can do, as far as anything reaching for it through here needs.
 *
 * Deliberately narrower than the desktop shell's own bridge: each surface that starts using this adds
 * the call it needs.
 */
export interface UpdateBridge {
  /** A download from an earlier session still staged on disk, or null. */
  pending: () => Promise<{ version: string } | null>;
  /** Start the platform download for a named release. */
  download: (opts: UpdateDownloadTarget) => Promise<void>;
  /** Install what was downloaded. The desktop shell relaunches instead of returning. */
  apply: () => Promise<void>;
  /** Subscribe to download progress; returns an unsubscribe function. */
  onProgress: (cb: (p: { received: number; total: number }) => void) => () => void;
  /** Subscribe to the download finishing; returns an unsubscribe function. */
  onDownloaded: (cb: () => void) => () => void;
}

/**
 * The update bridge this build talks to, or null in the browser.
 *
 * @returns The bridge, or null where the platform has no way to install anything
 */
export function updateBridge(): UpdateBridge | null {
  if (typeof window === 'undefined') return null;
  return window.formamorphDesktop?.update ?? null;
}
