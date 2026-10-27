import { isDesktop } from '@/lib/desktop';

/** Whether to offer the desktop app: everywhere but the desktop app itself. */
export function deviceCanRunDesktopApp(): boolean {
  return !isDesktop();
}
