/// <reference types="vite/client" />

// Injected by Vite (see vite.config.js `define`) from package.json's version.
declare const __APP_VERSION__: string;

// Injected by Vite (see vite.config.js `define`) from the FORMAMORPH_BUILD env: build-type class
// ('portable' | 'installed' | 'web'), empty for a local/dev build.
declare const __BUILD_TARGET__: string;

/**
 * The dev-only settings. The `VITE_DEFAULT_*` settings come through `vite/client`'s index signature; they
 * are read as text and parsed at their own call sites.
 */
interface ImportMetaEnv {
  /** DEV only: the `#dev?…` query a launch entry lands on (see `devRouter.ts`). */
  readonly VITE_DEV_ROUTE?: string;
  /** DEV only: hold HMR updates until the page applies them (see `heldUpdatesBanner.ts`). */
  readonly VITE_FM_HOLD_UPDATES?: string;
}
