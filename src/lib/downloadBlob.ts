/**
 * Trigger a browser file download of an existing `href` (a regular URL or a `data:` URL) saved as
 * `filename` — the standard create-anchor/click/remove dance.
 */
function downloadUrl(href: string, filename: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Save a file as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  downloadUrl(href, filename);
  URL.revokeObjectURL(href);
}
