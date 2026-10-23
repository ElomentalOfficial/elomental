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
