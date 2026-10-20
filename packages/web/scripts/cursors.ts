/**
 * Renders the gem cursors (src/assets/cursors/*.svg) to the PNGs the app uses: 32 px and 64 px
 * (for 2x screens), transparent. PNG because every browser takes it as a cursor; SVG cursors
 * are blurry or ignored in some. Run after changing an SVG:
 *
 *   node scripts/cursors.ts
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../src/assets/cursors/', import.meta.url);
const browser = await chromium.launch();
for (const name of ['gem', 'gem-lit']) {
  const svg = readFileSync(new URL(`${name}.svg`, dir), 'utf8');
  for (const scale of [1, 2]) {
    const page = await browser.newPage({ viewport: { width: 32, height: 32 }, deviceScaleFactor: scale });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    const png = await page.locator('svg').screenshot({ omitBackground: true });
    writeFileSync(new URL(`${name}${scale === 2 ? '@2x' : ''}.png`, dir), png);
    await page.close();
  }
}
await browser.close();
console.log('cursors rendered');
