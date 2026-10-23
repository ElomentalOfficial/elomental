/**
 * Writes the factions' full-colour art (owner, 2026-10-23), every piece edged in gold like the
 * app's gold lettering:
 * - the emblems (src/art/elements/<element>.svg: the Affinity cards' crests), the marks in
 *   src/elementMarks.ts filled flat in their element's colour;
 * - the signs (src/art/factions/<element>.svg: your faction on the Profile card and page), plain
 *   shapes a glance reads (a flame, a drop, two peaks, the wind), the wind's lines drawn as
 *   gold-edged bands with grey inside.
 * The colours come from the palette (palette.css: each element's -fill role, the gold ramp, a warm
 * grey), so the art follows it. Run after changing a mark, a sign or the palette:
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

/** The signs, on a 24-unit grid: filled shapes, and Air's lines. */
const SIGNS = {
  fire: 'M12.5 2.5c.6 3.4 5.5 6.2 5.5 11.3a6 6 0 0 1-12 0c0-2.7 1.4-4.6 2.9-6.1-.1 1.9.6 3.3 1.9 3.9-.4-3.3.2-6.4 1.7-9.1Z',
  water: 'M12 2.6c2.6 3.6 6.4 8.1 6.4 12a6.4 6.4 0 0 1-12.8 0c0-3.9 3.8-8.4 6.4-12Z',
  earth: 'M2.5 19.5 9.5 7.5l3.4 5.6 2.6-3.6 6 10Z',
} as const;
const WIND = ['M3 8.5h11.5a2.5 2.5 0 1 0-2.5-2.5', 'M3 12.5h15.5', 'M3 16.5h11.5a2.5 2.5 0 1 1-2.5 2.5'];
const gold = `<defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">${GOLD.map((c, i) => `<stop offset="${i / 2}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`;
const sign = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n${gold}\n${body}\n</svg>\n`;
for (const [element, d] of Object.entries(SIGNS) as [keyof typeof SIGNS, string][]) {
  const body = `<path d="${d}" fill="${hex(FILLS[element])}" stroke="url(#gold)" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"/>`;
  writeFileSync(new URL(`../src/art/factions/${element}.svg`, import.meta.url), sign(body));
}
// Air: each line twice, a wide gold band under a narrower grey one, so it reads edged in gold
const wind = (stroke: string, width: number) =>
  `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${WIND.map((d) => `<path d="${d}"/>`).join('')}</g>`;
writeFileSync(new URL('../src/art/factions/air.svg', import.meta.url), sign(wind('url(#gold)', 3.4) + wind(hex('stone-300'), 1.8)));
console.log('emblems and signs written');
