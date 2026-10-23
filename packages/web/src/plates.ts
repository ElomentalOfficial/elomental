import { h } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * Name plates (migration level_plates; designed with the ui-designer): one object for the name
 * and the account level. An Art Deco rule under the name (owner: only the part under the name,
 * as the first rules were), the level in a medallion at its centre. Plates come with the level,
 * nine of them (levels 5 to 100 for now, xp.ts PLATE_LEVELS), all kept, any equipped; below
 * level 5, or with none equipped, the level sits on one plain line.
 *
 * Each rule is its own Deco divider (owner: variety, after the references), richer up the
 * ladder: its lines (one to three, staggered), its ends and what flanks the medallion; the
 * medallion's rings: one to Cartouche, two from Fanlight, three on Winged and Starforged. The shape
 * carries the tier; the colour marks its band (ink, steel, gilt, star, epic, mythic: plates.css),
 * never the rank metals.
 *
 * The lines are CSS (plates.css `.rule-line`), so the rule stretches to any name: each runs from
 * `a` px in from the rule's end to `b` px short of the medallion (negative: under it). The ends
 * and the flanks are small SVGs, drawn for the left and mirrored: an end's x 0 is the rule's
 * outer edge, a flank's x 0 the medallion's edge (it runs to minus x); y 0 is the rule's middle.
 * The rule is decoration (worn, see-through); the medallion is text (opaque, never worn).
 */

export type Band = 'ink' | 'steel' | 'gilt' | 'star' | 'epic' | 'mythic';

interface Line {
  /** px from the rule's middle (minus: above) */
  y: number;
  /** where it starts, px in from the end; where it stops, px short of the medallion */
  a: number;
  b: number;
}

interface Tier {
  band: Band;
  lines: Line[];
  /** the end (left; the right is its mirror): its width and drawing */
  end: [number, string] | null;
  /** beside the medallion (left; mirrored): its width and drawing */
  flank: [number, string] | null;
  /** what hangs under the medallion: a sun (its rays), or an arc of gems */
  sun: 0 | 7 | 13 | 'gems';
  /** rings round the medallion */
  rings: 1 | 2 | 3;
}

/** Blank (no plate, or below level 5): one plain line under the name, the level on it. */
const BLANK: Tier = { band: 'ink', lines: [{ y: 0, a: 0, b: 2 }], end: null, flank: null, sun: 0, rings: 1 };

const solid = (d: string) => `<path d="${d}" class="solid"/>`;
const stroke = (d: string) => `<path d="${d}"/>`;
/** A diamond centred on (x, y), `r` from the centre to each point. */
const gem = (x: number, y: number, r: number) => `M${x - r} ${y}L${x} ${y - r}L${x + r} ${y}L${x} ${y + r}Z`;
/** Rays round (cx, 0) at `deg` degrees (180 points left), from r1 to r2. */
const fanRays = (cx: number, degs: number[], r1: number, r2: (d: number) => number) =>
  degs.map((d) => {
    const a = (d * Math.PI) / 180;
    const p = (r: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    return `M${p(r1)}L${p(r2(d))}`;
  }).join('');

/** The nine plates (the copy names them: copy.plates.names), each its own divider. */
const PLATES: Partial<Tier>[] = [
  // 5 Riveted: one line between open squares
  { lines: [{ y: 0, a: 6.75, b: 2 }],
    end: [8, stroke('M0.75 -3H6.75V3H0.75Z')] },
  // 10 Banded: two lines, stepped ends, double bars by the medallion
  { band: 'steel', lines: [{ y: -2, a: 9, b: 9 }, { y: 2, a: 9, b: 9 }],
    end: [10, stroke('M9 -5H5.5V-2.5H1V2.5H5.5V5H9')],
    flank: [8, stroke('M-3 -5V5M-6 -3.5V3.5')] },
  // 15 Cartouche: three staggered lines, a diamond on the end, a small one by the medallion
  { band: 'steel', lines: [{ y: 0, a: 8.5, b: 11 }, { y: -3.5, a: 16, b: 0 }, { y: 3.5, a: 16, b: 0 }],
    end: [17, solid(gem(4.25, 0, 3.75)) + stroke('M16 -6V-1.5M16 1.5V6')],
    flank: [10, solid(gem(-6, 0, 2.5))] },
  // 25 Fanlight: two lines out of a half sun at each end
  { band: 'gilt', rings: 2, lines: [{ y: -2, a: 12, b: 0 }, { y: 2, a: 12, b: 0 }],
    end: [13, stroke('M12 -6.5A6.5 6.5 0 0 0 12 6.5') + solid('M12 -3A3 3 0 0 0 12 3Z')
      + stroke(fanRays(12, [140, 160, 180, 200, 220], 8, (d) => (d === 180 ? 11.5 : 10.5)))] },
  // 35 Colonnade: three pillars at each end, the lines doubled into a band by the medallion
  { band: 'gilt', rings: 2, lines: [{ y: -2, a: 13, b: 0 }, { y: 2, a: 13, b: 0 }],
    end: [12, stroke('M2 -3.5V3.5M5.75 -6V6M9.5 -3.5V3.5')],
    flank: [18, stroke('M-18 -5.5H-3M-18 5.5H-3M-18 -5.5V-2M-18 5.5V2')] },
  // 50 Sunburst: a dot and a dash into one line, rays off the medallion, a sun beneath
  { band: 'gilt', rings: 2, sun: 7, lines: [{ y: 0, a: 11, b: 12 }],
    end: [11, solid('M0.5 0A1.75 1.75 0 1 0 4 0A1.75 1.75 0 1 0 0.5 0Z') + stroke('M6 0H9')],
    flank: [12, stroke('M-1.5 -5.5L-8.5 -8.5M-2 0H-11M-1.5 5.5L-8.5 8.5')] },
  // 65 Jewelled: two lines from a double diamond, a chain of gems by the medallion, gems hung beneath
  { band: 'star', rings: 2, sun: 'gems', lines: [{ y: -2, a: 17, b: 0 }, { y: 2, a: 17, b: 0 }],
    end: [18, solid(gem(3.5, 0, 3)) + stroke(gem(12, 0, 4.5))],
    flank: [16, solid(gem(-6, 0, 1.8) + gem(-12, 0, 1.8))] },
  // 80 Winged: three lines from double chevrons, wings swept off the medallion, a sun beneath
  { band: 'epic', rings: 3, sun: 7, lines: [{ y: 0, a: 12, b: 0 }, { y: -3.5, a: 20, b: 14 }, { y: 3.5, a: 20, b: 14 }],
    end: [13, stroke('M6 -4.5L1.5 0L6 4.5M11 -4.5L6.5 0L11 4.5')],
    flank: [24, stroke('M-2 -4C-8 -10 -16 -9 -24 -6.5M-2 4C-8 10 -16 9 -24 6.5')] },
  // 100 Starforged: three lines from ringed gems, stepped shoulders by the medallion, the full sun
  { band: 'mythic', rings: 3, sun: 13, lines: [{ y: 0, a: 17, b: 0 }, { y: -3.5, a: 23, b: 14 }, { y: 3.5, a: 23, b: 14 }],
    end: [18, solid(gem(11.5, 0, 3.5)) + '<circle cx="11.5" r="5.5" class="ring"/>' + stroke('M4 -4L0.5 0L4 4')],
    flank: [14, stroke('M-2 -7H-6V-5.25H-10V-3.5H-14M-2 7H-6V5.25H-10V3.5H-14')] },
];

/** Plate n (1 to 9); 0 is the bare medallion. */
export const TIERS: Tier[] = [BLANK, ...PLATES.map((p) => ({ ...BLANK, ...p }))];

const svg = (cls: string, box: string, size: [number, number], body: string) =>
  `<svg class="${cls}" viewBox="${box}" width="${size[0]}" height="${size[1]}" aria-hidden="true">${body}</svg>`;
const line = 'vector-effect="non-scaling-stroke"';

/**
 * Rays of a sun round (0, 0), downward (down) or upward, `n` of them, long on every other: from
 * the centre ray out (centreLong), or from the ends.
 */
function rays(n: number, r1: number, short: number, long: number, down: boolean, centreLong = false): string {
  const spread = n > 7 ? 80 : 60;
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => {
    const d = -spread + (2 * spread * i) / (n - 1);
    const a = ((down ? 90 : -90) + d) * (Math.PI / 180);
    const p = (r: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    const odd = (centreLong ? Math.abs(i - mid) : i) % 2;
    return `M${p(r1)}L${p(odd ? short : long)}`;
  }).join('');
}

/** The rule: its lines on each side, its ends and its flanks. */
function ruleHtml(t: Tier): string {
  const parts: string[] = [];
  const half = 'calc(50% + var(--medal-d) / 2';
  for (const l of t.lines) {
    const y = `top: calc(50% + ${l.y - 0.75}px)`;
    parts.push(`<span class="rule-line" style="${y}; left: ${l.a}px; right: ${half} + ${l.b}px)"></span>`);
    parts.push(`<span class="rule-line" style="${y}; right: ${l.a}px; left: ${half} + ${l.b}px)"></span>`);
  }
  // (the size inline too: other rules stretch icons to their box)
  const piece = (cls: string, box: string, w: number, body: string) =>
    svg(cls, box, [w, 18], body).replace('<svg ', `<svg style="width: ${w}px; height: 18px" `);
  if (t.end) {
    const [w, body] = t.end;
    for (const k of ['l', 'r']) parts.push(piece(`rule-end e-${k}`, `0 -9 ${w} 18`, w, body));
  }
  if (t.flank) {
    const [w, body] = t.flank;
    for (const k of ['l', 'r']) parts.push(piece(`rule-flank f-${k}`, `${-w} -9 ${w} 18`, w, body));
  }
  return parts.join('');
}

/**
 * Gems hung under the medallion, where a sun has its rays (Jewelled): three diamonds, the middle
 * one largest (owner: minimal). In the sun's box: the disc's radius is 12.
 */
const gemArc = (): string =>
  [-32, 0, 32].map((d, i) => {
    const a = ((90 + d) * Math.PI) / 180;
    return solid(gem(16.5 * Math.cos(a), 16.5 * Math.sin(a), i === 1 ? 3 : 2));
  }).join('');

/** The level in its medallion (rings by tier, a hanging sun or gems); literal for screen readers. */
function plateMedal(level: number, plate = 0): HTMLElement {
  const t = TIERS[plate] ?? BLANK;
  const digits = String(level).length;
  return h(
    'span',
    { class: `plate-medal rings-${t.rings}`, attrs: { role: 'img', 'aria-label': copy.level.label(level), 'data-digits': String(Math.min(digits, 4)) } },
    t.sun ? h('span', { class: 'medal-sun', html: svg('', '-24 -24 48 48', [48, 48], t.sun === 'gems' ? gemArc() : `<path ${line} d="${rays(t.sun, 13, 18, 22, true, true)}"/>`), attrs: { 'aria-hidden': 'true' } }) : '',
    h('span', { class: 'medal-num', text: String(level), attrs: { 'aria-hidden': 'true' } }),
  );
}

/** The rule alone (plate 0 to 9), to lay over an element with the `name-plate` classes. */
function plateFrame(plate: number): HTMLElement | null {
  const t = TIERS[plate];
  if (!t) return null;
  return h('span', { class: 'plate-frame', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'plate-box', html: ruleHtml(t) }));
}

/** The band a plate is drawn in. */
export const plateBand = (plate: number): Band => (TIERS[plate] ?? BLANK).band;

/**
 * Puts `name` in `el` on plate `plate` (0: none) with the level in its medallion; without a
 * level (leaderboard rows: the level is never on the board) there's no medallion.
 */
export function paintPlate(el: HTMLElement, name: string, plate: number, level?: number | null): void {
  const t = TIERS[plate] ? plate : 0;
  el.classList.remove('name-plate', 'has-sun', ...Array.from(el.classList).filter((c) => /^(tier|band)-/.test(c)));
  el.classList.toggle('has-medal', level != null);
  if (t || level != null) el.classList.add('name-plate', `tier-${t}`, `band-${plateBand(t)}`);
  if (level != null && TIERS[t].sun) el.classList.add('has-sun');
  el.replaceChildren(
    h('span', { class: 'plate-text', text: name }),
    // (Blank's plain line only with its level: a row without a plate shows none)
    (t || level != null ? plateFrame(t) : null) ?? '',
    level != null ? plateMedal(level, t) : '',
  );
}
