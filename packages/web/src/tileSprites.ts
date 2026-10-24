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
  /** An elliptical arc round (cx, cy), radii rx and ry, from a0 to a1 degrees (0 right, 90 down). */
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) =>
    wear((Math.abs(rad(a1 - a0)) * (rx + ry)) / 2, (t) => [cx + Math.cos(rad(a0 + (a1 - a0) * t)) * rx, cy + Math.sin(rad(a0 + (a1 - a0) * t)) * ry]);
  return { line, steps, ray, diamond, dot, arc, ink: () => ({ strong, faint }) };
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
  // Store: a Deco fan of nested arcs at either end, opening toward the name, a spine from each
  // fan to the name with a small gem where it leaves the fan
  store: (p, { w, h, i, name }) => {
    const cy = name.y + name.h / 2;
    const r = (h - 2 * i) * 0.46;
    p.line(i + r + 4, cy, name.x - 4, cy);
    p.line(name.x + name.w + 4, cy, w - i - r - 4, cy);
    for (const k of [0.45, 0.72, 1]) {
      p.arc(i, cy, r * k, r * k, -90, 90);
      p.arc(w - i, cy, r * k, r * k, 90, 270);
    }
    p.diamond(i + r + 4, cy, 3);
    p.diamond(w - i - r - 4, cy, 3);
  },
  // Leaderboard: a medal. With room under the name, two ribbon bands fall in a V from the top to
  // one medal there (nested rings, a gem at the heart); in a short tile, where there's none, a
  // smaller medal hangs on each side of the name from its own short ribbon (owner, 2026-10-24)
  leader: (p, { w, h, i, name }) => {
    const cx = w / 2;
    const floor = h - i;
    const below = floor - (name.y + name.h);
    const medal = (x: number, y: number, r: number) => {
      p.arc(x, y, r, r, 0, 360);
      p.arc(x, y, r * 0.7, r * 0.7, 0, 360);
      p.diamond(x, y, r * 0.3);
    };
    const r = Math.min(below * 0.42, (w - 2 * i) * 0.16);
    if (r >= 12) {
      const my = name.y + name.h + 4 + r;
      for (const off of [0, 7]) {
        p.line(cx - w * 0.28 - off, i, cx - r * 0.6, my - r * 0.8);
        p.line(cx + w * 0.28 + off, i, cx + r * 0.6, my - r * 0.8);
      }
      medal(cx, my, r);
      return;
    }
    // beside the name: as large as the side's room allows, a little low, its ribbon a narrow V
    // from the top edge to the medal's shoulders
    const side = name.x - i;
    const rs = Math.min((h - 2 * i) * 0.3, (side - 6) / 2);
    if (rs < 6) return;
    const my = h / 2 + rs * 0.35;
    for (const s of [-1, 1]) {
      const x = cx + s * (name.w / 2 + 4 + rs);
      for (const d of [-1, 1]) p.line(x + d * rs * 0.95, i, x + d * rs * 0.45, my - rs * 0.9);
      medal(x, my, rs);
    }
  },
  // Setup: a dial, the name in a nested octagon with short ticks round it, the long ones at the
  // eight points, and a rule out to each side where the tile is wide enough
  setup: (p, { w, h, i, name }) => {
    const cx = name.x + name.w / 2;
    const cy = name.y + name.h / 2;
    const oct = (a: number, b: number): [number, number][] =>
      Array.from({ length: 9 }, (_, k) => [cx + Math.cos(rad(22.5 + 45 * k)) * a, cy + Math.sin(rad(22.5 + 45 * k)) * b]);
    const tick = (a: number, b: number, from: number, to: (k: number) => number) => {
      for (let k = 0; k < 16; k++) {
        const [c, s] = [Math.cos(rad(k * 22.5)), Math.sin(rad(k * 22.5))];
        p.line(cx + c * (a + from), cy + s * (b + from), cx + c * (a + to(k)), cy + s * (b + to(k)));
      }
    };
    // the outer ticks reach 17 px past the inner octagon: all of it kept inside the tile
    const a = Math.min(name.w / 2 + 16, w / 2 - i - 17);
    const b = Math.min(name.h / 2 + 14, h / 2 - i - 17);
    if (a < name.w / 2 + 4 || b < name.h / 2 + 4) {
      // a small tile, no room round the name: the dial drawn out at the tile's rim instead, one
      // octagon with its ticks pointing in
      const ra = w / 2 - i - 2;
      const rb = h / 2 - i - 2;
      p.steps(oct(ra, rb));
      tick(ra, rb, -3, (k) => (k % 2 ? -6 : -9));
      return;
    }
    p.steps(oct(a, b));
    p.steps(oct(a + 7, b + 7));
    tick(a, b, 10, (k) => (k % 2 ? 13 : 17));
    if (cx - a - 21 > i + 8) {
      p.line(i, cy, cx - a - 21, cy);
      p.line(cx + a + 21, cy, w - i, cy);
    }
  },
};

/**
 * Where an element inside a tile sits, in the tile's own px, from layout alone (offsets, through
 * any zoomed box between): the turnstile's swing and the press tilt are transforms, which layout
 * ignores, so the name can be measured the moment the tile is laid out, mid-swing or not.
 */
export function placeIn(tile: HTMLElement, el: HTMLElement): { x: number; y: number; w: number; h: number } {
  // the zoom on a box and every box between it and `until` (not counting `until`)
  const zoomTo = (from: HTMLElement, until: Element | null) => {
    let z = 1;
    for (let at: HTMLElement | null = from; at && at !== until; at = at.parentElement) z *= parseFloat(getComputedStyle(at).zoom) || 1;
    return z;
  };
  // an offset is in the unzoomed units of its own box: each step scaled by the zoom between it
  // and its offset parent (on wide screens a tile's face and the profile card's insides are zoomed)
  let x = 0;
  let y = 0;
  for (let at: HTMLElement | null = el; at && at !== tile; at = at.offsetParent as HTMLElement | null) {
    const z = zoomTo(at, at.offsetParent);
    x += at.offsetLeft * z;
    y += at.offsetTop * z;
  }
  const zoom = zoomTo(el, tile);
  return { x, y, w: el.offsetWidth * zoom, h: el.offsetHeight * zoom };
}

/**
 * Draws a tile's composition behind its name as soon as the tile is laid out (before it is first
 * painted, so it never appears over the tile afterwards), and again whenever the tile changes
 * size. `name` finds what the lines keep clear of.
 */
export function decorateTile(tile: HTMLElement, area: Area, name: () => HTMLElement): void {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'tile-sprite');
  svg.setAttribute('aria-hidden', 'true');
  tile.prepend(svg);
  const draw = () => {
    const w = tile.clientWidth;
    const h = tile.clientHeight;
    if (!w || !h) return;
    const at = placeIn(tile, name());
    const style = getComputedStyle(tile);
    const corner = (parseFloat(style.getPropertyValue('--frame-corner')) || 30) * (parseFloat(style.getPropertyValue('--frame-zoom')) || 1);
    // the name's box with its clearance: the lines frame it and the mask keeps them out of it
    const hole = { x: at.x - CLEAR, y: at.y - CLEAR, w: at.w + 2 * CLEAR, h: at.h + 2 * CLEAR };
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
