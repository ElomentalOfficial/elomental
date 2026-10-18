import { readJson, writeJson } from './storage.ts';

/**
 * Accessibility preferences (Setup > Accessibility). They live on the device
 * and on the account with the other settings (settings.ts; save_settings
 * merges them key by key), and default to the system where the system has an
 * opinion (reduced motion, more contrast).
 * docs/ACCESSIBILITY_AUDIT.md explains each one.
 */
export interface A11yPrefs {
  /** Text size in percent: every type token is scaled (styles.css --text-scale). */
  textSize: 100 | 125 | 150 | 200;
  /** 'system' follows prefers-contrast: more. */
  contrast: 'system' | 'standard' | 'high';
  /** Extra shape cues, so no cell state depends on hue. */
  colourBlind: boolean;
  /** 'system' follows prefers-reduced-motion. */
  motion: 'system' | 'reduce';
  showTimer: boolean;
  highlightLines: boolean;
  highlightBox: boolean;
  highlightSame: boolean;
  /** Keep a wrong number on the board until the next move, instead of fading it after a moment. */
  keepWrong: boolean;
  /** Casual only: false lets a Casual game go on past three mistakes. */
  casualMistakeLimit: boolean;
  haptics: boolean;
  sounds: boolean;
}

export const DEFAULTS: A11yPrefs = {
  textSize: 100,
  contrast: 'system',
  colourBlind: false,
  motion: 'system',
  showTimer: true,
  highlightLines: true,
  highlightBox: false,
  highlightSame: true,
  keepWrong: false,
  casualMistakeLimit: true,
  haptics: true,
  sounds: false,
};

const KEY = 'elomental:a11y';
export const TEXT_SIZES = [100, 125, 150, 200] as const;

export function a11yPrefs(): A11yPrefs {
  return { ...DEFAULTS, ...cleanA11y(readJson<unknown>(KEY)) };
}

/** Only known keys with valid values; anything else (old or tampered data) is dropped. */
export function cleanA11y(raw: unknown): Partial<A11yPrefs> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Partial<A11yPrefs> = {};
  if (TEXT_SIZES.includes(r.textSize as A11yPrefs['textSize'])) out.textSize = r.textSize as A11yPrefs['textSize'];
  if (r.contrast === 'system' || r.contrast === 'standard' || r.contrast === 'high') out.contrast = r.contrast;
  if (r.motion === 'system' || r.motion === 'reduce') out.motion = r.motion;
  for (const key of ['colourBlind', 'showTimer', 'highlightLines', 'highlightBox', 'highlightSame', 'keepWrong', 'casualMistakeLimit', 'haptics', 'sounds'] as const) {
    if (typeof r[key] === 'boolean') out[key] = r[key] as boolean;
  }
  return out;
}

const listeners = new Set<() => void>();
/** Runs when a preference changes (here or from the account). Returns an unsubscribe. */
export function onA11yChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stores preferences on this device and applies them to the page. */
export function storeA11y(prefs: Partial<A11yPrefs>): void {
  writeJson(KEY, { ...a11yPrefs(), ...cleanA11y(prefs) });
  applyA11y();
  for (const listener of listeners) listener();
}

const media = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;

export const highContrast = (p = a11yPrefs()): boolean => p.contrast === 'high' || (p.contrast === 'system' && media('(prefers-contrast: more)'));

/** True when animation should be cut down: the player's choice or the system's. */
export const reducedMotion = (): boolean => a11yPrefs().motion === 'reduce' || media('(prefers-reduced-motion: reduce)');

/** A short vibration, unless haptics are off. */
export function haptic(ms: number): void {
  if (a11yPrefs().haptics) navigator.vibrate?.(ms);
}

/** Reflects the preferences on <html>, where styles.css picks them up. */
export function applyA11y(): void {
  const p = a11yPrefs();
  const root = document.documentElement;
  root.style.setProperty('--text-scale', String(p.textSize / 100));
  root.toggleAttribute('data-large-text', p.textSize > 100);
  root.dataset.contrast = highContrast(p) ? 'high' : 'standard';
  root.toggleAttribute('data-colour-blind', p.colourBlind);
  root.toggleAttribute('data-reduce-motion', p.motion === 'reduce');
  root.toggleAttribute('data-hide-timer', !p.showTimer);
}

/** Follow system changes while a preference is set to 'system'. */
export function installA11y(): void {
  applyA11y();
  for (const query of ['(prefers-contrast: more)', '(prefers-reduced-motion: reduce)']) {
    matchMedia(query).addEventListener('change', () => {
      applyA11y();
      for (const listener of listeners) listener();
    });
  }
}
