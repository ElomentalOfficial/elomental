import { expect, test, type Page } from '@playwright/test';
import { axe, DEVICES, problems, settled, signedIn, SIZES } from './fixtures.ts';

/**
 * The signed-in screens (full review H6, L34): Profile, the Forge and a part's sheet, the
 * Leaderboard with its affinities sheet, ranks and a player's card, and the affinity choice,
 * at every Text size on phones and tablets: nothing runs out of its box or off the screen.
 * The server is faked (fixtures.ts signedIn); nothing live is touched.
 */

const PHONES_AND_TABLETS = DEVICES.filter((d) => d.width < 1100);

async function open(page: Page, textSize: number, affinity?: string | null) {
  await signedIn(page, { textSize, affinity });
  await page.goto('/');
  // The splash turns away by itself after a moment; skip it if it's still there.
  await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
}

/** Goes back with the page's Back button until Home shows (at most a few pages). */
async function home(page: Page) {
  for (let i = 0; i < 4 && !(await page.locator('.tile.area-casual').isVisible()); i++) {
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await settled(page);
  }
  await expect(page.locator('.tile.area-casual')).toBeVisible();
}

async function sheet(page: Page, open: () => Promise<void>, where: string, found: string[]) {
  await open();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('h2, h3').first()).toBeVisible();
  found.push(...(await problems(page, where)));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}

for (const device of PHONES_AND_TABLETS) {
  for (const size of SIZES) {
    test(`${device.name}, text ${size}%: the signed-in screens fit`, async ({ page }, info) => {
      test.skip(info.project.name === 'light', 'layout is the same in both themes');
      test.setTimeout(120_000);
      await page.setViewportSize({ width: device.width, height: device.height });
      await open(page, size);
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      const found: string[] = [];
      found.push(...(await problems(page, 'Home')));

      await page.locator('.tile-setup:visible, .tile.area-setup:visible').first().click();
      await expect(page).toHaveTitle(/Setup/);
      found.push(...(await problems(page, 'Setup')));
      await page.locator('.setting', { hasText: 'Leaderboard and card' }).getByRole('button').click();
      await expect(page).toHaveTitle(/Leaderboard and card/);
      found.push(...(await problems(page, 'Leaderboard and card')));
      await home(page);

      await page.locator('.avatar-btn').click();
      await expect(page.locator('.profile-forge')).toBeVisible();
      found.push(...(await problems(page, 'Profile')));
      await page.locator('.profile-forge').click();
      await expect(page.locator('.part-card').first()).toBeVisible();
      found.push(...(await problems(page, 'Forge')));
      await sheet(page, () => page.locator('.part-card').first().click(), 'Part sheet', found);
      await sheet(page, () => page.locator('.plate-card-4').click(), 'Plate sheet', found);
      await home(page);

      await page.locator('.tile.area-leader').click();
      await expect(page.locator('.lb-row-btn').first()).toBeVisible();
      found.push(...(await problems(page, 'Leaderboard')));
      await sheet(page, () => page.getByRole('button', { name: 'Details', exact: true }).click(), 'Factions sheet', found);
      await sheet(page, () => page.getByRole('button', { name: 'Ranks', exact: true }).click(), 'Ranks sheet', found);
      await sheet(page, () => page.locator('.lb-row-btn').first().click(), 'Player card', found);

      expect(found).toEqual([]);
    });

    test(`${device.name}, text ${size}%: the affinity choice fits`, async ({ page }, info) => {
      test.skip(info.project.name === 'light', 'layout is the same in both themes');
      await page.setViewportSize({ width: device.width, height: device.height });
      await open(page, size, null);
      // Home asks with one line on the profile card (full review M13), never by taking over;
      // where the card has no room for it (small phones) the Profile asks instead
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      await settled(page);
      if (!(await page.getByRole('button', { name: /^Choose your faction/ }).isVisible())) await page.locator('.avatar-btn').click();
      await page.getByRole('button', { name: /^Choose your faction/ }).click();
      await expect(page.locator('.affinity-card').first()).toBeVisible({ timeout: 15_000 });
      expect(await problems(page, 'Affinity')).toEqual([]);
    });
  }
}

test('the signed-in screens pass axe', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, 100);
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  const found: string[] = [];
  const check = async (where: string) => found.push(...(await axe(page)).map((v) => `${where}: ${v}`));
  await page.locator('.avatar-btn').click();
  await expect(page.locator('.profile-forge')).toBeVisible();
  await check('Profile');
  await page.locator('.profile-forge').click();
  await expect(page.locator('.part-card').first()).toBeVisible();
  await check('Forge');
  await home(page);
  await page.locator('.tile.area-leader').click();
  await expect(page.locator('.lb-row-btn').first()).toBeVisible();
  await check('Leaderboard');
  await page.locator('.lb-row-btn').first().click();
  await expect(page.getByRole('dialog').locator('h2').first()).toBeVisible();
  await check('Player card');
  expect(found).toEqual([]);
});

test('Home: the name and rank only, Spirits only once there is one, the Store still to come', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, 100);
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  // 930 Elo: the rank under the name, and no next-step line under it (owner, 2026-10-21)
  await expect(page.locator('.profile-rank')).toHaveText('Adept');
  await expect(page.locator('.home-line')).toHaveCount(0);
  // the fixture has 1 Spirit: three chips, the numbers on one line
  await expect(page.locator('.stat-chip:visible')).toHaveCount(3);
  await settled(page); // the tiles have turned in
  const tops = await page.locator('.stat-chip strong').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await page.getByRole('button', { name: 'Store', exact: true }).click();
  await expect(page.getByText('The Store opens soon.')).toBeVisible();
});

test('Home: the month your side won shows once, then never again', async ({ page }) => {
  await signedIn(page, { monthWon: true });
  await page.goto('/');
  await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Fire won September' })).toBeVisible();
  await page.getByRole('button', { name: 'See your badges' }).click();
  // the Profile opens at its badges, the focus on their heading
  await expect(page.locator('.card-badges h2')).toBeFocused();
  await expect(page.locator('.card-badges h2')).toBeInViewport();
  await home(page);
  await page.reload();
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  await page.waitForTimeout(1_500);
  await expect(page.getByRole('heading', { name: 'Fire won September' })).toHaveCount(0);
});
