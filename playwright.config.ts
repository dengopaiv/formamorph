import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level tests. These exist for the failures jsdom structurally cannot see: real layout
 * (element boxes, caret rects), real hit-testing (`pointer-events`, stacking, overlap) and real
 * viewport-driven behavior. Anything provable from pure logic or a rendered tree belongs in the
 * Vitest suite instead — this runner is deliberately kept small and is not part of `npm test`.
 *
 * The dev server is required, not the production build: the specs navigate with the DEV-only
 * dev-router (`window.__fmDev.goto`), which is tree-shaken out of a production bundle.
 */
const PORT = Number(process.env.E2E_PORT ?? 5183);
// `localhost`, not `127.0.0.1`: Vite binds the hostname, and on Windows the numeric form can miss it.
const BASE_URL = `http://localhost:${PORT}`;

/**
 * A local FormamorphServer for the specs that need one (`contest-entry.spec.ts`). Handed to the dev
 * server as its API base, because the app reads that at start-up and the default in `.env` is the live
 * workshop — a run without the override would publish to production. Unset, those specs skip.
 */
const API_URL = process.env.E2E_API_URL;

/**
 * The Vite server the runner starts serves the tree as it stood when the run began: `BASELINE_NO_WATCH`
 * turns off its file watcher and HMR (see `vite.config.js`). A watching server pushes a full page reload
 * into every open page whenever any file under the root is saved, and a reload mid-test drops the app back
 * to the Main Menu — another session editing this tree, or a background tool rewriting a file, then fails
 * whichever spec happened to be running. A server a developer already has up (`reuseExistingServer`) is
 * theirs and keeps watching.
 */
const VITE_ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  BASELINE_NO_WATCH: '1',
  ...(API_URL ? { VITE_API_URL_DEV: API_URL } : {}),
};

export default defineConfig({
  testDir: './e2e',
  // Serial by default: the suite shares one dev server and the specs write localStorage keys the app
  // reads globally (the split-mode preference). Opt a spec into parallel only if it owns its state.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
    },
    {
      // A phone profile, not just a small window: `hasTouch` is what makes the swipe-only chrome
      // (and the touch handlers behind it) render at all.
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: false },
    },
  ],
  webServer: [
    {
      // Its own port, so a run never fights the dev servers on 5180-5182 (see `.claude/launch.json`).
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: BASE_URL,
      // Never reuse when an API base is named: an already-running server was started against a different
      // one, and pointing the app at the wrong API is exactly what must not happen silently.
      reuseExistingServer: !process.env.CI && !API_URL,
      env: VITE_ENV,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
