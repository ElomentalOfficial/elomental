/**
 * The faint wood-grain lines behind every screen: contour lines of a smooth,
 * seeded height field, like the rings in a cut log. Two bands of evenly
 * spaced rings run in from opposite corners and bend gently as they go, with
 * calm empty space between them on the diagonal, so the page never gets busy
 * behind the tiles or the board. The lines wobble slightly and vary in weight,
 * as if drawn by hand.
 *
 * The drawing is made for the screen's own shape (portrait phone, landscape
 * desktop), so the composition fits instead of being cropped away, and used as
 * a mask (styles.css #app::before): the colour comes from the theme and the
 * lines stay a hairline at any size. Seeded, so every visit draws the same.
 */

/** Grid spacing for tracing contours, in drawing units. */
const STEP = 10;
/** The drawing's long side, in drawing units. */
const LONG = 1600;

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

/** Smooth 2D value noise over the unit square, `cells` lattice cells per side, values in -1..1. */
function valueNoise(random: () => number, cells: number) {
  const lattice = Array.from({ length: (cells + 1) * (cells + 1) }, () => random() * 2 - 1);
  const at = (i: number, j: number) => lattice[Math.min(cells, j) * (cells + 1) + Math.min(cells, i)];
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => {
    const gx = Math.max(0, Math.min(1, u)) * cells;
    const gy = Math.max(0, Math.min(1, v)) * cells;
    const i = Math.min(cells - 1, Math.floor(gx));
    const j = Math.min(cells - 1, Math.floor(gy));
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fade(gx - i);
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fade(gx - i);
    return a + (b - a) * fade(gy - j);
  };
}

interface Ellipse {
  x: number;
  y: number;
  /** Radius along the grain and across it. */
  along: number;
  across: number;
  angle: number;
  weight: number;
}

/** Elliptical distance from the centre: 0 at the centre, 1 on the outline. */
function distance(e: Ellipse, x: number, y: number): number {
  const dx = x - e.x;
  const dy = y - e.y;
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  const a = (dx * c + dy * s) / e.along;
  const b = (-dx * s + dy * c) / e.across;
  return Math.sqrt(a * a + b * b);
}

/**
 * The height field for a W×H drawing. Each band falls off linearly from its
 * core, so its rings are evenly spaced like growth rings; knots push them
 * apart. Everything is placed relative to the drawing, along its diagonal.
 */
function field(W: number, H: number): (x: number, y: number) => number {
  const random = rng(11);
  const warpX = valueNoise(random, 3);
  const warpY = valueNoise(random, 3);
  // A second, finer warp: the gentle bends real grain takes around what grew in it.
  const bendX = valueNoise(random, 7);
  const bendY = valueNoise(random, 7);
  const wobble = valueNoise(random, 48);
  const spacing = valueNoise(random, 7);
  const D = Math.hypot(W, H);
  // The grain runs along the calm diagonal (upper left to lower right). One band
  // sits in the lower-left corner, one in the upper-right, each reaching most of
  // the way to that diagonal and no further.
  const grain = Math.atan2(H, W);
  const toDiagonal = (W * H) / D;
  const bands: Ellipse[] = [
    { x: 0, y: H, along: 0.8 * D, across: 0.86 * toDiagonal, angle: grain, weight: 1 },
    { x: W, y: 0, along: 0.8 * D, across: 0.86 * toDiagonal, angle: grain, weight: 1 },
  ];
  return (x0: number, y0: number) => {
    const u = x0 / W;
    const v = y0 / H;
    const x = x0 + 0.09 * D * warpX(u, v) + 0.025 * D * bendX(u, v);
    const y = y0 + 0.09 * D * warpY(u, v) + 0.025 * D * bendY(u, v);
    let h = -1;
    for (const b of bands) h = Math.max(h, b.weight * (1 - distance(b, x, y)));
    return h * (1 + 0.12 * spacing(u, v)) + 0.006 * wobble(u, v);
  };
}

type Point = [number, number];

/** Marching squares over an nx×ny grid: every iso-line at `level`, joined into polylines. */
function contours(values: Float64Array, nx: number, ny: number, level: number): Point[][] {
  const segments: [Point, Point][] = [];
  const v = (i: number, j: number) => values[j * nx + i];
  const lerp = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i + 1, j + 1);
      const d = v(i, j + 1);
      const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const x = i * STEP;
      const y = j * STEP;
      const top: Point = [x + lerp(a, b) * STEP, y];
      const right: Point = [x + STEP, y + lerp(b, c) * STEP];
      const bottom: Point = [x + lerp(d, c) * STEP, y + STEP];
      const left: Point = [x, y + lerp(a, d) * STEP];
      switch (code) {
        case 1: case 14: segments.push([left, bottom]); break;
        case 2: case 13: segments.push([bottom, right]); break;
        case 3: case 12: segments.push([left, right]); break;
        case 4: case 11: segments.push([top, right]); break;
        case 6: case 9: segments.push([top, bottom]); break;
        case 7: case 8: segments.push([left, top]); break;
        case 5: segments.push([left, top], [bottom, right]); break;
        case 10: segments.push([top, right], [left, bottom]); break;
      }
    }
  }
  // Join segments end to end into polylines.
  const key = (p: Point) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
  const byEnd = new Map<string, number[]>();
  segments.forEach(([p, q], k) => {
    for (const e of [key(p), key(q)]) (byEnd.get(e) ?? byEnd.set(e, []).get(e)!).push(k);
  });
  const used = new Uint8Array(segments.length);
  const lines: Point[][] = [];
  const extend = (line: Point[], atEnd: boolean) => {
    for (;;) {
      const tip = atEnd ? line[line.length - 1] : line[0];
      const next = (byEnd.get(key(tip)) ?? []).find((k) => !used[k]);
      if (next === undefined) return;
      used[next] = 1;
      const [p, q] = segments[next];
      const far = key(p) === key(tip) ? q : p;
      if (atEnd) line.push(far);
      else line.unshift(far);
    }
  };
  segments.forEach(([p, q], k) => {
    if (used[k]) return;
    used[k] = 1;
    const line: Point[] = [p, q];
    extend(line, true);
    extend(line, false);
    lines.push(line);
  });
  return lines;
}

/** Ramer–Douglas–Peucker: drop the points a line doesn't need (keeps the drawing small). */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const dist = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
    if (dist > worst) {
      worst = dist;
      index = i;
    }
  }
  if (worst <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

const pathOf = (points: Point[]) =>
  'M' + points.map(([x, y], i) => `${i === 1 ? 'L' : i > 1 ? ' ' : ''}${Math.round(x)} ${Math.round(y)}`).join('');

/**
 * The lines as an SVG document shaped like the screen (`aspect` = width /
 * height). White strokes: the CSS mask only uses their shape.
 */
function grainSvg(aspect: number, stroke = '#fff'): string {
  const W = Math.round(aspect >= 1 ? LONG : LONG * aspect);
  const H = Math.round(aspect >= 1 ? LONG / aspect : LONG);
  const nx = Math.floor(W / STEP) + 1;
  const ny = Math.floor(H / STEP) + 1;
  const h = field(W, H);
  const values = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = h(i * STEP, j * STEP);
  // Each ring gets its own weight, like ink lines drawn by hand: most about 1,
  // some thinner, a few a little heavier. Grouped so the SVG stays a few paths.
  const widths = [0.6, 0.85, 1.1, 1.45];
  const odds = [0.2, 0.3, 0.35, 0.15];
  const pickWidth = rng(29);
  const groups: string[][] = widths.map(() => []);
  // Evenly spaced rings from each band's outline in to its core; none in the calm space between.
  for (let level = 0.004; level < 1.3; level += 0.0165) {
    for (const line of contours(values, nx, ny, level)) {
      if (line.length < 4) continue; // crumbs from the wobble
      let roll = pickWidth();
      let w = 0;
      while (w < odds.length - 1 && roll > odds[w]) roll -= odds[w++];
      groups[w].push(pathOf(simplify(line, 0.7)));
    }
  }
  return (
    // Explicit size: without it browsers rasterise data-URL SVGs at a default size and crop them.
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<g fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round">` +
    groups.map((g, i) => (g.length ? `<path stroke-width="${widths[i]}" d="${g.join('')}"/>` : '')).join('') +
    `</g></svg>`
  );
}

/** Screen shapes are rounded to a few steps, so turning a phone or resizing a window rarely redraws. */
const SHAPES = [0.45, 0.6, 0.8, 1, 1.3, 1.6, 2];
const cache = new Map<number, string>();

const shapeFor = (aspect: number) =>
  SHAPES.reduce((best, s) => (Math.abs(Math.log(s / aspect)) < Math.abs(Math.log(best / aspect)) ? s : best));
const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

function grainUrl(aspect: number): string {
  const shape = shapeFor(aspect);
  if (!cache.has(shape)) cache.set(shape, svgUrl(grainSvg(shape)));
  return cache.get(shape)!;
}

/** The page's own background lines: --grain-color for each theme, baked into the strokes. */
const LINE_COLOURS = { dark: 'rgba(232,232,206,0.045)', light: 'rgba(121,67,65,0.1)' } as const;

/**
 * The same lines painted on the page itself (html), under the app. In the home-screen
 * app on iOS the app's layers can stop short of the bottom of the screen, leaving a strip
 * where only the page shows; with the lines on the page too, that strip matches the rest.
 * Placed exactly where #app::before's mask puts them (the same box, `cover`, centred).
 */
function paintPageLines(aspect: number): void {
  const root = document.documentElement;
  const shape = shapeFor(aspect);
  const screenH = parseFloat(getComputedStyle(root).getPropertyValue('--screen-h')) || innerHeight;
  const boxW = innerWidth, boxH = screenH + 120;                    // the layer: 60px past top and bottom
  const w = Math.max(boxW, boxH * shape), h = w / shape;            // cover
  root.style.setProperty('--page-lines-size', `${w}px ${h}px`);
  root.style.setProperty('--page-lines-pos', `${(boxW - w) / 2}px ${-60 + (boxH - h) / 2}px`);
  for (const theme of ['dark', 'light'] as const)
    root.style.setProperty(`--page-lines-${theme}`, svgUrl(grainSvg(shape, LINE_COLOURS[theme])));
}

/**
 * Puts the lines behind the app, and redraws them if the screen changes shape.
 * Drawing takes a few tens of milliseconds, so it waits until the browser is
 * idle: the splash (which covers the page) is never held up by it.
 */
export function applyGrain(): void {
  // The layer runs 60px past the top and bottom of the screen (styles.css).
  const apply = () => {
    const aspect = innerWidth / (innerHeight + 120);
    document.documentElement.style.setProperty('--grain', grainUrl(aspect));
    if (document.documentElement.classList.contains('standalone')) paintPageLines(aspect);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(apply, { timeout: 800 });
  else setTimeout(apply, 50);
  let timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(apply, 200);
  });
}
