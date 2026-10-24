import { expect, test, type Page } from '@playwright/test';
import { axe, DEVICES, openPrivacy, problems, settled, signedIn, SIZES } from './fixtures.ts';

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

      await page.locator('.tile.area-setup').first().click();
      await expect(page).toHaveTitle(/Setup/);
      found.push(...(await problems(page, 'Setup')));
      await openPrivacy(page);
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
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      // (a wide screen's Profile has a door for them)
      await page.locator('.plates-row, .plates-door').first().click();
      await expect(page.locator('.plate-card').first()).toBeVisible();
      found.push(...(await problems(page, 'Name plates')));
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
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('.plates-row').click();
  await expect(page.locator('.plate-card').first()).toBeVisible();
  await check('Name plates');
  await home(page);
  await page.locator('.tile.area-leader').click();
  await expect(page.locator('.lb-row-btn').first()).toBeVisible();
  await check('Leaderboard');
  await page.locator('.lb-row-btn').first().click();
  await expect(page.getByRole('dialog').locator('h2').first()).toBeVisible();
  await check('Player card');
  expect(found).toEqual([]);
});

test('Home: the card holds you, your Level and Elo, your badges; the Forge tile your purse', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, 100);
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  // 930 Elo: the rank under the name, and no next-step line under it (owner, 2026-10-21)
  await expect(page.locator('.profile-rank .rank-name')).toHaveText('Adept');
  await expect(page.locator('.home-line')).toHaveCount(0);
  // the account level in a cell of its own (1200 XP: level 11), the plate holds the name alone
  await expect(page.locator('.pc-level')).toHaveText(/Level\s*11/);
  await expect(page.locator('.pc-elo')).toHaveText(/Elo\s*930/);
  await expect(page.locator('.profile-card .plate-medal')).toHaveCount(0);
  // the faction, a third tile beside Elo and Level, read as its caption and name
  await expect(page.locator('.pc-faction:not(.pc-choose)')).toHaveText(/Faction\s*Fire/);
  await expect(page.getByRole('button', { name: 'Choose your faction' })).toBeHidden();
  // no badges chosen: the newest two, an empty socket for the third
  // each slot a button to the badge choice: the newest two badges, and a "+" to add one
  await expect(page.getByRole('button', { name: /\. Change the badges on your card$/ })).toHaveCount(2);
  const add = page.getByRole('button', { name: 'Add a badge to your card' });
  await expect(add).toHaveCount(1);
  await settled(page); // the tiles have turned in
  await add.click();
  const choice = page.getByRole('dialog', { name: 'Badges on your card' });
  await expect(choice.locator('.badge-pick')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(choice).toBeHidden();
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  // the Forge tile carries its name alone, like every tile
  await expect(page.locator('.tile.area-forge')).toHaveAccessibleName('Forge');
  await settled(page); // the tiles have turned in
  await page.getByRole('button', { name: 'Store', exact: true }).click();
  await expect(page.getByText('The Store opens soon.')).toBeVisible();
});

test('Forge: blueprints forge at their price, the rest at the full one', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, 100);
  await page.locator('.tile.area-forge').click();
  await expect(page.locator('.part-card').first()).toBeVisible();
  // the fixture holds a Common avatar blueprint (free) and an Epic frame blueprint (200)
  const bored = page.locator('.part-card', { hasText: 'Bored' });
  await expect(bored).toHaveAccessibleName(/Blueprint: ready to forge/);
  await bored.click();
  await expect(page.getByRole('dialog')).toContainText('Free with your blueprint');
  await page.keyboard.press('Escape');
  await page.locator('.part-card', { hasText: 'Epic Frame' }).click();
  await expect(page.getByRole('dialog')).toContainText('With your blueprint: 200 Stardust');
  await page.keyboard.press('Escape');
  // the worn frame's marks: 57 wins, 1 mark, 17 toward the next
  const worn = page.locator('.part-card', { hasText: 'Gold Frame' });
  await expect(worn).toHaveAccessibleName(/1 of 3 marks, 17 of 40 wins to the next/);
  await worn.click();
  await expect(page.getByRole('dialog')).toContainText('1 of 3 marks. 17 of 40 wins to the next.');
  await page.keyboard.press('Escape');
  // gilding: a gilded frame says so; one with 3 marks offers Gild at its price
  await expect(page.locator('.part-card', { hasText: 'Bronze Frame' })).toHaveAccessibleName(/Gilded/);
  await page.locator('.part-card', { hasText: 'Silver Frame' }).click();
  await expect(page.getByRole('button', { name: 'Gild for 1000 Stardust' })).toBeEnabled();
  await page.keyboard.press('Escape');
  // a part without one: the full price
  await page.locator('.part-card', { hasText: 'Mythic Frame' }).click();
  await expect(page.getByRole('dialog')).toContainText('1800 Stardust');
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
