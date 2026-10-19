import type { Page } from '@playwright/test';
import { solve } from '@elomental/engine';
import { expect, startCasualByKeyboard, test } from './fixtures.ts';

/**
 * The Add to Home Screen note in the result pop-up: on a phone in the browser, after the
 * first solved square, then every 5th. A phone here means a touch screen (pointer: coarse).
 */
test.use({ hasTouch: true, isMobile: true });

/** Solves the open board: reads the given numbers, solves them with the engine, types the rest. */
async function solveBoard(page: Page) {
  // A fresh board: the last result is gone and there are cells to fill.
  await expect(page.locator('.result')).toHaveCount(0);
  await expect(page.locator('.cell[aria-label$=": empty"]').first()).toBeVisible();
  const values = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.cell')].map((c) => Number(/: (\d)/.exec(c.getAttribute('aria-label') ?? '')?.[1] ?? 0)),
  );
  const solution = solve(Uint8Array.from(values))!;
  for (let i = 0; i < 81; i++) {
    if (values[i]) continue;
    await page.locator(`[data-cell="${i}"]`).click();
    await page.keyboard.press(String(solution[i]));
  }
  await expect(page.getByRole('heading', { name: /Solved/ })).toBeVisible({ timeout: 10_000 });
}

const note = (page: Page) => page.locator('.result .install-note');

test('the first solve shows the note, and How unfolds the steps in the pop-up', async ({ app }) => {
  await startCasualByKeyboard(app);
  await solveBoard(app);
  await expect(note(app)).toBeVisible();
  await app.getByRole('button', { name: 'How to add Elomental to your Home Screen' }).click();
  await expect(app.locator('.result .install-steps li')).toHaveCount(3);
  // Still the one result pop-up: no second pop-up opened over it.
  await expect(app.locator('.modal')).toHaveCount(1);
});

test('the second to fifth solves leave it out, the sixth shows it again', async ({ app }) => {
  await app.evaluate(() => localStorage.setItem('elomental:install-solves', '1'));
  await startCasualByKeyboard(app);
  await solveBoard(app);
  await expect(app.locator('.result')).toBeVisible();
  await expect(note(app)).toHaveCount(0);

  await app.evaluate(() => localStorage.setItem('elomental:install-solves', '5'));
  await app.getByRole('button', { name: 'New square' }).click();
  await expect(app.getByRole('grid', { name: 'Sudoku board' })).toBeVisible({ timeout: 20_000 });
  await solveBoard(app);
  await expect(note(app)).toBeVisible();
});
