import { readJson, writeJson } from './storage.ts';

export type Theme = 'dark' | 'light';

const KEY = 'elomental:theme';
const META_COLOR: Record<Theme, string> = { dark: '#262721', light: '#FFFFE5' };

/** Dark is the default; light is opt-in from Setup. */
export function getTheme(): Theme {
  return readJson<Theme>(KEY) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme = getTheme()): void {
  document.documentElement.dataset.theme = theme;
  setBarColor(META_COLOR[theme]);
}

/** iOS tints the status bar (and the area behind it) from theme-color. */
export function setBarColor(color: string): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export const WELCOME_COLOR = META_COLOR.dark;

export function setTheme(theme: Theme): void {
  writeJson(KEY, theme);
  applyTheme(theme);
}
