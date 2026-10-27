/**
 * Library id of the copy of the bundled avatar earlier builds seeded. Fixed rather than random so saves can
 * name it and `migrateSave` can fold the two older values onto it.
 */
export const DEFAULT_AVATAR_ID = 'default-avatar';

/** Pre-library saves picked the bundled avatar by this sentinel; `migrateSave` rewrites it to the id above. */
export const LEGACY_DEFAULT_AVATAR_SENTINEL = 'default';

/** 2.5.0–2.9.2 id, back when the library called these models. `migrateSave` rewrites it in saves and
 *  `ModelStorageService` rekeys the stored record. */
export const LEGACY_DEFAULT_AVATAR_ID = 'default-model';

