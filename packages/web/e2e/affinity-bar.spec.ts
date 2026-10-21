import { expect, test } from '@playwright/test';
import { settled, signedIn } from './fixtures.ts';

/**
 * The affinity bar on the Leaderboard never relies on colour alone: each segment wide enough
 * carries its element's glyph (phones show the bar without much room for the legend, and Fire
 * and Earth look alike to protanopes). The server is faked (fixtures.ts signedIn).
 */

const SHOTS = process.env.AFFINITY_SHOTS;

test('each affinity segment shows its glyph where it fits, and drops it where it does not', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript((t) => localStorage.setItem('elomental:theme', JSON.stringify(t)), info.project.name);
  await signedIn(page);
  await page.goto('/');
  await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  await settled(page);
  await page.locator('.tile.area-leader').click();
  const bar = page.locator('.lb-faction .lb-strength');
  await expect(bar).toBeVisible({ timeout: 15_000 });
  const glyphs = bar.locator('.seg-glyph');
  await expect(glyphs).toHaveCount(4);
  for (const glyph of await glyphs.all()) await expect(glyph).toBeVisible();
  // the glyph is drawn in the element's own text colour, not left to inherit
  const colours = await bar.locator('.strength-seg').evaluateAll((segs) => segs.map((s) => getComputedStyle(s).color));
  expect(new Set(colours).size).toBeGreaterThan(1);
  if (SHOTS) await page.locator('.lb-faction').screenshot({ path: `${SHOTS}/affinity-bar-${info.project.name}.png` });
  // a sliver of a share: no room for the glyph, so it goes
  await bar.locator('.strength-seg').first().evaluate((s) => ((s as HTMLElement).style.flexGrow = '0.2'));
  await expect(bar.locator('.strength-seg').first().locator('.seg-glyph')).toBeHidden();
});
