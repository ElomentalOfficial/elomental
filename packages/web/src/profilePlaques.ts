import grain from './art/grain.webp';
import type { Box } from './profileWalls.ts';

/**
 * The plaques behind the profile card's Level, Elo and badges (owner, 2026-10-23): an Art Deco
 * plaque in each cell, drawn to the cell as laid out. Its top and bottom edges rise to a raised
 * middle on 45° shoulders, its corners are cut concave, a back plate's shoulders show behind the
 * raised middle, and a fine worn line runs just inside its edge. The fill is worn by the tiles'
 * own grain, like old print.
 */

const n = (v: number) => v.toFixed(1);

/**
 * The plaque's outline in a box: `rise` the raised middle's height over the shoulders, `r` the
 * concave corners' radius (`rLow` for the lower two), the middle `mid` of the width.
 */
function outline(b: Box, rise: number, r: number, rLow: number, mid: number): string {
  const { left: x0, top: y0, right: x1, bottom: y1 } = b;
  const cx = (x0 + x1) / 2;
  const c = ((x1 - x0) * mid) / 2;
  const t = y0 + rise;
  const u = y1 - rise;
  // clockwise from the raised middle's top left; each concave corner an arc about the corner itself
  return [
    `M${n(cx - c)} ${n(y0)}H${n(cx + c)}L${n(cx + c + rise)} ${n(t)}H${n(x1 - r)}`,
    `A${n(r)} ${n(r)} 0 0 0 ${n(x1)} ${n(t + r)}V${n(u - rLow)}`,
    `A${n(rLow)} ${n(rLow)} 0 0 0 ${n(x1 - rLow)} ${n(u)}H${n(cx + c + rise)}L${n(cx + c)} ${n(y1)}H${n(cx - c)}L${n(cx - c - rise)} ${n(u)}H${n(x0 + rLow)}`,
    `A${n(rLow)} ${n(rLow)} 0 0 0 ${n(x0)} ${n(u - rLow)}V${n(t + r)}`,
    `A${n(r)} ${n(r)} 0 0 0 ${n(x0 + r)} ${n(t)}H${n(cx - c - rise)}Z`,
  ].join('');
}

const inset = (b: Box, d: number): Box => ({ left: b.left + d, top: b.top + d, right: b.right - d, bottom: b.bottom - d });

/**
 * One plaque in a cell: its fill, its back plate's shoulders, the worn line inside its edge.
 * `rLow` widens the lower corners (the badges', round the frame's corner ornaments).
 */
function plaque(b: Box, unit: number, rLow?: number): { fill: string; lines: string } {
  const h = b.bottom - b.top;
  const rise = Math.min(h * 0.12, 7 * unit);
  const r = Math.min(h * 0.2, 9 * unit);
  rLow ??= r;
  const mid = 0.5;
  const fill = outline(b, rise, r, rLow, mid);
  const line = outline(inset(b, 3 * unit), Math.max(0, rise - unit), Math.max(0, r - 2 * unit), Math.max(0, rLow - 2 * unit), mid);
  // the back plate: wider shoulders a little lower than the raised middle, top and bottom
  const cx = (b.left + b.right) / 2;
  const c = ((b.right - b.left) * mid) / 2 + rise * 2.5;
  const lift = rise * 0.45;
  const back =
    `M${n(cx - c - rise)} ${n(b.top + rise)}L${n(cx - c)} ${n(b.top + lift)}H${n(cx + c)}L${n(cx + c + rise)} ${n(b.top + rise)}` +
    `M${n(cx - c - rise)} ${n(b.bottom - rise)}L${n(cx - c)} ${n(b.bottom - lift)}H${n(cx + c)}L${n(cx + c + rise)} ${n(b.bottom - rise)}`;
  return { fill, lines: line + back };
}

/** The plaques for the card's cells, as SVG content for a `width` × `height` drawing. */
export function cardPlaques(c: { width: number; height: number; unit: number; level: Box; elo: Box; badges: Box; frameCorner: number }): string {
  const plaques = [plaque(c.level, c.unit), plaque(c.elo, c.unit), plaque(c.badges, c.unit, c.frameCorner * 0.6)];
  return (
    `<defs><pattern id="pc-grain" patternUnits="userSpaceOnUse" width="224" height="224"><image href="${grain}" width="224" height="224"/></pattern>` +
    `<mask id="pc-grain-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${c.width}" height="${c.height}"><rect width="${c.width}" height="${c.height}" fill="url(#pc-grain)"/></mask></defs>` +
    `<g class="pc-plaque-fill" mask="url(#pc-grain-mask)">${plaques.map((p) => `<path d="${p.fill}"/>`).join('')}</g>` +
    `<g class="pc-plaque-line">${plaques.map((p) => `<path d="${p.lines}"/>`).join('')}</g>`
  );
}
