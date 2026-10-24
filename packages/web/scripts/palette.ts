/**
 * The palette, generated: one ramp per hue, and the roles each element, rarity and Home tone
 * takes in every theme. Writes src/styles/palette.css; never edit that file by hand.
 *
 *   npm run palette -w @elomental/web
 *
 * Steps are set by luminance, not by look, so step N of any hue has the same contrast against
 * every surface as step N of any other: one mapping rule (roleStep) covers every hue.
 *   200 ink on dark, High contrast · 300 ink on dark · 400 line on dark, or a light fill
 *   450 line on light · 500 fill under Bright text · 550 ink on light
 *   600 line on light, High contrast · 700 ink on light, High contrast
 *   800, 900 the dark surfaces and their tints
 * Existing colours are anchors, kept to the hex; every other step is generated in OKLCH at the
 * ramp's own hue and chroma. Designed with the ui-designer and an illustrator review
 * (docs/review/palette-2026-10-21-ui.md and -art.md).
 *
 * A new element, rarity or accent: one RAMPS entry (a hue clear of its family, chroma 0.05–0.14
 * so it stays earthy, the fill at 500 for Bright text or 400/200 for dark text), one SWATCHES
 * entry, run this, and `npm test` checks every role of it on every surface (contrast.ts).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { oklch, parseHex, solveY, toHex } from './colour.ts';

/** WCAG relative luminance of each step. */
const BANDS: Record<number, number> = { 50: 0.95, 100: 0.78, 200: 0.64, 300: 0.44, 400: 0.3, 500: 0.14, 600: 0.082, 700: 0.052, 800: 0.035, 900: 0.02, 950: 0.0075 };
const STEPS = [100, 200, 300, 400, 450, 500, 550, 600, 700, 800, 900];
const METAL = [100, 200, 300, 400, 450, 500, 550, 600, 700];
/**
 * How much of a hue's chroma each step carries: tints and shades are quieter, as in the Figma set.
 * 450 and 550 are the light theme's line and ink: they carry more than the spine (15% and 25%), so a
 * hue stays itself as small text on a pale page, never past CHROMA_CEILING, the palette's earthy
 * limit. 150 is the light board's row and column.
 */
const PROFILE: Record<number, number> = { 50: 0.2, 100: 0.35, 150: 0.47, 200: 0.6, 300: 0.9, 375: 1, 400: 1, 425: 1, 450: 1.15, 500: 1, 550: 1.25, 600: 0.95, 700: 0.85, 800: 0.45, 900: 0.3, 950: 0.2 };
const CHROMA_CEILING = 0.15;
const FLAT: Record<number, number> = Object.fromEntries(Object.keys(PROFILE).map((k) => [k, 1]));

/** An existing colour kept exactly (hex), or a generated one: hue, chroma and optionally its own luminance. */
type Anchor = string | { C: number; H: number; Y?: number };
interface Ramp {
  name: string;
  what: string;
  steps: number[];
  anchors: Record<number, Anchor>;
  profile?: Record<number, number>;
}

export const RAMPS: Ramp[] = [
  // the neutrals keep half steps (375, 425, 450) where the tuned borders sit
  { name: 'stone', what: 'dark-theme neutrals', steps: [100, 200, 300, 375, 425, 450, 500, 600, 700, 800, 900, 950], profile: FLAT,
    anchors: { 950: '#141511', 900: '#262721', 800: '#343530', 700: '#40413c', 500: '#6d6d5f', 450: '#77786e', 425: '#85867c', 375: '#9a9b8f' } },
  { name: 'iron', what: 'Common: a warm iron grey, off the Forest hue', steps: STEPS, profile: FLAT, anchors: { 500: { C: 0.012, H: 70 } } },
  { name: 'sand', what: 'the bright neutrals: keys and text on dark', steps: [50, 100, 200, 300, 400, 450, 500, 600, 700, 800, 900], profile: FLAT,
    anchors: { 50: '#ffffe5', 100: '#e8e8ce', 200: '#dadbb9', 300: '#b3b5a0', 400: '#8c8d76', 450: '#7a7b64', 500: '#6b6c58' } },
  // a third of sand's chroma at the neutrals' hue, so the light page reads as paper, not yellow
  { name: 'paper', what: 'light-theme ground: a warm off-white', steps: [50, 100, 200, 300, 400, 600], profile: FLAT,
    anchors: {
      50: { C: 0.011, H: 98, Y: 0.93 }, // the page and pop-ups
      100: { C: 0.013, H: 98, Y: 0.82 }, // cards
      200: { C: 0.016, H: 98, Y: 0.735 }, // fields, segments, cells, tiles
      300: { C: 0.018, H: 100, Y: 0.62 }, // hairlines (1.2:1 on a card, as dark)
      400: { C: 0.018, H: 100, Y: 0.205 }, // field edges and the 3x3 outline (3:1 on every light surface)
      600: { C: 0.016, H: 105, Y: 0.1 }, // secondary text (4.5:1 on every light surface)
    } },
  { name: 'lava', what: 'Fire, Ranked, the accent', steps: [100, 150, ...STEPS.slice(1)], anchors: { 300: '#e69c74', 500: '#a85b37', 800: '#413226' } },
  { name: 'forest', what: 'Earth, Casual, what is on', steps: STEPS, anchors: { 200: '#c9d09d', 500: '#636945' } },
  { name: 'crimson', what: 'Daily, a wrong number, errors', steps: STEPS, anchors: { 600: '#794341' } },
  { name: 'tide', what: 'Water: a dusty sea blue, a light fill', steps: STEPS, anchors: { 400: { C: 0.08, H: 230 } } },
  { name: 'mist', what: 'Air: a cool grey-white, cloud rather than paper', steps: STEPS, profile: FLAT, anchors: { 200: { C: 0.02, H: 220 }, 500: { C: 0.035, H: 225 } } },
  { name: 'azure', what: 'Rare: a deep slate blue', steps: STEPS, anchors: { 500: { C: 0.0731, H: 249.5, Y: 0.15 } } },
  { name: 'amethyst', what: 'Epic: heather', steps: STEPS, anchors: { 500: '#6f4b81' } },
  { name: 'flame', what: 'Mythic: the forge-heart flame, a light fill', steps: STEPS, anchors: { 400: { C: 0.14, H: 36 } } },
  // the metals
  { name: 'bronze', what: 'Bronze plate', steps: METAL, anchors: { 400: '#c4875a', 500: '#9a5b2c' } },
  { name: 'silver', what: 'Silver plate', steps: METAL, anchors: { 300: '#b3bac1', 500: '#66707c' } },
  { name: 'gold', what: 'Gold plate, medals', steps: METAL, anchors: { 200: '#f0cd78', 300: { C: 0.115, H: 86 }, 500: '#8f6a12' } },
  { name: 'teal', what: 'Archmage rank: jade, clear of Diamond ice and Water', steps: METAL, anchors: { 500: { C: 0.085, H: 165 } } },
  { name: 'violet', what: 'Elomental rank: a deep violet, bluer than Epic heather', steps: METAL, anchors: { 500: { C: 0.13, H: 295 } } },
  { name: 'star', what: 'the gilt and star plate bands, and their glow', steps: METAL, anchors: { 200: '#ecd38c', 500: '#946410' } },
  { name: 'steel', what: 'the steel plate band: gunmetal, greyer than Air and Rare', steps: METAL, profile: FLAT, anchors: { 500: { C: 0.02, H: 250 } } },
];

function bandY(step: number): number {
  if (BANDS[step] !== undefined) return BANDS[step];
  // half steps sit between their neighbours on a log scale
  const ks = Object.keys(BANDS).map(Number).sort((a, b) => a - b);
  const lo = Math.max(...ks.filter((k) => k < step));
  const hi = Math.min(...ks.filter((k) => k > step));
  const t = (step - lo) / (hi - lo);
  return Math.exp(Math.log(BANDS[lo]) * (1 - t) + Math.log(BANDS[hi]) * t);
}

/** '--c-lava-500' → '#a85b37', and which steps are generated (the rest are existing colours). */
export const PRIM: Record<string, string> = {};
const GENERATED = new Set<string>();
for (const r of RAMPS) {
  const p = r.profile ?? PROFILE;
  const spine = Object.entries(r.anchors)
    .map(([s, a]) => {
      const step = Number(s);
      const [, C, H] = typeof a === 'string' ? oklch(parseHex(a)) : [0, a.C, a.H];
      return { step, H, Cp: C / p[step] };
    })
    .sort((a, b) => a.step - b.step);
  for (const step of r.steps) {
    const name = `--c-${r.name}-${step}`;
    const a = r.anchors[step];
    if (typeof a === 'string') {
      PRIM[name] = a;
      continue;
    }
    GENERATED.add(name);
    if (a) {
      PRIM[name] = toHex(solveY(a.Y ?? bandY(step), a.C, a.H));
      continue;
    }
    const below = spine.filter((s) => s.step < step).at(-1);
    const above = spine.find((s) => s.step > step);
    const [x, y] = [below ?? above!, above ?? below!];
    const t = x.step === y.step ? 0 : (step - x.step) / (y.step - x.step);
    const spineC = x.Cp + (y.Cp - x.Cp) * t;
    // a step above 1 in the profile lifts chroma only up to the ceiling (or the spine, if higher)
    const C = r.profile ? spineC : Math.min(spineC * p[step], Math.max(CHROMA_CEILING, spineC));
    PRIM[name] = toHex(solveY(bandY(step), C, x.H + (y.H - x.H) * t));
  }
}

interface Swatch {
  /** token prefix: --<id>-fill, --<id>-ink … */
  id: string;
  ramp: string;
  fill: number;
  /** per-role step overrides where a ramp lacks the standard step: `${role}-${theme}` */
  steps?: Partial<Record<string, number>>;
  /** the deep role from another ramp (themeRoles): `dark` a `ramp-step`, `tint` the ramp light's is tinted with */
  deep?: { dark: string; tint: string };
}
export const SWATCHES: Swatch[] = [
  { id: 'el-fire', ramp: 'lava', fill: 500 },
  { id: 'el-water', ramp: 'tide', fill: 400 },
  { id: 'el-earth', ramp: 'forest', fill: 500 },
  // Air's deep is the plain grey neutral at its siblings' steps: mist's own shades read as Water's
  // blue (owner)
  { id: 'el-air', ramp: 'mist', fill: 200, steps: { 'line-light': 550, 'line-hc-light': 700 }, deep: { dark: 'stone-700', tint: 'stone' } },
  { id: 'r-common', ramp: 'iron', fill: 500 },
  { id: 'r-rare', ramp: 'azure', fill: 500 },
  { id: 'r-epic', ramp: 'amethyst', fill: 500 },
  { id: 'r-mythic', ramp: 'flame', fill: 400 },
  { id: 'tone-lava', ramp: 'lava', fill: 500 },
  { id: 'tone-forest', ramp: 'forest', fill: 500 },
  { id: 'tone-crimson', ramp: 'crimson', fill: 600 },
];
/** A light fill (400 or lighter) takes dark text; a deep one Bright. */
export const lightFill = (s: Swatch) => s.fill <= 400;
/** On the off-white paper a 10% wash reads as dark's 18%, and lines keep 3:1 on it. */
const WASH_ALPHA = { dark: 0.18, light: 0.1 };

function roleStep(s: Swatch, role: 'ink' | 'line' | 'ink-hc' | 'line-hc', theme: 'dark' | 'light'): number {
  return (
    s.steps?.[`${role}-${theme}`] ??
    { ink: { dark: 300, light: 550 }, line: { dark: 400, light: 450 }, 'ink-hc': { dark: 200, light: 700 }, 'line-hc': { dark: 300, light: 600 } }[role][theme]
  );
}
const v = (ramp: string, step: number) => `var(--c-${ramp}-${step})`;
const rgba = (hex: string, a: number) => `rgba(${parseHex(hex).join(', ')}, ${a})`;

/** The hue at its darkest, on the dark theme: its 900, or another ramp's step (Air). */
const deepDark = (s: Swatch) => (s.deep ? `var(--c-${s.deep.dark})` : v(s.ramp, 900));

function themeRoles(s: Swatch, t: 'dark' | 'light'): Record<string, string> {
  return {
    ink: v(s.ramp, roleStep(s, 'ink', t)),
    line: v(s.ramp, roleStep(s, 'line', t)),
    wash: rgba(PRIM[`--c-${s.ramp}-500`], WASH_ALPHA[t]),
    // a light fill can't stand on the light theme's pale surfaces: as a shape it takes its line
    mark: t === 'light' && lightFill(s) ? v(s.ramp, roleStep(s, 'line', t)) : `var(--${s.id}-fill)`,
    edge: edge(s, t),
    // a ground for art drawn on it (a crest disc): the hue at its darkest on dark; on light, dark
    // enough for its emblem to stand out (owner) but barely coloured: a dark grey with a hint of
    // the hue (its 700 at 30% in stone 700)
    deep: t === 'dark'
      ? deepDark(s)
      : `color-mix(in oklab, ${v(s.deep?.tint ?? s.ramp, 700)} 30%, var(--c-stone-700))`,
  };
}
/**
 * The rim of a filled tag, chip, segment or disc, and the same rule for every swatch, so a row of
 * them never mixes rimmed and bare ones: none on the dark theme (the fill itself), and on the
 * light theme a deeper shade of the fill's own hue (600, or one step past a fill that deep).
 */
const edge = (s: Swatch, t: 'dark' | 'light') => (t === 'dark' ? `var(--${s.id}-fill)` : v(s.ramp, Math.max(600, s.fill + 100)));
function hcRoles(s: Swatch, t: 'dark' | 'light'): Record<string, string> {
  return {
    ink: v(s.ramp, roleStep(s, 'ink-hc', t)),
    line: v(s.ramp, roleStep(s, 'line-hc', t)),
    ...(t === 'light' && lightFill(s) ? { mark: v(s.ramp, roleStep(s, 'line-hc', t)) } : {}),
  };
}

type PlateTheme = 'dark' | 'light' | 'dark-hc' | 'light-hc';

/**
 * The leaderboard's medals (1st, 2nd, 3rd) in their metals, one step for all three per theme;
 * `chosen` on your own row, a step deeper on the light theme where that fill is a mid green.
 */
const MEDALS = ['bronze', 'silver', 'gold'];
const MEDAL_STEP: Record<PlateTheme, [number, number]> = { dark: [300, 300], light: [500, 550], 'dark-hc': [200, 200], 'light-hc': [600, 700] };
const medalRoles = (t: PlateTheme): string[] =>
  MEDALS.flatMap((m) => [`  --medal-${m}: ${v(m, MEDAL_STEP[t][0])};`, `  --medal-${m}-chosen: ${v(m, MEDAL_STEP[t][1])};`]);

/**
 * The name plates' bands (plates.ts TIERS; ui-designer): the shape carries the tier, the colour
 * only its band, cold to lit, never the rank metals: ink (the level's own ink, tokens.css), steel,
 * gilt, star, then the top two in the rarities' own hues (owner): epic (Winged, heather) and mythic
 * (Starforged, flame), at the star's steps. Each band a step per theme, [line, on a chosen card].
 */
const PLATE_BANDS: Record<string, Record<PlateTheme, [string, number, number]>> = {
  steel: { dark: ['steel', 300, 300], light: ['steel', 450, 550], 'dark-hc': ['steel', 200, 200], 'light-hc': ['steel', 600, 700] },
  gilt: { dark: ['star', 300, 300], light: ['star', 550, 600], 'dark-hc': ['star', 200, 200], 'light-hc': ['star', 700, 700] },
  star: { dark: ['star', 200, 200], light: ['star', 600, 600], 'dark-hc': ['star', 100, 100], 'light-hc': ['star', 700, 700] },
  epic: { dark: ['amethyst', 200, 200], light: ['amethyst', 600, 600], 'dark-hc': ['amethyst', 200, 200], 'light-hc': ['amethyst', 700, 800] },
  mythic: { dark: ['flame', 200, 200], light: ['flame', 600, 600], 'dark-hc': ['flame', 200, 200], 'light-hc': ['flame', 700, 800] },
};
/** How see-through a plate's frame is on the dark and light themes (contrast.ts measures it so):
 *  traces of metal behind the name (owner, 2026-10-21). */
export const PLATE_OPACITY = 0.5;
function plateRoles(t: PlateTheme): string[] {
  return [
    ...medalRoles(t),
    ...Object.entries(PLATE_BANDS).flatMap(([b, s]) => [`  --plate-${b}: ${v(s[t][0], s[t][1])};`, `  --plate-${b}-chosen: ${v(s[t][0], s[t][2])};`]),
    // the top bands' glow, each in its own hue, on dark; on the pale light surfaces a glow only
    // smudges, so the ornament carries the tier there
    ...(['star', 'amethyst', 'flame'] as const).map((r, i) =>
      `  --plate-glow-${['star', 'epic', 'mythic'][i]}: ${t.startsWith('dark') ? rgba(PRIM[`--c-${r}-200`], 0.3) : 'transparent'};`),
    // the frame sits back behind the name, see-through; High contrast draws it solid
    `  --plate-opacity: ${t.endsWith('hc') ? 1 : PLATE_OPACITY};`,
  ];
}

/**
 * The Ranked ranks' names (home.css `.rank-name`): each rank's name in its own metal: Novice
 * bronze, Apprentice silver, Adept gold, Archmage jade, Elomental violet. On dark a gradient
 * between two steps that are both ink (4.5:1 on every surface), light above and deep below, in both
 * themes: on light the two deepest steps (lighter ones fail on the light surfaces), so its turn is
 * narrower; solid in High contrast. The name is always written, so the colour only adds to it.
 */
const RANKS = ['bronze', 'silver', 'gold', 'teal', 'violet'];
const RANK_STEP: Record<PlateTheme, [number, number]> = { dark: [100, 300], light: [600, 700], 'dark-hc': [100, 200], 'light-hc': [700, 700] };
/**
 * Where a rank's name is large text (the Ranks sheet, the Profile: 3:1 is enough), its top is lit a
 * step brighter: on light the gradient then turns from a bright metal to a deep one, as on dark.
 */
const RANK_LIT: Record<PlateTheme, number> = { dark: 100, light: 500, 'dark-hc': 100, 'light-hc': 700 };
const rankRoles = (t: PlateTheme): string[] =>
  RANKS.flatMap((ramp, i) => [`  --rank-${i}-hi: ${v(ramp, RANK_STEP[t][0])};`, `  --rank-${i}-lo: ${v(ramp, RANK_STEP[t][1])};`, `  --rank-${i}-lit: ${v(ramp, RANK_LIT[t])};`]);

/** The old palette names, so every existing rule keeps working. */
const ALIASES: [string, string][] = [
  ['--c-bg', '--c-stone-900'],
  ['--c-highlight', '--c-stone-800'],
  ['--c-highlight-2', '--c-stone-700'],
  ['--c-bright', '--c-sand-50'],
  ['--c-second-bright', '--c-sand-100'],
  ['--c-mud', '--c-sand-200'],
  ['--c-rock', '--c-sand-300'],
  ['--c-lava', '--c-lava-500'],
  ['--c-lava-highlight', '--c-lava-800'],
  ['--c-ember', '--c-lava-300'],
  ['--c-forest', '--c-forest-500'],
  ['--c-forest-highlight', '--c-forest-200'],
  ['--c-crimson', '--c-crimson-600'],
];

export function paletteCss(): string {
  const ramps = RAMPS.map((r) => {
    const lines = r.steps.map((s) => {
      const n = `--c-${r.name}-${s}`;
      const [L, C, H] = oklch(parseHex(PRIM[n]));
      return `  ${n}: ${PRIM[n]}; /* L ${L.toFixed(3)} C ${C.toFixed(3)} H ${H.toFixed(0)}${GENERATED.has(n) ? '' : ' · existing'} */`;
    });
    return `  /* ${r.name}: ${r.what} */\n${lines.join('\n')}`;
  }).join('\n');
  const block = (selector: string, lines: string[]) => `${selector} {\n${lines.join('\n')}\n}\n`;
  const perSwatch = (f: (s: Swatch) => Record<string, string>) =>
    SWATCHES.flatMap((s) => Object.entries(f(s)).map(([role, value]) => `  --${s.id}-${role}: ${value};`));
  return [
    '/* Generated by scripts/palette.ts (npm run palette -w @elomental/web): edit the script, not this file. */\n',
    block('/* Palette ramps */\n:root', [
      ramps,
      '',
      '  /* Old palette names, kept as aliases */',
      ...ALIASES.map(([a, b]) => `  ${a}: var(${b});`),
      '  --c-white: #ffffff; /* sheen highlights on glass only */',
      '  --c-black: #000000; /* shadows only */',
      '',
      '  /*',
      '   * Swatches: each element, rarity and Home tone is one ramp plus one mapping.',
      '   *   fill  a solid tag, tile, chip or crest disc (the same in both themes)',
      '   *   on    text or icon on the fill (4.5:1)',
      "   *   ink   the hue as text or icon on the page and its surfaces (4.5:1 on each)",
      '   *   line  a border or ring that must be seen (3:1 on each surface)',
      '   *   wash  a faint tint behind something chosen (text and ink stay 4.5:1 on it)',
      '   *   mark  the hue as a shape without text (a frame ring, a stud): the fill, or its line where',
      '   *         a light fill would vanish (light theme)',
      '   *   edge  the 1px rim of every filled tag, chip, segment and disc: the same rule for all of',
      '   *         them (none on dark, a deeper shade of the hue on light), so a set never mixes rims',
      '   *   deep  a ground for art drawn on it (a crest disc): the hue at its darkest (900) on dark,',
      '   *         its 700 at 30% in stone 700 on light',
      '   * Always shown with the name or the crest, never colour alone.',
      '   */',
      ...SWATCHES.flatMap((s) => [`  --${s.id}-fill: ${v(s.ramp, s.fill)};`, `  --${s.id}-on: var(${lightFill(s) ? '--c-stone-900' : '--c-sand-50'});`]),
      '  /* the fill under its short name */',
      ...SWATCHES.filter((s) => !s.id.startsWith('tone-')).map((s) => `  --${s.id}: var(--${s.id}-fill);`),
    ]),
    block(":root,\n:root[data-theme='dark']", [...perSwatch((s) => themeRoles(s, 'dark')), '  /* name plates */', ...plateRoles('dark'), '  /* Ranked rank names */', ...rankRoles('dark')]),
    block(":root[data-theme='light']", [...perSwatch((s) => themeRoles(s, 'light')), '  /* name plates */', ...plateRoles('light'), '  /* Ranked rank names */', ...rankRoles('light')]),
    '/* High contrast: one step stronger (ink 7:1 or near it, lines 4.5:1) */\n',
    block(":root[data-contrast='high'][data-theme='dark']", [...perSwatch((s) => hcRoles(s, 'dark')), '  /* name plates */', ...plateRoles('dark-hc'), '  /* Ranked rank names */', ...rankRoles('dark-hc')]),
    block(":root[data-contrast='high'][data-theme='light']", [...perSwatch((s) => hcRoles(s, 'light')), '  /* name plates */', ...plateRoles('light-hc'), '  /* Ranked rank names */', ...rankRoles('light-hc')]),
  ].join('\n');
}

export const PALETTE_FILE = new URL('../src/styles/palette.css', import.meta.url);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(PALETTE_FILE, paletteCss());
  console.log(`wrote ${fileURLToPath(PALETTE_FILE)}`);
}
