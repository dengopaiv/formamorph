/**
 * What the app asks before a player leaves something they would lose. One copy each, because two routes
 * out of the same place must not word the question differently.
 */

/** Leaving a playthrough: the in-game Exit and the game menu's Exit. */
export const EXIT_TO_MENU_PROMPT = {
  title: 'Exit to Main Menu',
  description: 'Are you sure you want to exit to the main menu? Any unsaved progress will be lost.',
} as const;
