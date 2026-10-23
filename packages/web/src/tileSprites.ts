/**
 * Home's tile sprites (owner, 2026-10-23): behind each tile's name, an abstract Art Deco
 * composition in the Facet style (diamonds, lozenges, 45° rules, chevrons, dot grids, steps), each
 * tile built its own way, in grunge hairlines (every stroke worn into uneven dashes, a few dropped,
 * some fainter), like old print. The sunburst appears once, on Daily.
 *
 * Each composition is laid out from the tile's real size and the name's place in it (so it fits a
 * wide row, a square and a tall tile alike); the tile's own seed places the wear, so it looks
 * random but never changes. A mask keeps every line off the frame's four corner ornaments and
 * clear of the name.
 */
export type Area = 'daily' | 'casual' | 'ranked' | 'forge' | 'store' | 'leader' | 'setup';

const SVG = 'http://www.w3.org/2000/svg';
/** The room kept round the name, in px. */
const CLEAR = 8;
const SEEDS: Record<Area, number> = { daily: 31, casual: 11, ranked: 21, forge: 41, store: 71, leader: 51, setup: 61 };

/** A seeded random number generator (mulberry32): the same seed, the same composition. */
function seeded(seed: number): () => number {
  let s = Math.imul(seed, 0x9e3779b9) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v: number) => v.toFixed(1);
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The pen a composition draws with, in px. Every stroke is worn: walked in uneven dashes with
 * small gaps, about one dash in twelve dropped, a quarter of the rest in the fainter ink.
 */
function pen(seed: number) {
  const rnd = seeded(seed);
  let strong = '';
  let faint = '';
  /** Wears a stroke `len` px long, traced by `at(t)` for t from 0 to 1. */
  const wear = (len: number, at: (t: number) => [number, number]) => {
    for (let s = 0; s < len; ) {
      const dash = Math.min(len - s, 3 + rnd() * 8);
      if (rnd() > 0.08) {
        const steps = Math.max(1, Math.ceil(dash / 3));
        let d = '';
        for (let k = 0; k <= steps; k++) {
          const [x, y] = at((s + (dash * k) / steps) / len);
          d += `${k ? 'L' : 'M'}${n(x)} ${n(y)}`;
        }
        if (rnd() < 0.25) faint += d;
        else strong += d;
      }
      s += dash + 0.6 + rnd() * 1.2;
    }
  };
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    wear(Math.hypot(x2 - x1, y2 - y1), (t) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
  /** A path through points. */
  const steps = (points: [number, number][]) => points.slice(1).forEach(([x, y], k) => line(points[k][0], points[k][1], x, y));
  /** A ray out from (cx, cy) at `a` degrees (0 is right, 90 down), from r1 to r2 px out. */
  const ray = (cx: number, cy: number, a: number, r1: number, r2: number) =>
    line(cx + Math.cos(rad(a)) * r1, cy + Math.sin(rad(a)) * r1, cx + Math.cos(rad(a)) * r2, cy + Math.sin(rad(a)) * r2);
  const diamond = (x: number, y: number, rx: number, ry = rx) => steps([[x, y - ry], [x + rx, y], [x, y + ry], [x - rx, y], [x, y - ry]]);
  const dot = (x: number, y: number) => (strong += `M${n(x - 0.6)} ${n(y)}h1.2`);
  return { line, steps, ray, diamond, dot, ink: () => ({ strong, faint }) };
}

type Pen = ReturnType<typeof pen>;
/**
 * Where a composition is drawn: the tile's size, its inner edge (in from the frame's lines), its
 * shorter side, and the name's box with its clearance (x, y, width, height).
 */
type Box = { w: number; h: number; i: number; m: number; name: { x: number; y: number; w: number; h: number } };
type Compose = (p: Pen, b: Box) => void;

/**
 * Facet (Deco jewellery, Monument Valley geometry; owner's pick, 2026-10-23): diamonds, lozenges,
 * 45° rules, chevrons, dot grids and steps, but every tile built its own way, so no two repeat.
 */
const COMPOSITIONS: Record<Area, Compose> = {
  // Daily: a faceted sunrise, nested chevrons rising from the floor and rays round them (the one
  // sunburst), a small gem over it
  daily: (p, { w, h, i, m }) => {
    const cx = w / 2;
    const floor = h - i;
    for (const s of [0.1, 0.17, 0.24, 0.31]) p.steps([[cx - m * s, floor], [cx, floor - m * s], [cx + m * s, floor]]);
    for (let a = 202.5; a < 360; a += 22.5) p.ray(cx, floor, a, m * 0.36, m * (a % 45 ? 0.44 : 0.54));
    p.diamond(cx, floor - m * 0.62, 2.5);
  },
  // Casual: the name inside nested lozenges, rules from their points to the edges, dots in a facet
  casual: (p, { w, h, i, m, name }) => {
    const cx = name.x + name.w / 2;
    const cy = name.y + name.h / 2;
    const s = Math.max(4, m * 0.04);
    let a = 0;
    let b = 0;
    for (let k = 1; k <= 3; k++) {
      a = (name.w / 2 + s * k) * 1.45;
      b = (name.h / 2 + s * k) * 1.45;
      p.diamond(cx, cy, a, b);
    }
    p.line(i, cy, cx - a - 4, cy);
    p.line(cx + a + 4, cy, w - i, cy);
    p.line(cx, i, cx, cy - b - 4);
    p.line(cx, cy + b + 4, cx, h - i);
    for (const [x, y] of [[cx - a, cy], [cx + a, cy], [cx, cy - b], [cx, cy + b]]) p.diamond(x, y, 2.5);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) p.dot(cx + a * 0.55 + c * 6, cy + b * 0.55 + r * 6);
  },
  // Ranked: a column of chevrons climbing the middle to a gem at the top, a 45° X crossing behind it
  ranked: (p, { w, h, i, m }) => {
    const cx = w / 2;
    const cy = h / 2;
    const reach = Math.max(w, h) / 2;
    p.line(cx - reach, cy - reach, cx + reach, cy + reach);
    p.line(cx + reach, cy - reach, cx - reach, cy + reach);
    const gap = Math.max(7, m * 0.07);
    for (let y = h - i - 2; y > i + gap; y -= gap) p.steps([[cx - m * 0.1, y], [cx, y - m * 0.05], [cx + m * 0.1, y]]);
    p.diamond(cx, i + 3, 2.5);
  },
  // Forge: a gem chain, one spine through the name, nested gems at either end, small ones between
  forge: (p, { w, h, i, name }) => {
    const cy = name.y + name.h / 2;
    const r = (h - 2 * i) * 0.36;
    const ends = [i + r + 4, w - i - r - 4];
    p.line(i, cy, name.x - 4, cy);
    p.line(name.x + name.w + 4, cy, w - i, cy);
    for (const x of ends) for (const k of [0.4, 0.7, 1]) p.diamond(x, cy, r * k);
    p.diamond((ends[0] + r + name.x) / 2, cy, 3);
    p.diamond((ends[1] - r + name.x + name.w) / 2, cy, 3);
  },
  // Store: a harlequin lattice of crossing diagonals filling the side beside the name, a dot where
  // they cross
  store: (p, { w, h, i, name }) => {
    const x0 = name.x + name.w + 6;
    const x1 = w - i;
    const top = i;
    const floor = h - i;
    const cell = 10;
    // rising lines (y = floor - (x - c)) and falling ones (y = top + (x - c)), each kept to the side
    for (let c = x0 - (floor - top); c < x1; c += cell) {
      for (const rising of [true, false]) {
        const t0 = Math.max(0, x0 - c);
        const t1 = Math.min(floor - top, x1 - c);
        if (t1 <= t0) continue;
        if (rising) p.line(c + t0, floor - t0, c + t1, floor - t1);
        else p.line(c + t0, top + t0, c + t1, top + t1);
      }
    }
    for (let c = x0 - (floor - top); c < x1; c += cell) {
      for (let d = x0 - (floor - top); d < x1; d += cell) {
        const x = (floor - top + c + d) / 2;
        const y = floor - (x - c);
        if (x > x0 + 2 && x < x1 - 2 && y > top + 2 && y < floor - 2) p.dot(x, y);
      }
    }
  },
  // Leaderboard: a stepped pyramid, a ziggurat under the name where the tile has room below it, or
  // its steps climbing either side of the name where it hasn't; a dot grid high on the left
  leader: (p, { w, h, i, name }) => {
    const cx = w / 2;
    const floor = h - i;
    const levels = 4;
    const below = floor - (name.y + name.h + 2);
    // under the name: from the floor up to the name, wide at the base, narrow at the top
    const under = below >= 24;
    const rise = under ? below / levels : (floor - Math.max(i, name.y - 6)) / levels;
    const top = under ? Math.min(name.w / 2, (w / 2 - i) * 0.35) : name.w / 2 + 4;
    const run = Math.min(under ? (w / 2 - i - top) / levels : Math.max(6, rise * 1.2), Math.max(4, (w / 2 - i - top) / levels));
    const points: [number, number][] = [[cx - top - levels * run, floor]];
    for (let k = 1; k <= levels; k++) {
      const x = cx - top - (levels - k + 1) * run;
      points.push([x, floor - rise * (k - 1)], [x + run, floor - rise * (k - 1)], [x + run, floor - rise * k]);
    }
    const right = points.map(([x, y]) => [2 * cx - x, y] as [number, number]).reverse();
    p.steps([...points, ...right]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) p.dot(i * 2.5 + c * 6, i + 4 + r * 6);
  },
  // Setup: a zig-zag frieze along the top and the bottom, a small gem set in the middle of each,
  // the name left open between them
  setup: (p, { w, h, i }) => {
    const cx = w / 2;
    const rise = 4;
    const run = 8;
    for (const [y, flip] of [[i + 2, 1], [h - i - 2, -1]] as const) {
      const points: [number, number][] = [];
      for (let x = i, k = 0; x <= w - i; x += run / 2, k++) points.push([x, y + (k % 2 ? rise * flip : 0)]);
      p.steps(points);
      p.diamond(cx, y + rise * flip * 2.2, 2.5);
    }
  },
};

/**
 * Draws a tile's composition behind its name, and again whenever the tile changes size. Waits
 * for the tile's own animations (the turnstile) to settle first, so the name is measured where it
 * rests. `name` finds what the lines keep clear of.
 */
export function decorateTile(tile: HTMLElement, area: Area, name: () => Element): void {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'tile-sprite');
  svg.setAttribute('aria-hidden', 'true');
  tile.prepend(svg);
  const draw = () => {
    if (!tile.isConnected) return;
    const moving = tile.getAnimations().filter((a) => a.playState === 'running' || a.pending);
    if (moving.length) return void Promise.allSettled(moving.map((a) => a.finished)).then(draw);
    const w = tile.clientWidth;
    const h = tile.clientHeight;
    if (!w || !h) return;
    const box = tile.getBoundingClientRect();
    const scale = w / box.width;
    const at = name().getBoundingClientRect();
    const style = getComputedStyle(tile);
    const corner = (parseFloat(style.getPropertyValue('--frame-corner')) || 30) * (parseFloat(style.getPropertyValue('--frame-zoom')) || 1);
    // the name's box with its clearance: the lines frame it and the mask keeps them out of it
    const hole = {
      x: (at.left - box.left) * scale - CLEAR,
      y: (at.top - box.top) * scale - CLEAR,
      w: at.width * scale + 2 * CLEAR,
      h: at.height * scale + 2 * CLEAR,
    };
    const p = pen(SEEDS[area]);
    COMPOSITIONS[area](p, { w, h, i: corner * 0.4, m: Math.min(w, h), name: hole });
    const { strong, faint } = p.ink();
    const corners = [[0, 0], [w - corner, 0], [0, h - corner], [w - corner, h - corner]]
      .map(([x, y]) => `<rect x="${n(x)}" y="${n(y)}" width="${n(corner)}" height="${n(corner)}"/>`)
      .join('');
    const id = `tile-sprite-${area}`;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML =
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/>` +
      `<g fill="#000">${corners}<rect x="${n(hole.x)}" y="${n(hole.y)}" width="${n(hole.w)}" height="${n(hole.h)}" rx="${CLEAR}"/></g></mask>` +
      `<g mask="url(#${id})" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="${strong}"/><path d="${faint}" opacity="0.5"/></g>`;
  };
  new ResizeObserver(draw).observe(tile);
}
