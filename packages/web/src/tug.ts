import { reducedMotion } from './a11y.ts';
import { ELEMENT_PATHS } from './icons.ts';
import type { Element } from './profile.ts';

/**
 * The affinities' tug of war, drawn live (leaderboard.ts): each element sits in a corner
 * and pulls a rope tied to one knot in the middle. The knot is dragged towards the sides
 * that lead this month, by how far they lead; a strong side's rope is taut and keeps
 * reeling in, a weak side's sags and slips. The whole thing breathes and strains a little,
 * never still, never fast. Purely decorative (aria-hidden): the legend and the line under
 * it say the same in words. Still, at its final pose, with Reduce motion.
 */

const W = 320;
const H = 150;
const C = { x: W / 2, y: H / 2 };
const CORNER: Record<Element, { x: number; y: number }> = {
  fire: { x: 36, y: 34 },
  water: { x: W - 36, y: 34 },
  earth: { x: 36, y: H - 34 },
  air: { x: W - 36, y: H - 34 },
};
const ORDER: Element[] = ['fire', 'water', 'earth', 'air'];
const NS = 'http://www.w3.org/2000/svg';

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

export function tugOfWar(standings: { affinity: Element; standing: number }[]): SVGSVGElement {
  const sum = standings.reduce((n, s) => n + Math.max(0, Number(s.standing)), 0);
  const share: Record<Element, number> = { fire: 0.25, water: 0.25, earth: 0.25, air: 0.25 };
  if (sum > 0) for (const s of standings) share[s.affinity] = Math.max(0, Number(s.standing)) / sum;
  const leader = sum > 0 ? ORDER.reduce((a, b) => (share[b] > share[a] ? b : a)) : null;

  // where the knot settles: pulled from the middle towards each side by its share above a
  // fair quarter (strongly, so a 10% lead is plain to see), kept inside the field
  let tx = C.x;
  let ty = C.y;
  for (const e of ORDER) {
    tx += (CORNER[e].x - C.x) * (share[e] - 0.25) * 2.2;
    ty += (CORNER[e].y - C.y) * (share[e] - 0.25) * 2.2;
  }
  tx = Math.min(W - 70, Math.max(70, tx));
  ty = Math.min(H - 34, Math.max(34, ty));

  const svg = el('svg', { class: 'tug', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  const ropes = new Map<Element, { body: SVGPathElement; strands: SVGPathElement }>();
  const orbs = new Map<Element, SVGGElement>();
  const ropeLayer = el('g');
  const orbLayer = el('g');
  for (const e of ORDER) {
    const body = el('path', { class: `tug-rope el-${e}`, 'stroke-width': (3 + share[e] * 10).toFixed(1) });
    const strands = el('path', { class: 'tug-strands', 'stroke-width': (1 + share[e] * 4).toFixed(1) });
    ropeLayer.append(body, strands);
    ropes.set(e, { body, strands });
    const g = el('g', { class: `tug-orb el-${e}${e === leader ? ' lead' : ''}` });
    const r = 15 + share[e] * 16;
    g.append(el('circle', { r: r.toFixed(1) }));
    const mark = el('g', { transform: `translate(-12 -12)`, fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    for (const d of ELEMENT_PATHS[e]) mark.append(el('path', { d }));
    g.append(mark);
    orbLayer.append(g);
    orbs.set(e, g);
  }
  const knot = el('g', { class: 'tug-knot' });
  knot.append(el('circle', { r: 9 }), el('circle', { class: 'tug-knot-core', r: 4 }));
  svg.append(ropeLayer, orbLayer, knot);

  const pose = (t: number, settle: number) => {
    // the knot: eased out from the middle (a little past, then back), then straining
    const k = settle >= 1 ? 1 : 1 - Math.pow(1 - settle, 3) * Math.cos(settle * Math.PI * 1.5);
    const strain = settle >= 1 ? 1 : settle;
    let kx = C.x + (tx - C.x) * k;
    let ky = C.y + (ty - C.y) * k;
    if (leader) {
      // tugged towards the leader and let go, unevenly, as if the rope were really pulled
      const pull = (Math.sin(t * 1.7) * 0.6 + Math.sin(t * 2.9 + 1) * 0.4) * 3.2 * strain;
      kx += (CORNER[leader].x - kx) / 140 * pull * 4;
      ky += (CORNER[leader].y - ky) / 140 * pull * 4;
    }
    kx += Math.sin(t * 3.7) * 0.8 * strain;
    ky += Math.cos(t * 3.1) * 0.8 * strain;
    knot.setAttribute('transform', `translate(${kx.toFixed(2)} ${ky.toFixed(2)})`);

    for (const e of ORDER) {
      const o = CORNER[e];
      const s = share[e];
      // the orb leans back as it pulls (more for the strong), and breathes
      const lean = 2 + s * 8;
      const dx = o.x - kx;
      const dy = o.y - ky;
      const len = Math.hypot(dx, dy) || 1;
      const breathe = Math.sin(t * (1.2 + s * 2) + ORDER.indexOf(e)) * strain;
      const ox = o.x + (dx / len) * lean * (0.5 + 0.5 * breathe);
      const oy = o.y + (dy / len) * lean * (0.5 + 0.5 * breathe);
      orbs.get(e)!.setAttribute('transform', `translate(${ox.toFixed(2)} ${oy.toFixed(2)})`);
      // the rope: a weak side's sags (and sways), a strong side's is nearly straight
      const sag = (1 - Math.min(1, s * 2.2)) * 16 + Math.sin(t * 1.4 + ORDER.indexOf(e) * 1.7) * 3 * strain;
      const mx = (ox + kx) / 2 + (-dy / len) * sag * 0.3;
      const my = (oy + ky) / 2 + Math.abs(sag);
      const d = `M${ox.toFixed(1)} ${oy.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${kx.toFixed(1)} ${ky.toFixed(1)}`;
      const r = ropes.get(e)!;
      r.body.setAttribute('d', d);
      r.strands.setAttribute('d', d);
      // the twist runs towards the puller: faster for a stronger side
      r.strands.style.strokeDashoffset = (t * (6 + s * 40)).toFixed(1);
    }
  };

  if (reducedMotion()) {
    pose(0, 1);
    return svg;
  }
  const start = performance.now();
  const frame = (now: number) => {
    if (!svg.isConnected && now - start > 1000) return;
    if (reducedMotion()) {
      pose(0, 1);
    } else {
      const t = (now - start) / 1000;
      pose(t, Math.min(1, t / 1.8));
    }
    requestAnimationFrame(frame);
  };
  pose(0, 0);
  requestAnimationFrame(frame);
  return svg;
}
