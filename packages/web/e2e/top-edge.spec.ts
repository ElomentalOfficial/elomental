import { expect, test, type Page } from '@playwright/test';
import { openAccessibility, openPrivacy, settled, signedIn, topEdgeProblems } from './fixtures.ts';

/**
 * The top of every page (the owner's standing check): under the fixed header, nothing in a
 * scrolling body may be cut off at its top edge, the first control's focus ring included. On a
 * phone and on a wide screen, at 100% and 200% Text size.
 */

for (const { name, width, height } of [
  { name: 'phone', width: 375, height: 812 },
  { name: 'wide', width: 1280, height: 800 },
]) {
  for (const size of [100, 200]) {
    test(`${name}, text ${size}%: nothing is cut at the top of the Setup pages`, async ({ page }, info) => {
      test.skip(info.project.name === 'light', 'layout is the same in both themes');
      await page.setViewportSize({ width, height });
      await signedIn(page, { textSize: size });
      await page.goto('/');
      await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      await settled(page);
      const found: string[] = [];
      const check = async (where: string) => {
        await settled(page);
        found.push(...(await topEdgeProblems(page, where)));
      };
      const home = async (p: Page) => {
        for (let i = 0; i < 3 && !(await p.locator('.tile.area-casual').isVisible()); i++) {
          await p.getByRole('button', { name: 'Back', exact: true }).click();
          await settled(p);
        }
      };

      await page.locator('.tile.area-setup').first().click();
      await expect(page).toHaveTitle(/Setup/);
      await check('Setup');
      await openPrivacy(page);
      await expect(page).toHaveTitle(/Leaderboard and card/);
      await check('Leaderboard and card');
      await home(page);
      await settled(page);
      await page.locator('.tile.area-setup').first().click();
      await expect(page).toHaveTitle(/Setup/);
      await openAccessibility(page);
      await expect(page).toHaveTitle(/Accessibility/);
      await check('Accessibility');
      await home(page);
      await settled(page);
      await page.locator('.tile.area-leader').click();
      await expect(page.locator('.lb-row-btn').first()).toBeVisible();
      await check('Leaderboard');

      expect(found).toEqual([]);
    });
  }
}
