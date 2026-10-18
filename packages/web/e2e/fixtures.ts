import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every test starts as a fresh guest with the backend blocked (no account is
 * ever created), the theme of its project, and the tutorial already seen.
 */
export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use, info) => {
    await page.route(/supabase\.co/, (route) => route.abort());
    const theme = info.project.name === 'light' ? 'light' : 'dark';
    await page.addInitScript((t) => {
      if (sessionStorage.getItem('a11y-test-ready')) return;
      sessionStorage.setItem('a11y-test-ready', '1');
      localStorage.setItem('elomental:theme', JSON.stringify(t));
      localStorage.setItem('elomental:tutorial-done', 'true');
    }, theme);
    await page.goto('/');
    // The splash is a button: skip it.
    await page.locator('.screen.welcome').click();
    await expect(page.locator('.tile.area-casual')).toBeVisible();
    await use(page);
  },
});

export { expect };

/**
 * axe-core with the WCAG 2.0-2.2 A/AA rules and best practices. `meta-viewport`
 * is the one documented exception: pinch zoom stays off on phones and Text
 * size (to 200%) meets WCAG 1.4.4 instead (docs/ACCESSIBILITY_AUDIT.md, D1).
 */
export async function axe(page: Page) {
  // Page turns and tiles fade in; contrast is only meaningful once they've settled.
  await settled(page);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .disableRules(['meta-viewport'])
    .analyze();
  return result.violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

/** Waits until no animation on the page is still running (page turns, tile entries). */
export async function settled(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
}

/** Start a Casual Easy game from Home using only the keyboard. */
export async function startCasualByKeyboard(page: Page) {
  await page.locator('.tile.area-casual').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Casual' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: 'Easy' }).focus();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Play Easy' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('grid', { name: 'Sudoku board' })).toBeVisible({ timeout: 20_000 });
}
