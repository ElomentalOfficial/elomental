/**
 * Home's tile sprites (owner, 2026-10-23): behind each tile's name, one faint hairline motif of
 * its own, minimal and each in a different corner, worn by small breaks like the tiles' frames.
 * Each is drawn in a 100-unit square that the tile fits against the edge or corner `at` names
 * (preserveAspectRatio), so it grows with the tile and its lines stay in that corner, clear of the
 * centred name. The sunburst appears once, on Daily, as a sunrise.
 */
export type Area = 'daily' | 'casual' | 'ranked' | 'forge' | 'store' | 'leader' | 'setup';

/** The wear: the gap a break leaves, in units. */
const GAP = 1.6;
const n = (v: number) => v.toFixed(1);

/** A straight line, broken at each fraction in `cuts`. */
function line(x1: number, y1: number, x2: number, y2: number, cuts: number[] = []): string {
  const gap = GAP / Math.hypot(x2 - x1, y2 - y1);
  const at = (t: number) => `${n(x1 + (x2 - x1) * t)} ${n(y1 + (y2 - y1) * t)}`;
  let out = '';
  let start = 0;
  for (const c of [...cuts, 1]) {
    const end = c === 1 ? 1 : c - gap / 2;
    out += `M${at(start)}L${at(end)}`;
    start = c + gap / 2;
  }
  return out;
}

/** A path through the points, broken at the points whose index is in `breaks` (just before it). */
function steps(points: [number, number][], breaks: number[] = []): string {
  return points
    .slice(1)
    .map(([x, y], i) => line(points[i][0], points[i][1], x, y, breaks.includes(i + 1) ? [0.5] : []))
    .join('');
}

/** An arc around (cx, cy), clockwise from `a1` to `a2` degrees (0 is right, 90 down). */
function arc(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const p = (a: number) => `${n(cx + r * Math.cos((a * Math.PI) / 180))} ${n(cy + r * Math.sin((a * Math.PI) / 180))}`;
  return `M${p(a1)}A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${p(a2)}`;
}

/** An arc broken into the given runs of degrees. */
const arcs = (cx: number, cy: number, r: number, runs: [number, number][]) => runs.map(([a, b]) => arc(cx, cy, r, a, b)).join('');

/** A hollow diamond around (x, y), `r` from its middle to each point. */
const diamond = (x: number, y: number, r: number) => `M${n(x)} ${n(y - r)}L${n(x + r)} ${n(y)}L${n(x)} ${n(y + r)}L${n(x - r)} ${n(y)}Z`;

// Every motif keeps to the middle of an edge, between the frame's corners, and off the name.
const SPRITES: Record<Area, { at: string; d: string }> = {
  // Daily: the day's sun rising from the bottom edge, its rays long and short in turn
  daily: {
    at: 'xMidYMax',
    d:
      arcs(50, 100, 8, [[180, 262], [270, 360]]) +
      Array.from({ length: 7 }, (_, i) => {
        const a = ((210 + i * 20) * Math.PI) / 180;
        const to = i % 2 ? 26 : 36;
        return line(50 + 13 * Math.cos(a), 100 + 13 * Math.sin(a), 50 + to * Math.cos(a), 100 + to * Math.sin(a), [i % 3 ? 0.55 : 0.35]);
      }).join(''),
  },
  // Casual: calm ripples spreading from the left edge
  casual: {
    at: 'xMinYMid',
    d: arcs(0, 50, 14, [[-50, 20], [26, 50]]) + arcs(0, 50, 21, [[-50, -12], [-6, 50]]) + arcs(0, 50, 28, [[-50, 34], [40, 50]]),
  },
  // Ranked: chevrons climbing to a small diamond, at the top edge
  ranked: {
    at: 'xMidYMin',
    d: diamond(50, 6, 2.5) + [12, 18, 24].map((y, i) => steps([[42, y + 7], [50, y], [58, y + 7]], [i === 1 ? 2 : 1])).join(''),
  },
  // Forge: a chain of two gems on a worn spine, at the right edge
  forge: {
    at: 'xMaxYMid',
    d: line(44, 50, 55, 50) + diamond(62, 50, 7) + line(69, 50, 77, 50) + diamond(84, 50, 7) + line(91, 50, 100, 50, [0.5]),
  },
  // Store: two coins, overlapping, at the left edge
  store: {
    at: 'xMinYMid',
    d: arcs(22, 46, 10, [[0, 150], [158, 360]]) + arcs(34, 54, 10, [[-90, 100], [108, 200]]),
  },
  // Leaderboard: the podium's three steps, the middle one highest, on the bottom edge
  leader: {
    at: 'xMidYMax',
    d: steps([[34, 98], [34, 92], [46, 92], [46, 86], [58, 86], [58, 94], [70, 94], [70, 98]], [3, 5]) + line(30, 98, 74, 98, [0.4]),
  },
  // Setup: two sliders, each with its knob, at the bottom edge
  setup: {
    at: 'xMidYMax',
    d: line(34, 84, 66, 84, [0.7]) + diamond(42, 84, 3) + line(34, 93, 66, 93, [0.3]) + diamond(58, 93, 3),
  },
};

/** The sprite for a Home tile, as an SVG in the tile's ink (decoration: hidden from screen readers). */
export function tileSprite(area: Area): string {
  const { at, d } = SPRITES[area];
  return `<svg class="tile-sprite" viewBox="0 0 100 100" preserveAspectRatio="${at} meet" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
