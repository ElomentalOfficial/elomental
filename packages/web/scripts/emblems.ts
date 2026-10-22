/**
 * Renders the factions' full-colour emblems (the owner's art,
 * manual_assets/faction_assets/<element>colors_.svg) to the PNGs the crests use
 * (src/art/elements/<element>.png), 320 px square, transparent. PNG because the art's bevel is
 * an SVG filter that Firefox draws with a white fringe at the edges; baked once in Chromium,
 * every browser shows the same pixels. Run after changing the art:
 *
 *   node scripts/emblems.ts
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const src = new URL('../../../manual_assets/faction_assets/', import.meta.url);
const out = new URL('../src/art/elements/', import.meta.url);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 100, height: 100 }, deviceScaleFactor: 3.2 });
for (const element of ['fire', 'water', 'earth', 'air']) {
  const svg = readFileSync(new URL(`${element}colors_.svg`, src)).toString('base64');
  await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:100px;height:100px}</style><img src="data:image/svg+xml;base64,${svg}">`);
  await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  writeFileSync(new URL(`${element}.png`, out), await page.locator('img').screenshot({ omitBackground: true }));
}
await browser.close();
console.log('emblems rendered');
