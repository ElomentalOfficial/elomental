/**
 * Bakes the Forge icon (build_forge.py's two SVGs) to the WebPs the Home tile uses,
 * trimmed to the drawing, 3x the widest tile size. Chromium draws the brush filters
 * (stipple, grain) once here, so every browser shows the same pixels.
 *
 *   python scripts/forge-icon/build_forge.py <tmp dir>
 *   node scripts/forge-icon/render.ts <tmp dir> src/art
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out] = process.argv.slice(2);
const WIDTH = 330; // px: 3x the desktop tile's 110
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
for (const theme of ['dark', 'light']) {
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${readFileSync(join(dir, `forge-${theme}.svg`), 'utf8')}`);
  // the drawing's bounds (the grain group), a few units of air round it
  const box = await page.evaluate(() => {
    const b = (document.querySelector('svg > g') as SVGGElement).getBBox();
    return { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 };
  });
  const scale = WIDTH / box.width;
  const shot = await browser.newPage({ viewport: { width: Math.ceil(box.width), height: Math.ceil(box.height) }, deviceScaleFactor: scale });
  await shot.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${readFileSync(join(dir, `forge-${theme}.svg`), 'utf8').replace('viewBox="0 0 400 400" width="400" height="400"', `viewBox="${box.x} ${box.y} ${box.width} ${box.height}" width="${box.width}" height="${box.height}"`)}`);
  const png = await shot.screenshot({ omitBackground: true });
  // PNG to WebP in the page's own encoder, alpha kept
  const webp = await shot.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.9).split(',')[1];
  }, png.toString('base64'));
  writeFileSync(join(out, `forge-${theme}.webp`), Buffer.from(webp, 'base64'));
  await shot.close();
  console.log(theme, Math.round(box.width * scale), 'x', Math.round(box.height * scale));
}
await browser.close();
