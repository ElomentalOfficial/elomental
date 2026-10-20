import { h } from './ui.ts';

/**
 * Name plates (bought with Stardust, forge.ts): an Art Deco border drawn around the name,
 * from a plain Bronze line to the Elomentalist's triple line with fans, a crown and
 * chevrons. The straight lines are CSS borders (styles.css `.plate-frame`), so the border
 * stretches to any name; the ornaments are small SVGs pinned to the corners and the
 * middles, mirrored into place. Their (0, 0) is the outer line's corner. Decoration only.
 */

const svg = (cls: string, box: string, size: [number, number], body: string) =>
  `<svg class="${cls}" viewBox="${box}" width="${size[0]}" height="${size[1]}" aria-hidden="true">${body}</svg>`;

/** Rays and arcs of a quarter fan around the inner corner (3.5, 3.5). */
function fan(r1: number, r2: number, rays: number[]): string {
  const c = 3.5;
  const arc = (r: number) => `<path d="M${c} ${c + r}A${r} ${r} 0 0 0 ${c + r} ${c}"/>`;
  const ray = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const p = (r: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
    return `<path d="M${p(r1)}L${p(r2)}"/>`;
  };
  return arc(r1) + arc(r2) + rays.map(ray).join('');
}

/** One corner per plate (drawn for the top left; the others are mirrors). */
const CORNERS: Record<number, string> = {
  // Bronze: a small square box in each corner
  1: '<path d="M0.5 6.5H6.5V0.5"/>',
  // Silver: a stepped notch inside the double line, and a solid square at the corner
  2: '<path d="M3.5 10.5H6.5V6.5H10.5V3.5"/><rect x="-1" y="-1" width="3" height="3" class="solid"/>',
  // Gold: a sunburst fan in the corner
  3: fan(6, 10, [22.5, 45, 67.5]) + '<rect x="-1" y="-1" width="3" height="3" class="solid"/>',
  // Elomentalist: a fuller fan, and the inner line runs on past the corner
  4: fan(5, 8.5, [15, 30, 45, 60, 75]) + '<path d="M3.5 11.5V15M11.5 3.5H15"/><path d="M-4.5 3.5H3.5V-4.5"/><rect x="-1" y="-1" width="3" height="3" class="solid"/>',
};

/** The middle of the top edge (the bottom is its mirror); y 0 is the outer line. */
const TOPS: Record<number, string> = {
  3: '<path d="M0 -3L3 0.5L0 4L-3 0.5Z" class="solid"/>',
  4: '<path d="M-9 0.5L0 -5L9 0.5"/><path d="M0 -2L3 1.5L0 5L-3 1.5Z" class="solid"/>',
};

/** The middle of the left edge (the right is its mirror); x 0 is the outer line. */
const SIDES: Record<number, string> = {
  4: '<path d="M3.5 -6L7.5 0L3.5 6"/><path d="M-3 0L0.5 -3.5L4 0L0.5 3.5Z" class="solid"/>',
};

/** The border alone, to lay over an element with the `name-plate plate-n` classes. */
export function plateFrame(plate: number): HTMLElement | null {
  if (!plate) return null;
  const parts: string[] = [];
  for (const c of ['tl', 'tr', 'bl', 'br']) parts.push(svg(`plate-corner c-${c}`, '-5 -5 21 21', [21, 21], CORNERS[plate]));
  if (TOPS[plate]) for (const c of ['t', 'b']) parts.push(svg(`plate-mid m-${c}`, '-10 -7 20 14', [20, 14], TOPS[plate]));
  if (SIDES[plate]) for (const c of ['l', 'r']) parts.push(svg(`plate-side s-${c}`, '-7 -10 14 20', [14, 20], SIDES[plate]));
  return h('span', { class: 'plate-frame', html: parts.join(''), attrs: { 'aria-hidden': 'true' } });
}

/** Puts `name` in `el` on its plate (0: no plate). */
export function paintPlate(el: HTMLElement, name: string, plate: number): void {
  el.classList.remove('name-plate', 'plate-1', 'plate-2', 'plate-3', 'plate-4');
  if (plate) el.classList.add('name-plate', `plate-${plate}`);
  el.replaceChildren(h('span', { class: 'plate-text', text: name }), plateFrame(plate) ?? '');
}
