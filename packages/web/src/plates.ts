import { h } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * Name plates (migration level_plates; designed with the ui-designer): one object for the name
 * and the account level. An Art Deco frame round the name, the level in a medallion set into its
 * foot. Plates come with the level, nine of them (levels 5 to 100 for now, xp.ts PLATE_LEVELS),
 * all kept, any equipped; below level 5, or with none equipped, the medallion stands alone.
 *
 * One ladder, each plate its own Deco idea (TIERS, after the owner's references), drawn in thin
 * lines and growing richer up the ladder: one line on Riveted, two from Banded; every side shaped
 * (a tab, steps, a point, a half-round, a clipped end), never flat, except Jewelled's bevels. The
 * shape carries the tier; the colour marks its band (ink, steel, gilt, star, starfire:
 * plates.css), never the rank metals.
 *
 * The straight lines are CSS (plates.css `.plate-box`), so the frame stretches to any name; the
 * ends are SVGs stretched to the name's height, the ornaments small SVGs pinned to the corners,
 * the sides and the top, mirrored into place. The frame is decoration (worn, see-through); the
 * medallion is text (opaque, never worn).
 */

export type Band = 'ink' | 'steel' | 'gilt' | 'star' | 'starfire';

interface Tier {
  band: Band;
  /** 1 or 2 lines round the name */
  lines: 1 | 2;
  /** the corners: an open box (on a tab's shoulders), a bevel */
  corner: 'box' | 'bevel' | null;
  /** at the middle of each side: a stud, a pillar, a ringed gem, a half sun */
  side: 'stud' | 'pillar' | 'ring' | 'fan' | null;
  /** at the middle of the top line: a gem, a chevron, a chain of diamonds, a stepped wing */
  top: 'gem' | 'chevron' | 'chain' | 'wing' | null;
  /** shaped ends instead of flat sides (owner: the sides should stand out), stretched to the
   *  name's height: a point (cartouche), a tab, steps, a half-round, a clipped end */
  end: 'point' | 'tab' | 'steps' | 'arch' | 'chamfer' | null;
  /** two slim pillars inside the ends */
  pillars: boolean;
  /** what sits on each point: a diamond, a ringed gem with wings */
  tip: 'key' | 'wing' | null;
  /** a sun hanging behind the medallion: its rays */
  sun: 0 | 7 | 13;
  crown: boolean;
  /** rings round the medallion */
  rings: 1 | 2 | 3;
}

const BLANK: Tier = { band: 'ink', lines: 1, corner: null, side: null, top: null, end: null, pillars: false, tip: null, sun: 0, crown: false, rings: 1 };

/** The nine plates (the copy names them: copy.plates.names), each its own idea. */
const PLATES: Partial<Tier>[] = [
  // the four the owner chose from the first plates come back in their vocabulary: Riveted (was
  // Bronze), Banded (Silver), Fanlight (Gold) and Starforged
  { end: 'tab', corner: 'box', side: 'stud' }, //                             5   Riveted: a tab out of each side, open boxes on its shoulders
  { band: 'steel', lines: 2, end: 'steps', rings: 2 }, //                     10  Banded: the sides step out twice, a ziggurat
  { band: 'steel', lines: 2, end: 'point', tip: 'key', rings: 2 }, //          15  Cartouche: pointed ends, a diamond on each tip
  { band: 'gilt', lines: 2, end: 'arch', side: 'fan', top: 'gem', rings: 2 }, // 25 Fanlight: a half-round on each side, a half sun in it
  { band: 'gilt', lines: 2, end: 'chamfer', side: 'pillar', rings: 2 }, //    35  Colonnade: clipped ends, a pillar in each
  { band: 'gilt', lines: 2, end: 'point', tip: 'key', top: 'chevron', sun: 7, rings: 2 }, // 50 Sunburst: a sun under the medallion
  { band: 'star', lines: 2, corner: 'bevel', side: 'ring', top: 'chain', rings: 2 }, // 65 Jewelled: bevelled, a chain of diamonds, gems
  { band: 'star', lines: 2, end: 'point', tip: 'wing', top: 'wing', sun: 7, rings: 2 }, // 80 Winged: wings on the tips and on top
  { band: 'starfire', lines: 2, end: 'point', pillars: true, tip: 'wing', crown: true, sun: 13, rings: 3 }, // 100 Starforged
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

/**
 * A corner, drawn for the top left (the others are mirrors). (0, 0) is the corner: the outer line
 * runs 0.5 in, the inner 3.5. A bevel is cut out of the lines in plates.css (.corner-bevel);
 * this draws the cut's edge.
 */
const CORNERS = {
  box: '<path d="M0.5 6.5H6.5V0.5"/>',
  bevel: '<path d="M0.5 7L7 0.5M3.5 8L8 3.5"/><path d="M-1.5 -4.5L1.5 -1.5L-1.5 1.5L-4.5 -1.5Z" class="solid"/>',
};

/**
 * The middle of each side (the left; the right is its mirror): x 0 is the frame's outer edge,
 * y 0 half the name's height; a fixed size, so a wrapped name keeps them centred.
 */
const SIDES = {
  stud: '<rect x="-2" y="-2.5" width="5" height="5" class="solid"/>',
  pillar: '<rect x="8" y="-9" width="4.5" height="18" rx="2.25"/>',
  ring: '<path d="M2 -4.5L5 0L2 4.5L-1 0Z" class="solid"/><circle cx="2" r="6.5" class="ring"/>',
  // a half sun inside the half-round, its rays out toward it
  fan: '<path d="M15.5 -3A3 3 0 0 0 15.5 3"/>'
    + [135, 157.5, 180, 202.5, 225].map((d) => {
      const a = (d * Math.PI) / 180;
      const p = (r: number) => `${(15.5 + r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
      return `<path d="M${p(5)}L${p(d === 180 ? 8.5 : 7.5)}"/>`;
    }).join(''),
};

/**
 * The shaped ends, the left (the right is its mirror), stretched to the name's height: x in px
 * from the frame's outer edge, the straight lines joining at 26; y 0 to 100. The outer line, and
 * the inner one (drawn 3.5px inside it).
 */
const ENDS = {
  point: ['M26 0H12L0.5 50L12 100H26', 'M26 0H13.5L4 50L13.5 100H26'],
  tab: ['M26 0H8V30H0.5V70H8V100H26', 'M26 0H11.5V31.5H4V68.5H11.5V100H26'],
  steps: ['M26 0H16V20H8V36H0.5V64H8V80H16V100H26', 'M26 0H19.5V22H11.5V38H4V62H11.5V78H19.5V100H26'],
  arch: ['M26 0H12V20C4 24 0.5 36 0.5 50S4 76 12 80V100H26', 'M26 0H15.5V22.5C9 26.5 4 37 4 50S9 73.5 15.5 77.5V100H26'],
  chamfer: ['M26 0H12L0.5 24V76L12 100H26', 'M26 0H13.5L4 25.5V74.5L13.5 100H26'],
};

/** The middle of the top line: (0, 0) is where it meets the outer line. */
const TOPS = {
  gem: '<path d="M0 -3L3 0.5L0 4L-3 0.5Z" class="solid"/>',
  chevron: '<path d="M-7 3.5L0 7.5L7 3.5"/><path d="M0 -7.5L3 -4.5L0 -1.5L-3 -4.5Z" class="solid"/>',
  chain: '<path d="M0 -9L4 -4.5L0 0L-4 -4.5Z" class="solid"/><path d="M-9 -5.5L-6.5 -3L-9 -0.5L-11.5 -3ZM9 -5.5L11.5 -3L9 -0.5L6.5 -3Z" class="solid"/>'
    + '<circle cx="-15" cy="-1.5" r="1" class="solid"/><circle cx="15" cy="-1.5" r="1" class="solid"/>',
  wing: '<path d="M-17 0.5L-13 -3.5H-6L-3 -6.5M17 0.5L13 -3.5H6L3 -6.5"/><path d="M0 -10.5L3 -7L0 -3.5L-3 -7Z" class="solid"/>',
};

function frameHtml(t: Tier): string {
  const parts: string[] = [];
  if (t.corner) for (const k of ['tl', 'tr', 'bl', 'br']) parts.push(svg(`plate-corner c-${k}`, '-5 -5 21 21', [21, 21], CORNERS[t.corner]));
  if (t.side) for (const k of ['l', 'r']) parts.push(svg(`plate-side s-${k}`, '-10 -10 20 20', [20, 20], SIDES[t.side]));
  if (t.top) parts.push(svg('plate-top', '-22 -11 44 20', [44, 20], TOPS[t.top]));
  if (t.end) {
    // the outer and inner lines of each end, stretched to the name's height
    const end = (cls: string, d: string) => `<svg class="${cls}" viewBox="0 0 26 100" preserveAspectRatio="none" aria-hidden="true"><path ${line} d="${d}"/></svg>`;
    const [outer, inner] = ENDS[t.end];
    for (const k of ['e-l', 'e-r']) {
      parts.push(end(`plate-end ${k}`, outer));
      if (t.lines === 2) parts.push(end(`plate-inner ${k}`, inner + (t.pillars ? 'M19 22V78M21.5 30V70' : '')));
    }
  }
  if (t.tip) {
    const tip =
      t.tip === 'key' ? '<path d="M-4 0L0 -4.5L4 0L0 4.5Z" class="solid"/>'
        : '<path d="M0 -4.5L3 0L0 4.5L-3 0Z" class="solid"/><circle r="5.5" class="ring"/><path d="M-7 -4L-10 0L-7 4M-10 -3L-12.5 0L-10 3"/>';
    for (const c of ['l', 'r']) parts.push(svg(`plate-tip t-${c}`, '-14 -7 21 14', [21, 14], tip));
  }
  if (t.crown) {
    parts.push(svg('plate-crown', '-22 -21 44 22', [44, 22],
      `<path d="${rays(11, 8.5, 12, 15, false)}"/><path d="M-8.5 0.5A8.5 8.5 0 0 1 8.5 0.5"/><path d="M-5 0.5A5 5 0 0 1 5 0.5Z" class="solid"/>`
      + '<path d="M0 -21L2.5 -18L0 -15L-2.5 -18Z" class="solid"/><path d="M-21 0.5L-17 -3L-13 0.5M13 0.5L17 -3L21 0.5"/>'));
  }
  return parts.join('');
}

/** The level in its medallion (rings by tier, a hanging sun from Sunburst); literal for screen readers. */
export function plateMedal(level: number, plate = 0): HTMLElement {
  const t = TIERS[plate] ?? BLANK;
  const digits = String(level).length;
  return h(
    'span',
    { class: `plate-medal rings-${t.rings}`, attrs: { role: 'img', 'aria-label': copy.level.label(level), 'data-digits': String(Math.min(digits, 4)) } },
    t.sun ? h('span', { class: 'medal-sun', html: svg('', '-24 -24 48 48', [48, 48], `<path ${line} d="${rays(t.sun, 13, 18, 22, true, true)}"/>`), attrs: { 'aria-hidden': 'true' } }) : '',
    h('span', { class: 'medal-num', text: String(level), attrs: { 'aria-hidden': 'true' } }),
  );
}

/** The frame alone (plate 1 to 9), to lay over an element with the `name-plate` classes. */
export function plateFrame(plate: number): HTMLElement | null {
  const t = TIERS[plate];
  if (!plate || !t) return null;
  return h('span', { class: 'plate-frame', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'plate-box', html: frameHtml(t) }));
}

/** The band a plate is drawn in. */
export const plateBand = (plate: number): Band => (TIERS[plate] ?? BLANK).band;

/**
 * Puts `name` in `el` on plate `plate` (0: none) with the level in its medallion; without a
 * level (leaderboard rows: the level is never on the board) there's no medallion.
 */
export function paintPlate(el: HTMLElement, name: string, plate: number, level?: number | null): void {
  const t = TIERS[plate] ? plate : 0;
  el.classList.remove('name-plate', 'has-top', 'has-sun', 'has-end', ...Array.from(el.classList).filter((c) => /^(tier|band|corner|end)-/.test(c)));
  el.classList.toggle('has-medal', level != null);
  if (t || level != null) el.classList.add('name-plate', `tier-${t}`, `band-${plateBand(t)}`);
  const tier = TIERS[t];
  if (t && tier.end) el.classList.add('has-end', `end-${tier.end}`);
  if (t && tier.corner === 'bevel') el.classList.add('corner-bevel');
  if (t && (tier.top || tier.crown)) el.classList.add('has-top');
  if (level != null && tier.sun) el.classList.add('has-sun');
  el.replaceChildren(
    h('span', { class: 'plate-text', text: name }),
    plateFrame(t) ?? '',
    level != null ? plateMedal(level, t) : '',
  );
}
