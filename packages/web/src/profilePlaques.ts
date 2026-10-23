import { frameLine, underYou, type Box } from './profileWalls.ts';

/**
 * The plaques round the profile card's Level, Elo and badges (owner, 2026-10-23): an Art Deco
 * plaque in each cell, drawn to the cell as laid out. Its top and bottom edges rise to a raised
 * middle on 45° shoulders, its corners are cut concave: one fine worn contour, no fill.
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

/**
 * One plaque in a cell: its one contour (owner: simpler).
 * `rLow` widens the lower corners (the badges', round the frame's corner ornaments).
 */
function plaque(b: Box, unit: number, rLow?: number): string {
  const h = b.bottom - b.top;
  const r = Math.min(h * 0.2, 9 * unit);
  return outline(b, Math.min(h * 0.12, 7 * unit), r, rLow ?? r, 0.5);
}

/**
 * Each cell's plaque box (owner: bigger, out to the box's margins): grown from the cell out to a
 * small gap short of each neighbouring cell's plaque, and where it has no neighbour out to just
 * inside the frame's line (or the wall under you, above).
 */
function grown(cells: Box[], width: number, height: number, unit: number, ceiling: number): Box[] {
  const E = frameLine(unit) + 4 * unit;
  const gap = 2 * unit;
  const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - 0.5 && b0 < a1 - 0.5;
  return cells.map((b) => {
    const others = cells.filter((o) => o !== b);
    const left = others.filter((o) => o.right <= b.left + 0.5 && overlaps(o.top, o.bottom, b.top, b.bottom));
    const right = others.filter((o) => o.left >= b.right - 0.5 && overlaps(o.top, o.bottom, b.top, b.bottom));
    const above = others.filter((o) => o.bottom <= b.top + 0.5 && overlaps(o.left, o.right, b.left, b.right));
    const below = others.filter((o) => o.top >= b.bottom - 0.5 && overlaps(o.left, o.right, b.left, b.right));
    return {
      left: left.length ? (Math.max(...left.map((o) => o.right)) + b.left) / 2 + gap : E,
      right: right.length ? (Math.min(...right.map((o) => o.left)) + b.right) / 2 - gap : width - E,
      top: above.length ? (Math.max(...above.map((o) => o.bottom)) + b.top) / 2 + gap : ceiling + 4 * unit,
      bottom: below.length ? (Math.min(...below.map((o) => o.top)) + b.bottom) / 2 - gap : height - E,
    };
  });
}

/** The plaques for the card's cells, as SVG content for a `width` × `height` drawing. */
export function cardPlaques(c: { width: number; height: number; unit: number; portrait: Box; name: Box; level: Box; elo: Box; badges: Box; frameCorner: number }): string {
  const [level, elo, badges] = grown([c.level, c.elo, c.badges], c.width, c.height, c.unit, underYou(c));
  const plaques = [plaque(level, c.unit), plaque(elo, c.unit), plaque(badges, c.unit, c.frameCorner * 0.6)];
  return `<g class="pc-plaque-line">${plaques.map((d) => `<path d="${d}"/>`).join('')}</g>`;
}
