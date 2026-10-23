/**
 * Writes the factions' full-colour emblems (src/art/elements/<element>.svg: the Affinity cards'
 * crests, Home's faction banner) from the marks in src/elementMarks.ts (owner, 2026-10-23): each
 * mark filled flat in its element's colour, edged in gold like the app's gold lettering. The
 * colours come from the palette (palette.css: each element's -fill role, the gold ramp), so the
 * emblems follow it. Run after changing a mark or the palette:
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
/** The edge's width in the marks' 84 units; drawn behind the fill, so half of it shows. */
const EDGE = 3.2;

for (const [element, step] of Object.entries(FILLS) as [keyof typeof FILLS, string][]) {
  const paths = ELEMENT_MARKS[element].paths.map((d) => `<path d="${d}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 88 88">
<defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">${GOLD.map((c, i) => `<stop offset="${i / 2}" stop-color="${c}"/>`).join('')}</linearGradient></defs>
<g fill="${hex(step)}" stroke="url(#gold)" stroke-width="${EDGE}" stroke-linejoin="round" paint-order="stroke">${paths}</g>
</svg>
`;
  writeFileSync(new URL(`../src/art/elements/${element}.svg`, import.meta.url), svg);
}
console.log('emblems written');
