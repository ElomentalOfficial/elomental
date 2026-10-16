import { readJson, writeJson } from './storage.ts';

export type Theme = 'dark' | 'light';

const KEY = 'elomental:theme';
const BAR_COLOR: Record<Theme, string> = { dark: '#262721', light: '#FFFFE5' };

/** Dark is the default; light is opt-in from Setup. */
export function getTheme(): Theme {
  return readJson<Theme>(KEY) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme = getTheme()): void {
  document.documentElement.dataset.theme = theme;
  setBarColor(BAR_COLOR[theme]);
}

/**
 * iOS colours the status bar from theme-color but can ignore later edits to the
 * same tag, so replace the tag instead; a new element is picked up reliably.
 */
function setBarColor(color: string): void {
  const old = document.querySelector('meta[name="theme-color"]');
  if (old?.getAttribute('content') === color) return;
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = color;
  if (old) old.replaceWith(meta);
  else document.head.append(meta);
}

export function setTheme(theme: Theme): void {
  writeJson(KEY, theme);
  applyTheme(theme);
}
