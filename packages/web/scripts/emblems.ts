/**
 * Writes the factions' full-colour emblems (src/art/elements/<element>.svg: the Affinity cards'
 * crests, your faction on the Profile card and page): the owner's marks in src/elementMarks.ts,
 * filled flat in their element's colour and edged in gold like the app's gold lettering. The
 * colours come from the palette (palette.css: each element's -fill role, the gold ramp), so the
 * art follows it. Run after changing a mark or the palette:
 *
 *   node scripts/emblems.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ELEMENT_MARKS } from '../src/elementMarks.ts';

const palette = readFileSync(new URL('../src/styles/palette.css', import.meta.url), 'utf8');
const hex = (name: string): string => {
  const found = palette.match(new RegExp(`--c-${name}: (#[0-9a-f]{6})`));
  if (!found) throw new Error(`palette.css has no --c-${name}`);
  return found[1];
};
/** Each element's fill: its -fill role's step (scripts/palette.ts ELEMENTS). */
const FILLS = { fire: 'lava-500', water: 'tide-400', earth: 'forest-500', air: 'mist-200' } as const;
/** The gold edge, light at the top to deep below. */
const GOLD = [hex('gold-100'), hex('gold-300'), hex('gold-400')];
const gold = `<defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">${GOLD.map((c, i) => `<stop offset="${i / 2}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`;
/**
 * Shapes filled in `fill` with the gold edge inside them (owner: an edge outside crowded Water's
 * thin curls): the edge stroked twice as wide and clipped to the shapes, so `edge` units of it
 * show, all within the outline.
 */
const edgedInside = (ds: readonly string[], fill: string, edge: number) => {
  const paths = ds.map((d) => `<path d="${d}"/>`).join('');
  return `<clipPath id="shape">${paths}</clipPath>\n<g fill="${fill}">${paths}</g>\n` +
    `<g clip-path="url(#shape)" fill="none" stroke="url(#gold)" stroke-width="${2 * edge}" stroke-linejoin="round">${paths}</g>`;
};

/** The emblems' edge, in the marks' 84 units. */
const EDGE = 1.6;
for (const [element, step] of Object.entries(FILLS) as [keyof typeof FILLS, string][]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84">\n${gold}\n${edgedInside(ELEMENT_MARKS[element].paths, hex(step), EDGE)}\n</svg>\n`;
  writeFileSync(new URL(`../src/art/elements/${element}.svg`, import.meta.url), svg);
}
console.log('emblems written');
