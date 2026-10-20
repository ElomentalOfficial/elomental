/**
 * Contrast and colour-blindness audit of the theme tokens in styles.css.
 *
 * Every colour pair the app actually draws is listed in PAIRS by token, so a
 * changed token is re-checked automatically. Translucent colours and element
 * opacity are composited over what they sit on. Colour blindness uses the
 * Machado et al. (2009) matrices at full severity.
 *
 *   node scripts/contrast.ts            print the full table
 *   node --test test/contrast.test.ts   fail on any regression
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Each theme, and each with Setup > Accessibility > Contrast: High. */
export type Theme = 'dark' | 'light' | 'dark-hc' | 'light-hc';
type RGBA = [number, number, number, number];

/** [label, foreground token, background token, required ratio, what a translucent background sits on, foreground opacity] */
type Pair = [string, string, string, number, string?, number?];

export const PAIRS: Pair[] = [
  // Text: 4.5:1, or 3:1 at 24px+ (or 18.66px+ bold).
  ['Body text on page', '--text', '--bg', 4.5],
  ['Muted text on page', '--muted', '--bg', 4.5],
  ['Muted text on modal', '--muted', '--modal-bg', 4.5],
  ['Text on modal', '--text', '--modal-bg', 4.5],
  ['Text on surface-2 (inputs, segments)', '--text', '--surface-2', 4.5],
  ['Muted text on surface-2 (resume info, pills)', '--muted', '--surface-2', 4.5],
  ['Muted text on surface (cards, profile rank)', '--muted', '--surface', 4.5],
  ['Muted text on a chosen card', '--muted-chosen', '--chosen-bg', 4.5, '--surface'],
  // The accent as text (titles, counts, the Daily month, errors' mark, outline buttons)
  ['Accent text on page', '--accent-text', '--bg', 4.5],
  ['Accent text on surface', '--accent-text', '--surface', 4.5],
  ['Accent text on surface-2', '--accent-text', '--surface-2', 4.5],
  ['Accent text on modal', '--accent-text', '--modal-bg', 4.5],
  ['Accent text on a chosen card', '--accent-text', '--chosen-bg', 4.5, '--surface'],
  ['Home tile label', '--tile-text', '--tile', 4.5],
  ['Daily tile label (Bright on Crimson)', '--c-bright', '--c-crimson', 4.5],
  ['Casual tile label (Bright on Forest)', '--c-bright', '--c-forest', 4.5],
  ['Ranked tile label (Bright on Lava)', '--c-bright', '--c-lava', 4.5],
  // Rarity tags and element fills (parts, drops, affinities): Bright text on each
  ['Common tag', '--c-bright', '--r-common', 4.5],
  ['Rare tag', '--c-bright', '--r-rare', 4.5],
  ['Epic tag', '--c-bright', '--r-epic', 4.5],
  ['Mythic tag', '--c-bright', '--r-mythic', 4.5],
  ['Fire fill', '--c-bright', '--el-fire', 4.5],
  ['Water fill', '--c-bright', '--el-water', 4.5],
  ['Earth fill', '--c-bright', '--el-earth', 4.5],
  ['Air fill', '--c-bright', '--el-air', 4.5],
  ['Chosen card text (wearing, your plate)', '--text', '--chosen-bg', 4.5, '--surface'],
  ['Name plate border (bronze) on chosen card', '--plate-bronze', '--chosen-bg', 3, '--surface'],
  ['Name plate border (silver) on chosen card', '--plate-silver', '--chosen-bg', 3, '--surface'],
  ['Name plate border (gold) on chosen card', '--plate-gold', '--chosen-bg', 3, '--surface'],
  ['Name plate border (elo) on chosen card', '--plate-elo', '--chosen-bg', 3, '--surface'],
  ['Name plate border (bronze) on --surface', '--plate-bronze', '--surface', 3],
  ['Name plate border (bronze) on --profile-bg', '--plate-bronze', '--profile-bg', 3],
  ['Name plate border (bronze) on --modal-bg', '--plate-bronze', '--modal-bg', 3],
  ['Name plate border (silver) on --surface', '--plate-silver', '--surface', 3],
  ['Name plate border (silver) on --profile-bg', '--plate-silver', '--profile-bg', 3],
  ['Name plate border (silver) on --modal-bg', '--plate-silver', '--modal-bg', 3],
  ['Name plate border (gold) on --surface', '--plate-gold', '--surface', 3],
  ['Name plate border (gold) on --profile-bg', '--plate-gold', '--profile-bg', 3],
  ['Name plate border (gold) on --modal-bg', '--plate-gold', '--modal-bg', 3],
  ['Name plate border (elo) on --surface', '--plate-elo', '--surface', 3],
  ['Name plate border (elo) on --profile-bg', '--plate-elo', '--profile-bg', 3],
  ['Name plate border (elo) on --modal-bg', '--plate-elo', '--modal-bg', 3],
  ['Profile text', '--profile-text', '--profile-bg', 4.5],
  ['Stat chip label', '--muted', '--chip-bg', 4.5, '--profile-bg'],
  ['Primary button text', '--primary-text', '--primary-bg', 4.5],
  ['Action button text (Hint, Undo, Notes)', '--action-text', '--action-bg', 4.5],
  ['Notes button on', '--notes-on-text', '--notes-on-bg', 4.5],
  ['Hint count badge', '--on-accent', '--accent', 4.5],
  ['Toast', '--on-accent', '--accent', 4.5],
  ['Keypad number (30px)', '--key-text', '--key-bg', 3],
  ['Keypad number, all nine placed (55% opacity)', '--key-text', '--key-bg', 3, '--bg', 0.55],
  ['Timer (30px)', '--text', '--bg', 3],
  ['Puzzle type (14px)', '--text', '--bg', 4.5],
  ['Square code chip (12px)', '--muted', '--bg', 4.5],
  ['Given number on cell (28px)', '--cell-text', '--cell', 3],
  ['Given number in row/column highlight', '--cell-text', '--cell-cross', 3],
  ['Your number on cell', '--cell-user', '--cell', 3],
  ['Your number in row/column highlight', '--cell-user', '--cell-cross', 3],
  ['Same-number cell', '--same-text', '--same-bg', 3],
  ['Wrong number cell', '--wrong-text', '--wrong-bg', 3],
  ['Notes on cell', '--cell-text', '--cell', 4.5],
  ['Notes in row/column highlight', '--cell-text', '--cell-cross', 4.5],
  ['Notes wheel number', '--wheel-text', '--wheel-bg', 4.5],
  ['Daily: missed day', '--muted', '--modal-bg', 4.5],
  ['Daily: future day', '--muted', '--bg', 4.5],
  // Non-text: 3:1.
  ['UI: grid box line vs page', '--grid-line', '--bg', 3],
  ['UI: wrong fill vs cell', '--wrong-bg', '--cell', 3],
  ['UI: selection ring vs cell', '--select', '--cell', 3],
  ['UI: selection ring vs same-number fill', '--select', '--same-bg', 3],
  ['UI: selection inner ring vs same-number fill', '--select-inner', '--same-bg', 3],
  ['UI: focus outline vs page', '--focus', '--bg', 3],
  ['UI: focus outline vs modal', '--focus', '--modal-bg', 3],
  ['UI: mistake used vs page', '--mistake-on', '--bg', 3],
  ['UI: mistake unused vs page', '--mistake-off', '--bg', 3],
  ['UI: keypad key vs page', '--key-bg', '--bg', 3],
  ['UI: text field border vs modal', '--field-border', '--modal-bg', 3],
  ['UI: text field border vs surface (Setup cards)', '--field-border', '--surface', 3],
  ['UI: Clash code box edge vs modal (as a text field)', '--field-border', '--modal-bg', 3],
  ['UI: selected segment ring vs track', '--select', '--chip-bg', 3, '--modal-bg'],
  // Supplementary or decorative: measured, never required (see ACCEPTED).
  ['UI: board cell vs page', '--cell', '--bg', 3],
  ['UI: row/column highlight vs cell', '--cell-cross', '--cell', 3],
  ['UI: same-number fill vs cell', '--same-bg', '--cell', 3],
  ['UI: action button vs page', '--action-bg', '--bg', 3],
  ['UI: modal border', '--modal-border', '--modal-bg', 3, '--modal-bg'],
];

/** Pairs that may stay under their ratio, and why. Anything else failing is a regression. */
export const ACCEPTED: Record<string, string> = {
  'UI: board cell vs page': 'the 3x3 box outline (--grid-line) carries the board structure',
  'UI: row/column highlight vs cell': 'supplementary; the selection ring marks the cell (High contrast makes it strong)',
  'UI: same-number fill vs cell': 'supplementary; the number itself is the cue',
  'UI: action button vs page': 'buttons are identified by their text label',
  'UI: modal border': 'decorative hairline',
  'UI: mistake unused vs page': 'an empty slot: used skulls (Lava, 3:1 and scaled up) carry the count, the row label says it, and High contrast fills the slots in --muted',
  'UI: selection ring vs same-number fill': 'light theme: the inner ring (--select-inner) carries it there',
};

const lin = (v: number) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: RGBA) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const ratio = (a: RGBA, b: RGBA): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1) as RGBA;
const hex = (c: RGBA) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function parse(c: string): RGBA | null {
  c = c.trim().toLowerCase();
  if (c === 'transparent') return null;
  let m = c.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)).concat(1) as RGBA;
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`Unreadable colour: ${c}`);
}

/** Custom properties declared in the first block matching `selector`. */
function block(css: string, selector: RegExp): Record<string, string> {
  const m = css.match(selector);
  if (!m || m.index === undefined) throw new Error(`Block not found: ${selector}`);
  const start = css.indexOf('{', m.index) + 1;
  let depth = 1;
  let i = start;
  while (depth) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  const vars: Record<string, string> = {};
  for (const d of css.slice(start, i - 1).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].replace(/\/\*.*?\*\//g, '').trim();
  return vars;
}

export function themes(css: string): Record<Theme, Record<string, string>> {
  const palette = block(css, /\/\* Palette from the Figma ColorPalette frame\. \*\/\s*:root/);
  const dark = { ...palette, ...block(css, /:root,\s*:root\[data-theme='dark'\]/) };
  const light = { ...palette, ...block(css, /:root\[data-theme='light'\]\s*\{/) };
  // High contrast: the shared overrides, then each theme's own (styles.css, "High contrast").
  const hc = block(css, /:root\[data-contrast='high'\]\[data-theme\]\s*\{/);
  return {
    dark,
    light,
    'dark-hc': { ...dark, ...hc, ...block(css, /:root\[data-contrast='high'\]\[data-theme='dark'\]\s*\{/) },
    'light-hc': { ...light, ...hc, ...block(css, /:root\[data-contrast='high'\]\[data-theme='light'\]\s*\{/) },
  };
}

function resolve(vars: Record<string, string>, value: string): string {
  const ref = value.trim().match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
  if (!ref) return value.trim();
  const next = vars[ref[1]] ?? ref[2];
  if (next === undefined) throw new Error(`Unknown token ${ref[1]}`);
  return resolve(vars, next);
}

function colour(vars: Record<string, string>, token: string, under?: RGBA | null): RGBA | null {
  const c = parse(resolve(vars, `var(${token})`));
  if (!c || c[3] === 1) return c;
  return over(c, under ?? (parse(resolve(vars, 'var(--bg)')) as RGBA));
}

export interface Row {
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  need: number;
  pass: boolean;
}

export function contrast(css: string): Record<Theme, Row[]> {
  const out = { dark: [], light: [], 'dark-hc': [], 'light-hc': [] } as Record<Theme, Row[]>;
  for (const [theme, vars] of Object.entries(themes(css)) as [Theme, Record<string, string>][]) {
    for (const [label, fgToken, bgToken, need, underToken, opacity] of PAIRS) {
      const under = underToken ? colour(vars, underToken) : undefined;
      const bg = colour(vars, bgToken, under);
      let fg = bg && colour(vars, fgToken, bg);
      if (!fg || !bg) continue; // a transparent token: nothing drawn in this theme
      if (opacity !== undefined) fg = over([fg[0], fg[1], fg[2], opacity], bg);
      const r = ratio(fg, bg);
      out[theme].push({ label, fg: hex(fg), bg: hex(bg), ratio: r, need, pass: r >= need });
    }
  }
  return out;
}

// --- Colour blindness ------------------------------------------------------

const MACHADO: Record<string, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const unlin = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const simulate = (c: RGBA, m: number[][]): RGBA => {
  const l = [lin(c[0]), lin(c[1]), lin(c[2])];
  return m.map((row) => Math.min(255, Math.max(0, unlin(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))).concat(1) as RGBA;
};
function lab(c: RGBA): [number, number, number] {
  const [r, g, b] = [lin(c[0]), lin(c[1]), lin(c[2])];
  const xyz = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = xyz.map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const deltaE = (a: RGBA, b: RGBA) => {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** Cell states compared pairwise under each kind of colour vision. */
export const STATES: [string, string][] = [
  ['cell', '--cell'],
  ['row/column highlight', '--cell-cross'],
  ['same number', '--same-bg'],
  ['wrong', '--wrong-bg'],
  ['hint', '--accent'],
];

export interface StatePair {
  vision: string;
  pair: string;
  deltaE: number;
}

/** State pairs that look alike (ΔE < 15) under some kind of colour vision. */
export function lookAlikes(css: string): Record<Theme, StatePair[]> {
  const out = { dark: [], light: [], 'dark-hc': [], 'light-hc': [] } as Record<Theme, StatePair[]>;
  for (const [theme, vars] of Object.entries(themes(css)) as [Theme, Record<string, string>][]) {
    const cols = STATES.map(([name, token]) => [name, colour(vars, token)!] as const);
    for (const vision of ['normal', ...Object.keys(MACHADO)]) {
      for (let i = 0; i < cols.length; i++) {
        for (let j = i + 1; j < cols.length; j++) {
          const see = (c: RGBA) => (vision === 'normal' ? c : simulate(c, MACHADO[vision]));
          const d = deltaE(see(cols[i][1]), see(cols[j][1]));
          if (d < 15) out[theme].push({ vision, pair: `${cols[i][0]} / ${cols[j][0]}`, deltaE: d });
        }
      }
    }
  }
  return out;
}

export const readStyles = (): string => readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const css = readStyles();
  for (const [theme, rows] of Object.entries(contrast(css))) {
    console.log(`\n${theme}`);
    for (const r of rows) {
      const state = r.pass ? 'pass' : ACCEPTED[r.label] ? 'ok* ' : 'FAIL';
      console.log(`${state}  ${r.ratio.toFixed(2).padStart(5)}:1  need ${r.need}  ${r.fg} on ${r.bg}  ${r.label}`);
    }
  }
  console.log('\nok* = below the ratio by design (ACCEPTED in this file)');
  for (const [theme, rows] of Object.entries(lookAlikes(css))) {
    console.log(`\n${theme}: cell states with ΔE < 15`);
    for (const r of rows) console.log(`${r.vision.padEnd(13)} ${r.pair.padEnd(34)} ΔE ${r.deltaE.toFixed(1)}`);
  }
}
