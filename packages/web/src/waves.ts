/**
 * The faint flowing lines behind every screen: two bundles of near-parallel
 * strokes that swell and pinch as they run diagonally up the page, from the
 * lower left to the upper right, spaced loosely so the page stays calm. Drawn
 * once as an SVG and used as a mask (styles.css #app::before), so the colour
 * comes from the theme and the lines stay a hairline at any size. The canvas
 * is square, so a phone, a tablet and a desktop all crop it to the same
 * diagonal. Seeded, so every visit draws the same lines.
 */

const W = 1600;
const H = 1600;
/** The bundles are drawn level, longer than the canvas, then turned up by this much. */
const TILT = -52;
const REACH = 700;

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth path through points (Catmull-Rom as cubic Béziers). */
function smooth(points: [number, number][]): string {
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[Math.max(0, i - 1)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(points.length - 1, i + 2)];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return d;
}

/**
 * One bundle: `count` lines around a slow wave from (x0,y0) to (x1,y1). The
 * spacing between lines breathes along the way, so the bundle pinches into a
 * cord and fans open again, which is what reads as fabric.
 */
function bundle(random: () => number, count: number, y0: number, y1: number, amplitude: number, spread: number): string[] {
  const phase = random() * Math.PI * 2;
  const phase2 = random() * Math.PI * 2;
  const freq = 1.1 + random() * 0.6;
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i / (count - 1) - 0.5;
    const points: [number, number][] = [];
    // Longer than the canvas, so the ends stay off-screen once the bundle is turned.
    for (let x = -REACH; x <= W + REACH; x += 80) {
      const t = (x + REACH) / (W + 2 * REACH);
      const centre = y0 + (y1 - y0) * t + amplitude * Math.sin(t * Math.PI * freq + phase);
      // How open the bundle is here: pinched (0.15) to fanned (1).
      const open = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2.2 + phase2));
      // Each line also twists a little, so the lines cross and don't look ruled.
      const twist = 18 * Math.sin(t * Math.PI * 3 + offset * 4 + phase);
      points.push([x, centre + offset * spread * open + twist * open]);
    }
    paths.push(smooth(points));
  }
  return paths;
}

let cached: string | null = null;

/** The lines as an SVG data URL (white strokes; the CSS mask only uses their shape). */
export function wavesUrl(): string {
  if (cached) return cached;
  const random = rng(7);
  // Loosely spaced; both cross near the middle, the second a touch flatter.
  const main = bundle(random, 13, 900, 640, 150, 460);
  const second = bundle(random, 9, 640, 1000, 120, 320);
  const group = (lines: string[], tilt: number) =>
    `<g transform="rotate(${tilt} ${W / 2} ${H / 2})">${lines.map((d) => `<path d="${d}"/>`).join('')}</g>`;
  const svg =
    // Explicit size: without it browsers rasterise data-URL SVGs at a default size and crop them.
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<g fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round">` +
    group(main, TILT) +
    group(second, TILT + 8) +
    `</g></svg>`;
  cached = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return cached;
}

/** Puts the lines behind the app (once, at startup). */
export function applyWaves(): void {
  document.documentElement.style.setProperty('--waves', wavesUrl());
}
