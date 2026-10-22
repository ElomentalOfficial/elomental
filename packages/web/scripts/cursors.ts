/**
 * Renders the gem cursors (src/assets/cursors/*.svg, drawn on a 32-unit grid) to the PNGs the
 * app uses: SIZE px and twice that (for 2x screens), transparent. PNG because every browser
 * takes it as a cursor; SVG cursors are blurry or ignored in some. The hotspot in base.css is
 * scaled to match (2 units in). Run after changing an SVG or the size:
 *
 *   node scripts/cursors.ts
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

/** The cursor's size in CSS px (owner, 2026-10-22: a little larger than the 32 it was). */
const SIZE = 40;

const dir = new URL('../src/assets/cursors/', import.meta.url);
const browser = await chromium.launch();
for (const name of ['gem', 'gem-lit']) {
  const svg = readFileSync(new URL(`${name}.svg`, dir), 'utf8');
  for (const scale of [1, 2]) {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: scale });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>${svg}`);
    const png = await page.locator('svg').screenshot({ omitBackground: true });
    writeFileSync(new URL(`${name}${scale === 2 ? '@2x' : ''}.png`, dir), png);
    await page.close();
  }
}
await browser.close();
console.log(`cursors rendered at ${SIZE}px`);
