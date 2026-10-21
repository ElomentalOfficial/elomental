/**
 * Palette proposal generator and checker (docs/review/palette-2026-10-21-ui.md).
 *
 *   node --no-warnings docs/review/palette/build.ts          write tokens-proposal.css, print the report tables
 *
 * 1. Builds every ramp: existing colours are anchors (kept exactly, or nudged where the report says
 *    why); every other step is generated in OKLCH at the ramp's own hue and chroma, at the shared
 *    luminance of its step (BANDS), so step N of any hue has the same contrast as step N of any other.
 * 2. Maps each swatch (element, rarity, Home tone) to its roles per theme.
 * 3. Writes tokens-proposal.css: a drop-in replacement for src/styles/tokens.css (not wired in),
 *    old names kept as aliases, plus the High contrast lines that belong in accessibility.css.
 * 4. Checks it with the app's own checker (packages/web/scripts/contrast.ts): the existing PAIRS
 *    plus the swatch pairs below, in dark, light and both High contrast variants; lists every
 *    existing token whose drawn colour changes; and measures look-alikes under colour blindness.
 * Read-only for packages/: it imports contrast.ts and reads the stylesheet, it never writes there.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PAIRS, ACCEPTED, contrast, themes } from '../../../packages/web/scripts/contrast.ts';
import { parseHex, toHex, solveY, dE, simulate, ratio, oklch, luminance, over, type RGB } from './colour.ts';

// --- 1. Steps and ramps --------------------------------------------------------------------

/** WCAG relative luminance of each step. Chosen so each step has one job on every surface:
 *  200 ink on dark in High contrast (≥6.7:1 on surface-2) · 300 ink on dark (≥4.5:1) ·
 *  400 line on dark (≥3:1), or a light fill under dark text (≥5:1) · 500 fill under Bright
 *  text (≥5:1), line on light (≥3:1) · 600 ink on light (≥4.5:1 on Mud) · 700 ink on light in
 *  High contrast (≥7:1 on Mud) · 800, 900 the dark surfaces. */
export const BANDS: Record<number, number> = { 50: 0.95, 100: 0.78, 200: 0.64, 300: 0.44, 400: 0.3, 500: 0.14, 600: 0.082, 700: 0.052, 800: 0.035, 900: 0.02, 950: 0.0075 };
const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
/** How much of a hue's chroma each step carries (tints and shades are quieter, as in the Figma set). */
const PROFILE: Record<number, number> = { 50: 0.2, 100: 0.35, 200: 0.6, 300: 0.9, 375: 1, 400: 1, 425: 1, 450: 1, 500: 1, 600: 0.95, 700: 0.85, 800: 0.45, 900: 0.3, 950: 0.2 };
const FLAT: Record<number, number> = Object.fromEntries(Object.keys(PROFILE).map((k) => [k, 1]));

/** An anchor is an existing colour kept exactly (hex), or a generated one: its hue, chroma and
 *  (optionally) its own luminance instead of the step's. */
type Anchor = string | { C: number; H: number; Y?: number };
interface Ramp {
  name: string;
  what: string;
  steps: number[];
  anchors: Record<number, Anchor>;
  profile?: Record<number, number>;
}

export const RAMPS: Ramp[] = [
  { name: 'stone', what: 'dark-theme neutrals and Common (warm grey, chroma ≤ 0.02)', steps: [100, 200, 300, 375, 425, 450, 500, 600, 700, 800, 900, 950], profile: FLAT,
    anchors: { 950: '#141511', 900: '#262721', 800: '#343530', 700: '#40413c', 500: '#6d6d5f', 450: '#77786e', 425: '#85867c', 375: '#9a9b8f' } },
  { name: 'sand', what: 'light-theme neutrals (beige-olive, chroma 0.03–0.045)', steps: [50, 100, 200, 300, 400, 450, 500, 600, 700, 800, 900], profile: FLAT,
    anchors: { 50: '#ffffe5', 100: '#e8e8ce', 200: '#dadbb9', 300: '#b3b5a0', 400: '#8c8d76', 450: '#7a7b64', 500: '#6b6c58' } },
  { name: 'lava', what: 'Fire, Ranked, the dark accent', steps: STEPS, anchors: { 300: '#e69c74', 500: '#a85b37', 800: '#413226' } },
  { name: 'forest', what: 'Earth, Casual, what is on', steps: STEPS, anchors: { 200: '#c9d09d', 500: '#636945' } },
  { name: 'crimson', what: 'Daily, the light theme ink and accent', steps: STEPS, anchors: { 600: '#794341' } },
  { name: 'tide', what: 'Water (new: a dusty sea blue, light fill)', steps: STEPS, anchors: { 400: { C: 0.08, H: 230 } } },
  { name: 'mist', what: 'Air (new: a cool grey-white)', steps: STEPS, profile: FLAT, anchors: { 200: { C: 0.02, H: 220 }, 500: { C: 0.035, H: 225 } } },
  { name: 'azure', what: 'Rare (nudged a step lighter, see report)', steps: STEPS, anchors: { 500: { C: 0.0731, H: 249.5, Y: 0.15 } } },
  { name: 'amethyst', what: 'Epic', steps: STEPS, anchors: { 500: '#6f4b81' } },
  { name: 'flame', what: 'Mythic (new: a reddish-orange flame, light fill)', steps: STEPS, anchors: { 400: { C: 0.14, H: 36 } } },
  { name: 'bronze', what: 'Bronze plate', steps: [200, 300, 400, 500, 600, 700], anchors: { 400: '#c4875a', 500: '#9a5b2c' } },
  { name: 'silver', what: 'Silver plate', steps: [200, 300, 400, 500, 600, 700], anchors: { 300: '#b3bac1', 500: '#66707c' } },
  { name: 'gold', what: 'Gold plate, medals, the light plate glow', steps: [200, 300, 400, 500, 600, 700], anchors: { 200: '#f0cd78', 300: '#c9a54e', 500: '#8f6a12' } },
  { name: 'star', what: 'Starforged plate (the top plate, --plate-elo)', steps: [200, 300, 400, 500, 600, 700], anchors: { 200: '#ecd38c', 500: '#946410' } },
];

function bandY(step: number): number {
  if (BANDS[step] !== undefined) return BANDS[step];
  // half steps of the neutral ramps sit between their neighbours on a log scale
  const ks = Object.keys(BANDS).map(Number).sort((a, b) => a - b);
  const lo = Math.max(...ks.filter((k) => k < step));
  const hi = Math.min(...ks.filter((k) => k > step));
  const t = (step - lo) / (hi - lo);
  return Math.exp(Math.log(BANDS[lo]) * (1 - t) + Math.log(BANDS[hi]) * t);
}

export const PRIM: Record<string, string> = {}; // '--c-lava-500' -> '#a85b37'
const GENERATED = new Set<string>();
for (const r of RAMPS) {
  const p = r.profile ?? PROFILE;
  // each anchor's hue and its chroma at full profile
  const spine = Object.entries(r.anchors).map(([s, a]) => {
    const step = Number(s);
    const [, C, H] = typeof a === 'string' ? oklch(parseHex(a)) : [0, a.C, a.H];
    return { step, H, Cp: C / p[step] };
  }).sort((a, b) => a.step - b.step);
  for (const step of r.steps) {
    const name = `--c-${r.name}-${step}`;
    const a = r.anchors[step];
    if (typeof a === 'string') {
      PRIM[name] = a;
      continue;
    }
    if (a) {
      PRIM[name] = toHex(solveY(a.Y ?? bandY(step), a.C, a.H));
      GENERATED.add(name);
      continue;
    }
    const below = spine.filter((s) => s.step < step).at(-1);
    const above = spine.find((s) => s.step > step);
    const [x, y] = [below ?? above!, above ?? below!];
    const t = x.step === y.step ? 0 : (step - x.step) / (y.step - x.step);
    const H = x.H + (y.H - x.H) * t;
    const Cp = x.Cp + (y.Cp - x.Cp) * t;
    PRIM[name] = toHex(solveY(bandY(step), Cp * p[step], H));
    GENERATED.add(name);
  }
}

// --- 2. Swatches and their roles -------------------------------------------------------------

type Theme = 'dark' | 'light' | 'dark-hc' | 'light-hc';
interface Swatch {
  id: string; // token prefix: --<id>-fill …
  ramp: string;
  fill: number;
  /** per-role step overrides, where a ramp lacks the standard step */
  steps?: Partial<Record<string, number>>;
}
export const SWATCHES: Swatch[] = [
  { id: 'el-fire', ramp: 'lava', fill: 500 },
  { id: 'el-water', ramp: 'tide', fill: 400 },
  { id: 'el-earth', ramp: 'forest', fill: 500 },
  { id: 'el-air', ramp: 'mist', fill: 200, steps: { 'line-light': 600, 'line-hc-light': 700 } },
  { id: 'r-common', ramp: 'stone', fill: 500, steps: { 'line-dark': 375 } },
  { id: 'r-rare', ramp: 'azure', fill: 500 },
  { id: 'r-epic', ramp: 'amethyst', fill: 500 },
  { id: 'r-mythic', ramp: 'flame', fill: 400 },
  { id: 'tone-lava', ramp: 'lava', fill: 500 },
  { id: 'tone-forest', ramp: 'forest', fill: 500 },
  { id: 'tone-crimson', ramp: 'crimson', fill: 600 },
];
const ON_DARK_FILL = '--c-sand-50'; // Bright
const ON_LIGHT_FILL = '--c-stone-900'; // Bg
const WASH_ALPHA = { dark: 0.18, light: 0.14 };
/** the step each role takes, per theme (a light fill is one at 400 or lighter, read with dark text) */
function roleStep(s: Swatch, role: string, theme: 'dark' | 'light'): number {
  const o = s.steps?.[`${role}-${theme}`];
  if (o) return o;
  return { ink: { dark: 300, light: 600 }, line: { dark: 400, light: 500 }, 'ink-hc': { dark: 200, light: 700 }, 'line-hc': { dark: 300, light: 600 } }[role]![theme];
}
const lightFill = (s: Swatch) => s.fill <= 400;
const v = (ramp: string, step: number) => `var(--c-${ramp}-${step})`;
const rgba = (hex: string, a: number) => `rgba(${parseHex(hex).join(', ')}, ${a})`;

/** role tokens: theme-independent ones (fill, on) and each theme's */
function roles(s: Swatch) {
  const base = { fill: v(s.ramp, s.fill), on: `var(${lightFill(s) ? ON_LIGHT_FILL : ON_DARK_FILL})` };
  const theme = (t: 'dark' | 'light') => ({
    ink: v(s.ramp, roleStep(s, 'ink', t)),
    line: v(s.ramp, roleStep(s, 'line', t)),
    wash: rgba(PRIM[`--c-${s.ramp}-500`], WASH_ALPHA[t]),
    // a light fill can't stand on the light theme's pale surfaces: its shapes and edges take the line
    mark: t === 'light' && lightFill(s) ? v(s.ramp, roleStep(s, 'line', t)) : `var(--${s.id}-fill)`,
  });
  const hc = (t: 'dark' | 'light') => ({
    ink: v(s.ramp, roleStep(s, 'ink-hc', t)),
    line: v(s.ramp, roleStep(s, 'line-hc', t)),
    ...(t === 'light' && lightFill(s) ? { mark: v(s.ramp, roleStep(s, 'line-hc', t)) } : {}),
  });
  return { base, dark: theme('dark'), light: theme('light'), 'dark-hc': hc('dark'), 'light-hc': hc('light') };
}

// --- 3. The stylesheet -----------------------------------------------------------------------

const ROOT = new URL('../../../', import.meta.url);
const tokensCss = readFileSync(new URL('packages/web/src/styles/tokens.css', ROOT), 'utf8');
const a11yCss = readFileSync(new URL('packages/web/src/styles/accessibility.css', ROOT), 'utf8');

function body(css: string, selector: RegExp): string {
  const m = css.match(selector)!;
  const start = css.indexOf('{', m.index!) + 1;
  let depth = 1;
  let i = start;
  while (depth) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

/** Old palette names, kept as aliases so nothing breaks. */
export const ALIASES: [string, string, string?][] = [
  ['--c-bg', '--c-stone-900'],
  ['--c-highlight', '--c-stone-800'],
  ['--c-highlight-2', '--c-stone-700'],
  ['--c-bright', '--c-sand-50'],
  ['--c-second-bright', '--c-sand-100'],
  ['--c-mud', '--c-sand-200'],
  ['--c-rock', '--c-sand-300'],
  ['--c-lava', '--c-lava-500', 'Bright on it 4.91:1'],
  ['--c-lava-highlight', '--c-lava-800'],
  ['--c-ember', '--c-lava-300', 'Lava as text on the dark surfaces'],
  ['--c-forest', '--c-forest-500'],
  ['--c-forest-highlight', '--c-forest-200'],
  ['--c-crimson', '--c-crimson-600'],
  ['--r-common', '--r-common-fill'],
  ['--r-rare', '--r-rare-fill'],
  ['--r-epic', '--r-epic-fill'],
  ['--r-mythic', '--r-mythic-fill'],
  ['--el-fire', '--el-fire-fill'],
  ['--el-water', '--el-water-fill'],
  ['--el-earth', '--el-earth-fill'],
  ['--el-air', '--el-air-fill'],
];

/** Raw colours in the theme blocks, re-pointed at their step (two are merged: see the report). */
const HEX_TO_STEP: Record<string, string> = {
  '#383932': '--c-stone-700', // dark --line: merged into the separator / surface-2 step
  '#e8e8cc': '--c-sand-100', // light --separator: merged into Second bright
  '#85867c': '--c-stone-425',
  '#77786e': '--c-stone-450',
  '#9a9b8f': '--c-stone-375',
  '#7a7b64': '--c-sand-450',
  '#8c8d76': '--c-sand-400',
  '#6b6c58': '--c-sand-500',
  '#40413c': '--c-stone-700',
};
const PLATES: Record<'dark' | 'light', Record<string, string>> = {
  dark: { '--plate-bronze': '--c-bronze-400', '--plate-silver': '--c-silver-300', '--plate-gold': '--c-gold-300', '--plate-elo': '--c-star-200' },
  light: { '--plate-bronze': '--c-bronze-500', '--plate-silver': '--c-silver-500', '--plate-gold': '--c-gold-500', '--plate-elo': '--c-star-500' },
};

function themeBody(src: string, t: 'dark' | 'light'): string {
  let out = src;
  for (const [hex, step] of Object.entries(HEX_TO_STEP)) out = out.replaceAll(new RegExp(`${hex}(?=;)`, 'gi'), `var(${step})`);
  for (const [tok, step] of Object.entries(PLATES[t])) out = out.replace(new RegExp(`(${tok}:\\s*)#[0-9a-f]{6}`), `$1var(${step})`);
  if (t === 'dark') out = out.replace('--chosen-bg: rgba(168, 91, 55, 0.18);', '--chosen-bg: var(--tone-lava-wash);');
  out = out.replace(/(--feather-shadow: [^;]+;)\s*(--profile-bg)/, '$1\n  $2'); // a missing line break in the source
  const lines = SWATCHES.map((s) => {
    const r = roles(s)[t];
    return `  --${s.id}-ink: ${r.ink};\n  --${s.id}-line: ${r.line};\n  --${s.id}-wash: ${r.wash};\n  --${s.id}-mark: ${r.mark};`;
  });
  return `${out.trimEnd()}\n\n  /* Swatch roles (see the palette proposal): ink = the hue as text on this theme's surfaces,\n     line = a border that must be seen, wash = a faint tint, mark = the hue as a shape. */\n${lines.join('\n')}\n`;
}

function hcBody(src: string, t: 'dark' | 'light' | 'both'): string {
  let out = src;
  for (const [hex, step] of Object.entries(HEX_TO_STEP)) out = out.replaceAll(new RegExp(`${hex}(?=;)`, 'gi'), `var(${step})`);
  if (t === 'both') return out;
  const lines = SWATCHES.map((s) => Object.entries(roles(s)[`${t}-hc`]).map(([k, val]) => `  --${s.id}-${k}: ${val};`).join('\n'));
  return `${out.trimEnd()}\n  /* Swatch roles, one step stronger: ink 7:1 or near it, lines 4.5:1. */\n${lines.join('\n')}\n`;
}

const paletteBody = body(tokensCss, /\/\* Palette from the Figma ColorPalette frame\. \*\/\s*:root/);
const nonColour = paletteBody.slice(paletteBody.indexOf('  --font:'));

const ramps = RAMPS.map((r) => {
  const lines = r.steps.map((s) => {
    const n = `--c-${r.name}-${s}`;
    const [L, C, H] = oklch(parseHex(PRIM[n]));
    return `  ${n}: ${PRIM[n]}; /* L ${L.toFixed(3)} C ${C.toFixed(3)} H ${H.toFixed(0)}${GENERATED.has(n) ? '' : ' · existing'} */`;
  });
  return `  /* ${r.name}: ${r.what} */\n${lines.join('\n')}`;
}).join('\n');

const css = `/* PROPOSAL, not wired in. A drop-in replacement for packages/web/src/styles/tokens.css,
   generated by docs/review/palette/build.ts (edit the script, not this file).
   Design tokens: the palette, the type and spacing scales, and the dark and light themes. */
/* Palette from the Figma ColorPalette frame. */
:root {
  /*
   * Ramps. One per hue, steps by luminance: step N of every hue has the same contrast against
   * every surface, so a role maps to the same step for every hue.
   *   200 ink on dark, High contrast  · 300 ink on dark       · 400 line on dark / light fill
   *   500 fill under Bright text      · 600 ink on light      · 700 ink on light, High contrast
   *   800, 900 dark surfaces and tints
   * Steps marked "existing" are the Figma colours (or the tuned theme greys) kept exactly.
   * The neutrals have half steps (375, 425, 450) where the tuned borders sit.
   */
${ramps}
  --c-white: #ffffff; /* sheen highlights on glass only */
  --c-black: #000000; /* shadows only */

  /* Old palette names: aliases, so every existing rule keeps working. */
${ALIASES.map(([a, b, note]) => `  ${a}: var(${b});${note ? ` /* ${note} */` : ''}`).join('\n')}

  /*
   * Swatches: each element, rarity and Home tone is one ramp plus one mapping. Fill and its text
   * are the same in both themes; ink, line, wash and mark are set per theme below.
   *   fill  a solid tag, tile, chip or crest disc
   *   on    text or icon on the fill (4.5:1)
   *   ink   the hue as text or icon on the page and its surfaces (4.5:1 on each)
   *   line  a border or ring that must be seen (3:1 on each surface)
   *   wash  a faint tint behind something chosen (text and ink stay 4.5:1 on it)
   *   mark  the hue as a shape without text (frame ring, bar segment, dot, a fill's 1px edge):
   *         the fill itself, or its line where a light fill would vanish (light theme)
   * Always shown with the name or the crest, never colour alone.
   */
${SWATCHES.map((s) => { const r = roles(s).base; return `  --${s.id}-fill: ${r.fill};\n  --${s.id}-on: ${r.on};`; }).join('\n')}

${nonColour.trimEnd()}
}

/* Dark is the default theme. */
:root,
:root[data-theme='dark'] {${themeBody(body(tokensCss, /:root,\s*:root\[data-theme='dark'\]/), 'dark')}}

:root[data-theme='light'] {${themeBody(body(tokensCss, /:root\[data-theme='light'\]\s*\{/), 'light')}}

/* ---------------------------------------------------------------------------------------
 * High contrast: these three blocks REPLACE the ones in src/styles/accessibility.css (the first
 * lines of each are the existing overrides, re-pointed at their steps).
 * ------------------------------------------------------------------------------------- */
:root[data-contrast='high'][data-theme] {${hcBody(body(a11yCss, /:root\[data-contrast='high'\]\[data-theme\]\s*\{/), 'both')}}
:root[data-contrast='high'][data-theme='dark'] {${hcBody(body(a11yCss, /:root\[data-contrast='high'\]\[data-theme='dark'\]\s*\{/), 'dark')}}
:root[data-contrast='high'][data-theme='light'] {${hcBody(body(a11yCss, /:root\[data-contrast='high'\]\[data-theme='light'\]\s*\{/), 'light')}}
`;
writeFileSync(new URL('tokens-proposal.css', import.meta.url), css);
// The specimen page (specimen.html) gets the same tokens, scoped to its panels so both themes sit side by side.
{
  const url = new URL('specimen.html', import.meta.url);
  const page = readFileSync(url, 'utf8');
  const scoped = css.replaceAll(":root[data-theme='light']", "[data-theme='light']").replaceAll(":root[data-theme='dark']", "[data-theme='dark']");
  writeFileSync(url, page.replace(/\/\* tokens:start \*\/[\s\S]*\/\* tokens:end \*\//, () => `/* tokens:start */\n${scoped}\n/* tokens:end */`));
}

// --- 4. Checks -------------------------------------------------------------------------------

const styles = (tokens: string) =>
  readFileSync(new URL('packages/web/src/styles.css', ROOT), 'utf8').replace(/^@import '\.\/(styles\/[\w-]+\.css)';$/gm, (_, f: string) =>
    f === 'styles/tokens.css' ? tokens : readFileSync(new URL(`packages/web/src/${f}`, ROOT), 'utf8'));
const oldCss = styles(tokensCss);
const newCss = styles(css);

/** The PAIRS to add to contrast.ts: every role of every swatch on every surface. */
export const SURFACES: [string, string][] = [['page', '--bg'], ['surface', '--surface'], ['surface-2', '--surface-2'], ['modal', '--modal-bg']];
export function swatchPairs(ids: string[]): [string, string, string, number, string?][] {
  const out: [string, string, string, number, string?][] = [];
  for (const s of ids) {
    out.push([`${s}: on-fill`, `--${s}-on`, `--${s}-fill`, 4.5]);
    for (const [n, t] of SURFACES) out.push([`${s}: ink on ${n}`, `--${s}-ink`, t, 4.5]);
    for (const [n, t] of SURFACES) out.push([`UI: ${s} line vs ${n}`, `--${s}-line`, t, 3]);
    for (const [n, t] of SURFACES) out.push([`UI: ${s} mark vs ${n}`, `--${s}-mark`, t, 3]);
    out.push([`${s}: text on wash (card)`, '--text', `--${s}-wash`, 4.5, '--surface']);
    out.push([`${s}: text on wash (page)`, '--text', `--${s}-wash`, 4.5, '--bg']);
    out.push([`${s}: ink on wash (card)`, `--${s}-ink`, `--${s}-wash`, 4.5, '--surface']);
  }
  return out;
}
/** The eight "Bright on the fill" rows they replace (Air, Water and Mythic take dark text now). */
const REPLACED = ['Common tag', 'Rare tag', 'Epic tag', 'Mythic tag', 'Fire fill', 'Water fill', 'Earth fill', 'Air fill'];
/** The deep fills keep their Figma depth on the dark theme: as bare shapes they sit under 3:1 there. */
export function swatchAccepted(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of ids) for (const [n] of SURFACES) out[`UI: ${s} mark vs ${n}`] =
    'dark theme: a deep fill as a shape (ring, dot, bar) always sits beside its name or crest; where a shape alone must be seen, use the line role (3:1). On the light theme the mark is 3:1 or better, and its line rows guard it';
  return out;
}
const DEEP = SWATCHES.filter((s) => !lightFill(s)).map((s) => s.id);

const before = contrast(oldCss);
const keep = PAIRS.filter((p) => !REPLACED.includes(p[0]));
PAIRS.length = 0;
PAIRS.push(...keep, ...swatchPairs(SWATCHES.map((s) => s.id)));
Object.assign(ACCEPTED, swatchAccepted(DEEP));
const after = contrast(newCss);

const THEMES: Theme[] = ['dark', 'light', 'dark-hc', 'light-hc'];
const out: string[] = [];
const say = (s = '') => out.push(s);

// 4a. regressions in the existing pairs, and new failures
say('## Checker result');
for (const t of THEMES) {
  const fails = after[t].filter((r) => !r.pass && !ACCEPTED[r.label]);
  say(`- ${t}: ${after[t].length} pairs, ${fails.length} below their ratio${fails.length ? ':' : ''}`);
  for (const r of fails) say(`  - ${r.label}: ${r.ratio.toFixed(2)}:1 (need ${r.need}) ${r.fg} on ${r.bg}`);
  const ok = after[t].filter((r) => !r.pass && ACCEPTED[r.label]);
  say(`  (${ok.length} under their ratio by design, ACCEPTED: ${[...new Set(ok.map((r) => r.label.replace(/^UI: /, '')))].join('; ')})`);
}
const oldRows = Object.fromEntries(THEMES.map((t) => [t, Object.fromEntries(before[t].map((r) => [r.label, r]))]));
say('\nExisting pairs whose ratio moved by more than 0.05:');
for (const t of THEMES) for (const r of after[t]) {
  const o = oldRows[t][r.label];
  if (o && Math.abs(o.ratio - r.ratio) > 0.05) say(`- ${t} · ${r.label}: ${o.ratio.toFixed(2)} → ${r.ratio.toFixed(2)}`);
}

// 4b. every existing token whose drawn colour changes
function resolver(cssText: string) {
  const th = themes(cssText);
  const res = (vars: Record<string, string>, val: string): string => {
    const m = val.trim().match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
    return m ? res(vars, vars[m[1]] ?? m[2]) : val.trim();
  };
  return (t: Theme, tok: string) => {
    const vars = th[t];
    if (!(tok in vars)) return null;
    const raw = res(vars, vars[tok]);
    const hex = raw.match(/^#([0-9a-f]{6})$/i);
    if (hex) return raw.toLowerCase();
    const m = raw.match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return `rgba(${p.join(',')})`;
  };
}
const oldR = resolver(oldCss);
const newR = resolver(newCss);
const solid = (c: string): RGB => (c.startsWith('#') ? parseHex(c) : (c.slice(5, -1).split(',').slice(0, 3).map(Number) as RGB));
say('\n## Existing tokens whose colour changes');
say('| Theme | Token | Old | New | ΔE (OKLab) |');
say('| --- | --- | --- | --- | --- |');
const oldTh = themes(oldCss);
for (const t of THEMES) for (const tok of Object.keys(oldTh[t])) {
  const [a, b] = [oldR(t, tok), newR(t, tok)];
  if (a && b && a !== b) say(`| ${t} | \`${tok}\` | ${a} | ${b} | ${dE(solid(a), solid(b)).toFixed(3)} |`);
}

// 4c. the role table: weakest surface per role, per theme
say('\n## Role contrast (the weakest of page, surface, surface-2 and modal)');
say('| Swatch | Role | Need | Dark | Light | Dark HC | Light HC |');
say('| --- | --- | --- | --- | --- | --- | --- |');
const byLabel = Object.fromEntries(THEMES.map((t) => [t, Object.fromEntries(after[t].map((r) => [r.label, r]))]));
for (const s of SWATCHES) {
  const groups: [string, string[], number][] = [
    ['on-fill', [`${s.id}: on-fill`], 4.5],
    ['ink', SURFACES.map(([n]) => `${s.id}: ink on ${n}`), 4.5],
    ['line', SURFACES.map(([n]) => `UI: ${s.id} line vs ${n}`), 3],
    ['mark', SURFACES.map(([n]) => `UI: ${s.id} mark vs ${n}`), 3],
    ['text on wash', [`${s.id}: text on wash (card)`, `${s.id}: text on wash (page)`], 4.5],
    ['ink on wash', [`${s.id}: ink on wash (card)`], 4.5],
  ];
  for (const [role, labels, need] of groups) {
    const cells = THEMES.map((t) => {
      const rows = labels.map((l) => byLabel[t][l]).filter(Boolean);
      if (!rows.length) return '–';
      const w = rows.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
      const where = labels.length > 1 ? ` ${w.label.split(' ').at(-1)}` : '';
      return `${w.ratio.toFixed(2)}${w.pass ? '' : ' ✗'}${where} (${w.fg})`;
    });
    say(`| ${s.id} | ${role} | ${need} | ${cells.join(' | ')} |`);
  }
}

// 4d. colour-vision look-alikes
const VISIONS = ['normal', 'deuteranopia', 'protanopia', 'tritanopia'];
const colourOf = (cssText: string, t: Theme, tok: string) => {
  const c = resolver(cssText)(t, tok)!;
  if (c.startsWith('#')) return parseHex(c);
  const p = c.slice(5, -1).split(',').map(Number);
  return over(p.slice(0, 3) as RGB, p[3] ?? 1, parseHex(resolver(cssText)(t, '--bg')!));
};
const dEs = (a: RGB, b: RGB) => VISIONS.map((vis) => dE(simulate(a, vis), simulate(b, vis)));
say('\n## Look-alikes (ΔE OKLab: normal / deuteranopia / protanopia / tritanopia; ≥ 0.10 clearly apart, 0.05–0.10 apart side by side, < 0.05 near-collision)');
const COMPARE: [string, string, string, string][] = [
  ['Rare vs Water (fills)', '--r-rare-fill', '--el-water-fill', 'fill'],
  ['Rare vs Water (ink)', '--r-rare-ink', '--el-water-ink', 'ink'],
  ['Common vs Air (fills)', '--r-common-fill', '--el-air-fill', 'fill'],
  ['Common vs Air (marks)', '--r-common-mark', '--el-air-mark', 'mark'],
  ['Mythic vs Fire (fills)', '--r-mythic-fill', '--el-fire-fill', 'fill'],
  ['Mythic vs Fire (ink)', '--r-mythic-ink', '--el-fire-ink', 'ink'],
  ['Epic vs Crimson (fills)', '--r-epic-fill', '--tone-crimson-fill', 'fill'],
  ['Rare vs Epic', '--r-rare-fill', '--r-epic-fill', 'fill'],
  ['Common vs Rare', '--r-common-fill', '--r-rare-fill', 'fill'],
  ['Common vs Epic', '--r-common-fill', '--r-epic-fill', 'fill'],
  ['Epic vs Mythic', '--r-epic-fill', '--r-mythic-fill', 'fill'],
  ['Fire vs Earth', '--el-fire-mark', '--el-earth-mark', 'mark'],
  ['Fire vs Water', '--el-fire-mark', '--el-water-mark', 'mark'],
  ['Fire vs Air', '--el-fire-mark', '--el-air-mark', 'mark'],
  ['Water vs Earth', '--el-water-mark', '--el-earth-mark', 'mark'],
  ['Water vs Air (marks)', '--el-water-mark', '--el-air-mark', 'mark'],
  ['Water vs Air (fills)', '--el-water-fill', '--el-air-fill', 'fill'],
  ['Mythic vs Water (fills, both light)', '--r-mythic-fill', '--el-water-fill', 'fill'],
  ['Mythic fill vs Ember (dark accent text)', '--r-mythic-fill', '--c-ember', 'fill'],
  ['Earth vs Air', '--el-earth-mark', '--el-air-mark', 'mark'],
  ['Common vs Earth (cross)', '--r-common-fill', '--el-earth-fill', 'fill'],
  ['Epic vs Water (cross)', '--r-epic-fill', '--el-water-fill', 'fill'],
  ['Gold vs Starforged plate', '--plate-gold', '--plate-elo', 'plate'],
];
say('| Pair | Dark | Light | Before (dark) |');
say('| --- | --- | --- | --- |');
const OLD_TOK: Record<string, string> = { '--r-rare-fill': '--r-rare', '--el-water-fill': '--el-water', '--r-common-fill': '--r-common', '--el-air-fill': '--el-air', '--r-mythic-fill': '--r-mythic', '--el-fire-fill': '--el-fire', '--r-epic-fill': '--r-epic', '--tone-crimson-fill': '--c-crimson', '--el-earth-fill': '--el-earth', '--el-fire-mark': '--el-fire', '--el-earth-mark': '--el-earth', '--el-water-mark': '--el-water', '--el-air-mark': '--el-air', '--r-common-mark': '--r-common', '--plate-gold': '--plate-gold', '--plate-elo': '--plate-elo' };
const fmt = (xs: number[]) => xs.map((x) => (x < 0.05 ? `**${x.toFixed(3)}**` : x.toFixed(3))).join(' / ');
for (const [label, a, b, kind] of COMPARE) {
  const cells = (['dark', 'light'] as Theme[]).map((t) => fmt(dEs(colourOf(newCss, t, a), colourOf(newCss, t, b))));
  const oa = OLD_TOK[a];
  const ob = OLD_TOK[b];
  const old = kind === 'ink' || !oa || !ob ? '–' : fmt(dEs(colourOf(oldCss, 'dark', oa), colourOf(oldCss, 'dark', ob)));
  say(`| ${label} | ${cells.join(' | ')} | ${old} |`);
}

// 4e. the ramps, for the report
say('\n## Ramps');
say('| Ramp | ' + [50, 100, 200, 300, 375, 400, 425, 450, 500, 600, 700, 800, 900, 950].join(' | ') + ' |');
say('| --- |' + ' --- |'.repeat(14));
for (const r of RAMPS) {
  say(`| ${r.name} | ` + [50, 100, 200, 300, 375, 400, 425, 450, 500, 600, 700, 800, 900, 950].map((s) => {
    const n = `--c-${r.name}-${s}`;
    if (!PRIM[n]) return '';
    return GENERATED.has(n) ? PRIM[n] : `**${PRIM[n]}**`;
  }).join(' | ') + ' |');
}
say('\nBold: an existing colour kept exactly. Luminance of each step: ' + Object.entries(BANDS).map(([k, y]) => `${k} ${y}`).join(' · '));
say(`\nBright on Rare: ${ratio(parseHex(PRIM['--c-azure-500']), parseHex('#ffffe5')).toFixed(2)} · Bg on Mythic: ${ratio(parseHex(PRIM['--c-flame-400']), parseHex('#262721')).toFixed(2)} · Bg on Water: ${ratio(parseHex(PRIM['--c-tide-400']), parseHex('#262721')).toFixed(2)} · Bg on Air: ${ratio(parseHex(PRIM['--c-mist-200']), parseHex('#262721')).toFixed(2)}`);
say(`Rare nudge: #41668b → ${PRIM['--c-azure-500']} ΔE ${dE(parseHex('#41668b'), parseHex(PRIM['--c-azure-500'])).toFixed(3)} (Y ${luminance(parseHex(PRIM['--c-azure-500'])).toFixed(3)})`);

console.log(out.join('\n'));
