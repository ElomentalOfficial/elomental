import { expect, test } from '@playwright/test';
import { settled, signedIn } from './fixtures.ts';

/**
 * Name plates are kept (wear_plates): on the Forge every plate you own stays yours, the one
 * equipped says so, any other you own is a button that equips it, and "Unequip plate" takes it
 * off. The sample player owns Bronze, Silver and Gold and has Silver equipped; the server is
 * faked (fixtures.ts signedIn), so this checks the page and what it asks the server for.
 */
test('a plate you own can be equipped again, and unequipped', async ({ page }) => {
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
  await page.locator('.profile-forge').click();
  await expect(page.locator('.plate-card').first()).toBeVisible();

  // Silver is equipped: not a button, and it says so
  const silver = page.locator('.plate-card-2');
  await expect(silver).toHaveClass(/state-yours/);
  await expect(silver).toHaveAttribute('aria-label', /Silver name plate\. Equipped\./);
  expect(await silver.evaluate((el) => el.tagName)).toBe('DIV');
  // Bronze and Gold are owned: buttons that equip them, with no price
  for (const [n, name] of [[1, 'Bronze'], [3, 'Gold']] as const) {
    await expect(page.getByRole('button', { name: `${name} name plate. Equip.` })).toBeVisible();
    await expect(page.locator(`.plate-card-${n} .plate-price`)).toHaveCount(0);
  }
  // Diamond is the next one to get; Starforged comes after it
  await expect(page.locator('.plate-card-4')).toHaveAttribute('aria-label', /Diamond name plate\. .*9000 Stardust/);
  await expect(page.locator('.plate-card-5')).toHaveAttribute('aria-label', /After Diamond/);

  // a double tap equips once, and focus lands on the plate equipped
  await page.getByRole('button', { name: 'Bronze name plate. Equip.' }).dblclick();
  await expect(page.locator('.toast')).toContainText('Your name now has the Bronze plate.');
  await expect(page.locator('.plate-card-1')).toBeFocused();
  await page.getByRole('button', { name: 'Unequip plate' }).click();
  await expect(page.locator('.forge-plates .forge-heading')).toBeFocused();
  await expect.poll(() => asked).toEqual([{ p_plate: 1 }, { p_plate: 0 }]);
});
