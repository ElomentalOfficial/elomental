import { a11yPrefs, cleanA11y, storeA11y, type A11yPrefs } from './a11y.ts';
import { readJson, writeJson } from './storage.ts';
import { getTheme, setTheme, type Theme } from './theme.ts';
import { markTutorialDone, resetTutorial, tutorialDone } from './tutorial.ts';

/**
 * Player settings. Each lives on the device, so the app starts with them at
 * once, and on the account (profiles.settings, saved by backend.saveSettings),
 * so they follow the player to every device.
 */
export interface Settings {
  theme: Theme;
  /** The long-press notes wheel; off swaps it for a Notes button under the keypad. */
  notesWheel: boolean;
  tutorialDone: boolean;
  /** Setup > Accessibility (a11y.ts). Partial when saving one choice; keys merge on the account. */
  a11y: Partial<A11yPrefs>;
}

const NOTES_WHEEL_KEY = 'elomental:notes-wheel';

export const notesWheelOn = (): boolean => readJson<boolean>(NOTES_WHEEL_KEY) !== false;

export function localSettings(): Settings {
  return { theme: getTheme(), notesWheel: notesWheelOn(), tutorialDone: tutorialDone(), a11y: a11yPrefs() };
}

/** Writes settings on this device (and repaints the theme if it changed). */
export function applySettings(settings: Partial<Settings>): void {
  if (settings.theme && settings.theme !== getTheme()) setTheme(settings.theme);
  if (settings.notesWheel !== undefined) writeJson(NOTES_WHEEL_KEY, settings.notesWheel);
  if (settings.tutorialDone !== undefined) (settings.tutorialDone ? markTutorialDone : resetTutorial)();
  if (settings.a11y && Object.keys(settings.a11y).length) storeA11y(settings.a11y);
}

/** Only the keys and values the app knows; anything else from the server is dropped. */
export function cleanSettings(raw: unknown): Partial<Settings> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const clean: Partial<Settings> = {};
  if (r.theme === 'dark' || r.theme === 'light') clean.theme = r.theme;
  if (typeof r.notesWheel === 'boolean') clean.notesWheel = r.notesWheel;
  if (typeof r.tutorialDone === 'boolean') clean.tutorialDone = r.tutorialDone;
  if (r.a11y && typeof r.a11y === 'object') clean.a11y = cleanA11y(r.a11y);
  return clean;
}
