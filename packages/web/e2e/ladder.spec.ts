import { expect, test } from '@playwright/test';
import { axe, settled, signedIn } from './fixtures.ts';

/**
 * The Ranked ladder (ranked_ladder): ranks without divisions, the bar to the next rank, the
 * one-time word on a new technique family, and the comeback square. The fixture player is at
 * 930 Elo, Adept, on the stage that brings in X-Wings and XY-Wings. The server is faked
 * (fixtures.ts signedIn).
 */

const SHOTS = process.env.LADDER_SHOTS;

async function open(page: import('@playwright/test').Page, lossRun = 0) {
  await page.setViewportSize({ width: 375, height: 812 });
  await signedIn(page, { lossRun });
  await page.goto('/');
  await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  await settled(page);
}

test('the Ranked sheet names the rank and, once, the new technique family', async ({ page }) => {
  await open(page);
  await page.locator('.tile.area-ranked').click();
  const sheet = page.getByRole('dialog', { name: 'Ranked' });
  await expect(sheet).toContainText('Adept · 930 Elo');
  await expect(sheet.getByRole('heading', { name: 'New in your Ranked squares' })).toBeVisible();
  await expect(sheet).toContainText('an X-⁠Wing or an XY-⁠Wing');
  await expect(sheet).not.toContainText('a step easier');
  expect(await axe(page)).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ranked-sheet.png` });
  // Start tells this phone it has seen it (the faked server starts nothing, so it's back Home)
  await sheet.getByRole('button', { name: 'Start' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('elomental:techniques-seen'))).toBe('["wings","pairs","pointing"]');
  await page.reload();
  await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page.locator('.tile.area-ranked')).toBeVisible();
  await settled(page);
  await page.locator('.tile.area-ranked').click();
  await expect(page.getByRole('dialog', { name: 'Ranked' })).toContainText('Adept · 930 Elo');
  await expect(page.getByRole('heading', { name: 'New in your Ranked squares' })).toHaveCount(0);
});

test('after two losses in a row the Ranked sheet says the square is a step easier', async ({ page }) => {
  await open(page, 2);
  await page.locator('.tile.area-ranked').click();
  await expect(page.getByRole('dialog', { name: 'Ranked' })).toContainText('After two losses in a row, this square is a step easier.');
});

test('the Profile shows the rank and a bar to the next one', async ({ page }) => {
  await open(page);
  await page.locator('.avatar-btn').click();
  await expect(page.locator('.profile-tier')).toContainText('Adept');
  const next = page.locator('.profile-next-rank');
  await expect(next).toContainText('70 Elo to Archmage');
  // 930 is 330 of Adept's 400: the bar is that far along, and hidden from screen readers
  const share = await next.locator('.rank-bar span').evaluate((el) => parseFloat((el as HTMLElement).style.width));
  expect(share).toBe(83);
  await expect(next.locator('.rank-bar')).toHaveAttribute('aria-hidden', 'true');
  expect(await axe(page)).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/profile.png` });
});

test('the Ranks sheet lists the five ranks, Elomental at the top', async ({ page }) => {
  await open(page);
  await page.locator('.tile.area-leader').click();
  await page.getByRole('button', { name: 'Ranks', exact: true }).click();
  const sheet = page.getByRole('dialog');
  const names = await sheet.locator('.tier-name strong').allTextContents();
  expect(names).toEqual(['Elomental', 'Archmage', 'Adept', 'Apprentice', 'Novice']);
  await expect(sheet).toContainText('70 Elo to Archmage');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ranks.png` });
});
