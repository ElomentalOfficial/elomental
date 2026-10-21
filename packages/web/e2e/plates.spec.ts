import { expect, test } from '@playwright/test';
import { settled, signedIn } from './fixtures.ts';

/**
 * Name plates come with the level (level_plates): Profile > Name plates holds every plate, the
 * collected ones are buttons that equip them, the locked ones say the level that brings them,
 * the next with its XP to go. The sample player is level 11 (1200 XP): Riveted and Banded are
 * collected and Banded is worn; the server is faked (fixtures.ts signedIn), so this checks the
 * page and what it asks the server for.
 */
test('the plates the level brought can be equipped; the rest show the level they come at', async ({ page }) => {
  await signedIn(page);
  const asked: unknown[] = [];
  await page.route(/supabase\.co\/rest\/v1\/rpc\/wear_plate/, async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"plate":1}' });
  });
  await page.goto('/');
  await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  await settled(page);
  await page.locator('.avatar-btn').click();
  // the Profile's name carries the plate and the level
  await expect(page.locator('.profile-page .plate-medal').first()).toHaveAccessibleName('Level 11');
  await expect(page.locator('.plates-row')).toContainText('2 of 9');
  await page.locator('.plates-row').click();
  await expect(page).toHaveTitle(/Name plates/);

  // Banded is worn and says so
  await expect(page.getByRole('button', { name: 'Banded plate, equipped' })).toHaveAttribute('aria-pressed', 'true');
  // Blank and Riveted are collected: buttons that equip them
  for (const name of ['Blank', 'Riveted']) await expect(page.getByRole('button', { name: `${name} plate. Equip.` })).toBeVisible();
  // Cartouche is next (level 15), with its XP to go; Starforged is the top, at 100
  await expect(page.getByRole('group', { name: 'Cartouche plate, locked until level 15' })).toBeVisible();
  await expect(page.locator('.tier-card-3 .plate-next')).toHaveText('900 XP to go');
  await expect(page.getByRole('group', { name: 'Starforged plate, locked until level 100' })).toBeVisible();
  await expect(page.locator('.tier-card-4 .plate-next')).toHaveCount(0);

  // a double tap equips once, and focus stays on the plate pressed
  await page.getByRole('button', { name: 'Riveted plate. Equip.' }).dblclick();
  await expect(page.locator('.toast')).toContainText('Your name now has the Riveted plate.');
  await expect(page.locator('[data-plate="1"]')).toBeFocused();
  await expect.poll(() => asked).toEqual([{ p_plate: 1 }]);
});
