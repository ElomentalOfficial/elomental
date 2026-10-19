import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/**
 * The button in a sign-in email opens the app with a one-time token
 * (supabase/templates/build.mjs). The auth server is faked: nothing is sent.
 */

const HANDOFF = '0b6c1f2e-4a5d-4e8f-9a1b-2c3d4e5f6a7b';

/** Opens the app as an email's button would, with the auth server answering `verify`. */
async function openFromEmail(page: Page, verify: { status: number; json: object }, redirect = 'https://elomental.online/') {
  const calls: string[] = [];
  const sent: { verify?: Record<string, unknown> } = {};
  await page.route(/supabase\.co/, (route) => {
    const url = route.request().url();
    calls.push(url.replace(/^.*supabase\.co/, ''));
    if (!url.includes('/auth/v1/verify')) return route.abort();
    sent.verify = route.request().postDataJSON();
    return route.fulfill(verify);
  });
  await page.addInitScript(() => localStorage.setItem('elomental:tutorial-done', 'true'));
  await page.goto(`/?token_hash=hash123&type=email&r=${encodeURIComponent(redirect)}`);
  await page.locator('.screen.welcome').click();
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  return { calls, sent };
}

test('an expired email link says so, clears the address bar, and only then starts a guest', async ({ page }) => {
  const { calls } = await openFromEmail(page, { status: 403, json: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } });
  await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  const verify = calls.findIndex((c) => c.startsWith('/auth/v1/verify'));
  const guest = calls.findIndex((c) => c.startsWith('/auth/v1/signup'));
  expect(verify).toBeGreaterThanOrEqual(0);
  // No guest account raced the link: it starts only after the link failed.
  if (guest >= 0) expect(guest).toBeGreaterThan(verify);
});

test('the token is sent as a token hash of the right type, also with a hand-off in the redirect', async ({ page }) => {
  const { sent } = await openFromEmail(page, { status: 403, json: { code: 403, msg: 'Token has expired or is invalid' } }, `https://elomental.online/?handoff=${HANDOFF}`);
  await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();
  expect(sent.verify).toMatchObject({ token_hash: 'hash123', type: 'email' });
  expect(new URL(page.url()).search).toBe('');
});
