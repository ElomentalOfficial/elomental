import { h } from './ui.ts';

/**
 * Name plates (bought with Stardust, forge.ts): an Art Deco border drawn around the name,
 * from a plain Bronze line to the Starforged plate's pointed cartouche with its sunburst crown.
 * The straight lines are CSS borders (styles.css `.plate-box`), so the border stretches to
 * any name; the ornaments are small SVGs pinned to the corners and the middles, mirrored
 * into place. Their (0, 0) is the outer line's corner. The outer `.plate-frame` is a little
 * larger, so its wear mask covers the ornaments that reach past the lines. Decoration only.
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
};

/** The middle of the top edge (the bottom is its mirror); y 0 is the outer line. */
const TOPS: Record<number, string> = {
  3: '<path d="M0 -3L3 0.5L0 4L-3 0.5Z" class="solid"/>',
};

/**
 * The Starforged plate: a cartouche with pointed ends, like an Art Deco nameplate. Each end is
 * two nested chevrons (the outer and inner lines) stretched to the name's height
 * (non-scaling strokes keep them 1px), with two slim pillars inside; a gem sits on each
 * tip, a sunburst crown rises from the top and a small gem hangs below.
 */
function starforged(): string {
  const line = 'vector-effect="non-scaling-stroke"';
  const end = (cls: string) =>
    `<svg class="${cls}" viewBox="0 0 26 100" preserveAspectRatio="none" aria-hidden="true">` +
    `<path ${line} d="M26 0H12L0.5 50L12 100H26"/>` +
    '</svg>';
  const inner = (cls: string) =>
    `<svg class="${cls}" viewBox="0 0 26 100" preserveAspectRatio="none" aria-hidden="true">` +
    `<path ${line} d="M26 0H13.5L4 50L13.5 100H26"/><path ${line} d="M19 22V78M21.5 30V70"/>` +
    '</svg>';
  // on each tip: a gem in a ring, with two chevrons pointing out
  const tip = (cls: string) =>
    `<svg class="${cls}" viewBox="-14 -7 21 14" width="21" height="14" aria-hidden="true">` +
    '<path d="M0 -4.5L3 0L0 4.5L-3 0Z" class="solid"/><circle r="5.5" class="ring"/>' +
    '<path d="M-7 -4L-10 0L-7 4M-10 -3L-12.5 0L-10 3"/></svg>';
  // a sunburst crown: a half sun on the top line, long and short rays, a gem on top
  const rays = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75]
    .map((d) => {
      const a = ((d - 90) * Math.PI) / 180;
      const p = (r: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
      return `M${p(8.5)}L${p(d % 30 === 0 ? 15 : 12)}`;
    })
    .join('');
  const crown =
    '<svg class="elo-crown" viewBox="-22 -21 44 22" width="44" height="22" aria-hidden="true">' +
    `<path d="${rays}"/><path d="M-8.5 0.5A8.5 8.5 0 0 1 8.5 0.5"/><path d="M-5 0.5A5 5 0 0 1 5 0.5Z" class="solid"/>` +
    '<path d="M0 -21L2.5 -18L0 -15L-2.5 -18Z" class="solid"/><path d="M-21 0.5L-17 -3L-13 0.5M13 0.5L17 -3L21 0.5"/></svg>';
  // below: a gem hanging from a short bar
  const drop =
    '<svg class="elo-drop" viewBox="-12 -2 24 11" width="24" height="11" aria-hidden="true">' +
    '<path d="M-10 2.5H10"/><path d="M0 3L3 6L0 9L-3 6Z" class="solid"/></svg>';  return end('elo-end e-l') + end('elo-end e-r') + inner('elo-inner e-l') + inner('elo-inner e-r') + tip('elo-tip t-l') + tip('elo-tip t-r') + crown + drop;
}
/** The border alone, to lay over an element with the `name-plate plate-n` classes. */
export function plateFrame(plate: number): HTMLElement | null {
  if (!plate) return null;
  const frame = (html: string) => h('span', { class: 'plate-frame', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'plate-box', html }));
  if (plate === 4) return frame(starforged());
  const parts: string[] = [];
  for (const c of ['tl', 'tr', 'bl', 'br']) parts.push(svg(`plate-corner c-${c}`, '-5 -5 21 21', [21, 21], CORNERS[plate]));
  if (TOPS[plate]) for (const c of ['t', 'b']) parts.push(svg(`plate-mid m-${c}`, '-10 -7 20 14', [20, 14], TOPS[plate]));
  return frame(parts.join(''));
}

/** Puts `name` in `el` on its plate (0: no plate). */
export function paintPlate(el: HTMLElement, name: string, plate: number): void {
  el.classList.remove('name-plate', 'plate-1', 'plate-2', 'plate-3', 'plate-4');
  if (plate) el.classList.add('name-plate', `plate-${plate}`);
  el.replaceChildren(h('span', { class: 'plate-text', text: name }), plateFrame(plate) ?? '');
}
