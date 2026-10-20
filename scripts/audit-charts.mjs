// Charts for docs/AUDIT.md from docs/audit/sim-live.json and sim-proposal.json:
// Stardust held, parts owned and Elo over 180 days (median line, 10th–90th band), per persona.
// `node scripts/audit-charts.mjs` (needs the dev Playwright) → docs/audit/*.png
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const live = JSON.parse(readFileSync('docs/audit/sim-live.json', 'utf8'));
const prop = JSON.parse(readFileSync('docs/audit/sim-proposal.json', 'utf8'));
const COL = { casual: '#636945', regular: '#41668b', grinder: '#a85b37' };
const W = 720, H = 360, PAD = { l: 64, r: 120, t: 40, b: 44 };

function chart(title, series, { max, yFmt = (v) => v, log = false, lines = [] }) {
  const x = (d) => PAD.l + (d / 179) * (W - PAD.l - PAD.r);
  const yv = (v) => (log ? Math.log10(Math.max(v, 1)) / Math.log10(max) : v / max);
  const y = (v) => H - PAD.b - Math.min(1, yv(v)) * (H - PAD.t - PAD.b);
  const ticks = log ? [1, 10, 100, 1000, 10000, 100000].filter((t) => t <= max) : Array.from({ length: 5 }, (_, i) => Math.round((max * i) / 4));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Montserrat, sans-serif">
  <rect width="${W}" height="${H}" fill="#fffff5"/>
  <text x="${PAD.l}" y="24" font-size="15" font-weight="800" fill="#262721">${title}</text>`;
  for (const t of ticks) svg += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" stroke="#d8d8c4"/><text x="${PAD.l - 8}" y="${y(t) + 4}" font-size="11" text-anchor="end" fill="#55574a">${yFmt(t)}</text>`;
  for (const d of [0, 30, 60, 90, 120, 150, 179]) svg += `<text x="${x(d)}" y="${H - PAD.b + 18}" font-size="11" text-anchor="middle" fill="#55574a">${d === 179 ? 180 : d}</text>`;
  svg += `<text x="${(W - PAD.r + PAD.l) / 2}" y="${H - 6}" font-size="11" text-anchor="middle" fill="#55574a">days</text>`;
  for (const [label, v, color] of lines) svg += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" stroke="${color}" stroke-dasharray="4 4"/><text x="${W - PAD.r + 6}" y="${y(v) + 4}" font-size="10" fill="${color}">${label}</text>`;
  for (const [name, curve, dash] of series) {
    const c = COL[name];
    const band = curve.map((p, d) => `${x(d)},${y(p[2])}`).join(' ') + ' ' + curve.map((p, d) => `${x(d)},${y(p[0])}`).reverse().join(' ');
    if (!dash) svg += `<polygon points="${band}" fill="${c}" opacity="0.14"/>`;
    svg += `<polyline points="${curve.map((p, d) => `${x(d)},${y(p[1])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5" ${dash ? 'stroke-dasharray="6 4"' : ''}/>`;
  }
  const names = [...new Set(series.map((s) => s[0]))];
  names.forEach((n, i) => (svg += `<rect x="${W - PAD.r + 10}" y="${PAD.t + i * 20}" width="12" height="12" fill="${COL[n]}"/><text x="${W - PAD.r + 28}" y="${PAD.t + i * 20 + 10}" font-size="12" fill="#262721">${n}</text>`));
  if (series.some((s) => s[2])) svg += `<text x="${W - PAD.r + 10}" y="${PAD.t + names.length * 20 + 16}" font-size="10" fill="#55574a">dashed = proposal</text>`;
  return svg + '</svg>';
}
const P = ['casual', 'regular', 'grinder'];
const charts = {
  'stardust-live': chart('Stardust held, live rules (median, 10th–90th %)', P.map((n) => [n, live.personas[n].curves.stardust]), { max: 200000, log: true, yFmt: (v) => (v >= 1000 ? `${v / 1000}k` : v) }),
  'stardust-proposal': chart('Stardust held: live (solid) vs 3-part cap + sinks (dashed)', [...P.map((n) => [n, live.personas[n].curves.stardust]), ...P.map((n) => [n, prop.personas[n].curves.stardust, true])], { max: 200000, log: true, yFmt: (v) => (v >= 1000 ? `${v / 1000}k` : v) }),
  'parts-owned': chart('Season set collected, of 48 (live rules)', P.map((n) => [n, live.personas[n].curves.owned]), { max: 48, lines: [['full set', 48, '#794341']] }),
  'elo': chart('Elo over time (live rules)', P.map((n) => [n, live.personas[n].curves.elo]), { max: 3200, lines: [['Apprentice', 600, '#8a8b7a'], ['Adept', 1200, '#8a8b7a'], ['Elementalist', 2000, '#8a8b7a'], ['Archmage', 3000, '#8a8b7a']] }),
};
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
for (const [name, svg] of Object.entries(charts)) {
  await pg.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;800&display=swap" rel="stylesheet"></head><body style="margin:0">${svg}</body></html>`);
  await pg.evaluate(() => document.fonts.ready);
  await pg.locator('svg').screenshot({ path: `docs/audit/${name}.png` });
  console.log(name);
}
await b.close();
