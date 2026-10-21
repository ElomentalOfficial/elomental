import { h } from './ui.ts';

/**
 * Name plates (bought with Stardust, forge.ts): an Art Deco rule drawn under the name, from
 * Bronze's single line to Starforged's three lines and hanging sun. One vocabulary for the set
 * (parallel lines, a dip at the centre), and each plate grows on the one before: more lines, a
 * richer centre, and its own end, from Bronze's dots to Starforged's ringed gems.
 *
 * Each rule is five pieces in a row (plates.css `.plate-box`): an end, the lines, the centre, the
 * lines, the end mirrored. The ends and the centre are fixed-size SVGs; the lines stretch to the
 * name's width (non-scaling strokes keep them 1.5px). Every piece shares one y: 0 is the top of
 * the band, just under the name, and the lines run at the plate's `levels`. The outer
 * `.plate-frame` is a little larger, so its wear mask and Starforged's glow have room. Decoration
 * only.
 */

const svg = (cls: string, w: number, hgt: number, body: string) =>
  `<svg class="${cls}" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" aria-hidden="true">${body}</svg>`;
const solid = (d: string) => `<path d="${d}" class="solid"/>`;
const path = (d: string) => `<path d="${d}"/>`;
/** A diamond centred on (x, y), `r` from the centre to each point. */
const gem = (x: number, y: number, r: number) => `M${x - r} ${y}L${x} ${y - r}L${x + r} ${y}L${x} ${y + r}Z`;
/** Short line ends from x to the piece's edge, one per level. */
const stubs = (from: number, to: number, levels: number[]) => levels.map((y) => `M${from} ${y}H${to}`).join('');

interface Rule {
  /** the band's height, and the y of each line */
  h: number;
  levels: number[];
  /** the left end and the centre: width and drawing */
  end: [number, string];
  centre: [number, string];
}

/** Rays of a half sun hanging from (cx, cy): long on every second ray. */
function sunRays(cx: number, cy: number, r1: number, short: number, long: number): string {
  return [-60, -40, -20, 0, 20, 40, 60]
    .map((d, i) => {
      const a = (d * Math.PI) / 180;
      const p = (r: number) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy + r * Math.cos(a)).toFixed(2)}`;
      return `M${p(r1)}L${p(i % 2 ? short : long)}`;
    })
    .join('');
}

const RULES: Record<number, Rule> = {
  // Bronze: one line running out to a dot and a smaller dot past it, a ring round a dot in the middle
  1: {
    h: 10, levels: [5],
    end: [12, '<circle cx="1.5" cy="5" r="1.25" class="solid"/><circle cx="6" cy="5" r="2.25" class="solid"/>' + path(stubs(9.5, 12, [5]))],
    centre: [16, '<circle cx="8" cy="5" r="4"/><circle cx="8" cy="5" r="1.75" class="solid"/>' + path('M0 5H4M12 5H16')],
  },
  // Silver: two lines; at each end the lower one rises to meet the upper and they run out as
  // one to a solid square; at the centre the lower one dips into a V round a square
  2: {
    h: 13, levels: [3, 6],
    end: [14, '<rect x="0" y="1.5" width="3" height="3" class="solid"/>' + path('M14 3H3M14 6H9L6 3')],
    centre: [22, path('M0 3H22M0 6H5L11 12L17 6H22') + '<rect x="9" y="4.75" width="4" height="4" class="solid"/>'],
  },
  // Gold: two lines from double chevrons pointing out; a gem parts the upper line, the lower
  // dips under it
  3: {
    h: 13, levels: [3, 6],
    end: [16, path('M5 1.5L2 4.5L5 7.5M9 1.5L6 4.5L9 7.5') + path(stubs(11.5, 16, [3, 6]))],
    centre: [26, solid(gem(13, 4.5, 4.5)) + path('M0 3H8.5M17.5 3H26M0 6H6L13 13L20 6H26')],
  },
  // Diamond: three lines from a pair of diamonds; a faceted gem (a gem in a diamond) parts the upper two, the lowest dips under
  4: {
    h: 16, levels: [3, 6, 9],
    end: [20, solid(gem(2.5, 6, 2)) + solid(gem(9.5, 6, 3)) + path(stubs(15, 20, [3, 6, 9]))],
    centre: [30, path(gem(15, 6, 6)) + solid(gem(15, 6, 3)) + path('M0 3H10.5M19.5 3H30M0 6H7.5M22.5 6H30M0 9H6L15 16L24 9H30')],
  },
  // Starforged: three lines from a ringed gem; at the centre a half sun hangs from the top line
  // under a small gem, and the lower lines part round it (the chevrons are Gold's)
  5: {
    h: 20, levels: [3, 6, 9],
    end: [22, solid(gem(8, 6, 4)) + '<circle cx="8" cy="6" r="5.5" class="ring"/>' + path(stubs(15.5, 22, [3, 6, 9]))],
    centre: [36,
      path('M0 3H36M0 6H10.5M25.5 6H36M0 9H8M28 9H36') + path('M12 6A6 6 0 0 0 24 6') + solid('M14.5 6A3.5 3.5 0 0 0 21.5 6Z') +
      path(sunRays(18, 6, 7.5, 10, 12)) + solid(gem(18, 3, 2.5))],
  },
};

/** The rule alone, to lay under an element with the `name-plate plate-n` classes. */
export function plateFrame(plate: number): HTMLElement | null {
  const r = RULES[plate];
  if (!r) return null;
  const lineH = Math.max(...r.levels) + 2;
  const lines = `<svg class="plate-lines" viewBox="0 0 10 ${lineH}" width="10" height="${lineH}" preserveAspectRatio="none" aria-hidden="true">` +
    r.levels.map((y) => `<path vector-effect="non-scaling-stroke" d="M0 ${y}H10"/>`).join('') + '</svg>';
  const end = (side: string) => svg(`plate-end e-${side}`, r.end[0], r.h, r.end[1]);
  const html = end('l') + lines + svg('plate-centre', r.centre[0], r.h, r.centre[1]) + lines + end('r');
  return h('span', { class: 'plate-frame', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'plate-box', html }));
}

/** Puts `name` in `el` on its plate (0: no plate). */
export function paintPlate(el: HTMLElement, name: string, plate: number): void {
  el.classList.remove('name-plate', 'plate-1', 'plate-2', 'plate-3', 'plate-4', 'plate-5');
  if (plate) el.classList.add('name-plate', `plate-${plate}`);
  el.replaceChildren(h('span', { class: 'plate-text', text: name }), plateFrame(plate) ?? '');
}
