import { expect, test, type Page } from '@playwright/test';
import { axe, settled, signedIn, topEdgeProblems } from './fixtures.ts';

/**
 * Founder tools (screens/founderConsole.ts): phones get the section list first, a section opens
 * full width and Back steps back to the list, then to Setup; wide screens get a sidebar beside
 * the open section. The server is faked; Setup's row needs a founder code given this session, so
 * the console is mounted directly.
 */

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const player = (name: string, extra: Record<string, unknown> = {}) => ({
  userId: `u-${name}`, name, email: `${name.toLowerCase()}@example.test`, elo: 1200, restricted: false, restrictedUntil: null,
  restrictionReason: null, toReview: 1, flagged: 1, decisions: 0, lastDecision: null, ...extra,
  games: [{ flagId: 1, at: day(-1), reason: 'copied', check: 'solve', leaps: 14, placements: 51, evidence: -3, potential: 2, validPuzzle: true, rating: 900, seconds: 312, reviewed: false, note: null }],
});
const PAGES: Record<string, unknown[]> = {
  open: [player('Marlowe'), player('Ottilie')],
  banned: [player('Rosalind', { restricted: true, restrictedUntil: day(12), restrictionReason: 'copied answers', toReview: 0 })],
  history: [],
};

async function openConsole(page: Page) {
  await signedIn(page);
  // the founder calls, on top of signedIn's fake server (routes added later are tried first)
  await page.route(/supabase\.co\/rest\/v1\/rpc\/(admin_review_page|admin_search|founders_shown|founder_activity|founder_status)/, (route) => {
    const fn = new URL(route.request().url()).pathname.split('/').pop();
    const body =
      fn === 'admin_review_page' ? { counts: { open: 2, banned: 1, history: 0 }, items: PAGES[JSON.parse(route.request().postData() || '{}').p_view] ?? [] }
      : fn === 'admin_search' ? [player('Rosalind', { restricted: true, toReview: 0, log: [] })]
      : fn === 'founders_shown' ? false
      : fn === 'founder_status' ? { founder: true, unlocked: true }
      : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/');
  await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  await page.evaluate(async () => {
    const { mount } = await import('/src/ui.ts');
    const { founderConsole } = await import('/src/screens/founderConsole.ts');
    mount(founderConsole());
  });
  await expect(page.locator('.screen.console')).toBeVisible();
}

test('phone: the section list, a section, and Back step by step', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openConsole(page);
  const title = page.locator('.subbar h1');
  await expect(title).toHaveText('Founder tools');
  await expect(page.getByRole('button', { name: /^To review 2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Banned 1/ })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(await topEdgeProblems(page, 'Founder tools')).toEqual([]);

  // by keyboard: a row is a real button
  await page.getByRole('button', { name: /^Banned/ }).focus();
  await page.keyboard.press('Enter');
  await expect(title).toHaveText('Banned');
  await expect(page.getByText(/until .+, 12 days left · copied answers/)).toBeVisible();
  expect(await axe(page)).toEqual([]);

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(title).toHaveText('Founder tools');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveTitle(/Setup/);
});

test('phone: the search opens a player from the first view', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openConsole(page);
  await page.getByRole('searchbox').first().fill('rosa');
  await page.keyboard.press('Enter');
  await expect(page.locator('.subbar h1')).toHaveText('Search');
  // one match opens straight away
  await expect(page.locator('.review-row.open')).toContainText('Rosalind');
  // clearing the search leaves it, back to the section list
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.subbar h1')).toHaveText('Founder tools');
});

test('wide: a sidebar beside the open section', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openConsole(page);
  await expect(page.locator('.screen.console')).toHaveClass(/is-wide/);
  // flags waiting: To review opens first, marked as the current section
  await expect(page.getByRole('button', { name: /^To review/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.console-pane-title')).toHaveText('To review');
  await page.getByRole('button', { name: /^Banned/ }).click();
  await expect(page.locator('.console-pane-title')).toHaveText('Banned');
  await expect(page.getByRole('button', { name: /^Banned/ })).toHaveAttribute('aria-current', 'page');
  // live: Review only, the dev tools and testers are beta's (migration beta_testers)
  await expect(page.getByRole('button', { name: /^(Dev mode|Stardust and parts|Testers)/ })).toHaveCount(0);
  await settled(page);
  expect(await axe(page)).toEqual([]);
  expect(await topEdgeProblems(page, 'Founder tools, wide')).toEqual([]);
});
