/**
 * Home's tile sprites (owner, 2026-10-23): behind each tile's name, a small abstract Art Deco
 * composition of its own (fans of arcs, stepped lines, rules ending in diamonds and dots, hatching,
 * chevrons), in faint worn hairlines like the tiles' frames. Minimal, but never empty; the sunburst
 * appears once, on Daily, as a sunrise.
 *
 * Each composition is laid out from the tile's real size (so it fills a wide row, a square and a
 * tall tile alike), its breaks placed by a seed of its own, so it looks random but never changes.
 * A mask keeps every line off the frame's four corner ornaments and a gap clear of the name.
 */
export type Area = 'daily' | 'casual' | 'ranked' | 'forge' | 'store' | 'leader' | 'setup';

const SVG = 'http://www.w3.org/2000/svg';
/** The gap a break leaves, and the room kept round the name, in px. */
const GAP = 2;
const CLEAR = 8;

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

/** The pen a composition draws with: worn lines, arcs, diamonds and dots, in px. */
function pen(seed: number) {
  const rnd = seeded(seed);
  let d = '';
  /** A worn line: broken once (sometimes twice) at a random point. */
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < GAP * 4) return void (d += `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`);
    const cuts = rnd() < 0.6 ? [0.2 + rnd() * 0.6] : [0.15 + rnd() * 0.3, 0.55 + rnd() * 0.3];
    const gap = GAP / len / 2;
    let start = 0;
    for (const c of [...cuts, 1]) {
      const end = c === 1 ? 1 : c - gap;
      d += `M${n(x1 + (x2 - x1) * start)} ${n(y1 + (y2 - y1) * start)}L${n(x1 + (x2 - x1) * end)} ${n(y1 + (y2 - y1) * end)}`;
      start = c + gap;
    }
  };
  /** A path through points, each leg worn. */
  const steps = (points: [number, number][]) => points.slice(1).forEach(([x, y], i) => line(points[i][0], points[i][1], x, y));
  /** A worn arc round (cx, cy), clockwise from a1 to a2 degrees (0 is right, 90 down). */
  const arc = (cx: number, cy: number, r: number, a1: number, a2: number) => {
    const at = (a: number) => `${n(cx + r * Math.cos((a * Math.PI) / 180))} ${n(cy + r * Math.sin((a * Math.PI) / 180))}`;
    const cut = a1 + (a2 - a1) * (0.25 + rnd() * 0.5);
    const gap = ((GAP / r) * 180) / Math.PI / 2;
    for (const [s, e] of [[a1, cut - gap], [cut + gap, a2]]) d += `M${at(s)}A${n(r)} ${n(r)} 0 ${e - s > 180 ? 1 : 0} 1 ${at(e)}`;
  };
  const diamond = (x: number, y: number, r: number) => (d += `M${n(x)} ${n(y - r)}L${n(x + r)} ${n(y)}L${n(x)} ${n(y + r)}L${n(x - r)} ${n(y)}Z`);
  const dot = (x: number, y: number, r = 1.2) => (d += `M${n(x - r)} ${n(y)}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0`);
  return { line, steps, arc, diamond, dot, rnd, path: () => d };
}

type Pen = ReturnType<typeof pen>;
/** The tile's size, its inner edge (in from the frame's lines) and its shorter side. */
type Box = { w: number; h: number; i: number; m: number };

const COMPOSITIONS: Record<Area, { seed: number; draw: (p: Pen, b: Box) => void }> = {
  // Daily: the day's sun rising from the bottom edge (the one sunburst), the horizon ruled out to
  // either side, a plumb line with its diamond hanging from the top
  daily: {
    seed: 31,
    draw: (p, { w, h, i, m }) => {
      const cx = w / 2;
      const cy = h - i;
      p.arc(cx, cy, m * 0.07, 180, 360);
      p.arc(cx, cy, m * 0.12, 180, 360);
      for (let k = 0; k < 11; k++) {
        const a = ((195 + k * 15) * Math.PI) / 180;
        const to = m * (k % 2 ? 0.27 : 0.38);
        p.line(cx + Math.cos(a) * m * 0.16, cy + Math.sin(a) * m * 0.16, cx + Math.cos(a) * to, cy + Math.sin(a) * to);
      }
      p.line(i, cy, cx - m * 0.16, cy);
      p.line(cx + m * 0.16, cy, w - i, cy);
      p.line(i + w * 0.12, cy - 4, cx - m * 0.2, cy - 4);
      p.line(cx + m * 0.2, cy - 4, w - i - w * 0.12, cy - 4);
      p.diamond(cx, i + 4, 3);
      p.line(cx, i + 8, cx, i + h * 0.2);
      p.dot(cx, i + h * 0.2 + 4);
    },
  },
  // Casual: ripples spreading from the left, rules drawn in from the right ending in dots, a small
  // ringed dot low on the right
  casual: {
    seed: 11,
    draw: (p, { w, h, i, m }) => {
      const cy = h * 0.6;
      for (const r of [0.18, 0.27, 0.36, 0.45]) p.arc(i, cy, m * r, -72, 72);
      [0.44, 0.34, 0.24].forEach((len, k) => {
        const y = i + 6 + k * 5;
        p.line(w - i, y, w - i - w * len, y);
        p.dot(w - i - w * len - 4, y);
      });
      const ox = w - i - m * 0.16;
      const oy = h - i - m * 0.16;
      p.arc(ox, oy, m * 0.07, 0, 359);
      p.dot(ox, oy);
    },
  },
  // Ranked: chevrons climbing to a diamond at the top, a stepped ziggurat along the bottom, two
  // tall rules standing at the sides
  ranked: {
    seed: 21,
    draw: (p, { w, h, i, m }) => {
      const cx = w / 2;
      p.diamond(cx, i + 4, 3);
      for (let k = 0; k < 4; k++) {
        const y = i + 12 + k * 6;
        p.steps([[cx - m * 0.1, y + m * 0.06], [cx, y], [cx + m * 0.1, y + m * 0.06]]);
      }
      const base = h - i;
      const s = m * 0.06;
      p.steps([[i, base], [cx - 4 * s, base], [cx - 4 * s, base - s], [cx - 2 * s, base - s], [cx - 2 * s, base - 2 * s], [cx + 2 * s, base - 2 * s], [cx + 2 * s, base - s], [cx + 4 * s, base - s], [cx + 4 * s, base], [w - i, base]]);
      for (const x of [i + 8, w - i - 8]) {
        p.line(x, h * 0.3, x, h * 0.7);
        p.diamond(x, h * 0.3 - 4, 2.5);
        p.dot(x, h * 0.7 + 4);
      }
    },
  },
  // Forge: a fan opening from the left, a spine across the middle with two gems near the right, the
  // top and bottom ruled in short from the right
  forge: {
    seed: 41,
    draw: (p, { w, h, i }) => {
      const cy = h / 2;
      for (const r of [0.22, 0.32, 0.42]) p.arc(i, cy, h * r, -60, 60);
      p.line(i + h * 0.5, cy, w - i - h * 0.62, cy);
      p.diamond(w - i - h * 0.5, cy, h * 0.12);
      p.line(w - i - h * 0.38, cy, w - i - h * 0.3, cy);
      p.diamond(w - i - h * 0.2, cy, h * 0.08);
      p.line(w - i - h * 0.12, cy, w - i, cy);
      p.line(w * 0.55, i + 3, w - i - h * 0.2, i + 3);
      p.line(w * 0.6, h - i - 3, w - i - h * 0.3, h - i - 3);
      p.dot(w * 0.55 - 4, i + 3);
    },
  },
  // Store: two rings overlapping on the left, three upright rules on the right (the middle one
  // tallest), a long hairline along the bottom from a diamond
  store: {
    seed: 71,
    draw: (p, { w, h, i, m }) => {
      const r = m * 0.17;
      p.arc(i + r + 4, h / 2 - r * 0.3, r, 0, 359);
      p.arc(i + r * 2.1 + 4, h / 2 + r * 0.3, r, 0, 359);
      const x = w - i - m * 0.3;
      [0.28, 0.4, 0.28].forEach((half, k) => {
        p.line(x + k * 5, h / 2 - m * half, x + k * 5, h / 2 + m * half);
        p.dot(x + k * 5, h / 2 - m * half - 4);
      });
      p.diamond(w * 0.3, h - i - 2, 2.5);
      p.line(w * 0.3 + 5, h - i - 2, x - 8, h - i - 2);
    },
  },
  // Leaderboard: three columns rising on the right, hatching at 45° on the upper left, a rule along
  // the top ending in a dot
  leader: {
    seed: 51,
    draw: (p, { w, h, i, m }) => {
      const base = h - i;
      const col = m * 0.07;
      [0.42, 0.62, 0.32].forEach((tall, k) => {
        const x = w - i - m * 0.36 + k * (col + 4);
        p.steps([[x, base], [x, base - m * tall], [x + col, base - m * tall], [x + col, base]]);
      });
      // the hatching in a band just in from the left, clear of the frame's top corner
      const len = Math.min(h - 2 * i, m * 0.35);
      const cy = Math.min(h / 2, i * 1.75 + len / 2);
      for (let k = 0; k < 5; k++) {
        const x = i * 2.5 + 4 + k * 6;
        p.line(x, cy + len / 2, x + len, cy - len / 2);
      }
      p.line(w * 0.4, i + 3, w - i - m * 0.1, i + 3);
      p.dot(w * 0.4 - 4, i + 3);
    },
  },
  // Setup: a rule across the top with a diamond at its middle, a small fan opening below the name
  setup: {
    seed: 61,
    draw: (p, { w, h, i }) => {
      const cx = w / 2;
      p.line(i, i + 4, cx - 5, i + 4);
      p.diamond(cx, i + 4, 3);
      p.line(cx + 5, i + 4, w - i, i + 4);
      for (const r of [0.1, 0.17]) p.arc(cx, h - i, h * r, 200, 340);
      p.dot(cx, h - i - 2);
    },
  },
};

/**
 * Draws a tile's composition behind its name, and again whenever the tile changes size. Waits
 * for the tile's own animations (the turnstile) to settle first, so the name is measured where it
 * rests. `name` finds what the lines keep clear of (the name, and the Forge's purse under it).
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
    const { seed, draw: compose } = COMPOSITIONS[area];
    const p = pen(seed);
    compose(p, { w, h, i: corner * 0.4, m: Math.min(w, h) });
    // the mask: everything but the frame's corners and the name with room round it
    const hole = {
      x: (at.left - box.left) * scale - CLEAR,
      y: (at.top - box.top) * scale - CLEAR,
      w: at.width * scale + 2 * CLEAR,
      h: at.height * scale + 2 * CLEAR,
    };
    const corners = [[0, 0], [w - corner, 0], [0, h - corner], [w - corner, h - corner]]
      .map(([x, y]) => `<rect x="${n(x)}" y="${n(y)}" width="${n(corner)}" height="${n(corner)}"/>`)
      .join('');
    const id = `tile-sprite-${area}`;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML =
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/>` +
      `<g fill="#000">${corners}<rect x="${n(hole.x)}" y="${n(hole.y)}" width="${n(hole.w)}" height="${n(hole.h)}" rx="${CLEAR}"/></g></mask>` +
      `<path d="${p.path()}" mask="url(#${id})" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  new ResizeObserver(draw).observe(tile);
}
