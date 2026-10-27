/**
 * Opens a page outside the app: a new tab on the web, the system browser in the desktop shell.
 * Electron denies the popup and hands the URL to the OS (`setWindowOpenHandler` in `electron/main.cjs`).
 */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
