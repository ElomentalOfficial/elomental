/**
 * Writes the factions' full-colour emblems (src/art/elements/<element>.svg: the Affinity cards'
 * crests, your faction on the Profile card and page): the owner's marks in src/elementMarks.ts,
 * filled flat in their element's colour and edged in gold like the app's gold lettering. The
 * colours come from the palette (palette.css: each element's -fill role, the gold ramp), so the
 * art follows it. Also each emblem plain (src/art/elements/plain/: no edge, a mild gradient of its
 * colour) for the faction flag. Run after changing a mark or the palette:
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
/**
 * A plain emblem's colour on the light theme, where its own is too pale for the pale flag: Air's
 * a neutral steel grey (owner, 2026-10-24), not mist's blue.
 */
const PLAIN_LIGHT: Partial<Record<keyof typeof FILLS, string>> = { air: 'steel-500' };
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

/**
 * A mark's true bounds: its points and each curve's extremes (the marks use absolute M, C and Z
 * only; a curve's control points can lie outside the shape, so they don't count).
 */
function bounds(ds: readonly string[]): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number) => {
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  };
  const at = (a: number, b: number, c: number, d: number, t: number) =>
    (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
  /** where a cubic's derivative is zero, inside (0, 1) */
  const turns = (a: number, b: number, c: number, d: number) => {
    const [qa, qb, qc] = [-a + 3 * b - 3 * c + d, 2 * (a - 2 * b + c), b - a];
    if (Math.abs(qa) < 1e-9) return Math.abs(qb) < 1e-9 ? [] : [-qc / qb];
    const disc = qb * qb - 4 * qa * qc;
    return disc < 0 ? [] : [(-qb + Math.sqrt(disc)) / (2 * qa), (-qb - Math.sqrt(disc)) / (2 * qa)];
  };
  for (const d of ds) {
    let [px, py] = [0, 0];
    for (const [, cmd, args] of d.matchAll(/([MCZ])([^MCZ]*)/g)) {
      const n = args.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
      if (cmd === 'M') [px, py] = [n[0], n[1]];
      for (let i = 0; cmd === 'C' && i < n.length; i += 6) {
        const [ax, ay, bx, by, x, y] = n.slice(i, i + 6);
        for (const t of [...turns(px, ax, bx, x), ...turns(py, ay, by, y)].filter((t) => t > 0 && t < 1))
          add(at(px, ax, bx, x, t), at(py, ay, by, y, t));
        add(px, py);
        [px, py] = [x, y];
      }
      add(px, py);
    }
  }
  return [x0, y0, x1, y1];
}

/** The emblems' edge, in the marks' 84 units. */
const EDGE = 1.6;
/**
 * Every emblem the same size, whole and centred (owner, 2026-10-23: some ran off the box's edges):
 * each mark's true bounds scaled so its longer side is SIZE, in the middle of the 84 box.
 */
const SIZE = 80;
for (const [element, step] of Object.entries(FILLS) as [keyof typeof FILLS, string][]) {
  const { paths } = ELEMENT_MARKS[element];
  const [x0, y0, x1, y1] = bounds(paths);
  const k = SIZE / Math.max(x1 - x0, y1 - y0);
  const fit = `translate(${+(42 - (k * (x0 + x1)) / 2).toFixed(3)} ${+(42 - (k * (y0 + y1)) / 2).toFixed(3)}) scale(${+k.toFixed(5)})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84">\n${gold}\n<g transform="${fit}">\n${edgedInside(paths, hex(step), EDGE / k)}\n</g>\n</svg>\n`;
  writeFileSync(new URL(`../src/art/elements/${element}.svg`, import.meta.url), svg);
  // the plain emblem (owner, 2026-10-24: the faction flag): no gold edge, a mild fall of its own
  // colour, a step lighter at the top to a step deeper at the foot; for the light theme too where
  // its own colour is too pale for the pale flag (PLAIN_LIGHT)
  const plain = (at: string) => {
    const [ramp, n] = at.split('-');
    const fall = [`${ramp}-${Number(n) - 100}`, `${ramp}-${Number(n) + 100}`].map(hex);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84">\n<defs><linearGradient id="fall" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${fall[0]}"/><stop offset="1" stop-color="${fall[1]}"/></linearGradient></defs>\n` +
      `<g transform="${fit}" fill="url(#fall)">${paths.map((d) => `<path d="${d}"/>`).join('')}</g>\n</svg>\n`;
  };
  writeFileSync(new URL(`../src/art/elements/plain/${element}.svg`, import.meta.url), plain(step));
  const light = PLAIN_LIGHT[element];
  if (light) writeFileSync(new URL(`../src/art/elements/plain/${element}-light.svg`, import.meta.url), plain(light));
}
console.log('emblems written');
