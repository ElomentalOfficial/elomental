/**
 * The walls of Home's profile card (owner, 2026-10-22: "the Forge Link"). The card is a sudoku
 * box: its outline is the tile's own Art Deco frame, and these walls part its cells in the same
 * ink, weight and wear, each wall built its own way and ended, where it meets the frame, in a
 * motif from the tile corners' family (art/frames: the wheel band, rings, the fluted block, the
 * chamfered band, the pendant gem). A wall that meets another stops just short of it; nothing is
 * drawn on a crossing. The faction hangs from the frame as a banner built of the same lines.
 *
 * Pure: it takes the cells' boxes (px, from the card's top left) and returns SVG markup in
 * currentColor; home.css gives the colour (the frame's ink) and the faintness.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CardLayout {
  width: number;
  height: number;
  /** One unit of the tile frame's 40-unit corner, in px (its size / 40). */
  unit: number;
  portrait: Box;
  name: Box;
  level: Box;
  elo: Box;
  badges: Box;
  /** The faction's banner: its width in px, or 0 for none. */
  banner: number;
}

/** The frame's wear: long dashes broken by short gaps, in frame units (the corners' own pattern). */
const WEAR = [11, 1.6, 7, 1.2, 16, 2, 9, 1.4];

interface Wall {
  o: 'h' | 'v';
  /** where it runs across (y for a horizontal wall, x for a vertical one) */
  at: number;
  /** from and to, along it */
  a: number;
  b: number;
  style: keyof typeof STYLES;
  /** terminals at its start (top or left) and end, where those meet the frame */
  ends: [Terminal | null, Terminal | null];
  /** a crossing: the lower rank gives way */
  rank: number;
}
type Terminal = keyof typeof TERMS;

/** A drawing context: one unit's size, and an offset that keeps each line's wear out of step. */
function pen(u: number) {
  const n = (v: number) => (v * u).toFixed(2);
  const scaled = (path: string) => path.replace(/-?\d+(\.\d+)?/g, (v) => n(Number(v)));
  const dash = WEAR.map((w) => (w * u).toFixed(2)).join(' ');
  let offset = 0;
  const lw = 1.3 * u;
  const worn = (d: string, w = lw) =>
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w.toFixed(2)}" stroke-dasharray="${dash}" stroke-dashoffset="${((offset += 13.7) * u).toFixed(1)}"/>`;
  const solid = (d: string) => `<path d="${d}" fill="currentColor"/>`;
  const dot = (x: number, y: number, r: number) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="currentColor"/>`;
  const gem = (x: number, y: number, r: number) => solid(scaled(`M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z`));
  const arc = (r: number) => `M${n(r)} 0 A${n(r)} ${n(r)} 0 0 1 ${n(-r)} 0 `;
  const ray = (deg: number, r1: number, r2: number) => {
    const t = (deg * Math.PI) / 180;
    return `M${n(r1 * Math.cos(t))} ${n(r1 * Math.sin(t))} L${n(r2 * Math.cos(t))} ${n(r2 * Math.sin(t))} `;
  };
  return { u, lw, n, scaled, worn, solid, dot, gem, arc, ray };
}
type Pen = ReturnType<typeof pen>;

/**
 * How each wall is built: drawn along x from 0 to L (px) about y 0. `hw` is half its width, the
 * room a crossing wall leaves for it.
 */
const STYLES = {
  // the frame's own pair, drawn in to a chamfered waist over the middle badge: the floor
  pinched: {
    hw: (p: Pen) => 3 * p.u,
    draw: (p: Pen, L: number) => {
      const g = 3 * p.u, a = L * 0.4, b = L * 0.6, h = g * 0.35, s = (g - h) * 1.6;
      return p.worn(`M0 ${-g} H${a} L${a + s} ${-h} H${b - s} L${b} ${-g} H${L} M0 ${g} H${a} L${a + s} ${h} H${b - s} L${b} ${g} H${L}`);
    },
  },
  // one fine line strung with a few small gems: under you
  beaded: {
    hw: (p: Pen) => 1.4 * p.u,
    draw: (p: Pen, L: number) => {
      let out = p.worn(`M0 0 H${L}`, p.lw * 0.65);
      const count = Math.max(2, Math.round(L / (44 * p.u)));
      for (let i = 1; i < count; i++) {
        const x = (L * i) / count, r = 1.3 * p.u;
        out += p.solid(`M${x - r} 0 L${x} ${-r} L${x + r} 0 L${x} ${r} Z`);
      }
      return out;
    },
  },
  // a fine pair, close together: beside your portrait
  fineDouble: {
    hw: (p: Pen) => 1.8 * p.u,
    draw: (p: Pen, L: number) => p.worn(`M0 ${-1.6 * p.u} H${L} M0 ${1.6 * p.u} H${L}`, p.lw * 0.6),
  },
  // one fine line: Level and Elo apart
  fine: {
    hw: (p: Pen) => p.u,
    draw: (p: Pen, L: number) => p.worn(`M0 0 H${L}`, p.lw * 0.65),
  },
};

/** Terminals, drawn on the frame line (y 0) reaching into the card (y down); `reach` in units. */
const TERMS = {
  // the profile corner's banded half wheel, a rivet on the frame
  wheel: {
    reach: 14,
    draw: (p: Pen) => {
      let d = p.arc(9) + p.arc(14);
      for (let a = 15; a < 180; a += 15) d += p.ray(a, 9, 14);
      return p.worn(d) + p.dot(0, 0, 2.2);
    },
  },
  // the Casual corner's rings
  rings: { reach: 14, draw: (p: Pen) => p.worn(p.arc(5) + p.arc(9.5) + p.arc(14)) + p.dot(0, 0, 1.6) },
  // a fluted block on the frame, a bar the wall rests on
  capital: {
    reach: 13,
    draw: (p: Pen) => p.worn(p.scaled('M-11 0 V10 H11 V0 M-5.5 0 V7 M0 0 V7 M5.5 0 V7 M-7 13 H7')) + p.dot(-8.5, 11.5, 1) + p.dot(8.5, 11.5, 1),
  },
  // the Store corner's chamfered band with rungs, and its gem
  chamfer: {
    reach: 12,
    draw: (p: Pen) =>
      p.worn(p.scaled('M-15 0 L-8 12 H8 L15 0 M-9 0 L-4.5 7 H4.5 L9 0 M-12.67 4 L-7.5 2.33 M-10.33 8 L-6 4.67 M-8 12 L-4.5 7 M12.67 4 L7.5 2.33 M10.33 8 L6 4.67 M8 12 L4.5 7')) +
      p.gem(0, 3.2, 2),
  },
  // a gem hung on a short stem, a rivet either side
  pendant: {
    reach: 14,
    draw: (p: Pen) => p.worn(p.scaled('M0 0 V4 M0 4 L5 9 L0 14 L-5 9 Z')) + p.gem(0, 9, 2) + p.dot(-6, 2.6, 1.2) + p.dot(6, 2.6, 1.2),
  },
};

/** The banner: a rod on the frame line with gem ends, an outline coming to a point with a step
    inside its tip, a gem below it (62 × 96 units of its own, scaled to `w`); the emblem fills its
    upper part (BANNER_EMBLEM). */
function banner(p: Pen, cx: number, top: number, w: number): string {
  const s = w / 62;
  const k = (path: string) => path.replace(/-?\d+(\.\d+)?/g, (v) => (Number(v) * s).toFixed(2));
  return `<g transform="translate(${(cx - w / 2).toFixed(1)} ${(top - 6 * s).toFixed(1)})">` +
    p.worn(k('M2 6 H60'), p.lw * 1.1) +
    p.solid(k('M2 2.5 L5.5 6 L2 9.5 L-1.5 6 Z M60 2.5 L63.5 6 L60 9.5 L56.5 6 Z')) +
    p.worn(k('M10 8 V70 L31 86 L52 70 V8')) +
    p.worn(k('M19 66 L31 75 L43 66'), p.lw * 0.75) +
    p.solid(k('M31 87.5 L34.5 91 L31 94.5 L27.5 91 Z')) +
    '</g>';
}
/** Where the emblem sits on the banner, in its units: inside the outline (10 to 52), above the step. */
export const BANNER_EMBLEM = { size: 34, top: 20 };

/** Where the banner hangs (its centre and top, px) and how far down it reaches, for the layout. */
export function bannerPlace(width: number, unit: number, w: number): { cx: number; top: number; bottom: number } {
  const frame = 11 * unit;
  // clear of the corner's ornament (40 units square), a little air beside it
  const cx = width - 40 * unit - 2 * unit - w / 2;
  return { cx, top: frame, bottom: frame + (88.5 / 62) * w };
}

const sideBySide = (a: Box, b: Box) => a.right <= b.left + 0.5;

export function cardWalls(c: CardLayout): string {
  const p = pen(c.unit);
  const E = 11 * c.unit, W = c.width, H = c.height;
  const walls: Wall[] = [];
  const topBottom = Math.max(c.portrait.bottom, c.name.bottom);
  const pairTop = Math.min(c.level.top, c.elo.top), pairBottom = Math.max(c.level.bottom, c.elo.bottom);
  const yMid = (topBottom + pairTop) / 2, yFloor = (pairBottom + c.badges.top) / 2;
  // the floor: you above it, your badges below
  walls.push({ o: 'h', at: yFloor, a: E, b: W - E, style: 'pinched', ends: ['capital', 'chamfer'], rank: 0 });
  // under you: you and your name above, Level and Elo below
  walls.push({ o: 'h', at: yMid, a: E, b: W - E, style: 'beaded', ends: ['rings', 'wheel'], rank: 1 });
  // beside your portrait, when your name sits beside it (at large text it sits under it)
  if (sideBySide(c.portrait, c.name)) walls.push({ o: 'v', at: (c.portrait.right + c.name.left) / 2, a: E, b: yMid, style: 'fineDouble', ends: ['pendant', null], rank: 2 });
  // Level and Elo apart
  if (sideBySide(c.level, c.elo)) walls.push({ o: 'v', at: (c.level.right + c.elo.left) / 2, a: yMid, b: yFloor, style: 'fine', ends: [null, null], rank: 3 });

  // a corner's ornament reaches 40 units in: no terminal inside it
  const clear = (x: number, y: number) => !((x < 46 * c.unit || x > W - 46 * c.unit) && (y < 46 * c.unit || y > H - 46 * c.unit));
  const AIR = 1.8 * c.unit;
  const cuts = walls.map(() => [] as [number, number][]);
  walls.forEach((w, i) => {
    for (const other of walls) {
      if (other === w || other.o === w.o) continue;
      const onW = other.at, onOther = w.at;
      if (onW < w.a - 0.5 || onW > w.b + 0.5 || onOther < other.a - 0.5 || onOther > other.b + 0.5) continue;
      const wEnds = Math.abs(onW - w.a) < 0.5 || Math.abs(onW - w.b) < 0.5;
      const otherEnds = Math.abs(onOther - other.a) < 0.5 || Math.abs(onOther - other.b) < 0.5;
      const room = STYLES[other.style].hw(p) + AIR;
      if (wEnds || (!otherEnds && w.rank > other.rank)) cuts[i].push([onW - room, onW + room]);
    }
  });

  let marks = '', lines = '', defs = '';
  walls.forEach((w, i) => {
    const limit = w.o === 'v' ? H - E : W - E;
    ([[w.a, Math.abs(w.a - E) < 0.5, w.o === 'v' ? 0 : -90, 1], [w.b, Math.abs(w.b - limit) < 0.5, w.o === 'v' ? 180 : 90, -1]] as const).forEach(([pos, atFrame, rot, dir], j) => {
      const name = w.ends[j];
      const x = w.o === 'v' ? w.at : pos, y = w.o === 'v' ? pos : w.at;
      if (!name || !atFrame || !clear(x, y)) return;
      const reach = TERMS[name].reach * c.unit;
      cuts[i].push(dir > 0 ? [pos - 4 * c.unit, pos + reach] : [pos - reach, pos + 4 * c.unit]);
      marks += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})">${TERMS[name].draw(p)}</g>`;
    });
    const span = STYLES[w.style].hw(p) + 2.5 * c.unit;
    const holes = cuts[i].map(([c0, c1]) => (w.o === 'v'
      ? `<rect x="${(w.at - span).toFixed(1)}" y="${c0.toFixed(1)}" width="${(2 * span).toFixed(1)}" height="${(c1 - c0).toFixed(1)}" fill="black"/>`
      : `<rect x="${c0.toFixed(1)}" y="${(w.at - span).toFixed(1)}" width="${(c1 - c0).toFixed(1)}" height="${(2 * span).toFixed(1)}" fill="black"/>`)).join('');
    defs += `<mask id="pc-wall-${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="white"/>${holes}</mask>`;
    const body = STYLES[w.style].draw(p, w.b - w.a);
    const place = w.o === 'h' ? `translate(${w.a.toFixed(1)} ${w.at.toFixed(1)})` : `translate(${w.at.toFixed(1)} ${w.a.toFixed(1)}) rotate(90)`;
    lines += `<g mask="url(#pc-wall-${i})"><g transform="${place}">${body}</g></g>`;
  });
  if (c.banner) {
    const b = bannerPlace(W, c.unit, c.banner);
    marks += banner(p, b.cx, b.top, c.banner);
  }
  return `<defs>${defs}</defs>${lines}${marks}`;
}
