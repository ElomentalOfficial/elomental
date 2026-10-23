/**
 * The sunburst behind a hero icon (docs/DESIGN_SYSTEM.md, background ornaments): 36 hairline rays,
 * long and short in turn, each broken into two or three dashes by one of a few patterns (never the
 * same twice in a row), drawn in a 400-unit circle that banner.css stretches to the oval each
 * place gives it (--rays-w, --rays-h), so the tips stay off the text around it.
 */
const RAY_DASHES = [
  [[0, 0.55], [0.63, 0.8], [0.87, 1]],
  [[0, 0.3], [0.38, 1]],
  [[0, 0.72], [0.8, 1]],
  [[0.08, 0.45], [0.54, 0.62], [0.7, 1]],
];
const RAYS_MASK = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 36; i++) {
    const a = (i * Math.PI) / 18;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const from = 100;
    const to = from + 98 * (i % 2 ? 0.62 : 1);
    for (const [s, e] of RAY_DASHES[(i * 3) % RAY_DASHES.length]) {
      const r1 = from + (to - from) * s;
      const r2 = from + (to - from) * e;
      lines.push(`M${(200 + dx * r1).toFixed(1)} ${(200 + dy * r1).toFixed(1)}L${(200 + dx * r2).toFixed(1)} ${(200 + dy * r2).toFixed(1)}`);
    }
  }
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="none"><path d="${lines.join('')}" stroke="#000" stroke-width="1.3" fill="none"/></svg>`,
  )}")`;
})();

/** Puts the sunburst behind an element (centred on it, in its text colour) and returns it. */
export function withRays<T extends HTMLElement>(el: T): T {
  el.classList.add('rays');
  el.style.setProperty('--rays', RAYS_MASK);
  return el;
}

/**
 * A sunburst stamp of its own (the Home letters): the same hairline, broken rays, but the seed
 * picks how many, their turn, the long/short rhythm and where each one breaks, so no two letters
 * share a stamp and the same seed always draws the same one. A 200-unit square, rays from 42 to
 * at most 98 units out, 1px hairlines in currentColor; `centre`, an image drawn half as wide in
 * the middle, so the two always keep one ratio. The caller sizes it and sets the rays' faintness.
 */
export function rayStamp(seed: number, centre?: string): string {
  // mulberry32: neighbouring seeds give unrelated stamps
  let s = Math.imul(seed, 0x9e3779b9) >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const count = [24, 28, 32, 36, 40][Math.floor(rnd() * 5)];
  const turn = rnd() * ((2 * Math.PI) / count);
  const rhythm = [2, 3, 4][Math.floor(rnd() * 3)];
  const shortLen = 0.45 + rnd() * 0.3;
  const from = 42 + rnd() * 6;
  const reach = 86 + rnd() * 12;
  // some stamps draw their long rays as twin hairlines, like a pinstripe
  const twin = rnd() < 0.4;
  const lines: string[] = [];
  const ray = (a: number, r1: number, r2: number) =>
    lines.push(`M${(100 + Math.cos(a) * r1).toFixed(1)} ${(100 + Math.sin(a) * r1).toFixed(1)}L${(100 + Math.cos(a) * r2).toFixed(1)} ${(100 + Math.sin(a) * r2).toFixed(1)}`);
  for (let i = 0; i < count; i++) {
    const a = turn + (i * 2 * Math.PI) / count;
    const long = i % rhythm === 0;
    const to = from + (reach - from) * (long ? 1 : shortLen);
    // two or three dashes, the gaps placed at random along the ray
    const cuts = rnd() < 0.5 ? [0.25 + rnd() * 0.5] : [0.2 + rnd() * 0.25, 0.55 + rnd() * 0.3];
    let start = 0;
    for (const c of [...cuts, 1]) {
      const r1 = from + (to - from) * start;
      const r2 = from + (to - from) * (c === 1 ? 1 : c - 0.04);
      if (twin && long) {
        ray(a - 0.012, r1, r2);
        ray(a + 0.012, r1, r2);
      } else ray(a, r1, r2);
      start = c + 0.04;
    }
  }
  // one hairline at every size, so a small stamp's rays don't thin out and a big one's don't thicken
  const image = centre ? `<image href="${centre}" x="50" y="50" width="100" height="100"/>` : '';
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><path d="${lines.join('')}" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" fill="none"/>${image}</svg>`;
}
