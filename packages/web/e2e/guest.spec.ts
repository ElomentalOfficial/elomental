import { expect, test } from '@playwright/test';
import { axe, settled, signedIn } from './fixtures.ts';

/**
 * A guest account (anonymous, no email yet; full review H8, M19): never listed, so the
 * Leaderboard's bar says so and offers Sign up; the Profile shows the guest's own name and a
 * way to sign up. The server is faked (fixtures.ts signedIn).
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signedIn(page, { anonymous: true });
  await page.goto('/');
  await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page.locator('.tile.area-casual')).toBeVisible();
});

test('a guest is told they aren’t listed, and Sign up opens the form', async ({ page }) => {
  await settled(page);
  await page.locator('.tile.area-leader').click();
  await expect(page).toHaveTitle(/Leaderboard/);
  const bar = page.getByRole('region', { name: 'You' });
  await expect(bar).toContainText('Guests aren’t listed. Sign up to get your place.', { timeout: 15_000 });
  await bar.getByRole('button', { name: 'Sign up' }).click();
  const sheet = page.getByRole('dialog', { name: 'Get your place' });
  await expect(sheet.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(sheet).toContainText('Played before? Use the same email to sign in.');
  expect(await axe(page)).toEqual([]);
});

test('a guest’s Profile shows their name and a way to sign up', async ({ page }) => {
  await settled(page);
  await page.locator('.avatar-btn').click();
  await expect(page.locator('.profile-plate')).toContainText('Wilhelmina.Ashcombe');
  await page.getByRole('button', { name: 'Sign up with email' }).click();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
});
